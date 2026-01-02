const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");
const { detectFaces, detectObjects } = require("../services/ai.service");
const { exec } = require("child_process");
const fs = require("fs");

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
    const { sessionId, chunkIndex, filePath } = job.data;

    console.log(`📦 Processing chunk ${chunkIndex} for session ${sessionId}`);

    // Attempt to repair WebM chunk using FFmpeg (OpenCV often fails with raw MediaRecorder chunks)
    try {
      const backupPath = filePath + ".orig";
      if (!fs.existsSync(backupPath)) { // Avoid double repair if re-run
        fs.renameSync(filePath, backupPath);
        console.log(`🔧 [${sessionId}] Repairing chunk ${chunkIndex} with FFmpeg...`);
        // -c copy usually fixes container issues. If not, we might need -c:v libvpx-vp9 but that's slow.
        // -fflags +genpts helps generating timestamps.
        await run(`ffmpeg -y -v error -i "${backupPath}" -c copy -fflags +genpts "${filePath}"`);
        console.log(`✅ [${sessionId}] Chunk ${chunkIndex} repaired.`);
        // Note: We keep the backup just in case we need to debug later
      }
    } catch (err) {
      console.error(`⚠️ [${sessionId}] Failed to repair chunk ${chunkIndex}, using original. Error: ${err}`);
      // Restore original if failed and not exists
      if (fs.existsSync(filePath + ".orig") && !fs.existsSync(filePath)) {
        fs.renameSync(filePath + ".orig", filePath);
      }
    }

    // Mark chunk PROCESSING
    await pool.query(
      `
      UPDATE proctoring_chunks
      SET status = 'PROCESSING'
      WHERE session_id = $1 AND chunk_index = $2
      `,
      [sessionId, chunkIndex]
    );

    const frameCount = 10;
    const baseTime = chunkIndex * 10;

    console.log(`🔍 [${sessionId}] Chunk ${chunkIndex}: Finding faces...`);
    const faceData = await detectFaces(filePath);
    console.log(`✅ [${sessionId}] Chunk ${chunkIndex}: Faces found. Data:`, JSON.stringify(faceData).slice(0, 100) + "...");

    // Decide whether to run Object Detection (e.g. phone)
    // Run if ANY face is detected in the frames.
    const suspiciousGaze = faceData.faceCounts && faceData.faceCounts.some(c => c >= 1);

    // always run object detection as requested
    console.log(`🔍 [${sessionId}] Chunk ${chunkIndex}: Running Object Detection...`);
    const objectData = await detectObjects(filePath);
    console.log(`✅ [${sessionId}] Chunk ${chunkIndex}: Object Detection complete. Phone detected frames: ${objectData.phoneDetected.filter(Boolean).length}`);

    // Insert signals into DB
    // Use safe length check
    const count = faceData.faceCounts ? faceData.faceCounts.length : 0;
    for (let i = 0; i < count; i++) {
      const hasFace = faceData.faceCounts[i] > 0;
      const hasPhone = objectData.phoneDetected && objectData.phoneDetected[i] ? objectData.phoneDetected[i] : false;

      await pool.query(
        `
        INSERT INTO proctoring_chunk_signals
        (session_id, timestamp_seconds, face_count, face_present, phone_detected)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          sessionId,
          baseTime + i,
          faceData.faceCounts[i],
          hasFace,
          hasPhone
        ]
      );
    }

    // Mark chunk PROCESSED
    await pool.query(
      `
      UPDATE proctoring_chunks
      SET status = 'PROCESSED'
      WHERE session_id = $1 AND chunk_index = $2
      `,
      [sessionId, chunkIndex]
    );

    return { processed: true };
  },
  { connection: redis, concurrency: 5 }
);
