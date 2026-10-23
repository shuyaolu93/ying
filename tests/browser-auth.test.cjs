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

async function openPage(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  if (options.token) await context.addInitScript(token => localStorage.setItem('rongheAuthTokenV1', token), options.token);
  const page = await context.newPage();
  const errors = [];
  const calls = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no browser JavaScript errors'));
  await page.route('https://ying.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    try {
      await route.fulfill({
        contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html',
        body: await fs.readFile(path.join(root, file))
      });
    } catch {
      await route.fulfill({ status: 404, body: `Missing ${file}` });
    }
  });
  let user = options.token === 'valid-token'
    ? { id: 1, email: options.owner ? '1234567890' : 'reader@example.test', active: true, entitlementUntil: '2099-01-01T00:00:00Z' }
    : null;
  await page.route('https://ronghe-risk-free.shuyaolu93.workers.dev/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    calls.push(pathname);
    if (options.authDelay) await new Promise(resolve => setTimeout(resolve, options.authDelay));
    let status = 200;
    let data = { ok: true };
    if (pathname === '/api/auth/me') {
      if (!user || options.token === 'invalid-token' ||
          (options.expireAfterFirstCheck && calls.filter(call => call === '/api/auth/me').length > 1)) {
        status = 401; data = { message: '请先登录' };
      }
      else data = { user };
    } else if (pathname === '/api/auth/login' || pathname === '/api/auth/register') {
      const email = route.request().postDataJSON().email;
      user = { id: 2, email, active: false, entitlementUntil: null };
      data = { user, token: 'new-token' };
    } else if (pathname === '/api/auth/redeem') {
      user = { ...user, active: true, entitlementUntil: '2099-01-01T00:00:00Z' };
      data = { user };
    } else if (pathname === '/api/messages' && route.request().method() === 'GET') {
      if (user?.email !== '1234567890') { status = 403; data = { message: '禁止访问' }; }
      else data = { messages: [{ email: '<img src=x onerror=alert(1)>@example.test', message: '<script>alert(1)</script>' }] };
    }
    await route.fulfill({ status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' },
      body: JSON.stringify(data) });
  });
  await page.goto(`https://ying.test/${options.candle ? 'candle.html' : ''}`);
  return { page, calls };
}

test('new visitor sees the login page before content', async t => {
  const { page } = await openPage(t);
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
  assert.equal(await page.locator('body').getAttribute('class').then(s => s.includes('auth-gated')), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('expired session never reveals content during verification', async t => {
  const { page } = await openPage(t, { token: 'invalid-token', authDelay: 400 });
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
});

test('login, redeem, personal center and logout remain usable', async t => {
  const { page, calls } = await openPage(t);
  await page.fill('#coverEmail', '12345678');
  await page.fill('#coverPassword', 'password123');
  await page.locator('#coverAuthForm button[type="submit"]').click();
  await page.waitForFunction(() => localStorage.getItem('rongheAuthTokenV1') === 'new-token');
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('#authModal').isVisible(), false);
  await page.fill('#coverCode', 'RONGHE-TEST');
  await page.click('#coverRedeem');
  await page.waitForFunction(() => !document.body.classList.contains('auth-gated'));
  assert.equal(await page.locator('.shell').isVisible(), true);
  await page.click('#accountButton');
  assert.equal(await page.locator('#profileCenter').isVisible(), true);
  assert.equal(await page.locator('#authLoginFields').isVisible(), false);
  assert.equal(await page.locator('#myMessages').isVisible(), false);
  assert.equal(calls.includes('/api/messages'), false);
  await page.click('#authClose');
  assert.equal(await page.locator('#authModal').isVisible(), false);
  await page.click('#headerLogout');
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
});

test('owner message list displays account names as text', async t => {
  const { page } = await openPage(t, { token: 'valid-token', owner: true });
  await page.waitForFunction(() => !document.body.classList.contains('auth-gated'));
  await page.click('#accountButton');
  await page.waitForFunction(() => document.querySelector('#myMessages')?.textContent.includes('<img'));
  assert.equal(await page.locator('#myMessages img, #myMessages script').count(), 0);
});

test('candle page checks the session and chapter controls work on mobile', async t => {
  const { page } = await openPage(t, { token: 'valid-token', candle: true });
  await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await page.locator('.chapter').count() > 0, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.click('#chapterNavToggle');
  assert.equal(await page.locator('#chapterNavToggle').getAttribute('aria-expanded'), 'false');
  const toggle = page.locator('[data-chapter-toggle]').first();
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
});

test('candle page blocks an expired session while it remains open', async t => {
  const { page } = await openPage(t, { token: 'valid-token', candle: true, expireAfterFirstCheck: true });
  await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.body.textContent.includes('卡密已到期'));
  assert.equal(await page.locator('.chapter').count(), 0);
});
