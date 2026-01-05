const redis = require('./src/config/redis');

async function checkRedis() {
    try {
        const keys = await redis.keys('*');
        if (keys.length === 0) {
            console.log("✅ Redis is completely EMPTY.");
        } else {
            console.log(`⚠️ Redis contains ${keys.length} keys:`);
            console.log(keys.slice(0, 10)); // Show fast 10
            if (keys.length > 10) console.log("...");
        }
        process.exit(0);
    } catch (err) {
        console.error("❌ Error checking Redis:", err);
        process.exit(1);
    }
}

checkRedis();
