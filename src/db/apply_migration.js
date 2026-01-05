const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

async function migrate() {
    try {
        const sqlPath = path.join(__dirname, 'migrations', '002_optimize_architecture.sql');
        console.log('Dropping signals table...');
        await pool.query('DROP TABLE IF EXISTS proctoring_chunk_signals');

        console.log('Altering events table...');
        await pool.query('ALTER TABLE proctoring_events ALTER COLUMN end_time_seconds DROP NOT NULL');
        await pool.query('ALTER TABLE proctoring_events ALTER COLUMN duration_seconds DROP NOT NULL');

        console.log('Migration applied successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        console.error(err);
        process.exit(1);
    }
}

migrate();
