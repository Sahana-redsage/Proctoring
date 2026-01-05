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
      <ul>
        {events.map((e, i) => (
          <li key={i}>
            <strong>{e.eventType}</strong> – {e.message}
            <br />
            <br />
            {e.endTimeSeconds ? (
              <span>⏱ {e.startTimeSeconds}s → {e.endTimeSeconds}s</span>
            ) : (
              <span>⏱ At {e.startTimeSeconds}s</span>
            )}
            <br />
            <button onClick={() => playEvent(e)}>
              ▶ Play Flagged Segment
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
