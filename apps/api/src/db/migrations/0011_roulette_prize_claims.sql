CREATE TABLE roulette_prize_claims (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  experience_id TEXT NOT NULL,
  spin_id TEXT NOT NULL UNIQUE,
  prize_id TEXT NOT NULL,
  prize_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_at TEXT,
  redeemed_by TEXT
);

CREATE INDEX roulette_prize_claims_experience_idx
  ON roulette_prize_claims (experience_id, created_at DESC);
CREATE INDEX roulette_prize_claims_status_idx
  ON roulette_prize_claims (experience_id, status, created_at DESC);
CREATE INDEX roulette_prize_claims_prize_idx
  ON roulette_prize_claims (experience_id, prize_id, created_at DESC);
