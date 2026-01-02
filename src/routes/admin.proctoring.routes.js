const express = require("express");
const router = express.Router();

const controller = require("../controllers/admin/proctoring.admin.controller");

// List all completed sessions
router.get("/proctoring/sessions", controller.listSessions);

// Get full review data for a session
router.get("/proctoring/sessions/:sessionId", controller.getSessionReview);

module.exports = router;
