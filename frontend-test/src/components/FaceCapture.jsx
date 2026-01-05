import { useRef, useState, useEffect } from "react";
import { uploadReferenceImage } from "../api";

export default function FaceCapture({ sessionId, onVerified }) {
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [uploading, setUploading] = useState(false);

    const streamRef = useRef(null);

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then((s) => {
                streamRef.current = s;
                setStream(s);
                if (videoRef.current) videoRef.current.srcObject = s;
            })
            .catch((err) => console.error(err));

        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    const capture = async () => {
        if (!videoRef.current) return;

        // Create canvas to capture frame
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        canvas.getContext("2d").drawImage(videoRef.current, 0, 0, 640, 480);

        // Convert to Blob
        canvas.toBlob(async (blob) => {
            setUploading(true);
            try {
                const form = new FormData();
                form.append("sessionId", sessionId);
                form.append("image", blob, "ref.jpg");

                const res = await uploadReferenceImage(form);
                if (res.success) {
                    onVerified(); // Done
                } else {
                    alert("Upload failed");
                }
            } catch (err) {
                console.error(err);
                alert("Verification failed");
            } finally {
                setUploading(false);
            }
        }, "image/jpeg", 0.9);
    };

    return (
        <div style={{ textAlign: "center", border: "1px solid #ccc", padding: 20 }}>
            <h3>Step 1: Face Verification</h3>
            <p>Please look at the camera and take a reference photo.</p>

            <video ref={videoRef} autoPlay muted width={400} style={{ borderRadius: 8, background: "#000" }} />

            <br />
            <br />
            <button onClick={capture} disabled={uploading} style={{ fontSize: 16, padding: "10px 20px" }}>
                {uploading ? "Uploading..." : "📸 Capture Photo & Continue"}
            </button>
        </div>
    );
}
