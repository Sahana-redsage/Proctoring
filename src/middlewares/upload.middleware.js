const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadRoot = path.join(process.cwd(), "tmp", "proctoring");

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { sessionId } = req.body;

    const sessionDir = path.join(uploadRoot, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const { chunkIndex } = req.body;
    cb(null, `chunk_${String(chunkIndex).padStart(5, "0")}.webm`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB per chunk
  }
});

module.exports = upload;
