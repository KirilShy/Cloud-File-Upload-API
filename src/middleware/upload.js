const multer = require('multer');

// Allowed MIME types → file extensions
const ALLOWED = {
  'image/jpeg':      '.jpg',
  'image/png':       '.png',
  'image/gif':       '.gif',
  'image/webp':      '.webp',
  'application/pdf': '.pdf',
  'text/plain':      '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/zip': '.zip',
};

const MAX_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;

// Memory storage — no temp files on disk, buffer goes straight to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    cb(Object.assign(new Error(`File type "${file.mimetype}" is not allowed`), { status: 415 }));
  },
});

module.exports = { upload, ALLOWED };
