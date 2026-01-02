export default function EventTimeline({ events }) {
  function playEvent(event) {
    const video = document.getElementById("video");
    if (!video) return;

    // Jump to flagged start
    video.currentTime = event.startTimeSeconds;
    video.play();

    // Stop exactly at flagged end
    const durationMs =
      (event.endTimeSeconds - event.startTimeSeconds) * 1000;

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
            ⏱ {e.startTimeSeconds}s → {e.endTimeSeconds}s
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
