-- Migration 008 — Patient Master registry (name, mobile, gender, DOB, address).
-- Separate from the existing patient search/history feature (which derives
-- from case & collection records) — this is a proper demographic registry
-- used to auto-fill Case Records and compute exact age.
-- Run with: psql "$DATABASE_URL" -f sql/008_patient_master.sql

CREATE TABLE IF NOT EXISTS patients_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20),
  gender VARCHAR(10),
  dob DATE,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patients_master_name ON patients_master(name);
CREATE INDEX IF NOT EXISTS idx_patients_master_mobile ON patients_master(mobile);
