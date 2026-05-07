const { Pool } = require('pg');

// DB is optional — only instantiated when DATABASE_URL is present
let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  pool.on('error', (err) => console.warn('[DB] Unexpected pool error:', err.message));
}

module.exports = pool;
