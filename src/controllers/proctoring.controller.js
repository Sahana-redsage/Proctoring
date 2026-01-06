const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const redis = require("../config/redis");
const { chunkQueue, finalizeQueue } = require("../config/bullmq");
const { BATCH_SIZE } = require("../config/env");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { uploadToR2 } = require("../services/r2.service");

const STORAGE_DIR = path.join(os.tmpdir(), "proctoring_storage");
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });


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

  try {
    // 1. Save to Temp Disk temporarily for Upload
    const tempPath = path.join(os.tmpdir(), `${sessionId}_ref.jpg`);
    fs.writeFileSync(tempPath, req.file.buffer);

    // 2. Upload to Cloudflare R2
    const r2Key = `proctoring/reference/${sessionId}.jpg`;
    const r2Url = await uploadToR2(tempPath, r2Key);

    // 3. Store URL in Redis
    const redisKey = `session:${sessionId}:reference_image_url`;
    await redis.set(redisKey, r2Url);

    // Cleanup
    fs.unlinkSync(tempPath);

    console.log(`📸 [${sessionId}] Reference face uploaded to R2: ${r2Url}`);
    res.json({ success: true, message: "Reference face uploaded and saved" });
  } catch (err) {
    console.error(`❌ [${sessionId}] Reference upload failed:`, err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};

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

  // 💾 SAVE TO DISK (Cache/Backup)
  const sessionDir = path.join(STORAGE_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}.webm`);
  fs.writeFileSync(chunkPath, req.file.buffer);

  // ☁️ UPLOAD TO R2 (Requirement)
  // We can do this asynchronously if we don't want to block, but requirement implies backend "Need to upload"
  // Let's await it to be safe for now, or fire and forget if performance is critical.
  // Given "worker processing", reliability > speed here.
  const r2Key = `proctoring/${sessionId}/chunk_${chunkIndex}.webm`;
  let r2Url = "";
  try {
    r2Url = await uploadToR2(chunkPath, r2Key);
    // Store in Redis Hash
    await redis.hset(`session:${sessionId}:chunks`, chunkIndex, r2Url);
    console.log(`☁️ [${sessionId}] Chunk ${chunkIndex} uploaded to R2.`);
  } catch (e) {
    console.error(`❌ [${sessionId}] R2 Chunk Upload failed:`, e);
    // Fallback? proceed with local flow
  }

  console.log(`💾 [${sessionId}] Saved Chunk ${chunkIndex} to disk: ${chunkPath}`);

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
      chunkPath // Store actual path
    ]
  );

  // OPTIMIZATION: Only trigger AI processing every BATCH_SIZE chunks
  // For BATCH_SIZE=3, triggers at index 2, 5, 8... (0-indexed)
  if ((chunkIndex + 1) % BATCH_SIZE === 0) {
    const fromIndex = chunkIndex - (BATCH_SIZE - 1);
    console.log(`🚀 [${sessionId}] Batch Triggered! Index: ${chunkIndex}, BATCH_SIZE: ${BATCH_SIZE}, Batch Range: ${fromIndex}-${chunkIndex}`);

    try {
      await chunkQueue.add("PROCESS_BATCH_AI", {
        sessionId,
        fromChunkIndex: fromIndex,
        toChunkIndex: chunkIndex
      }, {
        jobId: `batch:${sessionId}:${fromIndex}`, // Prevent duplicates
        removeOnComplete: true, // Keep Redis clean
        removeOnFail: 500 // Keep last 500 failed jobs for debugging
      });
      console.log(`✅ [${sessionId}] Job added to queue: batch:${sessionId}:${fromIndex}`);
    } catch (err) {
      console.error(`❌ [${sessionId}] Failed to add job to queue:`, err);
    }
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
