const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

const { mergeChunks } = require("../services/videoMerge.service");
const { uploadToR2 } = require("../services/r2.service");

console.log("🔴 Finalize Worker started");

new Worker(
  "finalizeQueue",
  async (job) => {
    const { sessionId } = job.data;

    console.log(`🎬 Finalizing session ${sessionId}`);

    // Mark PROCESSING
    await pool.query(
      `UPDATE proctoring_sessions SET status = 'PROCESSING' WHERE id = $1`,
      [sessionId]
    );

    // Fetch all chunk files
    const { rows: chunks } = await pool.query(
      `
      SELECT file_path
      FROM proctoring_chunks
      WHERE session_id = $1
      ORDER BY chunk_index
      `,
      [sessionId]
    );

    const chunkFiles = chunks.map(c => c.file_path);

    if (!chunkFiles.length) {
      throw new Error("No chunks found for session");
    }

    // 1️⃣ MERGE VIDEO
    const finalVideoPath = await mergeChunks(sessionId, chunkFiles);
    console.log("🎞️ Video merged");

    // 2️⃣ UPLOAD TO R2
    const r2Key = `proctoring/${sessionId}.webm`;
    const publicUrl = await uploadToR2(finalVideoPath, r2Key);
    console.log("☁️ Uploaded to R2");

    // 3️⃣ UPDATE SESSION
    await pool.query(
      `
      UPDATE proctoring_sessions
      SET final_video_url = $1, status = 'DONE'
      WHERE id = $2
      `,
      [publicUrl, sessionId]
    );

    // 4️⃣ CLEANUP CHUNKS
    for (const file of chunkFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    if (fs.existsSync(finalVideoPath)) fs.unlinkSync(finalVideoPath);

    console.log(`✅ Session ${sessionId} finalized successfully`);

    return { success: true };
  },
  { connection: redis, concurrency: 1 }
);
