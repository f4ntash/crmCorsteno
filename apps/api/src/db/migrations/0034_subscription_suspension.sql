-- Require a commercial period for newly created Roulette experiences while
-- preserving unrestricted access for existing experiences.
ALTER TABLE experiences ADD COLUMN commercial_access_required INTEGER NOT NULL DEFAULT 0 CHECK (commercial_access_required IN (0, 1));

-- Keep suspension separate from the legacy status CHECK constraint. D1 runs
-- migrations transactionally, so the subscriptions table must not be rebuilt
-- here: that would trigger foreign-key actions on subscription history tables.
ALTER TABLE subscriptions ADD COLUMN suspended_at TEXT;
