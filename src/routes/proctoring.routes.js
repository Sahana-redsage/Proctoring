const express = require("express");
const router = express.Router();

const upload = require("../middlewares/upload.middleware");
const controller = require("../controllers/proctoring.controller");

// Start session
router.post("/session/start", controller.startSession);

// Upload Reference Face (Identity Check)
router.post(
  "/session/reference-image",
  upload.single("image"),
  controller.uploadReferenceImage
);

// Upload chunk
router.post(
  "/chunk/upload",
  upload.single("video"),
  controller.uploadChunk
);

// Complete session
router.post("/session/complete", controller.completeSession);

module.exports = router;
