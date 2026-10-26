'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : { channel: 'chrome' }),
    headless: true
  });
});
after(async () => { if (browser) await browser.close(); });

test('only the administrator can open the dashboard, read safe records and generate cards', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  let generatedWithBearer = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ying.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    await route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html', body: await fs.readFile(path.join(root, file)) });
  });
  await page.route('https://ronghe-risk-free.shuyaolu93.workers.dev/**', async route => {
    const url = new URL(route.request().url());
    const authorization = route.request().headers().authorization;
    let status = 200, data = {};
    if (url.pathname === '/api/auth/login') data = { token: 'admin-token', user: { email: '1234567890', canViewMessages: true } };
    else if (url.pathname === '/api/auth/me') data = { user: { email: '1234567890', canViewMessages: authorization === 'Bearer admin-token' } };
    else if (url.pathname === '/api/admin/dashboard' && authorization !== 'Bearer admin-token') { status = 403; data = { message: '仅管理员可查看后台' }; }
    else if (url.pathname === '/api/admin/dashboard' && url.searchParams.get('section') === 'overview') data = { summary: { users: 10, active_users: 6, codes: 36, redemptions: 6, logins: 1, desk_synced: 1, candle_synced: 0, messages: 1 } };
    else if (url.pathname === '/api/admin/dashboard') {
      const section = url.searchParams.get('section');
      data = { nextOffset: null, items: section === 'messages'
        ? [{ id: 1, email: 'reader@example.test', message: '<img src=x onerror=alert(1)>', created_at: '2026-10-26 03:00:00' }]
        : section === 'users' ? [{ id: 1, email: 'reader@example.test', entitlement_until: null, active_sessions: 0 }]
          : [] };
    } else if (url.pathname === '/api/admin/activation-codes') {
      generatedWithBearer = authorization === 'Bearer admin-token';
      data = { codes: ['RONGHE-TESTCARD123'], days: 30 };
    }
    await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  });
  await page.goto('https://ying.test/admin.html');
  assert.equal(await page.locator('#loginPanel').isVisible(), true);
  assert.equal(await page.locator('#dashboard').isVisible(), false);
  await page.fill('#account', '1234567890');
  await page.fill('#password', 'correct-password');
  await page.locator('#loginForm button').click();
  await page.locator('#stats .stat').first().waitFor();
  assert.equal(await page.locator('#dashboard').isVisible(), true);
  assert.equal(await page.locator('#stats .stat').count(), 8);
  assert.equal(await page.locator('#messagesSection img').count(), 0);
  assert.match(await page.locator('#messagesSection tbody').textContent(), /<img src=x onerror=alert\(1\)>/);
  await page.locator('#codeForm button').click();
  await page.waitForFunction(() => document.querySelector('#codeResult').value.includes('RONGHE-TESTCARD123'));
  assert.equal(generatedWithBearer, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});
