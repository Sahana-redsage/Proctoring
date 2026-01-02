import { useState } from "react";
import VideoRecorder from "../components/VideoRecorder";
import { startSession, completeSession } from "../api";

export default function Candidate() {
  const [sessionId, setSessionId] = useState(null);
  const [isExamEnded, setIsExamEnded] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  async function startExam() {
    try {
      const res = await startSession();
      setSessionId(res.sessionId);
      setIsStarted(true);
      setIsExamEnded(false);
    } catch (err) {
      alert("Failed to start exam");
      console.error(err);
    }
  }

  async function endExam() {
    try {
      setIsExamEnded(true); // 🔥 stop camera
      await completeSession(sessionId);
      alert("Exam completed");
    } catch (err) {
      alert("Failed to end exam");
      console.error(err);
    }
  }

  return (
    <div>
      <h2>Candidate Exam Page</h2>

      {/* START BUTTON */}
      {!isStarted && (
        <button onClick={startExam}>
          ▶ Start Exam
        </button>
      )}

      {/* RECORDING VIEW */}
      {isStarted && (
        <>
          <p><strong>Session:</strong> {sessionId}</p>

          <VideoRecorder
            sessionId={sessionId}
            isExamEnded={isExamEnded}
          />

          {!isExamEnded && (
            <button onClick={endExam}>
              ⛔ End Exam
            </button>
          )}
        </>
      )}
    </div>
  );
}
