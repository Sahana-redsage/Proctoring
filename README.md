# AI-Based Web Proctoring System

A full-stack, production-ready AI proctoring platform that monitors candidates during exams. It captures video chunks, detects suspicious behavior using AI (YOLO, MediaPipe, DeepFace), verifies candidate identity, and provides an admin dashboard for reviewing flagged session tapes with precision seeking.

---

## System Architecture

The system follows a distributed, asynchronous architecture to ensure scalability and cost-effectiveness.

- **Frontend (React + Vite)**: Handles webcam recording, chunked uploads, and admin dashboard UI.
- **Backend API (FastAPI)**: Manages sessions, chunk metadata, and orchestrates workers via Redis.
- **Workers (Python)**:
    - **Chunk Processor**: Downloads chunks, runs AI detection (Phone, Faces, Gaze, Identity), and stores events.
    - **Batch Merger**: Periodically merges processed chunks into intermediate batches to optimize storage.
    - **Finalizer**: Merges all batches into a single final exam video once the session ends.
- **Storage**: Cloudflare R2 for video files, PostgreSQL for relational data.
- **Queue & Locking**: Redis for job distribution and session-level processing locks.

---

## Getting Started

### Prerequisites
- **Python 3.10.x** (Mandatory for DeepFace/TensorFlow compatibility)
- **Node.js (LTS)**
- **FFmpeg** (Ensure it is in your System PATH)
- **PostgreSQL** & **Redis**

### Backend Setup
1. **Navigate to backend**: `cd backend`
2. **Virtual Environment**: 
   - Windows: `python -m venv venv` then `venv\Scripts\activate`
   - Mac/Linux: `python3 -m venv venv` then `source venv/bin/activate`
3. **Install dependencies**: `pip install -r requirements.txt`
4. **Environment Variables**: Create a `.env` file in the `backend/` directory (see `.env.example` or user request for details).

### Frontend Setup
1. **Navigate to frontend**: `cd frontend-test`
2. **Install dependencies**: `npm install`
3. **Environment**: Update `.env` with `VITE_API_URL=http://localhost:3000`.
4. **Run**: `npm run dev`

---

## Running the System

You need to run the following components in separate terminals (ensure venv is active for backend):

1. **API Server**: `uvicorn app.main:app --port 3000 --reload`
2. **Chunk Processor**: `python -m workers.chunk_processor`
(WE CAN RUN ANY NO OF WORKERS AS PER OUR LOAD.)
3. **Batch Merger**: `python -m workers.batch_merger`
4. **Finalizer**: `python -m workers.finalizer`

---

## AI Detection Capabilities

| Detection Type | Tech Used | Logic |
| :--- | :--- | :--- |
| **Phone Usage** | YOLOv8 | Detects cell phones with confidence thresholding. |
| **Multiple People** | MediaPipe/Haar | Flags if > 1 person is detected in the frame. |
| **No Face** | MediaPipe/Haar | Flags if the candidate leaves the frame. |
| **Looking Away** | MediaPipe | Tracks eye/head gaze to detect if candidate is looking off-screen. |
| **Identity Mismatch**| DeepFace(VGG-Face)  | Compares candidate's live frame against the reference photo. |

---

## Detailed Walkthrough

### Candidate Flow
1. **Identity Verification**: The candidate captures a reference photo via webcam before starting.
2. **Chunked Streaming**: The frontend records video in 20-second (configurable) segments and uploads them immediately to the backend. This prevents data loss if a crash occurs.
3. **Real-time Processing**: As soon as a chunk hits the backend, it is queued in Redis. The `chunk_processor` picks it up, runs AI models, and logs violations with exact timestamps.

### Admin Flow
1. **Session Management**: Admins can see all active and completed sessions.
2. **Smart Playback**: The final merged video is available for review.
3. **Event Timeline**: A list of flagged events (e.g., "Phone Detected") is shown. Clicking an event automatically seeks the video player to the correct timestamp (accurate to within 1-2 seconds).

### Video Merging Logic
- Chunks are uploaded as `.webm`.
- `batch_merger` cleans up the storage by merging individual chunks into larger batches.
- `finalizer` creates the "Master Video" once the `END_SESSION` signal is received and all chunks are processed.

---

## Notes
- **Warmup Fix**: The `chunk_processor` is configured to "warm up" AI models on startup to ensure zero-latency processing on the first chunk.
- **Session Locking**: Prevents multiple workers from trying to process/merge the same session simultaneously.
- **Scalability**: Add more `chunk_processor` workers to handle high volume.
- **Cleanup**: Temporary chunks are automatically deleted after merging to save R2 storage costs.

---

## Common Issues
- **FFmpeg not found**: Ensure `ffmpeg -version` works in your terminal.
- **DeepFace Errors**: Ensure you use Python 3.10 and have installed `tf-keras` if requested by TensorFlow.
- **PostgreSQL Connection**: Ensure your `DATABASE_URL` in `.env` is correct.
