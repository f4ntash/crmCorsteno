ALTER TABLE experience_prize_inventory RENAME TO experience_prize_inventory_legacy;

CREATE TABLE experience_prize_inventory (
  experience_id TEXT NOT NULL,
  prize_id TEXT NOT NULL,
  stock_mode TEXT NOT NULL CHECK (stock_mode IN ('limited', 'unlimited')),
  stock_available INTEGER,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (experience_id, prize_id),
  FOREIGN KEY (experience_id) REFERENCES experiences(id) ON DELETE CASCADE
);

INSERT INTO experience_prize_inventory (experience_id, prize_id, stock_mode, stock_available, delivered_count, created_at, updated_at)
SELECT experience_id, prize_id,
  CASE WHEN stock_limit IS NULL THEN 'unlimited' ELSE 'limited' END,
  CASE WHEN stock_limit IS NULL THEN NULL ELSE MAX(stock_limit - stock_used, 0) END,
  stock_used, created_at, updated_at
FROM experience_prize_inventory_legacy;

DROP TABLE experience_prize_inventory_legacy;

CREATE INDEX experience_prize_inventory_experience_idx
  ON experience_prize_inventory (experience_id);

CREATE TABLE experience_prize_inventory_events (
  id TEXT PRIMARY KEY NOT NULL,
  experience_id TEXT NOT NULL,
  prize_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('initial_stock', 'manual_add', 'manual_remove', 'prize_delivered')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  spin_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (experience_id, prize_id) REFERENCES experience_prize_inventory(experience_id, prize_id) ON DELETE CASCADE
);

CREATE INDEX experience_prize_inventory_events_lookup_idx
  ON experience_prize_inventory_events (experience_id, prize_id, created_at);
