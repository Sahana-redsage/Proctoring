const { Worker } = require("bullmq");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const pool = require("../config/db");
const redis = require("../config/redis");
const { uploadToR2 } = require("../services/r2.service");
const { finalizeQueue, redisConnection, chunkQueue } = require("../config/bullmq");

require("dotenv").config();

console.log("🔴 Finalize Worker started");

// Utility: run shell commands safely
function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });
}

const worker = new Worker(
  "finalizeQueue",
  async job => {
    const { sessionId } = job.data;

    console.log(`🎬 Finalizing session ${sessionId}`);
    const client = await pool.connect();

    try {
      /**
       * 1️⃣ CHECK ALL CHUNKS STATUS
       */
      const { rows: chunks } = await client.query(
        `
        SELECT id, chunk_index, status
        FROM proctoring_chunks
        WHERE session_id = $1
        ORDER BY chunk_index
        `,
        [sessionId] // No file_path needed from DB since it's 'REDIS'
      );

      if (!chunks.length) {
        console.log(`⚠️ [${sessionId}] No chunks found`);
        return;
      }

      // 1.5 Handle Stuck "RECEIVED" chunks (Partial Batch Leftovers)
      const stuckChunks = chunks.filter(c => c.status === "RECEIVED");

      if (stuckChunks.length > 0) {
        console.log(`🧩 [${sessionId}] Found ${stuckChunks.length} unprocessed pending chunks. Triggering forced processing...`);

        // Group by contiguous chunks or just group all together?
        // Since valid batches are already processed, these act like the "remainder".
        // They should ideally be contiguous at the end, but let's be safe.
        // We will trigger a batch job for the range of these chunks.

        const minIndex = Math.min(...stuckChunks.map(c => c.chunk_index));
        const maxIndex = Math.max(...stuckChunks.map(c => c.chunk_index));

        /* 
           We invoke the chunkQueue manually.
           We assume stuck chunks are the tail end.
        */
        const { chunkQueue } = require("../config/bullmq");
        await chunkQueue.add("PROCESS_BATCH_AI", {
          sessionId,
          fromChunkIndex: minIndex,
          toChunkIndex: maxIndex
        });

        // Requeue finalize to wait for this new job to finish
        console.log(`⏳ [${sessionId}] Requeuing finalize to wait for leftovers...`);
        await finalizeQueue.add("FINALIZE_SESSION", { sessionId }, { delay: 5000, attempts: 10 });
        return;
      }

      const incomplete = chunks.some(
        c => c.status !== "PROCESSED"
      );

      if (incomplete) {
        console.log(
          `⏸️ [${sessionId}] Some chunks still processing (PROCESSING status). Retrying finalize...`
        );
        await finalizeQueue.add(
          "FINALIZE_SESSION",
          { sessionId },
          { delay: 5000, attempts: 10 }
        );
        return;
      }

      /**
       * 2️⃣ DOWNLOAD CHUNKS FROM REDIS & PREPARE FOR MERGE
       */
      const mergeDir = path.join(os.tmpdir(), "proctoring_merge", sessionId);
      if (!fs.existsSync(mergeDir)) {
        fs.mkdirSync(mergeDir, { recursive: true });
      }

      const chunkFiles = [];

      console.log(`📥 [${sessionId}] Fetching ${chunks.length} chunks from Redis...`);

      for (const c of chunks) {
        const redisKey = `session:${sessionId}:chunk:${c.chunk_index}`;
        const buffer = await redis.getBuffer(redisKey);

        if (!buffer) {
          console.warn(`⚠️ [${sessionId}] Chunk ${c.chunk_index} missing in Redis! Skipping...`);
          continue;
        }

        const chunkPath = path.join(mergeDir, `chunk_${c.chunk_index}.webm`);
        fs.writeFileSync(chunkPath, buffer);
        chunkFiles.push(chunkPath);
      }

      const concatFile = path.join(mergeDir, `concat.txt`);
      const concatContent = chunkFiles
        .map(p => `file '${p.replace(/\\/g, "/")}'`)
        .join("\n");

      fs.writeFileSync(concatFile, concatContent);

      /**
       * 3️⃣ MERGE VIDEO USING FFMPEG
       */
      const outputFile = path.join(mergeDir, `final.webm`);

      console.log(
        `⏳ [${sessionId}] Starting video merge...`
      );

      await run(
        `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}"`
      );

      console.log(
        `🎞️ [${sessionId}] Video merged successfully`
      );

      /**
       * 4️⃣ UPLOAD TO CLOUDFLARE R2
       */
      const r2Key = `proctoring/${sessionId}.webm`;
      console.log(`📤 [${sessionId}] Uploading to R2...`);

      const finalVideoUrl = await uploadToR2(
        outputFile,
        r2Key
      );

      console.log(`☁️ [${sessionId}] Uploaded: ${finalVideoUrl}`);

      /**
       * 5️⃣ UPDATE SESSION & CLEANUP REDIS
       */
      await client.query(
        `UPDATE proctoring_sessions SET final_video_url = $1, status = 'DONE', ended_at = NOW() WHERE id = $2`,
        [finalVideoUrl, sessionId]
      );

      // Delete chunks from Redis
      console.log(`🧹 [${sessionId}] Cleaning up Redis keys...`);
      for (const c of chunks) {
        await redis.del(`session:${sessionId}:chunk:${c.chunk_index}`);
      }
      // Also delete event keys if any?
      // await redis.del(`session:${sessionId}:last_event:PHONE_USAGE`);
      // Keeping event keys till TTL/Eviction assumes they are small enough or let them expire.

      /**
       * 6️⃣ CLEANUP LOCAL FILES
       */
      fs.rmSync(mergeDir, { recursive: true, force: true });

      console.log(`✅ [${sessionId}] Finalized successfully`);

    } catch (err) {
      console.error(`❌ [${sessionId}] Finalize failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  },
  {
    connection: redisConnection
  }
);

module.exports = worker;
