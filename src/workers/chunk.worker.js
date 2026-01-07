const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");
const { detectFaces, detectObjects } = require("../services/ai.service");
const { exec } = require("child_process");
const fs = require("fs");
const { CHUNK_DURATION_SEC } = require("../config/env");
const ffmpeg = require("fluent-ffmpeg");

console.log("🟢 Chunk Worker started");

// 🛡️ Redis Config Check
async function enforceRedisPolicy() {
  try {
    const policy = await redis.config("GET", "maxmemory-policy");
    // policy result is strictly [param, value] usually? or just value depending on client. 
    // IORedis config('GET', ...) returns [ 'maxmemory-policy', 'value' ]
    const policyValue = Array.isArray(policy) ? policy[1] : policy;

    if (policyValue !== "noeviction") {
      console.warn(`⚠️ [Redis] Current policy is '${policyValue}'. Attempting to switch to 'noeviction'...`);
      try {
        await redis.config("SET", "maxmemory-policy", "noeviction");
        console.log("✅ [Redis] Policy set to 'noeviction'. Data safety improved.");
      } catch (setConfigErr) {
        console.error("❌ [Redis] Failed to auto-set 'noeviction'. Please set 'maxmemory-policy noeviction' in redis.conf manually to prevent data loss.");
      }
    } else {
      console.log("✅ [Redis] Policy is 'noeviction'.");
    }
  } catch (err) {
    console.warn("⚠️ [Redis] Could not check configuration.", err.message);
  }
}
enforceRedisPolicy();

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

      const { REDIS_URL } = require("../config/env");
      const IORedis = require("ioredis");

      // Create a dedicated Redis connection for data fetching (avoid BullMQ conflict)
      const dataRedis = new IORedis(REDIS_URL);

      console.log(`[DEBUG] Data Redis Status: ${dataRedis.status}`);

      console.log(`🚀 Processing AI Batch: Chunks ${fromChunkIndex} → ${toChunkIndex} (Session: ${sessionId})`);

      // Helper: Download file
      const downloadFile = async (url, dest) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(buffer));
      };

      // 1. Fetch ALL chunks from DISK or R2 (Redis URL)
      console.log(`[DEBUG] Verifying chunks...`);
      const chunkFiles = [];
      const batchDir = path.join(os.tmpdir(), `${sessionId}_batch_${fromChunkIndex}`); // Temp work dir
      if (!fs.existsSync(batchDir)) fs.mkdirSync(batchDir, { recursive: true });

      const STORAGE_DIR = path.join(os.tmpdir(), "proctoring_storage");
      const sessionDir = path.join(STORAGE_DIR, sessionId);

      try {
        const missingChunks = [];
        for (let i = fromChunkIndex; i <= toChunkIndex; i++) {
          const sourcePath = path.join(sessionDir, `chunk_${i}.webm`);
          const dest = path.join(batchDir, `part_${i}.webm`);

          if (fs.existsSync(sourcePath)) {
            // Local file exists (Cache)
            fs.copyFileSync(sourcePath, dest);
            chunkFiles.push(dest);
          } else {
            // Try fetching R2 URL from Redis
            const r2Url = await dataRedis.hget(`session:${sessionId}:chunks`, i);
            if (r2Url) {
              console.log(`☁️ [${sessionId}] Chunk ${i} missing on disk, downloading from R2...`);
              try {
                await downloadFile(r2Url, dest);
                chunkFiles.push(dest);
              } catch (downloadErr) {
                console.warn(`⚠️ [${sessionId}] Chunk ${i} download failed (likely already deleted from R2). Marking as PROCESSED.`);
                missingChunks.push(i);
              }
            } else {
              console.warn(`⚠️ [${sessionId}] Chunk ${i} has no R2 URL in Redis. Marking as PROCESSED.`);
              missingChunks.push(i);
            }
          }
        }

        // Mark missing chunks as PROCESSED to prevent retry loops
        if (missingChunks.length > 0) {
          console.log(`💾 [${sessionId}] Marking ${missingChunks.length} missing chunks as PROCESSED: ${missingChunks.join(', ')}`);
          for (const chunkIndex of missingChunks) {
            await pool.query(
              "UPDATE proctoring_chunks SET status = 'PROCESSED' WHERE session_id = $1 AND chunk_index = $2",
              [sessionId, chunkIndex]
            );
          }
        }

        console.log("[DEBUG] Fetch loop done");

        if (chunkFiles.length === 0) {
          console.error("❌ No chunks found for batch. Aborting.");
          return;
        }

        // 2. Merge Chunks
        console.log(`[DEBUG] Merging ${chunkFiles.length} chunks...`);
        const concatFile = path.join(batchDir, "concat.txt");
        const joinedContent = chunkFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join('\n');
        fs.writeFileSync(concatFile, joinedContent);

        const batchVideoPath = path.join(batchDir, "batch_full.webm");
        await run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${batchVideoPath}"`);
        console.log(`[DEBUG] Merge complete.`);

        // Fetch Reference Face (Identity Check)
        console.log(`[DEBUG] Checking for reference face...`);
        // New URL logic
        const refUrlKey = `session:${sessionId}:reference_image_url`;
        const refUrl = await dataRedis.get(refUrlKey);

        let refPath = null;
        if (refUrl) {
          console.log(`📸 [${sessionId}] Downloading reference face from R2...`);
          refPath = path.join(batchDir, 'reference.jpg');
          await downloadFile(refUrl, refPath);
          console.log(`📸 [${sessionId}] Reference face downloaded.`);
        } else {
          // Fallback to old buffer way (just in case of mixed versions)
          const refKey = `session:${sessionId}:reference_face`;
          const refBuffer = await dataRedis.getBuffer(refKey);
          if (refBuffer) {
            refPath = path.join(batchDir, 'reference.jpg');
            fs.writeFileSync(refPath, refBuffer);
            console.log(`📸 [${sessionId}] Reference face found (legacy buffer).`);
          }
        }

        if (refPath) {
          console.log(`📸 [${sessionId}] Verification enabled.`);
        }

        // 3. Run AI on the BATCH video
        console.log(`🔍 [${sessionId}] running AI on ${chunkFiles.length} chunks...`);
        const [faceData, objectData] = await Promise.all([
          detectFaces(batchVideoPath, refPath),
          detectObjects(batchVideoPath)
        ]);


        // 4. Calculate Timestamps
        // The AI result is now for the WHOLE batch video (e.g. 0s to 30s).
        // We need to map this back to absolute session time.
        // Base time is start        // 4. Get Actual Video Duration for Accurate Timing
        const { duration: actualDuration } = await new Promise((resolve) => {
          ffmpeg.ffprobe(batchVideoPath, (err, metadata) => {
            if (err) resolve({ duration: (toChunkIndex - fromChunkIndex + 1) * CHUNK_DURATION_SEC });
            else resolve({ duration: metadata.format.duration });
          });
        });

        const frameCount = Math.max(faceData.faceCounts.length, objectData.phoneDetected.length);
        const fps = frameCount / actualDuration;

        console.log(`⏱ [${sessionId}] Batch Info: Duration=${actualDuration}s, Frames=${frameCount}, FPS=${fps.toFixed(2)}`);

        // --- TIMESTAMP SYNC (VIDEO TIME) ---
        // Calculate the cumulative duration of all previous chunks to find the true "Video Start Time" of this batch.
        // This ensures events match the playback time of the final merged video, ignoring wall-clock gaps.
        let startOfBatch = 0;
        try {
          const { rows } = await pool.query(
            `SELECT COALESCE(SUM(end_time_seconds - start_time_seconds), 0) as offset 
              FROM proctoring_chunks 
              WHERE session_id = $1 AND chunk_index < $2`,
            [sessionId, fromChunkIndex]
          );
          startOfBatch = parseFloat(rows[0].offset);
          // If previous chunks are unprocessed/default, they contribute 30s. 
          // If processed/shortened, they contribute actual duration. perfect.
        } catch (err) {
          console.warn(`Timestamp sync failed, falling back to index stats:`, err);
          startOfBatch = fromChunkIndex * CHUNK_DURATION_SEC;
        }

        console.log(`⏱ [${sessionId}] Batch Video Start Time: ${startOfBatch.toFixed(2)}s`);

        for (let i = 0; i < frameCount; i++) {
          // Current second relative to batch start
          let timeOffset = Math.floor(i / fps);

          // Cap offset to batch duration to prevent overflow
          if (timeOffset > actualDuration) timeOffset = Math.floor(actualDuration);

          const timestamp = startOfBatch + timeOffset;

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

          // Identity Mismatch
          if (faceData.mismatches && faceData.mismatches[i]) {
            events.push({ type: 'IDENTITY_MISMATCH', confidence: 0.95 });
          }

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

        // 5. Correct DB Metadata (Start & End Time) for continuous video timeline
        if (fromChunkIndex === toChunkIndex) {
          const correctedStart = Math.round(startOfBatch);
          const correctedEnd = Math.round(startOfBatch + actualDuration);

          await pool.query(
            "UPDATE proctoring_chunks SET start_time_seconds = $1, end_time_seconds = $2 WHERE session_id = $3 AND chunk_index = $4",
            [correctedStart, correctedEnd, sessionId, fromChunkIndex]
          );
          console.log(`⏱ [${sessionId}] Corrected DB timeline for chunk ${fromChunkIndex}: ${correctedStart}s - ${correctedEnd}s`);
        }

        // 6. Mark chunks as PROCESSED
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
        dataRedis.quit(); // Close dedicated connection
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

      console.log("Ignoring single chunk job preference for batching.");
    }
  },
  {
    connection: redis,
    concurrency: 1, // Reduce CPU load to prevent timeouts
    lockDuration: 120000 // Increase lock time for heavy AI jobs
  }
);

