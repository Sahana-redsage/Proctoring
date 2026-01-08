from app.db import get_db

def insert_event(event):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO proctoring_events
        (
            session_id,
            event_type,
            message,
            start_time_seconds,
            end_time_seconds,
            duration_seconds,
            confidence_score,
            source_chunk_index,
            video_seek_seconds
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        event["session_id"],
        event["event_type"],
        event["message"],
        event["start_time_seconds"],
        event["end_time_seconds"],
        event["duration_seconds"],
        event["confidence_score"],
        event["source_chunk_index"],
        event["video_seek_seconds"]
    ))
    conn.commit()
    cur.close()
    conn.close()
