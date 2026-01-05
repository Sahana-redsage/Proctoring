const pool = require('./src/config/db');

async function resetEventsTable() {
    const client = await pool.connect();
    try {
        console.log("🔥 Dropping and Recreating proctoring_events table...");

        await client.query(`DROP TABLE IF EXISTS proctoring_events CASCADE;`);

        await client.query(`
      CREATE TABLE proctoring_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (
            event_type IN ('PHONE_USAGE', 'LOOKING_AWAY', 'NO_FACE', 'MULTIPLE_PEOPLE', 'IDENTITY_MISMATCH')
        ),
        start_time_seconds INT NOT NULL,
        end_time_seconds INT,
        duration_seconds INT,
        confidence_score FLOAT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

        await client.query(`CREATE INDEX idx_events_session ON proctoring_events(session_id);`);

        console.log("✅ proctoring_events table reset successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Reset failed:", err);
        process.exit(1);
    } finally {
        client.release();
    }
}

resetEventsTable();
