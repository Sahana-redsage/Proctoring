const { Worker } = require("bullmq");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const pool = require("../config/db");
const { uploadToR2 } = require("../services/r2.service");
const { finalizeQueue, batchQueue, redisConnection } = require("../config/bullmq");

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
        SELECT id, chunk_index, status, file_path
        FROM proctoring_chunks
        WHERE session_id = $1
        ORDER BY chunk_index
        `,
        [sessionId]
      );

      if (!chunks.length) {
        console.log(`⚠️ [${sessionId}] No chunks found`);
        return;
      }

      const incomplete = chunks.some(
        c => c.status !== "PROCESSED"
      );

      if (incomplete) {
        console.log(
          `⏸️ [${sessionId}] Some chunks still processing. Retrying finalize...`
        );

        // 🔁 Requeue finalize with delay
        await finalizeQueue.add(
          "FINALIZE_SESSION",
          { sessionId },
          { delay: 5000, attempts: 10 }
        );

        return;
      }

      /**
       * 1.5️⃣ TRIGGER FINAL BATCH (LEFTOVERS)
       */
      const BATCH_SIZE = 3; // Keep consistent with controller
      const totalChunks = chunks.length;

      // Calculate the starting index for any remaining chunks that didn't form a full batch
      const remainderStart = Math.floor(totalChunks / BATCH_SIZE) * BATCH_SIZE;

      if (remainderStart < totalChunks) {
        console.log(`🧩 [${sessionId}] Triggering final batch for leftovers: ${remainderStart} → ${totalChunks - 1}`);
        await batchQueue.add("PROCESS_BATCH", {
          sessionId,
          fromChunkIndex: remainderStart,
          toChunkIndex: totalChunks - 1,
          isFinalBatch: true
        });
      } else if (totalChunks > 0) {
        // Aligned perfectly, but we need to run Final Batch to flush events
        console.log(`🧩 [${sessionId}] Triggering final flush (re-run last batch): ${remainderStart - BATCH_SIZE} → ${remainderStart - 1}`);
        await batchQueue.add("PROCESS_BATCH", {
          sessionId,
          fromChunkIndex: remainderStart - BATCH_SIZE,
          toChunkIndex: remainderStart - 1,
          isFinalBatch: true
        });
      }

      /**
       * 2️⃣ PREPARE CONCAT FILE FOR FFMPEG
       */
      const mergeDir = path.join(
        process.cwd(),
        "tmp",
        "merge"
      );

      if (!fs.existsSync(mergeDir)) {
        fs.mkdirSync(mergeDir, { recursive: true });
      }

      const concatFile = path.join(
        mergeDir,
        `${sessionId}_concat.txt`
      );

      const concatContent = chunks
        .map(c => `file '${c.file_path.replace(/\\/g, "/")}'`)
        .join("\n");

      fs.writeFileSync(concatFile, concatContent);

      /**
       * 3️⃣ MERGE VIDEO USING FFMPEG (NO RE-ENCODE)
       */
      const outputFile = path.join(
        mergeDir,
        `${sessionId}_final.webm`
      );

      console.log(
        `⏳ [${sessionId}] Starting video merge of ${chunks.length} chunks...`
      );

      await run(
        `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}"`
      );

      console.log(
        `🎞️ [${sessionId}] Video merged successfully at ${outputFile}`
      );

      /**
       * 4️⃣ UPLOAD TO CLOUDFLARE R2
       */
      const r2Key = `proctoring/${sessionId}.webm`;

      console.log(
        `📤 [${sessionId}] Uploading to R2 (${r2Key})...`
      );

      const finalVideoUrl = await uploadToR2(
        outputFile,
        r2Key
      );

      console.log(
        `☁️ [${sessionId}] Uploaded to R2: ${finalVideoUrl}`
      );

      /**
       * 5️⃣ UPDATE SESSION RECORD
       */
      await client.query(
        `
        UPDATE proctoring_sessions
        SET
          final_video_url = $1,
          status = 'DONE',
          ended_at = NOW()
        WHERE id = $2
        `,
        [finalVideoUrl, sessionId]
      );

      console.log(
        `💾 [${sessionId}] Database updated with final video URL`
      );

      /**
       * 6️⃣ CLEANUP TEMP FILES
       */
      console.log(
        `🧹 [${sessionId}] Cleaning up local files...`
      );

      /*
      for (const c of chunks) {
        if (fs.existsSync(c.file_path)) {
          fs.unlinkSync(c.file_path);
        }
      }

      if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
      // if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); // Keep output too? Well output is uploaded.
      */

      console.log(
        `✅ [${sessionId}] Session finalized successfully`
      );
    } catch (err) {
      console.error(
        `❌ [${sessionId}] Finalize failed:`,
        err
      );
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
