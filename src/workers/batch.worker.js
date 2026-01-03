const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");
const crypto = require("crypto");

console.log("🟡 Batch Worker started (v4 - Fixed Event Types)");

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
        AND timestamp_seconds >= $2 AND timestamp_seconds < $3
      ORDER BY timestamp_seconds ASC
      `,
      [sessionId, fromTime, toTime]
    );

    console.log(`📊 [${sessionId}] Batch ${fromChunkIndex}-${toChunkIndex}: Processing ${signals.length} signals (${fromTime}s - ${toTime}s)`);

    // State for multiple event types
    const activeEvents = {};

    const detectors = [
      {
        type: "PHONE_USAGE",
        check: s => s.phone_detected,
        minDuration: 1 // More sensitive for phone
      },
      {
        type: "NO_FACE",
        check: s => !s.face_present,
        minDuration: 1
      },
      {
        type: "MULTIPLE_PEOPLE",
        check: s => s.face_count > 1,
        minDuration: 0 // Immediate trigger
      },
      {
        type: "LOOKING_AWAY", // Gazing
        // Threshold: 0.5 seems reasonable for "turning head". 
        // 0 is center. > 0.5 is left, < -0.5 is right.
        check: s => s.head_yaw && Math.abs(s.head_yaw) > 0.4,
        minDuration: 3 // Requested 5 seconds
      }
    ];

    // State management for cross-batch events
    const stateKey = `session:${sessionId}:detector_state`;
    const savedStateVal = await redis.get(stateKey);
    const savedState = savedStateVal ? JSON.parse(savedStateVal) : {};

    // Initialize state for each detector from Redis or default
    detectors.forEach(d => {
      if (savedState[d.type]) {
        d.state = savedState[d.type];
        console.log(`🔄 [${sessionId}] Resumed ${d.type} from previous batch (Start: ${d.state.start})`);
      } else {
        d.state = { start: null, last: null };
      }
    });

    // Helper to insert event
    const saveEvent = async (type, start, end, minDuration) => {
      const duration = end - start;
      console.log(`📝 [${sessionId}] Candidate Event: ${type} Duration: ${duration}s (${start}-${end}) Min: ${minDuration}`);

      if (duration >= minDuration) {
        try {
          await pool.query(
            `
            INSERT INTO proctoring_events
            (id, session_id, event_type, start_time_seconds, end_time_seconds, duration_seconds, confidence_score)
            VALUES ($1, $2, $3, $4, $5, $6, 0.8)
            `,
            [crypto.randomUUID(), sessionId, type, start, end, duration]
          );
          console.log(`⚠️ [${sessionId}] SAVED: ${type} (${duration}s)`);
        } catch (err) {
          console.error(`❌ [${sessionId}] Failed to save event ${type}: ${err.message}`);
        }
      } else {
        console.log(`🗑️ [${sessionId}] Ignored ${type}: Duration ${duration}s < ${minDuration}s`);
      }
    };

    for (const s of signals) {
      for (const d of detectors) {
        const isTriggered = d.check(s);

        if (isTriggered) {
          if (d.state.start === null) {
            // New Event Start
            console.log(`🚩 [${sessionId}] Trigger Start: ${d.type} at ${s.timestamp_seconds}`);
            d.state.start = s.timestamp_seconds;
            d.state.last = s.timestamp_seconds;
          } else {
            // Check for data gap (>2 seconds missing)
            if (s.timestamp_seconds - d.state.last > 2) {
              console.log(`⚠️ [${sessionId}] Gap detected (${d.state.last} -> ${s.timestamp_seconds}). Closing ${d.type}.`);
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
            console.log(`🛑 [${sessionId}] Trigger Stop: ${d.type} at ${s.timestamp_seconds} (Last: ${d.state.last})`);
            // Check if valid event
            await saveEvent(d.type, d.state.start, d.state.last, d.minDuration);
            // Reset
            d.state.start = null;
            d.state.last = null;
          }
        }
      }
    }

    // 🛑 Handle open-ended events
    // If this is the FINAL batch (triggered by finalize worker), we must force-close events.
    if (job.data.isFinalBatch) {
      console.log(`🛑 [${sessionId}] Final batch detected. Flushing open events...`);
      for (const d of detectors) {
        if (d.state.start !== null) {
          await saveEvent(d.type, d.state.start, d.state.last, d.minDuration);
          d.state.start = null;
          d.state.last = null;
        }
      }
      // Clear Redis state as session is done
      await redis.del(stateKey);
    } else {
      // Save state for next batch (Cross-Batch Persistence)
      const nextState = {};
      detectors.forEach(d => {
        nextState[d.type] = d.state;
      });
      await redis.set(stateKey, JSON.stringify(nextState), 'EX', 3600); // 1 hour TTL
    }

    return { batchProcessed: true, events: true };
  },
  { connection: redis, concurrency: 2 }
);
