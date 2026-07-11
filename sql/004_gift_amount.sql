-- Migration 004 — gifts can now carry a monetary amount that flows into
-- the income statement, capital account, and balance sheet.
-- Run with: psql "$DATABASE_URL" -f sql/004_gift_amount.sql

ALTER TABLE gifts ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
