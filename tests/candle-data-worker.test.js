'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const workerPromise = fs.readFile(path.join(__dirname, '../optional/auth-gated/cloudflare/candle-data-worker.js'), 'utf8')
  .then(source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')))
  .then(module => module.default);

test('candle data accepts the old site and both new domain origins', async () => {
  const worker = await workerPromise;
  for (const origin of [
    'https://shuyaolu93.github.io',
    'https://www.zunshoujilv.top',
    'https://zunshoujilv.top'
  ]) {
    const preflight = await worker.fetch(new Request('https://worker.test/api/candle/data', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' }
    }), {});
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

    const unauthenticated = await worker.fetch(new Request('https://worker.test/api/candle/data', {
      headers: { origin }
    }), {});
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('access-control-allow-origin'), origin);
  }
});

test('candle data rejects unrelated origins', async () => {
  const worker = await workerPromise;
  const response = await worker.fetch(new Request('https://worker.test/api/candle/data', {
    method: 'OPTIONS',
    headers: { origin: 'https://unrelated.example' }
  }), {});
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
