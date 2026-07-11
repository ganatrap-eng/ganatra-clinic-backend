-- Migration 003 — user access / audit log
-- Run with: psql "$DATABASE_URL" -f sql/003_audit_log.sql

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_label VARCHAR(180), -- denormalized "Name (userId)" so the log still reads fine if the account is later removed
  module VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL, -- view | write | edit | delete | export
  method VARCHAR(10),
  path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
