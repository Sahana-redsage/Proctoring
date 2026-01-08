from fastapi import APIRouter
from app.db import get_db

router = APIRouter(prefix="/admin")

@router.get("/sessions")
def list_sessions():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, candidate_id, status, started_at, ended_at, final_video_url
        FROM proctoring_sessions
        ORDER BY started_at DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@router.get("/sessions/{session_id}/events")
def get_events(session_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT event_type, message,
               start_time_seconds, end_time_seconds,
               confidence_score, video_seek_seconds
        FROM proctoring_events
        WHERE session_id = %s
        ORDER BY start_time_seconds
    """, (session_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@router.get("/sessions/{session_id}/video")
def get_final_video(session_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT final_video_url
        FROM proctoring_sessions
        WHERE id = %s
    """, (session_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row
