CREATE TRIGGER IF NOT EXISTS activation_code_redemption_limit
BEFORE UPDATE OF redeemed_count ON activation_codes
WHEN NEW.redeemed_count > NEW.max_redemptions OR NEW.redeemed_count < 0
BEGIN
  SELECT RAISE(ABORT, 'code_redemption_limit');
END;

CREATE TABLE IF NOT EXISTS auth_rate_counters (
  key TEXT PRIMARY KEY,
  bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_counters_bucket ON auth_rate_counters(bucket);

UPDATE sessions
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+12 hours')
WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+12 hours');
