const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");

console.log("🟡 Batch Worker started");

new Worker(
  "batchQueue",
  async (job) => {
    const { sessionId, fromChunkIndex, toChunkIndex } = job.data;

    console.log(
      `🧩 Processing batch ${fromChunkIndex} → ${toChunkIndex} for session ${sessionId}`
    );

    const fromTime = fromChunkIndex * 10;
    const toTime = (toChunkIndex + 1) * 10;
    const expectedSignals = 30; // 3 chunks * 10 seconds

    let signals = [];
    let attempts = 0;

    // 🔄 POLLING: Wait for signals to appear (Race Condition Fix)
    while (attempts < 10) {
      const res = await pool.query(
        `
        SELECT *
        FROM proctoring_chunk_signals
        WHERE session_id = $1
          AND timestamp_seconds BETWEEN $2 AND $3
        ORDER BY timestamp_seconds
        `,
        [sessionId, fromTime, toTime]
      );
      signals = res.rows;

      if (signals.length >= expectedSignals) break;

      console.log(`⏳ Batch ${fromChunkIndex}-${toChunkIndex}: Waiting for signals... (${signals.length}/${expectedSignals})`);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s
      attempts++;
    }

    console.log(`📊 [${sessionId}] Batch ${fromChunkIndex}-${toChunkIndex}: Processed with ${signals.length} signals.`);

    let phoneStart = null;

    // Helper to insert event
    const saveEvent = async (start, end) => {
      const duration = end - start;
      if (duration >= 2) {
        await pool.query(
          `
          INSERT INTO proctoring_events
          (id, session_id, event_type, start_time_seconds, end_time_seconds, duration_seconds, confidence_score)
          VALUES (uuid_generate_v4(), $1, 'PHONE_USAGE', $2, $3, $4, 0.7)
          `,
          [sessionId, start, end, duration]
        );
        console.log(`⚠️ [${sessionId}] Phone usage detected! Duration: ${duration}s (Time: ${start}-${end})`);
      }
    };

    for (const s of signals) {
      if (s.phone_detected && phoneStart === null) {
        phoneStart = s.timestamp_seconds;
      }

      if (!s.phone_detected && phoneStart !== null) {
        await saveEvent(phoneStart, s.timestamp_seconds);
        phoneStart = null;
      }
    }

    // 🛑 Handle case where batch ends while phone is still detected
    if (phoneStart !== null) {
      const lastTime = signals[signals.length - 1].timestamp_seconds;
      await saveEvent(phoneStart, lastTime);
    }

    return { batchProcessed: true, events: true };
  },
  { connection: redis, concurrency: 2 }
);
