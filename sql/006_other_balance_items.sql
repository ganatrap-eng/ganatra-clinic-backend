-- Migration 006 — unsecured loans (liability) and security deposits given
-- (current asset), neither of which fit the existing capital/income/expense
-- model. Both are tracked here and folded into the balance sheet.
-- Run with: psql "$DATABASE_URL" -f sql/006_other_balance_items.sql

CREATE TABLE IF NOT EXISTS other_balance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(20) NOT NULL CHECK (category IN ('unsecured_loan', 'security_deposit')),
  txn_type VARCHAR(12) NOT NULL, -- 'Taken'/'Repaid' for loans, 'Given'/'Refunded' for deposits
  party_name VARCHAR(150),        -- lender's name, or the landlord/owner's name
  amount NUMERIC(14,2) NOT NULL,
  txn_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_other_balance_items_date ON other_balance_items(txn_date);
CREATE INDEX IF NOT EXISTS idx_other_balance_items_category ON other_balance_items(category);
