import { useEffect, useRef, useState } from "react";
import {
  startSession,
  uploadReferencePhoto,
  uploadChunk,
  endSession
} from "../api";

export default function Candidate() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const [sessionId, setSessionId] = useState(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const chunkIndexRef = useRef(0);
  const [referenceCaptured, setReferenceCaptured] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [isExamEnded, setIsExamEnded] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const pendingUploadsRef = useRef([]); // Track upload promises

  /* 1️⃣ START SESSION + CAMERA PREVIEW */
  const handleStartExam = async () => {
    try {
      const data = await startSession();
      setSessionId(data.session_id);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Failed to start exam:", err);
      alert("Error starting exam. Please check camera permissions.");
    }
  };

  /* 2️⃣ CAPTURE REFERENCE PHOTO FROM VIDEO */
  const handleCaptureReference = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      try {
        await uploadReferencePhoto(sessionId, blob);
        setReferenceCaptured(true);
      } catch (err) {
        console.error("Failed to upload reference photo:", err);
        alert("Failed to upload photo. Try again.");
      }
    }, "image/jpeg");
  };

  /* 3️⃣ START RECORDING (CHUNKS WITH HEADERS) */
  const handleStartRecording = () => {
    isRecordingRef.current = true;
    setIsRecording(true);
    recordChunk();
  };

  const recordChunk = () => {
    if (!isRecordingRef.current) return;

    const stream = videoRef.current.srcObject;
    if (!stream) return;

    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const currentIdx = chunkIndexRef.current;

    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        // Increment BEFORE upload so the reported count is accurate
        const uploadPromise = uploadChunk(sessionId, currentIdx, e.data);
        pendingUploadsRef.current.push(uploadPromise);

        try {
          await uploadPromise;
        } finally {
          // Remove from pending list when done
          pendingUploadsRef.current = pendingUploadsRef.current.filter(p => p !== uploadPromise);
        }
      }
    };

    recorder.onstop = () => {
      chunkIndexRef.current++;
      setChunkIndex(chunkIndexRef.current);

      if (isRecordingRef.current) {
        recordChunk(); // Start next chunk
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;

    // Collect video based on env duration, then stop to trigger upload & next chunk
    setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, parseInt(import.meta.env.VITE_CHUNK_DURATION_MS) || 30000);
  };

  /* 4️⃣ END EXAM */
  const handleEndExam = async () => {
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    // Stop all tracks
    const stream = videoRef.current.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    setIsRecording(false);
    setIsFinalizing(true);

    // Wait for all pending uploads to complete
    try {
      if (pendingUploadsRef.current.length > 0) {
        console.log(`Waiting for ${pendingUploadsRef.current.length} pending uploads...`);
        await Promise.all(pendingUploadsRef.current);
      }

      // Now safe to end session. chunkIndexRef.current is already the correct total count.
      // because it was incremented in onstop of the last recorder.
      await endSession(sessionId, chunkIndexRef.current - 1);
      alert("Exam submitted successfully! Results will be processed shortly.");
      setIsExamEnded(true);
    } catch (err) {
      console.error("Failed to finalise session:", err);
      alert("There was an issue submitting your exam. Please contact support.");
    } finally {
      setIsFinalizing(false);
    }
  };

  /* 5️⃣ Prevent accidental tab close during upload */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isFinalizing || (isRecording && !isExamEnded)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isFinalizing, isRecording, isExamEnded]);

  return (
    <div style={{
      maxWidth: "900px",
      margin: "2rem auto",
      padding: "2rem",
      fontFamily: " 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      backgroundColor: "#fff",
      borderRadius: "16px",
      boxShadow: "0 10px 25px rgba(0,0,0,0.1)"
    }}>
      <header style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ color: "#1a73e8", margin: 0 }}>SafeExam Proctoring</h1>
        <p style={{ color: "#5f6368" }}>Secure Exam Environment</p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>

        {/* Progress Bar / Steps */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          {[
            { label: "Start", done: !!sessionId },
            { label: "Verify", done: referenceCaptured },
            { label: "Exam", done: isRecording || isFinalizing || isExamEnded }
          ].map((step, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: "24px", height: "24px", borderRadius: "50%",
                backgroundColor: step.done ? "#34a853" : "#dadce0",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px"
              }}>{idx + 1}</div>
              <span style={{ color: step.done ? "#333" : "#70757a", fontWeight: step.done ? "bold" : "normal" }}>{step.label}</span>
              {idx < 2 && <div style={{ width: "40px", height: "2px", backgroundColor: "#dadce0" }} />}
            </div>
          ))}
        </div>

        {/* Video Preview Container */}
        <div style={{
          position: "relative",
          width: "640px",
          height: "480px",
          backgroundColor: "#202124",
          borderRadius: "12px",
          overflow: "hidden",
          border: isRecording ? "4px solid #ea4335" : "4px solid #1a73e8"
        }}>
          {!sessionId && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              <button
                onClick={handleStartExam}
                style={{
                  padding: "1rem 2.5rem", fontSize: "1.2rem", backgroundColor: "#1a73e8", color: "#fff",
                  border: "none", borderRadius: "30px", cursor: "pointer", fontWeight: "bold",
                  boxShadow: "0 4px 10px rgba(26,115,232,0.4)"
                }}
              >
                Enter Examination Room
              </button>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: (sessionId && !isExamEnded && !isFinalizing) ? "block" : "none"
            }}
          />

          {isFinalizing && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", backgroundColor: "#1a73e8" }}>
              <h2>Finalizing Submission...</h2>
              <p>Please do not close this tab. Uploading final video chunks.</p>
              <div className="loader" style={{ marginTop: "1rem" }}></div>
            </div>
          )}

          {isExamEnded && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", backgroundColor: "#34a853" }}>
              <h2>Submission Successful</h2>
              <p>Your exam has been submitted for review. You can now close this tab.</p>
            </div>
          )}

          {isRecording && (
            <div style={{ position: "absolute", top: "20px", left: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#ea4335", animation: "blink 1s infinite" }} />
              <span style={{ color: "#fff", fontWeight: "bold", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>LIVE PROCTORING ACTIVE</span>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "1rem" }}>
          {sessionId && !referenceCaptured && (
            <button
              onClick={handleCaptureReference}
              style={{
                padding: "0.8rem 2rem", backgroundColor: "#34a853", color: "#fff",
                border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold"
              }}
            >
              Verify Identity (Capture Photo)
            </button>
          )}

          {referenceCaptured && !isRecording && !isExamEnded && (
            <button
              onClick={handleStartRecording}
              style={{
                padding: "0.8rem 2rem", backgroundColor: "#1a73e8", color: "#fff",
                border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold"
              }}
            >
              Start Examination
            </button>
          )}

          {isRecording && (
            <button
              onClick={handleEndExam}
              style={{
                padding: "0.8rem 2rem", backgroundColor: "#ea4335", color: "#fff",
                border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold"
              }}
            >
              Finish & Submit Exam
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        .loader {
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top: 4px solid #fff;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
