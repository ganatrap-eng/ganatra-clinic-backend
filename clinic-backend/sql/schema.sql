-- Ganatra Clinic ERP — PostgreSQL schema
-- Run with: psql "$DATABASE_URL" -f sql/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('Doctor','Reception','Nurse','Admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name VARCHAR(150) NOT NULL DEFAULT 'Ganatra Clinic',
  proprietor VARCHAR(150) NOT NULL DEFAULT 'Dr. Bhavisha Pratik Ganatra',
  address TEXT,
  phone VARCHAR(30),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  shift VARCHAR(10) NOT NULL CHECK (shift IN ('Morning','Evening')),
  pay_type VARCHAR(10) NOT NULL CHECK (pay_type IN ('Daily','Monthly')),
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no VARCHAR(20) UNIQUE NOT NULL,
  case_date DATE NOT NULL,
  patient_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  brief_history TEXT,
  doctor_id UUID REFERENCES doctors(id),
  shift VARCHAR(10) CHECK (shift IN ('Morning','Evening')),
  external_prescription TEXT,
  image_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_date ON cases(case_date);

CREATE TABLE IF NOT EXISTS case_medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  medicine_name VARCHAR(150) NOT NULL,
  qty NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id),
  case_no VARCHAR(20),
  patient_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  collection_date DATE NOT NULL,
  amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) GENERATED ALWAYS AS (amount_due - amount_collected) STORED,
  mode VARCHAR(10) CHECK (mode IN ('Cash','UPI','Card','Other')),
  image_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date);

CREATE TABLE IF NOT EXISTS doctor_pays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  pay_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctorpays_date ON doctor_pays(pay_date);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_date DATE NOT NULL,
  patient_name VARCHAR(150) NOT NULL,
  referral_type VARCHAR(20) CHECK (referral_type IN ('Lab Test','Hospital')),
  referred_to VARCHAR(150),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_date ON referrals(referral_date);

CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_date DATE NOT NULL,
  rep_name VARCHAR(150),
  company VARCHAR(150),
  gift_description TEXT,
  doctor_id UUID REFERENCES doctors(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'Nursing Staff Salary','Electricity / Light Bill','Housekeeping Expenses',
    'Rent','Medicine Bills','Repair & Maintenance','Miscellaneous Expenses','Staff Welfare'
  )),
  amount NUMERIC(12,2) NOT NULL,
  narration TEXT,
  image_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  block VARCHAR(100) NOT NULL,
  rate NUMERIC(5,2) NOT NULL,
  purchase_date DATE NOT NULL,
  cost NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capital_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_date DATE NOT NULL,
  txn_type VARCHAR(12) NOT NULL CHECK (txn_type IN ('Introduced','Drawings')),
  amount NUMERIC(14,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO clinic_settings (clinic_name, proprietor)
SELECT 'Ganatra Clinic', 'Dr. Bhavisha Pratik Ganatra'
WHERE NOT EXISTS (SELECT 1 FROM clinic_settings);
