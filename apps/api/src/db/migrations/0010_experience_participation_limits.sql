ALTER TABLE experience_spins ADD COLUMN participant_device_id TEXT;
ALTER TABLE experience_spins ADD COLUMN participant_session_id TEXT;

CREATE INDEX experience_spins_participant_device_idx
  ON experience_spins (experience_id, organization_id, participant_device_id, created_at);
CREATE INDEX experience_spins_participant_session_idx
  ON experience_spins (experience_id, organization_id, participant_session_id, created_at);

CREATE TABLE experience_participation (
  experience_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('device', 'session')),
  participant_id TEXT NOT NULL,
  spin_count INTEGER NOT NULL DEFAULT 0,
  last_spin_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (experience_id, scope_type, participant_id)
);

CREATE INDEX experience_participation_organization_idx
  ON experience_participation (organization_id, experience_id, scope_type, participant_id);
