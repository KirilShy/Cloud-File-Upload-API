<div align="center">

<img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/AWS-S3-FF9900?style=for-the-badge&logo=amazons3&logoColor=white" />
<img src="https://img.shields.io/badge/Docker-Containerized-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-Metadata-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" />

<br /><br />

# Cloud File Upload API

**Production-ready file upload service — AWS S3, signed URLs, Docker, PostgreSQL**

*Used as a standalone microservice or plugged into any app as an attachment layer*

</div>

---

## Architecture

```
┌──────────┐   multipart/form-data    ┌─────────────────────┐
│  Client  │ ───────────────────────▶ │   Express API       │
└──────────┘                          │   (rate-limited)    │
     ▲                                └──────────┬──────────┘
     │                                           │  @aws-sdk/client-s3
     │  Pre-signed URL                  ┌────────▼────────┐
     │  (temporary, expires 1h)         │   AWS S3        │
     └──────────────────────────────────│   (private)     │
                                        │   AES-256 enc.  │
                                        └────────┬────────┘
                                                 │
                                      ┌──────────▼──────────┐
                                      │   PostgreSQL        │
                                      │   (file metadata)   │
                                      │   (optional)        │
                                      └─────────────────────┘
```

**Two upload modes:**
1. **Server-side** — file passes through the API → streamed to S3 (`POST /api/files/upload`)
2. **Direct client upload** — API returns a presigned PUT URL → client uploads straight to S3, bypassing the server (`POST /api/files/presign`)

---

## Features

| | Feature |
|--|---------|
| **S3 upload** | Files buffered in memory and streamed directly to S3 — no temp disk I/O |
| **AES-256 encryption** | Server-side encryption enabled on every object |
| **Presigned URLs** | Files are never publicly accessible — all access is via time-limited signed URLs |
| **Direct upload** | Presigned PUT URLs for client-to-S3 uploads (more scalable for large files) |
| **File validation** | MIME type whitelist + configurable max size (default 10MB) |
| **Metadata store** | PostgreSQL tracks file ID, name, type, size, uploader, context, ref_id |
| **Rate limiting** | 100 req/15 min globally, enforced per IP |
| **JWT auth** | Optional — enable with `REQUIRE_AUTH=true` |
| **Docker** | Multi-stage Dockerfile + Docker Compose with PostgreSQL |
| **Health check** | `GET /api/health` verifies S3 + DB connectivity |

---

## Tech Stack

```
Runtime     Node.js 20
Framework   Express 4
Cloud       AWS S3 (SDK v3)
Database    PostgreSQL 16   (optional)
Auth        JWT             (optional)
Upload      Multer (memory storage)
Container   Docker + Docker Compose
```

---

## Quick Start

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/KirilShy/cloud-file-upload-api.git
cd cloud-file-upload-api

cp .env.example .env
# Fill in AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_BUCKET_NAME

docker-compose up --build
```

API is available at `http://localhost:4001`

### Option 2 — Manual

```bash
npm install

cp .env.example .env   # fill in AWS credentials

npm run dev            # → http://localhost:4001
```

---

## API Reference

All endpoints are prefixed with `/api/files`.

### Upload a file

```http
POST /api/files/upload
Content-Type: multipart/form-data

file:     <binary>         (required, field name must be "file")
context:  helpdesk-ticket  (optional — tag the file for filtering)
ref_id:   1234             (optional — e.g. ticket ID)
```

**Response `201`**
```json
{
  "message": "File uploaded successfully",
  "fileId": "3f2a1b4c-uuid.jpg",
  "key": "uploads/3f2a1b4c-uuid.jpg",
  "fileUrl": "https://s3.amazonaws.com/...?X-Amz-Expires=3600&...",
  "expiresIn": "3600s",
  "file": {
    "originalName": "photo.jpg",
    "mimeType": "image/jpeg",
    "size": 204800,
    "sizeFormatted": "200.0 KB"
  }
}
```

---

### Get presigned download URL

```http
GET /api/files/:fileId
```

**Response `200`**
```json
{
  "fileId": "3f2a1b4c-uuid.jpg",
  "key": "uploads/3f2a1b4c-uuid.jpg",
  "fileUrl": "https://s3.amazonaws.com/...?X-Amz-Expires=3600&...",
  "expiresIn": "3600s",
  "metadata": { ... }
}
```

