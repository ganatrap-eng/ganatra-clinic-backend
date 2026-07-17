-- Links a login account to a specific doctors-roster entry, so a Doctor-role
-- user's dashboard can be scoped to their own cases/collections/pay instead
-- of clinic-wide numbers. Nullable and optional — accounts with no link
-- (Reception, Nurse, Admin, or a Doctor account not yet linked) are
-- unaffected and simply keep seeing clinic-wide numbers where relevant.
ALTER TABLE users ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;
