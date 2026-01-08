import time
import tempfile
import requests

from app.db import get_db
from processors.video_merger import merge_videos
from app.utils.r2 import upload_file

BATCH_SIZE = 2
POLL_INTERVAL = 5


def merge_one_batch(session_id):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, r2_url, start_time_seconds, end_time_seconds
        FROM proctoring_chunks
        WHERE session_id = %s
          AND status = 'PROCESSED'
          AND chunk_index >= 0
        ORDER BY chunk_index
        LIMIT %s
    """, (session_id, BATCH_SIZE))

    rows = cur.fetchall()
    if len(rows) < BATCH_SIZE:
        cur.close()
        conn.close()
        return False

    # derive batch time window
    batch_start = min(r["start_time_seconds"] for r in rows)
    batch_end = max(r["end_time_seconds"] for r in rows)

    local_files = []
    for r in rows:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
        res = requests.get(r["r2_url"], stream=True)
        for c in res.iter_content(8192):
            tmp.write(c)
        tmp.close()
        local_files.append(tmp.name)

    merged = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name
    merge_videos(local_files, merged)

    batch_key = f"{session_id}/batches/{rows[0]['id']}.webm"
    batch_url = upload_file(open(merged, "rb"), batch_key)

    # insert batch chunk WITH TIME RANGE
    cur.execute("""
        INSERT INTO proctoring_chunks
        (
            session_id,
            chunk_index,
            start_time_seconds,
            end_time_seconds,
            r2_url,
            status
        )
        VALUES (%s, -1, %s, %s, %s, 'PROCESSED')
    """, (session_id, batch_start, batch_end, batch_url))

    # delete original chunks
    cur.execute("""
        DELETE FROM proctoring_chunks
        WHERE id = ANY(%s)
    """, ([r["id"] for r in rows],))

    conn.commit()
    cur.close()
    conn.close()

    return True


def main():
    print("Batch merger worker started")

    while True:
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT DISTINCT session_id
                FROM proctoring_chunks pc
                JOIN proctoring_sessions ps ON ps.id = pc.session_id
                WHERE ps.status = 'PROCESSING'
            """)
            sessions = [r["session_id"] for r in cur.fetchall()]
            cur.close()
            conn.close()

            for session_id in sessions:
                merge_one_batch(session_id)

        except Exception as e:
            print("Batch merger error:", e)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
