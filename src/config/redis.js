const IORedis = require("ioredis");
const { REDIS_URL } = require("./env");

const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

module.exports = redis;
