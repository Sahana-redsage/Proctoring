from processors.event_messages import EVENT_MESSAGES

class EventAggregator:
    def __init__(self, event_type, start_time, confidence):
        self.event_type = event_type
        self.start_time = start_time
        self.end_time = start_time
        self.confidence = confidence

    def update(self, ts, confidence):
        self.end_time = ts
        self.confidence = max(self.confidence, confidence)

    def to_record(self, session_id, chunk_index):
        message = EVENT_MESSAGES.get(
            self.event_type,
            "Suspicious activity detected"
        )

        return {
            "session_id": session_id,
            "event_type": self.event_type,
            "message": message,
            "start_time_seconds": int(self.start_time),
            "end_time_seconds": int(self.end_time),
            "duration_seconds": int(self.end_time - self.start_time),
            "confidence_score": float(self.confidence),
            "source_chunk_index": chunk_index,
            "video_seek_seconds": int(self.start_time),
        }
