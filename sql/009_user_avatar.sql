-- Migration 009 — user profile pictures.
-- Run with: psql "$DATABASE_URL" -f sql/009_user_avatar.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
