CREATE TABLE experience_spins (
  id TEXT PRIMARY KEY NOT NULL,
  experience_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  application_id TEXT,
  segment_id TEXT,
  segment_index INTEGER NOT NULL,
  prize_id TEXT,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('prize', 'no_prize')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX experience_spins_experience_idx ON experience_spins (experience_id, created_at);
CREATE INDEX experience_spins_organization_idx ON experience_spins (organization_id, created_at);
CREATE INDEX experience_spins_prize_idx ON experience_spins (prize_id);
CREATE INDEX experience_spins_application_idx ON experience_spins (application_id);
