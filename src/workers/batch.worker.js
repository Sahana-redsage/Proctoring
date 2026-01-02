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

    const { rows: signals } = await pool.query(
      `
      SELECT *
      FROM proctoring_chunk_signals
      WHERE session_id = $1
        AND timestamp_seconds BETWEEN $2 AND $3
      ORDER BY timestamp_seconds
      `,
      [sessionId, fromTime, toTime]
    );

    console.log(`📊 [${sessionId}] Batch ${fromChunkIndex}-${toChunkIndex}: Fetched ${signals.length} signals.`);

    let phoneStart = null;

    for (const s of signals) {
      if (s.phone_detected && phoneStart === null) {
        phoneStart = s.timestamp_seconds;
      }

      if (!s.phone_detected && phoneStart !== null) {
        const duration = s.timestamp_seconds - phoneStart;

        if (duration >= 5) {
          await pool.query(
            `
            INSERT INTO proctoring_events
            (id, session_id, event_type, start_time_seconds, end_time_seconds, duration_seconds, confidence_score)
            VALUES (uuid_generate_v4(), $1, 'PHONE_USAGE', $2, $3, $4, 0.7)
            `,
            [sessionId, phoneStart, s.timestamp_seconds, duration]
          );
          console.log(`⚠️ [${sessionId}] Phone usage detected! Duration: ${duration}s (Time: ${phoneStart}-${s.timestamp_seconds})`);
      }

      phoneStart = null;
    }
  }

    return { batchProcessed: true };
  },
{ connection: redis, concurrency: 2 }
);
