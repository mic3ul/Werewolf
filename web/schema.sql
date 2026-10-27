-- WeirdWolf web edition: Cloudflare D1 schema
-- Run this in the D1 database console before deploying the Worker.

CREATE TABLE IF NOT EXISTS rooms (
  chat_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at);

CREATE TABLE IF NOT EXISTS started_users (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  started_at INTEGER NOT NULL
);
