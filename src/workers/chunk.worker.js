const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");
const { detectFaces, detectObjects } = require("../services/ai.service");

console.log("🟢 Chunk Worker started");

new Worker(
  "chunkQueue",
  async (job) => {
    const { sessionId, chunkIndex, filePath } = job.data;

    console.log(`📦 Processing chunk ${chunkIndex} for session ${sessionId}`);

    // Mark chunk PROCESSING
    await pool.query(
      `
      UPDATE proctoring_chunks
      SET status = 'PROCESSING'
      WHERE session_id = $1 AND chunk_index = $2
      `,
      [sessionId, chunkIndex]
    );

    /**
     * FRAME SAMPLING (STUB)
     * Later: FFmpeg extract 1 FPS frames
     * For now: simulate 10 frames
     */
    const frameCount = 10;
    const baseTime = chunkIndex * 10;
    const faceData = await detectFaces(filePath);

    // Decide whether to run YOLO
    const suspiciousGaze = faceData.faceCounts.some(c => c === 1);

    let objectData = { phoneDetected: [] };
    if (suspiciousGaze) {
      objectData = await detectObjects(filePath);
    }

    for (let i = 0; i < faceData.faceCounts.length; i++) {
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
          faceData.faceCounts[i] > 0,
          objectData.phoneDetected[i] || false
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
