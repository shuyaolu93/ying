CREATE TRIGGER IF NOT EXISTS activation_code_redemption_limit
BEFORE UPDATE OF redeemed_count ON activation_codes
WHEN NEW.redeemed_count > NEW.max_redemptions OR NEW.redeemed_count < 0
BEGIN
  SELECT RAISE(ABORT, 'code_redemption_limit');
END;

UPDATE sessions
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+12 hours')
WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+12 hours');
