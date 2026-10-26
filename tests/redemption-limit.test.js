'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('the database rejects a second redemption even after both requests read an unused code', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../optional/auth-gated/cloudflare/schema.sql'), 'utf8'));
  db.exec("INSERT INTO users (email, password_hash, password_salt) VALUES ('one@test.invalid', 'x', 'x'), ('two@test.invalid', 'x', 'x')");
  db.exec("INSERT INTO activation_codes (code_hash, days, max_redemptions) VALUES ('test', 30, 1)");
  db.exec('UPDATE activation_codes SET redeemed_count = redeemed_count + 1 WHERE id = 1');
  db.exec('INSERT INTO code_redemptions (code_id, user_id) VALUES (1, 1)');
  assert.throws(() => db.exec('UPDATE activation_codes SET redeemed_count = redeemed_count + 1 WHERE id = 1'), /code_redemption_limit/);
  assert.equal(db.prepare('SELECT redeemed_count FROM activation_codes WHERE id = 1').get().redeemed_count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM code_redemptions').get().count, 1);
  db.close();
});
