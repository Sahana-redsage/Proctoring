import { useEffect, useRef } from "react";
import { uploadChunk } from "../api";

export default function VideoRecorder({ sessionId, isExamEnded }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const startedRef = useRef(false); // prevents double init
  const recordingStartTimeRef = useRef(null);
  const lastChunkEndTimeRef = useRef(0);

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
        recordingStartTimeRef.current = Date.now();

        const recorder = new MediaRecorder(stream, {
          mimeType: "video/webm"
        });

        recorderRef.current = recorder;

        // Helper to handle upload
        const handleDataAvailable = async (e) => {
          // Allow final chunk to upload even if isExamEnded is true
          if (!e.data || e.data.size === 0) return;

          const CHUNK_DURATION = 30; // 30 Seconds

          const currentIndex = chunkIndexRef.current;
          chunkIndexRef.current += 1; // Increment immediately

          const now = Date.now();
          // Calculate precise duration based on elapsed time since start
          const elapsedSeconds = (now - (recordingStartTimeRef.current || now)) / 1000;

          let startTime = lastChunkEndTimeRef.current;
          let endTime = elapsedSeconds;

          // Guard against erratic timers (ensure at least some duration)
          if (endTime <= startTime) endTime = startTime + 0.1;

          lastChunkEndTimeRef.current = endTime;

          const form = new FormData();
          form.append("sessionId", sessionId);
          form.append("chunkIndex", currentIndex);
          form.append("startTimeSeconds", startTime);
          form.append("endTimeSeconds", endTime);
          form.append("video", e.data);

          try {
            await uploadChunk(form);
            console.log(`Chunk ${currentIndex} uploaded (${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s)`);
          } catch (err) {
            console.error(`Chunk ${currentIndex} upload failed`, err);
          }
        };

        recorder.ondataavailable = handleDataAvailable;

        // Start initial recording
        recorder.start();

        // Restart recording every 30 seconds to ensure valid WebM headers for each chunk
        const interval = setInterval(() => {
          if (recorder.state === "recording") {
            recorder.stop();
            // Tiny delay/async restart handled in stop callback logic if needed, 
            // but here we just restart.
            setTimeout(() => {
              if (recorder.state === "inactive" && !isExamEnded) {
                recorder.start();
              }
            }, 100);
          }
        }, 30000);

        // Store interval to clear on unmount
        recorderRef.current.interval = interval;
      })
      .catch(err => {
        console.error("Camera error:", err);
        alert("Camera access failed");
      });

    // 🔁 CLEANUP (SAFE)
    return () => {
      if (recorderRef.current && recorderRef.current.interval) {
        clearInterval(recorderRef.current.interval);
      }
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
