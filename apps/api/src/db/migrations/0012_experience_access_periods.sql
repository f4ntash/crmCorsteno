-- Commercial entitlement periods are intentionally separate from campaign schedule dates.
-- Intervals use [starts_at, ends_at): start is inclusive, end is exclusive.
CREATE TABLE experience_access_periods (
    id TEXT PRIMARY KEY NOT NULL,
    experience_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'subscription', 'billing', 'promotion')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    note TEXT,
    FOREIGN KEY (experience_id) REFERENCES experiences(id)
);

CREATE INDEX experience_access_periods_experience_idx
  ON experience_access_periods (experience_id, starts_at, ends_at);
CREATE INDEX experience_access_periods_organization_idx
  ON experience_access_periods (organization_id);
