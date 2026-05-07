const crypto = require('crypto');
const path = require('path');
const s3 = require('../services/s3.service');
const db = require('../config/db');

const S3_PREFIX = 'uploads/';

// ── Helpers ──────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function dbInsert(record) {
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO uploaded_files (file_id, s3_key, original_name, mime_type, size, uploaded_by, context, ref_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [record.fileId, record.key, record.originalName, record.mimeType,
       record.size, record.uploadedBy, record.context || null, record.refId || null]
    );
  } catch (e) {
    console.warn('[DB] Insert failed (non-fatal):', e.message);
  }
}

async function dbGet(fileId) {
  if (!db) return null;
  try {
    const { rows } = await db.query('SELECT * FROM uploaded_files WHERE file_id = $1', [fileId]);
    return rows[0] || null;
  } catch { return null; }
}

// ── POST /api/files/upload ────────────────────────────────────────────
async function uploadFile(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file attached. Use field name "file".' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const fileId = `${crypto.randomUUID()}${ext}`;
  const s3Key = `${S3_PREFIX}${fileId}`;

  await s3.upload({
    buffer:       req.file.buffer,
    key:          s3Key,
    mimeType:     req.file.mimetype,
    originalName: req.file.originalname,
  });

  await dbInsert({
    fileId,
    key:          s3Key,
    originalName: req.file.originalname,
    mimeType:     req.file.mimetype,
    size:         req.file.size,
    uploadedBy:   req.user?.id || req.ip,
    context:      req.body.context,
    refId:        req.body.ref_id,
  });

  const fileUrl = await s3.presignGet(s3Key);

  res.status(201).json({
    message:   'File uploaded successfully',
    fileId,
    key:       s3Key,
    fileUrl,
    expiresIn: `${process.env.SIGNED_URL_EXPIRES || 3600}s`,
    file: {
      originalName:  req.file.originalname,
      mimeType:      req.file.mimetype,
      size:          req.file.size,
      sizeFormatted: fmtBytes(req.file.size),
    },
  });
}

// ── GET /api/files/:fileId ────────────────────────────────────────────
async function getFile(req, res) {
  const { fileId } = req.params;
  const s3Key = `${S3_PREFIX}${fileId}`;

  const [fileUrl, row] = await Promise.all([
    s3.presignGet(s3Key),
    dbGet(fileId),
  ]);

  res.json({
    fileId,
    key:       s3Key,
    fileUrl,
    expiresIn: `${process.env.SIGNED_URL_EXPIRES || 3600}s`,
    ...(row && {
      metadata: {
        originalName: row.original_name,
        mimeType:     row.mime_type,
        size:         row.size,
        sizeFormatted:fmtBytes(row.size),
        uploadedAt:   row.created_at,
        context:      row.context,
        refId:        row.ref_id,
      },
    }),
  });
}

// ── GET /api/files ────────────────────────────────────────────────────
async function listFiles(req, res) {
  if (!db) {
    return res.json({
      files: [],
      count: 0,
      note: 'Set DATABASE_URL to enable file listing with metadata.',
    });
  }

  const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);
  const context = req.query.context;

  const where  = context ? 'WHERE context = $3' : '';
  const params = context ? [limit, offset, context] : [limit, offset];

  const [rows, total] = await Promise.all([
    db.query(
      `SELECT file_id, original_name, mime_type, size, context, ref_id, created_at
       FROM uploaded_files ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params
    ),
    db.query(`SELECT COUNT(*) FROM uploaded_files ${context ? 'WHERE context = $1' : ''}`,
      context ? [context] : []),
  ]);

  res.json({
    files: rows.rows.map((r) => ({
      fileId:        r.file_id,
      originalName:  r.original_name,
      mimeType:      r.mime_type,
      size:          r.size,
      sizeFormatted: fmtBytes(r.size),
      context:       r.context,
      refId:         r.ref_id,
      uploadedAt:    r.created_at,
    })),
    count:      rows.rows.length,
    total:      parseInt(total.rows[0].count),
    pagination: { limit, offset },
  });
}

// ── POST /api/files/presign ───────────────────────────────────────────
// Returns a presigned PUT URL — the client uploads directly to S3 (no file passes through our server)
async function presignUpload(req, res) {
  const { filename, contentType } = req.body;
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType are required' });
  }

  const ext    = path.extname(filename).toLowerCase();
  const fileId = `${crypto.randomUUID()}${ext}`;
  const s3Key  = `${S3_PREFIX}${fileId}`;

  const uploadUrl = await s3.presignPut(s3Key, contentType, 300);

  res.json({
    uploadUrl,
    fileId,
    key:       s3Key,
    expiresIn: '5 minutes',
    note:      'PUT your file to uploadUrl, then use fileId to retrieve a download link.',
  });
}

// ── DELETE /api/files/:fileId ─────────────────────────────────────────
async function deleteFile(req, res) {
  const { fileId } = req.params;
  const s3Key = `${S3_PREFIX}${fileId}`;

  await s3.remove(s3Key);

  if (db) {
    try {
      await db.query('DELETE FROM uploaded_files WHERE file_id = $1', [fileId]);
    } catch (e) {
      console.warn('[DB] Delete failed (non-fatal):', e.message);
    }
  }

  res.json({ message: 'File deleted successfully', fileId, key: s3Key });
}

module.exports = { uploadFile, getFile, listFiles, presignUpload, deleteFile };
