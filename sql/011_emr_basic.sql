-- Migration 011 — Basic EMR fields on case records.
-- Extends the existing per-visit case record (rather than a separate
-- module) so a patient's clinical history stays in one continuous place
-- alongside billing/collections, exactly like Case Records already works.
--
-- Deliberately does NOT include: drug-interaction checking (needs a
-- licensed medical drug database to be safe/reliable — not something to
-- fake), allergies, past medical history, or lab-order tracking — those
-- were scoped out as "Comprehensive" and can be added later as their own
-- migration without touching any of this.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS vitals_bp VARCHAR(20);        -- e.g. "120/80"
ALTER TABLE cases ADD COLUMN IF NOT EXISTS vitals_pulse INTEGER;         -- beats per minute
ALTER TABLE cases ADD COLUMN IF NOT EXISTS vitals_temp NUMERIC(4,1);     -- °F
ALTER TABLE cases ADD COLUMN IF NOT EXISTS vitals_weight NUMERIC(5,1);   -- kg
ALTER TABLE cases ADD COLUMN IF NOT EXISTS vitals_height NUMERIC(5,1);   -- cm
ALTER TABLE cases ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS clinical_notes TEXT;          -- examination findings, doctor's notes

-- A prescribed medicine is clinically different from a "medicine dispensed
-- loose" (case_medicines, which is billing/inventory-facing) — a doctor
-- can prescribe something the clinic doesn't stock or bill for at all, so
-- these are kept as separate, independent lists rather than reusing
-- case_medicines for both purposes.
CREATE TABLE IF NOT EXISTS case_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  medicine_name VARCHAR(150) NOT NULL,
  dosage VARCHAR(50),        -- e.g. "500mg"
  frequency VARCHAR(50),     -- e.g. "1-0-1" or "Twice daily"
  duration VARCHAR(50),      -- e.g. "5 days"
  instructions VARCHAR(150), -- e.g. "After food"
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_case_prescriptions_case ON case_prescriptions(case_id);
