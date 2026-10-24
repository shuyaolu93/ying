-- Existing rows cannot be attributed to an account and remain private.
ALTER TABLE risk_decisions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE data_quality_checks ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_risk_decisions_user_created ON risk_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_checks_user_created ON data_quality_checks(user_id, created_at DESC);
