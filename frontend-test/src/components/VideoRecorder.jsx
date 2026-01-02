import { useEffect, useRef } from "react";
import { uploadChunk } from "../api";

export default function VideoRecorder({ sessionId, isExamEnded }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const startedRef = useRef(false); // prevents double init

  // ✅ SAFE STOP FUNCTION (never crashes)
  const stopRecording = () => {
    // Stop MediaRecorder safely
    if (
      recorderRef.current &&
      recorderRef.current.state === "recording"
    ) {
      recorderRef.current.stop();
    }

    // Stop camera tracks safely
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        if (track.readyState === "live") {
          track.stop();
        }
      });
      streamRef.current = null;
    }

    recorderRef.current = null;
  };

  // 🎥 START RECORDING
  useEffect(() => {
    if (!sessionId || startedRef.current) return;

    startedRef.current = true;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then(stream => {
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream, {
          mimeType: "video/webm"
        });

        recorderRef.current = recorder;

        recorder.ondataavailable = async e => {
          if (isExamEnded) return;
          if (!e.data || e.data.size === 0) return;

          const form = new FormData();
          form.append("sessionId", sessionId);
          form.append("chunkIndex", chunkIndexRef.current);
          form.append(
            "startTimeSeconds",
            chunkIndexRef.current * 10
          );
          form.append(
            "endTimeSeconds",
            (chunkIndexRef.current + 1) * 10
          );
          form.append("video", e.data);

          await uploadChunk(form);
          chunkIndexRef.current += 1;
        };

        recorder.start(10000); // 10s chunks
      })
      .catch(err => {
        console.error("Camera error:", err);
        alert("Camera access failed");
      });

    // 🔁 CLEANUP (SAFE)
    return () => {
      stopRecording();
    };
  }, [sessionId]);

  // 🛑 STOP WHEN EXAM ENDS
  useEffect(() => {
    if (isExamEnded) {
      stopRecording();
    }
  }, [isExamEnded]);

  return <p>🎥 Recording exam…</p>;
}
