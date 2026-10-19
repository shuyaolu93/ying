// Run with: npm run test:browser (requires Playwright and Chrome).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { if (browser) await browser.close(); });

async function desk(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  if (options.clock) await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no browser JavaScript errors'));
  let account = { id: 1, email: 'one@example.test', active: true, entitlementUntil: '2099-12-31T23:59:59Z' };
  await page.route('https://ronghe-risk-free.shuyaolu93.workers.dev/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/login') {
      const body = route.request().postDataJSON();
      const id = body.email.startsWith('two') ? 2 : 1;
      account = { ...account, id, email: body.email, active: !options.inactive,
        entitlementUntil: options.inactive ? null : options.expires || '2099-12-31T23:59:59Z' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: JSON.stringify({ user: account, token: 'test-token-' + account.id }) });
  });
  await page.route('https://ronghe.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    assert.ok(['index.html', 'app.js', 'auth.js', 'core/risk-engine.js'].includes(file));
    await route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html',
      body: await fs.readFile(path.join(root, file)) });
  });
  await page.goto('https://ronghe.test/');
  await page.waitForFunction(() => document.getElementById('headerLogout'));
  async function login(email = 'one@example.test') {
    await page.fill('#coverEmail', email);
    await page.fill('#coverPassword', 'testing-password');
    await page.click('#coverLogin');
    if (!options.inactive) await page.waitForFunction(() => !document.body.classList.contains('auth-gated'));
  }
  async function macro(extra = {}) {
    await page.evaluate(values => {
      const date = new Date();
      const today = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      const defaults = { pmiInput: '51', pmiPrev: '53', socialInput: '8', socialPrev: '7', m2Input: '8', m2Prev: '7', yieldInput: '1.7', yieldPrev: '1.8', dataDate: today, pmiDate: today, creditDate: today, yieldDate: today, dataSource: 'test source / same statistical period' };
      for (const [id, value] of Object.entries({ ...defaults, ...values })) {
        const el = document.getElementById(id); el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, extra);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function buy() {
    await page.fill('#calcInput0', '16');
    await page.click('#calculateValuation');
    for (const key of ['Logic', 'Value', 'Stop']) {
      await page.check('#phaseBuy' + key);
      await page.fill('#evidenceBuy' + key, 'Evidence ' + key);
    }
    for (let i = 1; i <= 5; i++) await page.check('#behavior' + i + 'Yes');
  }
  return { page, login, macro, buy };
}

test('first visit has no invented market dates or values', async t => {
  const { page, login } = await desk(t); await login();
  assert.equal(await page.inputValue('#dataDate'), '');
  assert.equal(await page.inputValue('#pmiInput'), '');
  assert.match(await page.textContent('#quadrantName'), /等待/);
});

test('PMI level, not its change, controls expansion and contraction', async t => {
  const { page, login, macro } = await desk(t); await login();
  await macro({ pmiInput: '49', pmiPrev: '47' });
  assert.match(await page.textContent('#quadrantName'), /收缩/);
  assert.match(await page.textContent('#quadrantReason'), /改善/);
  await macro({ pmiInput: '51', pmiPrev: '53' });
  assert.match(await page.textContent('#quadrantName'), /扩张/);
  assert.match(await page.textContent('#quadrantReason'), /回落/);
});

test('future and stale component dates invalidate the macro chain', async t => {
  const { page, login, macro } = await desk(t); await login();
  await macro({ pmiDate: '2099-01-01' });
  assert.match(await page.textContent('#quadrantName'), /等待/);
  assert.match(await page.textContent('#dataFreshness'), /不能晚于今天/);
  await macro({ yieldDate: '2000-01-01' });
  assert.match(await page.textContent('#dataFreshness'), /超过复核期限/);
});

test('DDM default and PEG percent units are correct; blank price is rejected', async t => {
  const { page, login } = await desk(t); await login();
  await page.click('#calculateValuation');
  assert.match(await page.textContent('#scenarioBase'), /20\.00/);
  await page.fill('#calcInput0', ''); await page.click('#calculateValuation');
  assert.match(await page.textContent('#valuationError'), /当前股价/);
  assert.equal(await page.textContent('#scenarioBase'), '—');
  await page.check('[name="companyType"][value="growth"]');
  await page.click('#calculateValuation');
  assert.match(await page.textContent('#scenarioBase'), /33\.00/);
});

test('opposite PB signals produce a conflict and block manual buy approval', async t => {
  const { page, login } = await desk(t); await login();
  await page.check('[name="companyType"][value="resource"]');
  await page.fill('#calcInput0', '3'); await page.fill('#calcInput3', '20');
  await page.click('#calculateValuation');
  assert.equal(await page.textContent('#valuationZone'), '信号冲突');
  for (const key of ['Logic', 'Value', 'Stop']) { await page.check('#phaseBuy' + key); await page.fill('#evidenceBuy' + key, 'Evidence'); }
  assert.match(await page.textContent('#phaseDecision'), /暂不建议/);
});

test('DDM optimistic case stays above base even when the spread is tiny', async t => {
  const { page, login } = await desk(t); await login();
  await page.fill('#calcInput2', '3.01'); await page.click('#calculateValuation');
  const base = parseFloat(await page.textContent('#scenarioBase'));
  const bull = parseFloat(await page.textContent('#scenarioBull'));
  assert.ok(bull > base);
  assert.match(await page.textContent('#valuationDetail'), /高度敏感/);
});

test('valuation edits clear scenarios and remove automatic allocation adjustment', async t => {
  const { page, login, macro } = await desk(t); await login(); await macro();
  await page.fill('#calcInput0', '16'); await page.click('#calculateValuation');
  assert.equal(await page.textContent('#allocAttack'), '40%');
  await page.fill('#calcInput0', '17');
  assert.equal(await page.textContent('#scenarioBase'), '—');
  assert.equal(await page.textContent('#allocAttack'), '35%');
  await page.check('[name="companyType"][value="growth"]');
  assert.equal(await page.textContent('#overviewValuation'), '等待计算');
});

test('risk requires a written stop condition and preserves the numeric limits', async t => {
  const { page, login } = await desk(t); await login();
  assert.match(await page.textContent('#riskValidation'), /止损/);
  await page.check('#phaseBuyStop'); await page.fill('#evidenceBuyStop', 'Logic invalidated by revenue decline');
  assert.match(await page.textContent('#riskValidation'), /通过/);
  await page.fill('#singlePositionInput', '16');
  assert.match(await page.textContent('#riskValidation'), /15%/);
});

test('high valuation cannot be approved by manual checks; discounted valuation can', async t => {
  const { page, login, macro, buy } = await desk(t); await login(); await macro(); await buy();
  assert.match(await page.textContent('#phaseDecision'), /可以买入/);
  await page.fill('#calcInput0', '30'); await page.click('#calculateValuation'); await page.check('#phaseBuyValue');
  assert.match(await page.textContent('#phaseDecision'), /暂不建议/);
});

test('inability to bear loss starts a pause that survives unchecking, reload and reset', async t => {
  const { page, login } = await desk(t); await login();
  for (let i = 1; i <= 5; i++) await page.check('#behavior' + i + 'Yes');
  await page.check('#behavior3No');
  assert.match(await page.textContent('#behaviorRisk'), /高风险/);
  await page.check('#behavior3Yes');
  assert.equal(await page.locator('#behaviorPause').isVisible(), true);
  await page.reload(); await page.waitForFunction(() => !document.body.classList.contains('auth-gated'));
  assert.equal(await page.locator('#behaviorPause').isVisible(), true);
  page.once('dialog', dialog => dialog.accept()); await page.click('#resetAll');
  assert.equal(await page.locator('#behaviorPause').isVisible(), true);
});

test('snapshot always regenerates weekly and simulation text and uses the newest baseline', async t => {
  const { page, login, macro, buy } = await desk(t); await login(); await macro(); await buy();
  await page.click('#generateSummary');
  await page.check('[data-weekly="macro"] input');
  await page.click('[data-scenario-preset="slowdown"]');
  await page.click('#saveSnapshot');
  const summary = await page.inputValue('#summaryOutput');
  assert.match(summary, /已完成 1\/5/);
  assert.doesNotMatch(summary, /仓位测算|止损条件已确认/);
  assert.match(await page.textContent('#weekComparison'), /底仓\+0pct/);
  await page.fill('#weeklyRiskNote', 'New risk after snapshot'); await page.click('#saveSnapshot');
  assert.match(await page.inputValue('#summaryOutput'), /New risk after snapshot/);
});

test('clicking calculate persists a recalculable valuation across reload', async t => {
  const { page, login } = await desk(t); await login();
  await page.click('#calculateValuation');
  await page.waitForFunction(() => {
    const draft = JSON.parse(localStorage.getItem('tradeDecisionCardDraftV3:user:1'));
    return draft && draft.stateData.valuationCalculated;
  });
  await page.reload(); await page.waitForFunction(() => !document.body.classList.contains('auth-gated'));
  assert.match(await page.textContent('#scenarioBase'), /20\.00/);
});

test('accounts have separate drafts and logout removes prior account data from the UI', async t => {
  const { page, login } = await desk(t); await login();
  await page.fill('#weeklyRiskNote', 'Account one private note');
  await page.waitForFunction(() => localStorage.getItem('tradeDecisionCardDraftV3:user:1'));
  await page.click('#headerLogout');
  assert.equal(await page.inputValue('#weeklyRiskNote'), '');
  await login('two@example.test');
  assert.equal(await page.inputValue('#weeklyRiskNote'), '');
  await page.click('#headerLogout'); await login();
  assert.equal(await page.inputValue('#weeklyRiskNote'), 'Account one private note');
});

test('inactive accounts stay on the cover and can access the redemption dialog', async t => {
  const { page, login } = await desk(t, { inactive: true }); await login();
  await page.waitForFunction(() => document.getElementById('authModal').hidden === false);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('auth-gated')), true);
  assert.equal(await page.locator('#authRedeem').isVisible(), true);
  assert.ok(await page.locator('#authModal').evaluate(el => Number(getComputedStyle(el).zIndex)) > 60);
});