---

### Get presigned PUT URL (direct client upload)

```http
POST /api/files/presign
Content-Type: application/json

{ "filename": "report.pdf", "contentType": "application/pdf" }
```

**Response `200`**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...?X-Amz-Expires=300&...",
  "fileId": "abc-uuid.pdf",
  "key": "uploads/abc-uuid.pdf",
  "expiresIn": "5 minutes",
  "note": "PUT your file to uploadUrl, then use fileId to retrieve a download link."
}
```

---

### List files

```http
GET /api/files?limit=20&offset=0&context=helpdesk-ticket
```

Returns metadata from PostgreSQL. Returns empty array if DB is not configured.

---

### Delete a file

```http
DELETE /api/files/:fileId
```

**Response `200`**
```json
{ "message": "File deleted successfully", "fileId": "...", "key": "..." }
```

---

### Health check

```http
GET /api/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-05-07T10:00:00Z",
  "services": {
    "s3": "connected",
    "db": "connected"
  }
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4001` | Server port |
| `AWS_ACCESS_KEY_ID` | **Yes** | — | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | **Yes** | — | IAM user secret key |
| `AWS_REGION` | **Yes** | — | e.g. `eu-west-1` |
| `AWS_BUCKET_NAME` | **Yes** | — | S3 bucket name |
| `SIGNED_URL_EXPIRES` | No | `3600` | Presigned URL expiry (seconds) |
| `MAX_FILE_SIZE_MB` | No | `10` | Max upload size in MB |
| `DATABASE_URL` | No | — | PostgreSQL connection string |
| `REQUIRE_AUTH` | No | `false` | Set `true` to require JWT on all routes |
| `JWT_SECRET` | No | — | Required when `REQUIRE_AUTH=true` |

---

`CORS_ORIGINS` accepts a comma-separated list of browser origins. Every response also includes an `X-Request-Id` header for correlating API errors with application logs.

---

## AWS Setup

### 1 — Create an S3 bucket

```
AWS Console → S3 → Create bucket
☑  Block all public access  (keep this ON — we use presigned URLs)
☑  Enable server-side encryption (AES-256)
```

### 2 — Create an IAM user

```
AWS Console → IAM → Users → Create user
Attach policy → Create inline policy:
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:HeadBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/*"
      ]
    }
  ]
}
```

### 3 — Generate access keys

```
IAM → User → Security credentials → Create access key
```

Copy the key pair into your `.env` — **never commit them**.

---

## Security

- **Private bucket** — no public access, all downloads go through presigned URLs
- **AES-256 encryption** — every object encrypted at rest on S3
- **IAM least privilege** — the IAM policy only grants the 4 operations this API needs
- **MIME whitelist** — only allowed file types accepted (no executable files)
- **Rate limiting** — 100 req/15 min per IP prevents abuse
- **No credentials in code** — all secrets via environment variables
- **Non-root Docker user** — container runs as `appuser`, not root

---

## Allowed File Types

| Type | Extensions |
|------|-----------|
| Images | `.jpg`, `.png`, `.gif`, `.webp` |
| Documents | `.pdf`, `.doc`, `.docx`, `.txt` |
| Archives | `.zip` |

---

## Integration with HelpDesk SaaS

This API is designed to plug into the [HelpDesk SaaS](https://github.com/KirilShy/helpdesk-saas) project as the attachment layer. Use the `context` and `ref_id` fields to link uploads to tickets:

```http
POST /api/files/upload
Content-Type: multipart/form-data

file:     screenshot.png
context:  helpdesk-ticket
ref_id:   42
```

Query all attachments for ticket #42:
```http
GET /api/files?context=helpdesk-ticket&ref_id=42
```

---

## Deployment

### Render
1. Connect repo → New Web Service
2. Set all env vars in the Render dashboard
3. Deploy — Render auto-detects `npm start`

### AWS EC2
1. Launch EC2, clone repo, `npm install`
2. Run with `pm2 start src/app.js`
3. Use EC2 IAM role instead of access keys (more secure)

---

<div align="center">

Built by [Kiril Shynkarenko](https://github.com/KirilShy) · Portfolio project

</div>
