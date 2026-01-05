-- 002_optimize_architecture.sql
DROP TABLE IF EXISTS proctoring_chunk_signals;

ALTER TABLE proctoring_events
ALTER COLUMN end_time_seconds DROP NOT NULL,
ALTER COLUMN duration_seconds DROP NOT NULL;
