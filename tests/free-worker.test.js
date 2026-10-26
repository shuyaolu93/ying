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

test('dashboard and card generation require the configured administrator user ID', async () => {
  const db = fakeDB(session());
  const env = { DB: db, MESSAGE_ADMIN_USER_ID: '8' };
  assert.equal((await call('/api/admin/dashboard?section=overview', { method: 'GET' }, env)).status, 403);
  assert.equal((await call('/api/admin/activation-codes', { method: 'POST', body: JSON.stringify({ days: 30, count: 1 }) }, env)).status, 403);
  assert.equal((await call('/api/admin/dashboard?section=users', { method: 'GET' }, { DB: fakeDB(null), MESSAGE_ADMIN_USER_ID: '7' })).status, 401);
  env.MESSAGE_ADMIN_USER_ID = '7';
  assert.equal((await call('/api/admin/dashboard?section=users&offset=0', { method: 'GET' }, env)).status, 200);
  assert.equal((await call('/api/admin/dashboard?section=users&offset=-1', { method: 'GET' }, env)).status, 400);
  assert.equal((await call('/api/admin/dashboard?section=unknown', { method: 'GET' }, env)).status, 400);
  const generated = await call('/api/admin/activation-codes', { method: 'POST', body: JSON.stringify({ days: 30, count: 1 }) }, env);
  assert.equal(generated.status, 200);
  assert.equal(generated.data.codes.length, 1);
  assert.equal(db.queries.some(sql => sql.startsWith('INSERT INTO activation_codes')), true);
});

test('only an administrator can delete a code with no redemptions', async () => {
  const deleted = [];
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes('FROM sessions s')) return session();
          if (sql.startsWith('SELECT id FROM activation_codes')) return values[0] === 11 ? { id: 11 } : null;
          return null;
        },
        async run() {
          if (sql.startsWith('DELETE FROM activation_codes')) {
            assert.match(sql, /redeemed_count = 0/);
            assert.match(sql, /NOT EXISTS \(SELECT 1 FROM code_redemptions WHERE code_id = \?\)/);
            assert.deepEqual(values, [values[0], values[0]]);
            deleted.push(values[0]);
            return { meta: { changes: values[0] === 10 ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        }
      };
    }
  };
  const admin = { DB: db, MESSAGE_ADMIN_USER_ID: '7' };
  const ordinary = { DB: db, MESSAGE_ADMIN_USER_ID: '8' };
  assert.equal((await call('/api/admin/activation-codes/10', { method: 'DELETE' }, ordinary)).status, 403);
  assert.equal((await call('/api/admin/activation-codes/10', { method: 'DELETE' }, { DB: fakeDB(null), MESSAGE_ADMIN_USER_ID: '7' })).status, 401);
  assert.equal((await call('/api/admin/activation-codes/0', { method: 'DELETE' }, admin)).status, 400);
  assert.equal(deleted.length, 0);
  assert.equal((await call('/api/admin/activation-codes/10', { method: 'DELETE' }, admin)).status, 200);
  assert.equal((await call('/api/admin/activation-codes/11', { method: 'DELETE' }, admin)).status, 409);
  assert.equal((await call('/api/admin/activation-codes/12', { method: 'DELETE' }, admin)).status, 404);
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

test('K-line quality check rejects invalid rows beyond the first', async () => {
  const valid = { open: 10, high: 12, low: 9, close: 11, volume: 100 };
  const bars = Array.from({ length: 60 }, () => ({ ...valid }));
  const env = { DB: fakeDB(session()) };
  const accepted = await call('/api/analysis/quality', { method: 'POST', body: JSON.stringify({ bars }) }, env);
  assert.equal(accepted.data.status, 'ok');
  bars[30] = { ...valid, high: 8 };
  const rejected = await call('/api/analysis/quality', { method: 'POST', body: JSON.stringify({ bars }) }, env);
  assert.equal(rejected.data.block_new_entries, true);
  assert.match(rejected.data.issues.join(' '), /第31条 OHLC 关系异常/);
  bars[30] = { ...valid, volume: 'NaN' };
  const invalidNumber = await call('/api/analysis/quality', { method: 'POST', body: JSON.stringify({ bars }) }, env);
  assert.equal(invalidNumber.data.block_new_entries, true);
});

test('market updates require an active account and expose only verified official links', async () => {
  const published = new Date(Date.now() - 86400000).toISOString();
  const xml = '<rss><channel>' +
    '<item><title><![CDATA[PMI &amp; 需求]]></title><link>https://www.stats.gov.cn/sj/zxfb/example.html</link><pubDate>' + published + '</pubDate></item>' +
    '<item><title>Unsafe</title><link>https://example.test/story</link><pubDate>' + published + '</pubDate></item>' +
    '</channel></rss>';
  const pbcXml = '<rss><channel><item><title><![CDATA[货币政策公告]]></title><link><![CDATA[www.pbc.gov.cn/goutongjiaoliu/example.html]]></link><pubDate>' + published + '</pubDate></item></channel></rss>';
  const feed = async url => new Response(url.includes('pbc.gov.cn') ? pbcXml : xml, { status: 206 });
  const active = { DB: fakeDB(session()), MARKET_FEED_FETCH: feed };
  assert.equal((await call('/api/market/hotspots', { method: 'GET' }, { DB: fakeDB(null), MARKET_FEED_FETCH: feed })).status, 401);
  assert.equal((await call('/api/market/hotspots', { method: 'GET' }, { DB: fakeDB(session({ entitlement_until: null })), MARKET_FEED_FETCH: feed })).status, 403);
  const result = await call('/api/market/hotspots', { method: 'GET' }, active);
  assert.equal(result.status, 200);
  assert.equal(result.data.items.length, 2);
  assert.equal(result.data.items[0].title, 'PMI & 需求');
  assert.equal(result.data.items[0].url, 'https://www.stats.gov.cn/sj/zxfb/example.html');
  assert.equal(result.data.items[1].url, 'https://www.pbc.gov.cn/goutongjiaoliu/example.html');
  const unavailable = await call('/api/market/hotspots', { method: 'GET' }, { DB: fakeDB(session()), MARKET_FEED_FETCH: async () => new Response('', { status: 503 }) });
  assert.equal(unavailable.status, 503);
});