test('card expiration gates the workspace while the page is still open', async t => {
  const { page, login } = await desk(t, { clock: true, expires: new Date(Date.now() + 120000).toISOString() });
  await login();
  await page.clock.fastForward(180000);
  await page.waitForFunction(() => document.body.classList.contains('auth-gated'));
  assert.equal(await page.locator('#authRedeem').isVisible(), true);
});

test('an expired pause requires fresh answers before proceeding', async t => {
  const { page, login } = await desk(t, { clock: true }); await login();
  for (let i = 1; i <= 5; i++) await page.check('#behavior' + i + 'Yes');
  await page.check('#behavior3No'); await page.check('#behavior3Yes');
  await page.clock.fastForward(24 * 3600000 + 60001);
  await page.waitForFunction(() => document.getElementById('behaviorCount').textContent === '0');
  assert.match(await page.textContent('#behaviorRisk'), /未完成/);
});

test('a restored complete buy checklist is revalidated without losing manual confirmation', async t => {
  const { page, login, macro, buy } = await desk(t); await login(); await macro(); await buy();
  await page.click('#saveSnapshot');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tradeDecisionCardDraftV3:user:1') || 'null')?.stateData.valuationCalculated);
  await page.reload(); await page.waitForFunction(() => !document.body.classList.contains('auth-gated'));
  assert.equal(await page.isChecked('#phaseBuyValue'), true);
  assert.match(await page.textContent('#phaseDecision'), /可以买入/);
});

test('mobile layout keeps navigation reachable and hides actions behind login', async t => {
  const { page, login } = await desk(t);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#mobileSummary').isVisible(), false);
  await login();
  assert.equal(await page.locator('#mobileSummary').isVisible(), true);
  await page.click('#stepNav [data-step="6"]');
  const positions = await page.evaluate(() => ({ nav: document.getElementById('stepNav').getBoundingClientRect().bottom, role: document.getElementById('role6').getBoundingClientRect().top }));
  assert.ok(positions.role >= positions.nav, 'module heading is below sticky navigation');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
