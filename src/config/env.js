require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,

  R2: {
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL
  },

  // Proctoring Settings
  CHUNK_DURATION_SEC: parseInt(process.env.CHUNK_DURATION_SEC || "10"),
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "3"),
  EVENT_DEBOUNCE_SEC: parseInt(process.env.EVENT_DEBOUNCE_SEC || "5")
};
