const pool = require('./src/config/db');

async function cleanEvents() {
    try {
        console.log("🧹 Clearing OLD corrupted event data...");
        await pool.query("DELETE FROM proctoring_events");
        console.log("✅ Event table wiped. Start a NEW session to see correct timestamps.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

cleanEvents();
