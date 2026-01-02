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

    console.log(`🔍 [${sessionId}] Chunk ${chunkIndex}: Finding faces...`);
    const faceData = await detectFaces(filePath);
    console.log(`✅ [${sessionId}] Chunk ${chunkIndex}: Faces found. Data:`, JSON.stringify(faceData).slice(0, 100) + "...");

    // Decide whether to run YOLO
    const suspiciousGaze = faceData.faceCounts.some(c => c === 1); // logic seems to imply 1 face is suspicious? or maybe user meant != 1? Assuming keeping existing logic for now but usually > 1 or 0 is suspicious.
    // Actually if c === 1 it means 1 face found. If c > 1 multiple faces. If c == 0 no face.
    // The previous code said: const suspiciousGaze = faceData.faceCounts.some(c => c === 1);
    // Wait, usually if a face is there it's good. 
    // If multiple faces or no faces, that's suspicious. 
    // But the code says "suspiciousGaze = ... some(c => c === 1)". 
    // This implies if there IS a face, we check for objects? 
    // Let's just add logs and not change logic unless user asked.
    // User asked "add more console logs... to know everything".

    let objectData = { phoneDetected: [] };
    if (suspiciousGaze) {
      console.log(`🔍 [${sessionId}] Chunk ${chunkIndex}: Suspicious behavior (or face present). Running Object Detection...`);
      objectData = await detectObjects(filePath);
      console.log(`✅ [${sessionId}] Chunk ${chunkIndex}: Object Detection complete.`);
    } else {
      console.log(`⏭️ [${sessionId}] Chunk ${chunkIndex}: No object detection needed.`);
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
