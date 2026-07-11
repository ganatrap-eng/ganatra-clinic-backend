-- Migration 002 — approval workflow, per-module permissions, OTP verification
-- Run with: psql "$DATABASE_URL" -f sql/002_permissions.sql

ALTER TABLE users ALTER COLUMN role DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
-- status: 'pending_otp' (admin bootstrap awaiting email OTP) | 'pending_approval' (awaiting admin) | 'active'
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
-- permissions shape: { "<module>": { "level": "none|view|write|edit|delete", "export": true|false }, ... }

CREATE TABLE IF NOT EXISTS otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL, -- 'admin_verify' | 'password_reset'
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otps_user ON otps(user_id, purpose);

-- Existing rows (if any) from before this migration become active with no
-- module access until an Admin sets their permissions explicitly.
UPDATE users SET status = 'active' WHERE status IS NULL;
