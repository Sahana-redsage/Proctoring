const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");

console.log("🟡 Batch Worker started (v2 - Status Sync)");

new Worker(
  "batchQueue",
  async (job) => {
    const { sessionId, fromChunkIndex, toChunkIndex } = job.data;

    console.log(
      `🧩 Processing batch ${fromChunkIndex} → ${toChunkIndex} for session ${sessionId}`
    );

    const fromTime = fromChunkIndex * 10;
    const toTime = (toChunkIndex + 1) * 10;
    // const expectedSignals = 30; // Not used anymore

    let attempts = 0;

    // 🔄 POLLING: Wait for all chunks to be processed by AI (Robust Sync)
    // We wait until the Chunk Worker marks them as 'PROCESSED'
    const totalChunks = toChunkIndex - fromChunkIndex + 1;
    let allProcessed = false;

    while (attempts < 60) { // Wait up to 2 minutes
      const { rows: chunks } = await pool.query(
        `
        SELECT chunk_index, status
        FROM proctoring_chunks
        WHERE session_id = $1
          AND chunk_index BETWEEN $2 AND $3
        `,
        [sessionId, fromChunkIndex, toChunkIndex]
      );

      // Check if we have all chunks and they are all processed
      const processedCount = chunks.filter(c => c.status === 'PROCESSED').length;

      if (processedCount === totalChunks) {
        allProcessed = true;
        break;
      }

      console.log(`⏳ Batch ${fromChunkIndex}-${toChunkIndex}: Waiting for chunks processing... (${processedCount}/${totalChunks} ready)`);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s
      attempts++;
    }

    if (!allProcessed) {
      console.warn(`⚠️ Batch ${fromChunkIndex}-${toChunkIndex}: Timed out waiting for chunks. Processing available signals...`);
    }

    // Now fetch signals
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

    // State for multiple event types
    const activeEvents = {};

    const detectors = [
      {
        type: "PHONE_USAGE",
        check: s => s.phone_detected,
        minDuration: 1 // More sensitive for phone
      },
      {
        type: "FACE_NOT_VISIBLE",
        check: s => !s.face_present,
        minDuration: 2
      },
      {
        type: "MULTIPLE_FACES",
        check: s => s.face_count > 1,
        minDuration: 1
      },
      {
        type: "LOOKING_AWAY", // Gazing
        // Threshold: 0.5 seems reasonable for "turning head". 
        // 0 is center. > 0.5 is left, < -0.5 is right.
        check: s => s.head_yaw && Math.abs(s.head_yaw) > 0.4,
        minDuration: 3 // Requested 5 seconds
      }
    ];

    // Initialize state for each detector
    detectors.forEach(d => {
      d.state = { start: null, last: null };
    });

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

        if (isTriggered) {
          if (d.state.start === null) {
            // New Event Start
            d.state.start = s.timestamp_seconds;
            d.state.last = s.timestamp_seconds;
          } else {
            // Check for data gap (>2 seconds missing)
            if (s.timestamp_seconds - d.state.last > 2) {
              console.log(`⚠️ [${sessionId}] Gap detected in signal stream (${d.state.last} -> ${s.timestamp_seconds}). Splitting event.`);
              // Close previous event
              await saveEvent(d.type, d.state.start, d.state.last, d.minDuration);
              // Start new event
              d.state.start = s.timestamp_seconds;
              d.state.last = s.timestamp_seconds;
            } else {
              // Extend event
              d.state.last = s.timestamp_seconds;
            }
          }
        } else {
          // Condition STOPPED
          if (d.state.start !== null) {
            // Check if valid event
            await saveEvent(d.type, d.state.start, d.state.last, d.minDuration);
            // Reset
            d.state.start = null;
            d.state.last = null;
          }
        }
      }
    }

    // 🛑 Handle open-ended events (carry over to next batch? complex. For now, close them).
    // Ideally we should state-persist across batches but that requires Redis/DB state.
    // For this simplified worker, we close at batch end.
    if (signals.length > 0) {
      for (const d of detectors) {
        if (d.state.start !== null) {
          await saveEvent(d.type, d.state.start, d.state.last, d.minDuration);
        }
      }
    }

    return { batchProcessed: true, events: true };
  },
  { connection: redis, concurrency: 2 }
);
