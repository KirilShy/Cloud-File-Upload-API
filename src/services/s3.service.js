const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/aws');

const BUCKET = process.env.AWS_BUCKET_NAME;
const EXPIRES = parseInt(process.env.SIGNED_URL_EXPIRES || '3600');

async function upload({ buffer, key, mimeType, originalName }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Store original filename in metadata (encoded to ensure ASCII-safe)
      Metadata: { 'original-name': encodeURIComponent(originalName) },
      // Server-side encryption — files are never stored in plaintext
      ServerSideEncryption: 'AES256',
    })
  );
  return key;
}

async function presignGet(key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: EXPIRES }
  );
}

// Presigned PUT URL — lets the client upload directly to S3 without going through our server.
// More scalable than server-side uploads for large files.
async function presignPut(key, mimeType, expiresIn = 300) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn }
  );
}

async function remove(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function ping() {
  await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
}

module.exports = { upload, presignGet, presignPut, remove, ping };
