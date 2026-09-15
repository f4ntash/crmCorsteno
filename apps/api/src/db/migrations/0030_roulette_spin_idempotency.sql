ALTER TABLE experience_spins ADD COLUMN request_id TEXT;
ALTER TABLE experience_spins ADD COLUMN response_json TEXT;

CREATE UNIQUE INDEX experience_spins_request_id_idx
  ON experience_spins (experience_id, organization_id, request_id)
  WHERE request_id IS NOT NULL;
