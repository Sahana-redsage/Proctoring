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

    // State for multiple event types
    const activeEvents = {};

    const detectors = [
      {
        type: "PHONE_USAGE",
        check: s => s.phone_detected,
        minDuration: 2
      },
      {
        type: "FACE_NOT_VISIBLE",
        check: s => !s.face_present,
        minDuration: 2
      },
      {
        type: "MULTIPLE_FACES",
        check: s => s.face_count > 1,
        minDuration: 2
      },
      {
        type: "LOOKING_AWAY", // Gazing
        // Threshold: 0.5 seems reasonable for "turning head". 
        // 0 is center. > 0.5 is left, < -0.5 is right.
        check: s => s.head_yaw && Math.abs(s.head_yaw) > 0.4,
        minDuration: 5 // Requested 5 seconds
      }
    ];

    // Initialize state
    detectors.forEach(d => activeEvents[d.type] = null);

    // Helper to insert event
    const saveEvent = async (type, start, end, minDuration) => {
      const duration = end - start;
      if (duration >= minDuration) {
        await pool.query(
          `
          INSERT INTO proctoring_events
          (id, session_id, event_type, start_time_seconds, end_time_seconds, duration_seconds, confidence_score)
          VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 0.8)
          `,
          [sessionId, type, start, end, duration]
        );
        console.log(`⚠️ [${sessionId}] ${type} detected! Duration: ${duration}s (Time: ${start}-${end})`);
      }
    };

    for (const s of signals) {
      for (const d of detectors) {
        const isTriggered = d.check(s);
        const startTime = activeEvents[d.type];

        if (isTriggered && startTime === null) {
          // Event Started
          activeEvents[d.type] = s.timestamp_seconds;
        } else if (!isTriggered && startTime !== null) {
          // Event Ended
          await saveEvent(d.type, startTime, s.timestamp_seconds, d.minDuration);
          activeEvents[d.type] = null;
        }
      }
    }

    // 🛑 Handle open-ended events
    if (signals.length > 0) {
      const lastTime = signals[signals.length - 1].timestamp_seconds;
      for (const d of detectors) {
        const type = d.type;
        if (activeEvents[type] !== null) {
          await saveEvent(type, activeEvents[type], lastTime, d.minDuration);
        }
      }
    }

    return { batchProcessed: true, events: true };
  },
  { connection: redis, concurrency: 2 }
);
