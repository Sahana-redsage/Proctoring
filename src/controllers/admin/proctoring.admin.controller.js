const pool = require("../../config/db");

/**
 * Human-readable messages for events
 */
const EVENT_MESSAGES = {
  PHONE_USAGE: "Detected mobile phone usage",
  LOOKING_AWAY: "Candidate was looking away from screen",
  NO_FACE: "Candidate not visible on camera",
  MULTIPLE_PEOPLE: "More than one person detected",
  IDENTITY_MISMATCH: "Candidate identity mismatch detected"
};

/**
 * GET /admin/proctoring/sessions
 */
exports.listSessions = async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      s.id AS "sessionId",
      s.exam_id AS "examId",
      s.candidate_id AS "candidateId",
      s.started_at AS "startedAt",
      s.ended_at AS "endedAt",
      s.final_video_url AS "finalVideoUrl",
      COUNT(e.id) AS "eventCount"
    FROM proctoring_sessions s
    LEFT JOIN proctoring_events e ON e.session_id = s.id
    WHERE s.status = 'DONE'
    GROUP BY s.id
    ORDER BY s.started_at DESC
  `);

  res.json({ success: true, sessions: rows });
};

/**
 * GET /admin/proctoring/sessions/:sessionId
 */
exports.getSessionReview = async (req, res) => {
  const { sessionId } = req.params;

  const sessionResult = await pool.query(
    `
    SELECT id, final_video_url, EXTRACT(EPOCH FROM (ended_at - started_at))::INT AS duration
    FROM proctoring_sessions
    WHERE id = $1 AND status = 'DONE'
    `,
    [sessionId]
  );

  if (!sessionResult.rows.length) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  const { rows: events } = await pool.query(
    `
    SELECT
      event_type,
      start_time_seconds,
      end_time_seconds,
      duration_seconds,
      confidence_score
    FROM proctoring_events
    WHERE session_id = $1
    ORDER BY start_time_seconds
    `,
    [sessionId]
  );

  const formattedEvents = events.map(e => ({
    eventType: e.event_type,
    message: EVENT_MESSAGES[e.event_type] || "Suspicious activity detected",
    startTimeSeconds: e.start_time_seconds,
    endTimeSeconds: e.end_time_seconds,
    durationSeconds: e.duration_seconds,
    confidenceScore: e.confidence_score
  }));

  res.json({
    success: true,
    session: {
      sessionId,
      finalVideoUrl: sessionResult.rows[0].final_video_url,
      durationSeconds: sessionResult.rows[0].duration
    },
    events: formattedEvents
  });
};
