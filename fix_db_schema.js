const pool = require('./src/config/db');

async function fixSchema() {
    const client = await pool.connect();
    try {
        console.log("🔧 Fixing Database Schema...");

        // 1. Add confidence_score if missing
        await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proctoring_events' AND column_name='confidence_score') THEN
          ALTER TABLE proctoring_events ADD COLUMN confidence_score FLOAT;
          RAISE NOTICE 'Added confidence_score column';
        END IF;
      END $$;
    `);

        // 2. Make end_time_seconds and duration_seconds nullable (if not already)
        await client.query(`
      ALTER TABLE proctoring_events ALTER COLUMN end_time_seconds DROP NOT NULL;
      ALTER TABLE proctoring_events ALTER COLUMN duration_seconds DROP NOT NULL;
    `);

        console.log("✅ Schema patched successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Schema patch failed:", err);
        process.exit(1);
    } finally {
        client.release();
    }
}

fixSchema();
