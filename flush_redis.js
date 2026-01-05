const redis = require('./src/config/redis');

async function flushRedis() {
    try {
        console.log("🔥 Flushing all Redis data...");
        await redis.flushall();
        console.log("✅ Redis cleared successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to flush Redis:", err);
        process.exit(1);
    }
}

flushRedis();
