const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/db");

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

    for (let i = 0; i < frameCount; i++) {
      const timestamp = baseTime + i;

      // 🔹 STUB SIGNALS (replace with MediaPipe / YOLO)
      const facePresent = true;
      const faceCount = 1;
      const pitch = Math.random() * 30; // fake head pitch
      const phoneDetected = pitch > 22; // fake logic

      await pool.query(
        `
        INSERT INTO proctoring_chunk_signals
        (session_id, timestamp_seconds, face_count, face_present, head_pitch, phone_detected)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          sessionId,
          timestamp,
          faceCount,
          facePresent,
          pitch,
          phoneDetected
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
