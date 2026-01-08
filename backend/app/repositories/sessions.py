from app.db import get_db

def get_reference_image(session_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT reference_image_url
        FROM proctoring_sessions
        WHERE id=%s
    """, (session_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    return row["reference_image_url"] if row else None
