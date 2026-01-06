export default function EventTimeline({ events }) {
  function playEvent(event) {
    const video = document.getElementById("video");
    if (!video) return;

    // Jump to flagged start
    video.currentTime = event.startTimeSeconds;
    video.play();

    // Stop exactly at flagged end
    // Stop exactly at flagged end (or default 5s if unknown)
    const end = event.endTimeSeconds || (event.startTimeSeconds + 5);
    const durationMs = (end - event.startTimeSeconds) * 1000;

    setTimeout(() => {
      video.pause();
    }, durationMs);
  }

  return (
    <div>
      <h3>Flagged Events</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {events.map((e, i) => (
          <li key={i} style={{
            marginBottom: "10px",
            padding: "10px",
            border: "1px solid #eee",
            borderRadius: "5px",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
              <strong style={{ color: "#d93025" }}>{e.eventType}</strong>
              <small style={{ color: "#666" }}>
                {e.endTimeSeconds ? (
                  <span>{e.startTimeSeconds}s - {e.endTimeSeconds}s</span>
                ) : (
                  <span>@{e.startTimeSeconds}s</span>
                )}
              </small>
            </div>

            <div style={{ fontSize: "0.9em", color: "#444", marginBottom: "8px" }}>
              {e.message}
            </div>

            <button
              onClick={() => playEvent(e)}
              style={{
                width: "100%",
                padding: "6px",
                cursor: "pointer",
                background: "#f1f3f4",
                border: "1px solid #dadce0",
                borderRadius: "4px",
                fontWeight: "500"
              }}
            >
              ▶ Play Segment
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
