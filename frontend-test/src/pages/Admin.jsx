import { useEffect, useState } from "react";
import {
  getAdminSessions,
  getAdminSessionReview
} from "../api";
import EventTimeline from "../components/EventTimeline";

export default function Admin() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [reviewData, setReviewData] = useState(null);

  // Load all completed sessions
  useEffect(() => {
    getAdminSessions().then(res => {
      if (res.success) setSessions(res.sessions);
    });
  }, []);

  // Load review data when session selected
  async function loadSession(sessionId) {
    setSelectedSession(sessionId);
    const res = await getAdminSessionReview(sessionId);
    if (res.success) setReviewData(res);
  }

  return (
    <div>
      <h2>Admin – Proctoring Review</h2>

      {/* SESSION LIST */}
      <div>
        <h3>Completed Exams</h3>
        <ul>
          {sessions.map(s => (
            <li key={s.sessionId}>
              <strong>{s.sessionId}</strong>
              <br />
              Events: {s.eventCount}
              <br />
              <button onClick={() => loadSession(s.sessionId)}>
                Review
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* REVIEW PANEL */}
      {reviewData && (
        <div>
          <h3>Exam Video Review</h3>

          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
            {/* LEFT: VIDEO PLAYER */}
            <div style={{ flex: "0 0 700px" }}>
              <video
                id="video"
                width="100%"
                controls
                src={reviewData.session.finalVideoUrl}
                style={{ borderRadius: "8px", border: "1px solid #ccc", display: "block" }}
              />
            </div>

            {/* RIGHT: SCROLLABLE EVENTS SIDEBAR */}
            <div style={{
              flex: 1,
              height: "500px",
              overflowY: "auto",
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "10px",
              backgroundColor: "#f9f9f9"
            }}>
              <EventTimeline events={reviewData.events} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
