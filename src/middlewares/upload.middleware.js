const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB per chunk
  }
});

module.exports = upload;
