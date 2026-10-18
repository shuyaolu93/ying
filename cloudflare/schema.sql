CREATE TABLE IF NOT EXISTS risk_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  requested_quantity REAL NOT NULL,
  allowed_quantity REAL NOT NULL,
  price REAL NOT NULL,
  equity REAL NOT NULL,
  decision TEXT NOT NULL,
  reasons TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_quality_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score REAL NOT NULL,
  status TEXT NOT NULL,
  block_new_entries INTEGER NOT NULL,
  issues TEXT NOT NULL,
  warnings TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_decisions_created_at ON risk_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_checks_created_at ON data_quality_checks(created_at DESC);
