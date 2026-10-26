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
  let deletedWithBearer = false;
  let unusedCodePresent = true;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ying.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    await route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: await fs.readFile(path.join(root, file)) });
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
        : section === 'logins' ? [
          { id: 2, email: 'reader@example.test', event_type: 'login', ip_address: '2001:db8::1', created_at: '2026-10-27 03:00:00' },
          { id: 1, email: '1234567890', event_type: 'login', ip_address: null, created_at: '2026-10-26 03:00:00' }
        ]
        : section === 'users' ? [{ id: 1, email: 'reader@example.test', entitlement_until: null, active_sessions: 0 }]
          : section === 'codes' ? [...(unusedCodePresent ? [{ id: 10, days: 30, redeemed_count: 0, max_redemptions: 1 }] : []), { id: 11, days: 30, redeemed_count: 1, max_redemptions: 1 }]
          : [] };
    } else if (url.pathname === '/api/admin/activation-codes') {
      generatedWithBearer = authorization === 'Bearer admin-token';
      data = { codes: ['RONGHE-TESTCARD123'], days: 30 };
    } else if (url.pathname === '/api/admin/activation-codes/10' && route.request().method() === 'DELETE') {
      deletedWithBearer = authorization === 'Bearer admin-token';
      unusedCodePresent = false;
      data = { ok: true };
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
  assert.deepEqual(await page.locator('#loginsSection thead th').allTextContents(), ['账号', '事件', '登录 IP', '时间']);
  assert.match(await page.locator('#loginsSection tbody').textContent(), /2001:db8::1/);
  assert.match(await page.locator('#loginsSection tbody tr').nth(1).textContent(), /—/);
  assert.equal(await page.getByRole('button', { name: '删除卡密 #10' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '删除卡密 #11' }).count(), 0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除卡密 #10' }).click();
  await page.getByText('卡密 #10 已删除。').waitFor();
  assert.equal(deletedWithBearer, true);
  assert.equal(await page.getByRole('button', { name: '删除卡密 #10' }).count(), 0);
  await page.locator('#codeForm button').click();
  await page.waitForFunction(() => document.querySelector('#codeResult').value.includes('RONGHE-TESTCARD123'));
  assert.equal(generatedWithBearer, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});
