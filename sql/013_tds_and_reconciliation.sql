-- Migration 013 — manual Bank Reconciliation.

-- Bank Reconciliation — manually-entered statement lines, matched against
-- an existing collection, expense, or doctor-pay record. Cash-mode
-- collections never appear here (cash doesn't move through the bank).
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  txn_type VARCHAR(10) NOT NULL CHECK (txn_type IN ('Credit', 'Debit')),
  matched_collection_id UUID REFERENCES collections(id) ON DELETE SET NULL,
  matched_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  matched_doctor_pay_id UUID REFERENCES doctor_pays(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bankstmt_date ON bank_statement_lines(entry_date);
CREATE INDEX IF NOT EXISTS idx_bankstmt_unmatched ON bank_statement_lines(matched_collection_id, matched_expense_id, matched_doctor_pay_id);
