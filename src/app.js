require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const s3 = require('./services/s3.service');
const db = require('./config/db');
const fileRoutes = require('./routes/file.routes');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// ── Middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const incomingId = req.get('x-request-id');
  req.id = incomingId && /^[A-Za-z0-9._:-]{1,100}$/.test(incomingId)
    ? incomingId
    : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// Global rate limit: 100 req / 15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
}));

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/files', fileRoutes);

// ── Health check ──────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const health = { status: 'ok', timestamp: new Date(), version: '1.0.0', services: {} };

  try {
    await s3.ping();
    health.services.s3 = 'connected';
  } catch (e) {
    health.services.s3 = 'error';
    health.services.s3Error = e.message;
    health.status = 'degraded';
  }

  if (db) {
    try {
      await db.query('SELECT 1');
      health.services.db = 'connected';
    } catch (e) {
      health.services.db = 'error';
      health.services.dbError = e.message;
    }
  } else {
    health.services.db = 'not configured';
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/', (_req, res) => res.json({
  name: 'Cloud File Upload API',
  version: '1.0.0',
  docs: '/api/health',
  endpoints: {
    upload: 'POST /api/files/upload',
    presign: 'POST /api/files/presign',
    get: 'GET /api/files/:fileId',
    list: 'GET /api/files',
    delete: 'DELETE /api/files/:fileId',
  },
}));

// ── Error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File too large. Maximum size: ${process.env.MAX_FILE_SIZE_MB || 10}MB`,
        requestId: req.id,
      });
    }
    return res.status(400).json({ error: err.message, requestId: req.id });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[Error]', err.message);

  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
    requestId: req.id,
  });
});

// ── Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`🚀  Cloud File Upload API → http://localhost:${PORT}`);
  console.log(`    Auth required: ${process.env.REQUIRE_AUTH === 'true' ? 'yes' : 'no'}`);
  console.log(`    Database:      ${process.env.DATABASE_URL ? 'configured' : 'not configured (optional)'}`);
  console.log(`    Bucket:        ${process.env.AWS_BUCKET_NAME || '⚠ AWS_BUCKET_NAME not set'}`);
});
