const { S3Client } = require('@aws-sdk/client-s3');

if (!process.env.AWS_REGION || !process.env.AWS_BUCKET_NAME) {
  throw new Error('AWS_REGION and AWS_BUCKET_NAME must be set');
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = s3;
