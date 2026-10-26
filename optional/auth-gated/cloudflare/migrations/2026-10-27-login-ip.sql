-- Existing login rows remain NULL because their visitor IP was not recorded.
ALTER TABLE login_events ADD COLUMN ip_address TEXT;
