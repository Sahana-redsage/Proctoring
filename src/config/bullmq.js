const { Queue } = require("bullmq");
const redis = require("./redis");

const chunkQueue = new Queue("chunkQueue", { connection: redis });
const batchQueue = new Queue("batchQueue", { connection: redis });
const finalizeQueue = new Queue("finalizeQueue", { connection: redis });

module.exports = {
  chunkQueue,
  batchQueue,
  finalizeQueue,
  redisConnection: redis
};
