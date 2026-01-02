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
          <h3>Exam Video</h3>

          <video
            id="video"
            width="700"
            controls
            src={reviewData.session.finalVideoUrl}
          />

          <EventTimeline events={reviewData.events} />
        </div>
      )}
    </div>
  );
}
