from app.db import get_db

def create_chunk(session_id, chunk_index, start_sec, end_sec, r2_url):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO proctoring_chunks
        (session_id, chunk_index, start_time_seconds, end_time_seconds, r2_url, status)
        VALUES (%s, %s, %s, %s, %s, 'RECEIVED')
        ON CONFLICT (session_id, chunk_index) DO NOTHING
    """, (session_id, chunk_index, start_sec, end_sec, r2_url))
    conn.commit()
    cur.close()
    conn.close()

def mark_processing(session_id, chunk_index):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE proctoring_chunks
        SET status='PROCESSING'
        WHERE session_id=%s AND chunk_index=%s
    """, (session_id, chunk_index))
    conn.commit()
    cur.close()
    conn.close()


def mark_processed(session_id, chunk_index):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE proctoring_chunks
        SET status='PROCESSED'
        WHERE session_id=%s AND chunk_index=%s
    """, (session_id, chunk_index))
    conn.commit()
    cur.close()
    conn.close()

def get_chunk_url(session_id, chunk_index):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT r2_url
        FROM proctoring_chunks
        WHERE session_id=%s AND chunk_index=%s
    """, (session_id, chunk_index))

    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return None

    return row["r2_url"]
