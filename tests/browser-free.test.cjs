// Run with: npm run test:browser (requires Playwright and Chromium).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true });
});
after(async () => { if (browser) await browser.close(); });

async function desk(t) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no browser JavaScript errors'));
  await page.route('https://ronghe.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    assert.ok(['index.html', 'app.js', 'core/risk-engine.js'].includes(file));
    await route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html', body: await fs.readFile(path.join(root, file)) });
  });
  await page.goto('https://ronghe.test/');
  return page;
}

async function macro(page) {
  await page.evaluate(() => {
    const date = new Date();
    const today = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const values = { pmiInput: '51', pmiPrev: '50', socialInput: '8', socialPrev: '7', m2Input: '8', m2Prev: '7', yieldInput: '1.7', yieldPrev: '1.8', dataDate: today, pmiDate: today, creditDate: today, yieldDate: today, dataSource: 'test source' };
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id); element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('the public edition opens without authentication or network requests', async t => {
  const page = await desk(t);
  assert.equal(await page.locator('body').evaluate(element => element.classList.contains('auth-gated')), false);
  assert.equal(await page.locator('#authModal, #bookCover, #accountButton').count(), 0);
  assert.equal(await page.locator('script[src*="auth.js"]').count(), 0);
  assert.match(await page.textContent('.live-pill'), /免费公开版/);
});

test('DDM and PEG calculations work in the public edition', async t => {
  const page = await desk(t);
  await page.click('#calculateValuation');
  assert.match(await page.textContent('#scenarioBase'), /20\.00/);
  await page.check('[name="companyType"][value="growth"]');
  await page.click('#calculateValuation');
  assert.match(await page.textContent('#scenarioBase'), /33\.00/);
});

test('public drafts persist in this browser after reload', async t => {
  const page = await desk(t);
  await page.fill('#weeklyRiskNote', 'Public browser-only note');
  await page.waitForFunction(() => localStorage.getItem('tradeDecisionCardDraftV3:public'));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('weeklyRiskNote').value === 'Public browser-only note');
  assert.equal(await page.inputValue('#weeklyRiskNote'), 'Public browser-only note');
});

test('free public workflow remains usable on mobile', async t => {
  const page = await desk(t);
  await page.setViewportSize({ width: 390, height: 844 });
  await macro(page);
  await page.click('#stepNav [data-step="6"]');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#mobileSummary').isVisible(), true);
});
