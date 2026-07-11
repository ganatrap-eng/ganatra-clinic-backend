-- Migration 005 — deleting a case record should unlink (not block) any
-- collection entries that reference it, and no route should ever be able
-- to crash the whole server on a constraint violation (see server.js /
-- route files for the accompanying try/catch hardening).
-- Run with: psql "$DATABASE_URL" -f sql/005_case_delete_safety.sql

ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_case_id_fkey;
ALTER TABLE collections ADD CONSTRAINT collections_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;
