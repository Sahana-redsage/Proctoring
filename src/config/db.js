const { Pool } = require("pg");
const { DATABASE_URL } = require("./env");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL Pool Error:", err);
  // Prevent process exit on idle client errors
});

module.exports = pool;
