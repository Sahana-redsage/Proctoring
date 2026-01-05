const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");
const { detectFaces, detectObjects } = require("../services/ai.service");
const { exec } = require("child_process");
const fs = require("fs");
const { CHUNK_DURATION_SEC } = require("../config/env");

console.log("🟢 Chunk Worker started");

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });
}

new Worker(
  "chunkQueue",
  async (job) => {
    // 🟡 Handle BATCH JOB (PROCESS_BATCH_AI)
    if (job.name === "PROCESS_BATCH_AI") {
      const { sessionId, fromChunkIndex, toChunkIndex } = job.data;
      const { EVENT_DEBOUNCE_SEC } = require("../config/env");
      const path = require("path");
      const os = require("os");

      console.log(`🚀 Processing AI Batch: Chunks ${fromChunkIndex} → ${toChunkIndex} (Session: ${sessionId})`);

      // 1. Fetch ALL chunks in range from Redis
      const chunkFiles = [];
      const batchDir = path.join(os.tmpdir(), `${sessionId}_batch_${fromChunkIndex}`);
      if (!fs.existsSync(batchDir)) fs.mkdirSync(batchDir, { recursive: true });

      try {
        for (let i = fromChunkIndex; i <= toChunkIndex; i++) {
          const redisKey = `session:${sessionId}:chunk:${i}`;
          const buffer = await redis.getBuffer(redisKey);
          if (buffer) {
            const p = path.join(batchDir, `part_${i}.webm`);
            fs.writeFileSync(p, buffer);
            chunkFiles.push(p);
          } else {
            console.warn(`⚠️ Batch ${fromChunkIndex}-${toChunkIndex}: Missing chunk ${i} in Redis.`);
          }
        }

        if (chunkFiles.length === 0) {
          console.error("❌ No chunks found for batch. Aborting.");
          return;
        }

        // 2. Merge Chunks into one 'Batch Video'
        const concatFile = path.join(batchDir, "concat.txt");
        const joinedContent = chunkFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join('\n');
        fs.writeFileSync(concatFile, joinedContent);

        const batchVideoPath = path.join(batchDir, "batch_full.webm");
        // Fast concat
        await run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${batchVideoPath}"`);

        // 3. Run AI on the BATCH video
        console.log(`🔍 [${sessionId}] running AI on ${chunkFiles.length} chunks...`);
        const [faceData, objectData] = await Promise.all([
          detectFaces(batchVideoPath),
          detectObjects(batchVideoPath)
        ]);

        // 4. Calculate Timestamps
        // The AI result is now for the WHOLE batch video (e.g. 0s to 30s).
        // We need to map this back to absolute session time.
        // Base time is start of 'fromChunkIndex'.
        const startOfBatch = fromChunkIndex * CHUNK_DURATION_SEC;

        const frameCount = Math.max(faceData.faceCounts.length, objectData.phoneDetected.length);

        for (let i = 0; i < frameCount; i++) {
          const timestamp = startOfBatch + i;

          // --- DETECTIONS START ---
          const events = [];

          // Phone
          if (objectData.phoneDetected[i]) events.push({ type: 'PHONE_USAGE', confidence: 0.9 });

          // Face
          const c = faceData.faceCounts[i] || 0;
          if (c === 0) events.push({ type: 'NO_FACE', confidence: 1.0 });
          else if (c > 1) events.push({ type: 'MULTIPLE_PEOPLE', confidence: 0.9 });

          // Gaze
          const yaw = Math.abs(faceData.headPitch[i] || 0);
          if (c === 1 && yaw > 0.5) events.push({ type: 'LOOKING_AWAY', confidence: 0.8 });

          // --- DEBOUNCE LOGIC ---
          for (const ev of events) {
            const key = `session:${sessionId}:last_event:${ev.type}`;
            const lastTime = await redis.get(key);

            if (!lastTime || (timestamp - parseInt(lastTime) >= EVENT_DEBOUNCE_SEC)) {
              console.log(`🚩 [${sessionId}] Event ${ev.type} @ ${timestamp}s`);
              // Insert
              await pool.query(
                `INSERT INTO proctoring_events (session_id, event_type, start_time_seconds, confidence_score)
                         VALUES ($1, $2, $3, $4)`,
                [sessionId, ev.type, timestamp, ev.confidence]
              );
              await redis.set(key, timestamp);
            }
          }
        }

        // 5. Mark chunks as PROCESSED
        console.log(`💾 [${sessionId}] Updating status for chunks ${fromChunkIndex}-${toChunkIndex} to PROCESSED...`);
        for (let i = fromChunkIndex; i <= toChunkIndex; i++) {
          await pool.query(
            "UPDATE proctoring_chunks SET status = 'PROCESSED' WHERE session_id = $1 AND chunk_index = $2",
            [sessionId, i]
          );
        }
        console.log(`✅ [${sessionId}] DB Status updated.`);

      } catch (err) {
        console.error(`❌ [${sessionId}] Error in Batch AI Process:`, err);
        throw err;
      } finally {
        // Cleanup batch dir (Robust)
        try {
          if (fs.existsSync(batchDir)) {
            // 2 second delay for Windows file locking
            await new Promise(r => setTimeout(r, 2000));
            // Async removal, ignore error
            fs.rm(batchDir, { recursive: true, force: true }, () => { });
          }
        } catch (e) {
          // Ignore synchronous setup errors
        }
      }
      return { msg: "Batch Processed" };

    } else {
      console.log("Ignoring single chunk job preference for batching.");
    }
  },
  { connection: redis, concurrency: 5 }
);
