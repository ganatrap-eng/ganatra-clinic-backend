-- Migration 012 — doctor registration number & qualifications, needed for
-- a legally valid printed prescription (India requires the treating
-- doctor's medical registration number to appear on any prescription —
-- this was missing entirely before). Also adds a couple of clinic
-- letterhead fields (email, timings) used on the same printout.

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS registration_no VARCHAR(50);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS qualifications VARCHAR(200);   -- e.g. "B.A.M.S., C.C.H., C.G.O., C.S.D."
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS specialization VARCHAR(150);  -- e.g. "Family Physician & Surgeon"

ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS timings VARCHAR(200); -- e.g. "Morn. 9:30–1:00 · Even. 4:00–9:30"
