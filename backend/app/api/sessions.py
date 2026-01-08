import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.utils.r2 import upload_file
from app.db import get_db

router = APIRouter()

@router.post("/start")
def start_session(exam_id: str, candidate_id: str):
    session_id = str(uuid.uuid4())
    
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO proctoring_sessions (id, exam_id, candidate_id, status, started_at)
            VALUES (%s, %s, %s, 'ACTIVE', now())
        """, (session_id, exam_id, candidate_id))
        conn.commit()
    except Exception as e:
        print(f"Error starting session: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to start session: {str(e)}")
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

    return {
        "session_id": session_id,
        "status": "ACTIVE"
    }


@router.post("/{session_id}/reference-photo")
async def upload_reference_photo(
    session_id: str,
    file: UploadFile = File(...)
):
    key = f"{session_id}/reference/reference.jpg"
    url = upload_file(file.file, key)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE proctoring_sessions
        SET reference_image_url=%s
        WHERE id=%s
    """, (url, session_id))
    conn.commit()
    cur.close()
    conn.close()

    return {"status": "uploaded", "url": url}

@router.post("/{session_id}/end")
def end_exam(session_id: str, last_chunk_index: int):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        UPDATE proctoring_sessions
        SET status = 'PROCESSING',
            expected_chunk_count = %s,
            ended_at = now()
        WHERE id = %s
          AND status = 'ACTIVE'
    """, (last_chunk_index + 1, session_id))

    if cur.rowcount == 0:
        cur.close()
        conn.close()
        raise HTTPException(400, "Session not active or already ended")

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "processing",
        "expected_chunks": last_chunk_index + 1
    }
