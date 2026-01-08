import { useEffect, useState } from "react";
import {
  getAdminSessions,
  getAdminSessionEvents,
  getAdminSessionVideo
} from "../api";

export default function Admin() {
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    refreshSessions();
  }, []);

  const refreshSessions = async () => {
    const res = await getAdminSessions();
    if (res.success) setSessions(res.sessions);
  };

  const loadSession = async (id) => {
    setSelectedId(id);
    const evRes = await getAdminSessionEvents(id);
    const vidRes = await getAdminSessionVideo(id);

    if (evRes.success) setEvents(evRes.events);
    if (vidRes.success) setVideoUrl(vidRes.videoUrl);
  };

  const seekVideo = (seconds) => {
    const video = document.getElementById("admin-player");
    if (video) {
      video.currentTime = seconds;
      video.play();
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", backgroundColor: "#f4f7f6", minHeight: "100vh" }}>
      <h1 style={{ color: "#2c3e50", marginBottom: "2rem" }}>Admin Proctoring Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "2rem" }}>
        {/* Sidebar: Sessions List */}
        <div style={{ backgroundColor: "#fff", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Recent Sessions</h3>
          <button
            onClick={refreshSessions}
            style={{ width: "100%", marginBottom: "1rem", padding: "0.5rem", cursor: "pointer", borderRadius: "6px", border: "1px solid #ddd" }}
          >
            Refresh List
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                style={{
                  padding: "0.8rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: selectedId === s.id ? "#e3f2fd" : "#f9f9f9",
                  border: selectedId === s.id ? "1px solid #2196f3" : "1px solid #eee",
                  transition: "all 0.2s"
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#333" }}>{s.id.slice(0, 8)}...</div>
                <div style={{ fontSize: "0.8rem", color: "#666" }}>Status: <span style={{ color: s.status === "COMPLETED" ? "green" : "orange" }}>{s.status}</span></div>
                <div style={{ fontSize: "0.7rem", color: "#999" }}>{new Date(s.started_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content: Video and Events */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {selectedId ? (
            <>
              {/* Video Player Section */}
              <div style={{ backgroundColor: "#fff", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                <h3 style={{ marginTop: 0 }}>Session Recording: {selectedId}</h3>
                {videoUrl ? (
                  <video
                    id="admin-player"
                    src={videoUrl}
                    controls
                    style={{ width: "100%", borderRadius: "8px", backgroundColor: "#000" }}
                  />
                ) : (
                  <div style={{ height: "400px", backgroundColor: "#eee", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
                    {sessions.find(s => s.id === selectedId)?.status === 'PROCESSING'
                      ? "Video is still processing..."
                      : "No video available for this session"}
                  </div>
                )}
              </div>

              {/* Events Timeline Section */}
              <div style={{ backgroundColor: "#fff", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                <h3 style={{ marginTop: 0 }}>Flagged Events</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {events.length > 0 ? (
                    events.map((e, i) => (
                      <div
                        key={i}
                        onClick={() => seekVideo(e.video_seek_seconds)}
                        style={{
                          padding: "1rem",
                          borderRadius: "8px",
                          border: "1px solid #ffebee",
                          backgroundColor: "#fff5f5",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: "bold", color: "#d32f2f", marginRight: "0.5rem" }}>{e.event_type}</span>
                          <span style={{ color: "#555" }}>{e.message}</span>
                        </div>
                        <div style={{ fontSize: "0.9rem", color: "#777", fontWeight: "500" }}>
                          at {Math.floor(e.video_seek_seconds)}s
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#666", fontStyle: "italic" }}>No suspicious events flagged for this session.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: "12px", color: "#999" }}>
              Select a session from the sidebar to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
