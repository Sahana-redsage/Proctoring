from fastapi import APIRouter, UploadFile, File, HTTPException
from app.config import settings
from app.redis_client import redis_client
from app.utils.locks import RedisLock
from app.utils.r2 import upload_file
from app.repositories.chunks import create_chunk

router = APIRouter()

@router.post("/{session_id}/{chunk_index}")
async def upload_chunk(
    session_id: str,
    chunk_index: int,
    file: UploadFile = File(...)
):
    """
    Receives a video chunk, uploads to R2, stores metadata in DB,
    and enqueues chunk for processing.
    """

    lock = RedisLock(redis_client, f"session:{session_id}:upload", ttl=10)
    if not lock.acquire():
        raise HTTPException(status_code=409, detail="Chunk upload in progress")

    try:
        # Calculate chunk times
        start_sec = chunk_index * settings.CHUNK_DURATION_SEC
        end_sec = start_sec + settings.CHUNK_DURATION_SEC

        # Upload to R2
        r2_key = f"{session_id}/chunks/{chunk_index}.webm"
        r2_url = upload_file(file.file, r2_key)

        # Insert into DB
        create_chunk(
            session_id=session_id,
            chunk_index=chunk_index,
            start_sec=start_sec,
            end_sec=end_sec,
            r2_url=r2_url
        )

        # Enqueue for worker
        redis_client.rpush(
            "global:chunk_queue",
            f"{session_id}:{chunk_index}"
        )

        return {
            "status": "uploaded",
            "chunk_index": chunk_index,
            "r2_url": r2_url
        }

    finally:
        lock.release()
