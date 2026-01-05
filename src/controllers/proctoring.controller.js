const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const redis = require("../config/redis");
const { chunkQueue, finalizeQueue } = require("../config/bullmq");
const { BATCH_SIZE } = require("../config/env");



// 1️⃣ START SESSION
exports.startSession = async (req, res) => {
  const { examId, candidateId } = req.body;

  if (!examId || !candidateId) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  const sessionId = uuidv4();

  await pool.query(
    `
    INSERT INTO proctoring_sessions (id, exam_id, candidate_id, status)
    VALUES ($1, $2, $3, 'ACTIVE')
    `,
    [sessionId, examId, candidateId]
  );

  res.json({ success: true, sessionId });
};

// 1.5 UPLOAD REFERENCE IMAGE
exports.uploadReferenceImage = async (req, res) => {
  const { sessionId } = req.body;
  if (!req.file || !sessionId) {
    return res.status(400).json({ success: false, message: "Missing image or session ID" });
  }

  // Store in Redis with long TTL
  const redisKey = `session:${sessionId}:reference_face`;
  await redis.setex(redisKey, 7200, req.file.buffer);

  console.log(`📸 [${sessionId}] Reference face saved to Redis.`);
  res.json({ success: true, message: "Reference face saved" });
};

// 2️⃣ UPLOAD CHUNK
// 2️⃣ UPLOAD CHUNK (REDIS STORAGE)
exports.uploadChunk = async (req, res) => {
  const {
    sessionId
  } = req.body;
  const chunkIndex = parseInt(req.body.chunkIndex);

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const startTimeSeconds = Math.round(parseFloat(req.body.startTimeSeconds));
  const endTimeSeconds = Math.round(parseFloat(req.body.endTimeSeconds));

  console.log(`📤 [${sessionId}] Received Chunk ${chunkIndex} (${startTimeSeconds}s - ${endTimeSeconds}s)`);

  // Store in Redis (Buffer)
  // Set TTL to 2 hours (7200 sec) to clean up abandoned sessions
  const redisKey = `session:${sessionId}:chunk:${chunkIndex}`;
  await redis.setex(redisKey, 7200, req.file.buffer);

  // Insert chunk metadata (filePath is now 'REDIS')
  await pool.query(
    `
    INSERT INTO proctoring_chunks
    (session_id, chunk_index, start_time_seconds, end_time_seconds, file_path, status)
    VALUES ($1, $2, $3, $4, 'REDIS', 'RECEIVED')
    ON CONFLICT (session_id, chunk_index) DO NOTHING
    `,
    [
      sessionId,
      chunkIndex,
      startTimeSeconds,
      endTimeSeconds
    ]
  );

  // OPTIMIZATION: Only trigger AI processing every BATCH_SIZE chunks
  // For BATCH_SIZE=3, triggers at index 2, 5, 8... (0-indexed)
  if ((chunkIndex + 1) % BATCH_SIZE === 0) {
    const fromIndex = chunkIndex - (BATCH_SIZE - 1);
    console.log(`🚀 [${sessionId}] Batch Complete (${fromIndex}-${chunkIndex}). Queuing AI Job.`);

    await chunkQueue.add("PROCESS_BATCH_AI", {
      sessionId,
      fromChunkIndex: fromIndex,
      toChunkIndex: chunkIndex
    }, {
      jobId: `batch:${sessionId}:${fromIndex}`, // Prevent duplicates
      removeOnComplete: true, // Keep Redis clean
      removeOnFail: 500 // Keep last 500 failed jobs for debugging
    });
  }

  res.json({ success: true, chunkIndex });
};

// 3️⃣ COMPLETE SESSION
exports.completeSession = async (req, res) => {
  const { sessionId } = req.body;

  await pool.query(
    `
    UPDATE proctoring_sessions
    SET status = 'COMPLETED', ended_at = now()
    WHERE id = $1
    `,
    [sessionId]
  );

  await finalizeQueue.add("FINALIZE_SESSION", { sessionId });

  res.json({
    success: true,
    message: "Session marked for final processing"
  });
};
