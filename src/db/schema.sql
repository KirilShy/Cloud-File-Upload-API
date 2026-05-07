CREATE TABLE IF NOT EXISTS uploaded_files (
  id            SERIAL PRIMARY KEY,
  file_id       VARCHAR(150) UNIQUE NOT NULL,   -- public UUID-based identifier
  s3_key        TEXT UNIQUE NOT NULL,            -- full S3 object key
  original_name VARCHAR(500) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size          INTEGER NOT NULL,                -- bytes
  uploaded_by   VARCHAR(150),                   -- IP or user_id from JWT
  context       VARCHAR(100),                   -- e.g. 'helpdesk-attachment', 'profile-picture'
  ref_id        VARCHAR(100),                   -- e.g. ticket ID for HelpDesk integration
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_file_id    ON uploaded_files(file_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON uploaded_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_context    ON uploaded_files(context, ref_id);
