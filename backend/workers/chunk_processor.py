import os
import tempfile
import requests

from app.redis_client import redis_client
from app.repositories.chunks import (
    mark_processing,
    mark_processed,
    get_chunk_url
)
from app.repositories.events import insert_event
from processors.chunk_analyzer import analyze_chunk
from app.config import settings
from deepface import DeepFace
from app.utils.session_lock import SessionLock


# Warm-up models on startup
DeepFace.build_model("VGG-Face")


print("Chunk processor started")

while True:
    job = redis_client.blpop("global:chunk_queue", timeout=5)
    if not job:
        continue

    _, payload = job
    session_id, chunk_index = payload.split(":")
    chunk_index = int(chunk_index)
    lock = SessionLock(
        redis_client,
        f"lock:session:{session_id}",
        ttl=120
    )

    if not lock.acquire():
        # another chunk of same session is processing
        redis_client.rpush("global:chunk_queue", f"{session_id}:{chunk_index}")
        continue

    try:
        mark_processing(session_id, chunk_index)

        chunk_url = get_chunk_url(session_id, chunk_index)
        if not chunk_url:
            continue

        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            r = requests.get(chunk_url, stream=True, timeout=30)
            for chunk in r.iter_content(chunk_size=8192):
                tmp.write(chunk)
            local_path = tmp.name

        chunk_start_sec = chunk_index * settings.CHUNK_DURATION_SEC

        events = analyze_chunk(
            local_path,
            session_id,
            chunk_index,
            chunk_start_sec
        )

        for event in events:
            insert_event(event)

        os.unlink(local_path)
        mark_processed(session_id, chunk_index)

        print(f"[OK] Session {session_id} | Chunk {chunk_index} | Events {len(events)}")

    except Exception as e:
        print("[ERROR] Chunk failed:", e)
    finally:
        lock.release()