test('market notes are private, bounded and revision checked', async () => {
  let currentUser = session();
  let stored = null;
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes('FROM sessions s')) return currentUser;
          if (sql.includes('FROM market_notes')) return stored?.userId === values[0] ? stored : null;
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO market_notes')) {
            if (stored) return { meta: { changes: 0 } };
            stored = { userId: values[0], payload: values[1], revision: 1, updated_at: values[2] };
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE market_notes')) {
            if (stored?.userId !== values[2] || stored.revision !== values[3]) return { meta: { changes: 0 } };
            stored = { userId: values[2], payload: values[0], revision: stored.revision + 1, updated_at: values[1] };
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
      };
    }
  };
  const env = { DB: db };
  const note = { updatedAt: new Date().toISOString(), fields: { hotspotTitle: '旧热点', hotspotOutput: '解读' } };
  assert.equal((await call('/api/market/notes', { method: 'GET' }, env)).data.note, null);
  assert.equal((await call('/api/market/notes', { method: 'PUT', body: JSON.stringify({ revision: 0, note }) }, env)).status, 200);
  assert.equal((await call('/api/market/notes', { method: 'GET' }, env)).data.note.fields.hotspotTitle, '旧热点');
  assert.equal((await call('/api/market/notes', { method: 'PUT', body: JSON.stringify({ revision: 0, note }) }, env)).status, 409);
  assert.equal((await call('/api/market/notes', { method: 'PUT', body: JSON.stringify({ revision: 1, note: { ...note, fields: { password: 'secret' } } }) }, env)).status, 400);
  assert.equal((await call('/api/market/notes', { method: 'PUT', body: JSON.stringify({ revision: 1, note: { ...note, fields: { hotspotFacts: 'x'.repeat(12001) } } }) }, env)).status, 413);
  currentUser = session({ id: 8 });
  assert.equal((await call('/api/market/notes', { method: 'GET' }, env)).data.note, null);
  currentUser = session({ entitlement_until: null });
  assert.equal((await call('/api/market/notes', { method: 'GET' }, env)).status, 403);
  currentUser = null;
  assert.equal((await call('/api/market/notes', { method: 'GET' }, env)).status, 401);
});

test('candle reading is private to its account and uses revision checks', async () => {
  let currentUser = session();
  let stored = null;
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes('FROM sessions s')) return currentUser;
          if (sql.includes('FROM candle_reading')) return stored?.userId === values[0] ? stored : null;
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO candle_reading')) {
            if (stored) return { meta: { changes: 0 } };
            stored = { userId: values[0], payload: values[1], revision: 1, updated_at: values[2] };
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE candle_reading')) {
            if (stored?.userId !== values[2] || stored.revision !== values[3]) return { meta: { changes: 0 } };
            stored = { userId: values[2], payload: values[0], revision: stored.revision + 1, updated_at: values[1] };
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
      };
    }
  };
  const reading = { chapter: 'ch14', last: 'rsi', scrollY: 120, updatedAt: 1000,
    favorites: ['rsi'], favoriteEdits: { rsi: { saved: true, at: 1000 } } };
  assert.equal((await call('/api/candle/reading', { method: 'GET' }, { DB: db })).data.revision, 0);
  assert.equal((await call('/api/candle/reading', { method: 'PUT', body: JSON.stringify({ revision: 0, reading }) }, { DB: db })).status, 200);
  const saved = await call('/api/candle/reading', { method: 'GET' }, { DB: db });
  assert.deepEqual(saved.data.reading.favorites, ['rsi']);
  assert.equal((await call('/api/candle/reading', { method: 'PUT', body: JSON.stringify({ revision: 0, reading }) }, { DB: db })).status, 409);
  assert.equal((await call('/api/candle/reading', { method: 'PUT', body: JSON.stringify({ revision: 1, reading: { ...reading, favoriteEdits: [] } }) }, { DB: db })).status, 400);
  currentUser = session({ id: 8 });
  assert.equal((await call('/api/candle/reading', { method: 'GET' }, { DB: db })).data.reading, null);
  currentUser = session({ entitlement_until: null });
  assert.equal((await call('/api/candle/reading', { method: 'GET' }, { DB: db })).status, 403);
  currentUser = null;
  assert.equal((await call('/api/candle/reading', { method: 'GET' }, { DB: db })).status, 401);
});
