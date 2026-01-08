import os
import tempfile
import requests

from app.db import get_db
from app.utils.r2 import upload_file
from processors.video_merger import merge_videos

def finalize_session(session_id):
    conn = get_db()
    cur = conn.cursor()

    # Fetch ALL remaining chunks: batch + leftover real
    cur.execute("""
        SELECT r2_url
        FROM proctoring_chunks
        WHERE session_id = %s
        ORDER BY start_time_seconds
    """, (session_id,))

    rows = cur.fetchall()
    if not rows:
        cur.close()
        conn.close()
        return False

    local_files = []
    for r in rows:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
        res = requests.get(r["r2_url"], stream=True)
        for c in res.iter_content(8192):
            tmp.write(c)
        tmp.close()
        local_files.append(tmp.name)

    final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name
    merge_videos(local_files, final_path)

    final_key = f"{session_id}/final/final.webm"
    final_url = upload_file(open(final_path, "rb"), final_key)

    cur.execute("""
        UPDATE proctoring_sessions
        SET status = 'DONE',
            final_video_url = %s
        WHERE id = %s
    """, (final_url, session_id))

    # Cleanup ALL chunks (batch + real)
    cur.execute("""
        DELETE FROM proctoring_chunks
        WHERE session_id = %s
    """, (session_id,))

    conn.commit()
    cur.close()
    conn.close()

    return True
