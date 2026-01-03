const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const { chunkQueue, batchQueue, finalizeQueue } = require("../config/bullmq");

const BATCH_SIZE = 3; // 3 chunks = 1 batch

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

// 2️⃣ UPLOAD CHUNK
exports.uploadChunk = async (req, res) => {
  const {
    sessionId,
    startTimeSeconds,
    endTimeSeconds
  } = req.body;
  const chunkIndex = parseInt(req.body.chunkIndex);

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const filePath = req.file.path;

  // Insert chunk metadata
  await pool.query(
    `
    INSERT INTO proctoring_chunks
    (session_id, chunk_index, start_time_seconds, end_time_seconds, file_path, status)
    VALUES ($1, $2, $3, $4, $5, 'RECEIVED')
    ON CONFLICT (session_id, chunk_index) DO NOTHING
    `,
    [
      sessionId,
      chunkIndex,
      startTimeSeconds,
      endTimeSeconds,
      filePath
    ]
  );

  // Push chunk job
  await chunkQueue.add("PROCESS_CHUNK", {
    sessionId,
    chunkIndex,
    filePath
  });

  // Batch trigger
  if ((chunkIndex + 1) % BATCH_SIZE === 0) {
    await batchQueue.add("PROCESS_BATCH", {
      sessionId,
      fromChunkIndex: chunkIndex - (BATCH_SIZE - 1),
      toChunkIndex: chunkIndex
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
