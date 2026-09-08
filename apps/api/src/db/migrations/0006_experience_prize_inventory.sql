CREATE TABLE IF NOT EXISTS experience_prize_inventory (
  experience_id TEXT NOT NULL,
  prize_id TEXT NOT NULL,
  stock_limit INTEGER,
  stock_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (experience_id, prize_id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id)
);

CREATE INDEX IF NOT EXISTS experience_prize_inventory_experience_idx
  ON experience_prize_inventory (experience_id);
