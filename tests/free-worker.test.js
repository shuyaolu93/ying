'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const workerPromise = fs.readFile(path.join(__dirname, '../optional/auth-gated/cloudflare/free-worker.js'), 'utf8')
  .then(source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')))
  .then(module => module.default);

function fakeDB(user) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      const statement = {
        sql,
        bind() { return this; },
        async first() { return sql.includes('FROM sessions s') ? user : null; },
        async all() { return { results: [] }; },
        async run() { queries.push(sql); return { meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(statements) {
      queries.push(...statements.map(statement => statement.sql));
      return statements.map(() => ({ success: true }));
    }
  };
}

function session(overrides = {}) {
  return {
    id: 7,
    email: '1234567890',
    entitlement_until: '2099-01-01T00:00:00.000Z',
    session_expires_at: new Date(Date.now() + 3600000).toISOString(),
    ...overrides
  };
}

async function call(pathname, options, env) {
  const worker = await workerPromise;
  const request = new Request('https://worker.test' + pathname, {
    ...options,
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, data: await response.json() };
}

test('expired ISO session is rejected even within its UTC calendar day', async () => {
  const db = fakeDB(session({ session_expires_at: new Date(Date.now() - 1000).toISOString() }));
  const result = await call('/api/auth/me', { method: 'GET' }, { DB: db });
  assert.equal(result.status, 401);
});

test('a registrable account name does not grant message administrator access', async () => {
  const db = fakeDB(session());
  const denied = await call('/api/messages', { method: 'GET' }, { DB: db });
  assert.equal(denied.status, 403);
  const allowed = await call('/api/messages', { method: 'GET' }, { DB: db, MESSAGE_ADMIN_USER_ID: '7' });
  assert.equal(allowed.status, 200);
  const profile = await call('/api/auth/me', { method: 'GET' }, { DB: db, MESSAGE_ADMIN_USER_ID: '7' });
  assert.equal(profile.data.user.canViewMessages, true);
});

test('changing a password revokes every existing session', async () => {
  const db = fakeDB(session());
  const result = await call('/api/auth/password', { method: 'POST', body: JSON.stringify({ password: 'new-password-123' }) }, { DB: db });
  assert.equal(result.status, 200);
  assert.equal(db.queries.some(sql => sql.startsWith('DELETE FROM sessions WHERE user_id')), true);
});

test('cloud risk check rejects a buy labeled reduceOnly', async () => {
  const db = fakeDB(session());
  const order = { side: 'buy', reduceOnly: true, quantity: 100, price: 100, equity: 8000, currentPosition: 10, maxPositionPct: 0.1, highWaterMark: 10000, maxDrawdownPct: 0.15 };
  const result = await call('/api/risk/check', { method: 'POST', body: JSON.stringify(order) }, { DB: db });
  assert.equal(result.status, 200);
  assert.equal(result.data.decision, 'reject');
  assert.equal(result.data.quantity, 0);
});
