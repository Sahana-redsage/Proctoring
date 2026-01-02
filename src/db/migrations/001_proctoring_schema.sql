-- ================================
-- PROCTORING SYSTEM SCHEMA v2
-- ================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- 1. PROCTORING SESSIONS
-- ================================
CREATE TABLE IF NOT EXISTS proctoring_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL,
    candidate_id UUID NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('ACTIVE', 'COMPLETED', 'PROCESSING', 'DONE', 'FAILED')
    ),

    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,

    last_chunk_index INT DEFAULT -1,
    expected_chunk_count INT,

    final_video_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 2. PROCTORING CHUNKS
-- ================================
CREATE TABLE IF NOT EXISTS proctoring_chunks (
    id BIGSERIAL PRIMARY KEY,

    session_id UUID NOT NULL
        REFERENCES proctoring_sessions(id)
        ON DELETE CASCADE,

    chunk_index INT NOT NULL,
    start_time_seconds INT NOT NULL,
    end_time_seconds INT NOT NULL,

    file_path TEXT NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'MERGED')
    ),

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (session_id, chunk_index)
);

-- ================================
-- 3. RAW SIGNALS (PER FRAME / TIME)
-- ================================
CREATE TABLE IF NOT EXISTS proctoring_chunk_signals (
    id BIGSERIAL PRIMARY KEY,

    session_id UUID NOT NULL
        REFERENCES proctoring_sessions(id)
        ON DELETE CASCADE,

    timestamp_seconds INT NOT NULL,

    face_count INT,
    face_present BOOLEAN,

    head_yaw FLOAT,
    head_pitch FLOAT,

    phone_detected BOOLEAN DEFAULT false,
    phone_confidence FLOAT,

    identity_similarity FLOAT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 4. FINAL FLAGGED EVENTS
-- ================================
CREATE TABLE IF NOT EXISTS proctoring_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    session_id UUID NOT NULL
        REFERENCES proctoring_sessions(id)
        ON DELETE CASCADE,

    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'PHONE_USAGE',
            'LOOKING_AWAY',
            'NO_FACE',
            'MULTIPLE_PEOPLE',
            'IDENTITY_MISMATCH'
        )
    ),

    start_time_seconds INT NOT NULL,
    end_time_seconds INT NOT NULL,
    duration_seconds INT NOT NULL,

    confidence_score FLOAT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 5. WORKER LOGS (OPTIONAL)
-- ================================
CREATE TABLE IF NOT EXISTS proctoring_worker_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID,
    chunk_index INT,
    message TEXT,
    level TEXT CHECK (level IN ('INFO', 'WARN', 'ERROR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- INDEXES (CRITICAL FOR PERFORMANCE)
-- ================================

CREATE INDEX IF NOT EXISTS idx_chunks_session_index
ON proctoring_chunks(session_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_chunks_status
ON proctoring_chunks(status);

CREATE INDEX IF NOT EXISTS idx_signals_session_time
ON proctoring_chunk_signals(session_id, timestamp_seconds);

CREATE INDEX IF NOT EXISTS idx_events_session
ON proctoring_events(session_id);
