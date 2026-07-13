-- Migration 007 — allow free-text role labels.
-- The original schema restricted `role` to exactly Doctor/Reception/Nurse/
-- Admin via a CHECK constraint. The admin approval panel now lets an Admin
-- type any role label they want (e.g. "Staff", "Accountant"), so that old
-- restriction just causes confusing failures — drop it.
-- Run with: psql "$DATABASE_URL" -f sql/007_free_text_roles.sql

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
