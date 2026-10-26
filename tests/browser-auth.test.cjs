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
  const context = await browser.newContext({ viewport: options.viewport || { width: 390, height: 844 } });
  t.after(() => context.close());
  if (options.token) await context.addInitScript(token => localStorage.setItem('rongheAuthTokenV1', token), options.token);
  if (options.readingData) await context.addInitScript(data => localStorage.setItem('ying-candle-reading-v1-account-1', JSON.stringify(data)), options.readingData);
  if (options.legacyMarketDraft) await context.addInitScript(data => localStorage.setItem('tradeDecisionCardDraftV3:account-1', JSON.stringify(data)), options.legacyMarketDraft);
  if (options.legacyMarketHistory) await context.addInitScript(data => localStorage.setItem('tradeDecisionCardSnapshotsV2:account-1', JSON.stringify(data)), options.legacyMarketHistory);
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
        contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
        body: await fs.readFile(path.join(root, file))
      });
    } catch {
      await route.fulfill({ status: 404, body: `Missing ${file}` });
    }
  });
  let user = options.token === 'valid-token'
    ? { id: 1, email: options.owner ? '1234567890' : 'reader@example.test', active: true, entitlementUntil: '2099-01-01T00:00:00Z', canViewMessages: Boolean(options.owner) }
    : null;
  const marketNotes = new Map();
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
      user = { id: 2, email, active: false, entitlementUntil: null, canViewMessages: false };
      data = { user, token: 'new-token' };
    } else if (pathname === '/api/auth/redeem') {
      user = { ...user, active: true, entitlementUntil: '2099-01-01T00:00:00Z' };
      data = { user };
    } else if (pathname === '/api/market/hotspots') {
      data = { fetchedAt: new Date().toISOString(), partial: false, items: [
        { title: '制造业 PMI 数据发布', source: '国家统计局 · 最新发布', url: 'https://www.stats.gov.cn/sj/zxfb/example.html', publishedAt: new Date().toISOString() },
        { title: '<img src=x onerror=alert(1)>', source: '国家统计局 · 数据解读', url: 'https://www.stats.gov.cn/sj/sjjd/example.html', publishedAt: new Date().toISOString() }
      ] };
    } else if (pathname === '/api/market/notes') {
      const key = user?.id;
      const saved = marketNotes.get(key);
      if (route.request().method() === 'GET') data = { note: saved?.note || null, revision: saved?.revision || 0 };
      else {
        const body = route.request().postDataJSON();
        if (body.revision !== (saved?.revision || 0)) { status = 409; data = { message: 'revision_conflict' }; }
        else { marketNotes.set(key, { note: body.note, revision: body.revision + 1 }); data = { ok: true, revision: body.revision + 1 }; }
      }
    } else if (pathname === '/api/desk/state' && route.request().method() === 'GET') {
      data = { state: user?.id === 1 && (options.legacyMarketDraft || options.legacyMarketHistory) ? { draft: options.legacyMarketDraft || null, history: options.legacyMarketHistory || [] } : null, revision: 0 };
    } else if (pathname === '/api/messages' && route.request().method() === 'GET') {
      if (user?.email !== '1234567890') { status = 403; data = { message: '禁止访问' }; }
      else data = { messages: [{ email: '<img src=x onerror=alert(1)>@example.test', message: '<script>alert(1)</script>' }] };
    } else if (pathname === '/api/candle/reading' && options.readingUnavailable) {
      status = 503; data = { error: 'unavailable' };
    } else if (pathname === '/api/candle/reading' && options.readingStore) {
      const store = options.readingStore;
      if (route.request().method() === 'GET') data = { reading: store.reading || null, revision: store.revision || 0 };
      else {
        const body = route.request().postDataJSON();
        if (body.revision !== (store.revision || 0)) { status = 409; data = { error: 'revision_conflict' }; }
        else { store.reading = body.reading; store.revision = (store.revision || 0) + 1; data = { ok: true, revision: store.revision }; }
      }
    }
    await route.fulfill({ status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' },
      body: JSON.stringify(data) });
  });
  await page.route('https://ying-candle-data.shuyaolu93.workers.dev/**', route => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': 'https://ying.test' },
    body: JSON.stringify({ patterns: options.patterns || [{ id: 'intro-test', ch: 'ch01', cn: '蜡烛图入门', en: 'Introduction', kind: '学习', sig: '中性', desc: '测试条目', def: '测试定义', note: '测试要点', lesson: true }], schematics: {} })
  }));
  await page.goto(`https://ying.test/${options.candle ? 'candle.html' : options.market ? 'market.html' : options.token && !options.root ? 'index.html' : ''}`);
  return { page, calls };
}

test('new visitor sees the login page before content', async t => {
  const { page } = await openPage(t);
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
  assert.equal(await page.locator('body').getAttribute('class').then(s => s.includes('auth-gated')), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('homepage cover opens and closes the login form', async t => {
  const { page } = await openPage(t);
  await page.locator('#bookCover').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#coverAuthForm').isVisible(), false);
  await page.locator('#coverEnter').click();
  assert.equal(await page.locator('#coverAuthForm').isVisible(), true);
  await page.locator('#coverBack').click();
  assert.equal(await page.locator('#coverAuthForm').isVisible(), false);
});

test('homepage particles respond to pointer movement', async t => {
  const { page } = await openPage(t);
  await page.locator('#bookCover').waitFor({ state: 'visible' });
  await page.mouse.move(110, 320);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#coverPointerGlow')).opacity) > .8);
  assert.equal(await page.locator('#coverEnter').isVisible(), true);
});

test('active account sees the homepage cover before opening the desk', async t => {
  const { page } = await openPage(t, { token: 'valid-token', root: true });
  await page.waitForFunction(() => document.body.classList.contains('home-intro'));
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
  await page.locator('#coverEnter').click();
  assert.equal(await page.locator('#bookCover').isVisible(), false);
  assert.equal(await page.locator('.shell').isVisible(), true);
  await page.goto('https://ying.test/?v=cover-preview');
  await page.waitForFunction(() => document.body.classList.contains('home-intro'));
  assert.equal(await page.locator('#bookCover').isVisible(), true);
});

test('expired session never reveals content during verification', async t => {
  const { page } = await openPage(t, { token: 'invalid-token', authDelay: 400 });
  assert.equal(await page.locator('body').getAttribute('class').then(s => s.includes('auth-pending')), true);
  assert.equal(await page.locator('#bookCover').isVisible(), false);
  assert.equal(await page.locator('.shell').isVisible(), false);
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
});

test('returning from the candle page never flashes the login cover for a valid session', async t => {
  const { page } = await openPage(t, { token: 'valid-token', candle: true, authDelay: 500 });
  await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  await page.locator('.site-switcher a[href="./index.html"]').click();
  assert.equal(await page.locator('body').getAttribute('class').then(s => s.includes('auth-pending')), true);
  assert.equal(await page.locator('#bookCover').isVisible(), false);
  assert.equal(await page.locator('.shell').isVisible(), false);
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#bookCover').isVisible(), false);
  assert.equal(await page.locator('body').getAttribute('class').then(s => s.includes('auth-gated')), false);
});

test('valuation requires real inputs and hold or sell summaries do not require a buy stop', async t => {
  const { page } = await openPage(t, { token: 'valid-token' });
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#calcInput0').inputValue(), '');
  assert.equal(await page.locator('#singlePositionInput').inputValue(), '');
  assert.equal(await page.locator('#leverageInput').inputValue(), '');
  await page.locator('#calculateValuation').click();
  assert.match(await page.locator('#valuationError').textContent(), /请检查输入范围/);
  const today = await page.evaluate(() => {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  });
  for (const id of ['dataDate', 'pmiDate', 'creditDate', 'yieldDate']) await page.locator('#' + id).fill(today);
  await page.locator('#dataSource').fill('国家统计局与公开债券数据');
  for (const [id, value] of Object.entries({ pmiInput: '51', pmiPrev: '50', socialInput: '8', socialPrev: '7', m2Input: '8', m2Prev: '7', yieldInput: '1.8', yieldPrev: '1.9', calcInput0: '20', calcInput1: '1.2', calcInput2: '9', calcInput3: '3' })) {
    await page.locator('#' + id).fill(value);
  }
  await page.locator('#calculateValuation').click();
  await page.locator('#singlePositionInput').fill('10');
  await page.locator('#leverageInput').fill('0');
  assert.match(await page.locator('#riskValidation').textContent(), /止损或逻辑失效条件/);
  await page.locator('#stageHold').check();
  assert.equal(await page.locator('#phaseBuyStop').isChecked(), false);
  assert.match(await page.locator('#riskValidation').textContent(), /风险校验通过/);
  await page.locator('#singlePositionInput').fill('30');
  assert.match(await page.locator('#riskValidation').textContent(), /单票仓位需 ≤ 15%/);
  await page.locator('#singlePositionInput').fill('10');
  await page.locator('#generateSummary').click();
  assert.match(await page.locator('#summaryOutput').inputValue(), /持有逻辑复核：/);
  await page.locator('#stageSell').check();
  await page.locator('#singlePositionInput').fill('30');
  await page.locator('#leverageInput').fill('40');
  assert.match(await page.locator('#riskValidation').textContent(), /卖出复核可继续/);
  await page.locator('#generateSummary').click();
  assert.match(await page.locator('#summaryOutput').inputValue(), /卖出证伪条件：/);
  await page.locator('#stageBuy').check();
  await page.locator('#calcInput0').fill('15');
  await page.locator('#calculateValuation').click();
  for (const [check, evidence] of [['phaseBuyLogic', 'evidenceBuyLogic'], ['phaseBuyValue', 'evidenceBuyValue'], ['phaseBuyStop', 'evidenceBuyStop']]) {
    await page.locator('#' + check).check();
    await page.locator('#' + evidence).fill('已核对的证据');
  }
  assert.match(await page.locator('#phaseDecision').textContent(), /待风险与行为复核/);
  assert.match(await page.locator('#riskValidation').textContent(), /单票仓位需 ≤ 15%/);
});

test('market update can be interpreted with evidence and is cleared between accounts', async t => {
  const { page } = await openPage(t, { token: 'valid-token', market: true });
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#hotspotNewsList .market-news').first().waitFor();
  assert.equal(await page.locator('#hotspotNewsList img').count(), 0);
  await page.locator('#hotspotNewsList .market-news button').first().click();
  assert.equal(await page.locator('#hotspotTitle').inputValue(), '制造业 PMI 数据发布');
  await page.locator('#hotspotFacts').fill('官方公布了本月制造业 PMI，统计口径与上月保持一致。');
  await page.locator('[name="hotspotPath"][value="demand"]').check();
  await page.locator('#hotspotWatch').fill('观察下月新订单指数和企业收入');
  await page.locator('#hotspotCounter').fill('若新订单并未改善，需求传导假设不成立');
  await page.locator('#hotspotForm button[type="submit"]').click();
  assert.match(await page.locator('#hotspotOutput').inputValue(), /可能的影响路径：需求与收入/);
  assert.match(await page.locator('#hotspotOutput').inputValue(), /原文：https:\/\/www\.stats\.gov\.cn/);
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('yingMarketDraftV1:account-1');
    const note = raw && JSON.parse(raw);
    return note?.fields?.hotspotOutput?.includes('需求与收入');
  });
  await page.waitForFunction(() => document.getElementById('marketStorageStatus').textContent.includes('按账号同步'));
  await page.locator('.site-switcher a[href="./index.html"]').click();
  assert.equal(await page.locator('#marketHotspots').count(), 0);
  await page.locator('#headerLogout').click();
  await page.locator('#bookCover').waitFor({ state: 'visible' });
  await page.locator('#coverEmail').fill('new-reader@example.test');
  await page.locator('#coverPassword').fill('password123');
  await page.locator('#coverAuthForm button[type="submit"]').click();
  await page.waitForFunction(() => localStorage.getItem('rongheAuthTokenV1') === 'new-token');
  await page.locator('#coverCode').fill('TEST-CODE');
  await page.locator('#coverRedeem').click();
  await page.locator('.shell').waitFor({ state: 'visible' });
  await page.locator('.site-switcher a[href="./market.html"]').click();
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#hotspotTitle').inputValue(), '');
  assert.equal(await page.locator('#hotspotOutput').inputValue(), '');
  assert.equal(await page.locator('#analysisCompany').inputValue(), '');
});

test('nine questions calculate cash flow, valuation and observed price change without inventing answers', async t => {
  const { page } = await openPage(t, { token: 'valid-token', market: true });
  await page.locator('.shell').waitFor({ state: 'visible' });
  const today = await page.evaluate(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()));
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  await page.locator('#analysisCompany').fill('示例公司 000001');
  await page.locator('#analysisAsOf').fill(today);
  await page.locator('#analysisYear').fill(String(Number(today.slice(0, 4)) + 1));
  await page.locator('#analysisSource').fill('示例公司年度报告及公告');
  for (const [id, value] of Object.entries({
    qProfit: '利润增长取决于订单和毛利率。', qOperatingCash: '需核对应收账款回收。',
    qRevenue: '新订单未必逐年线性增长。', qCashRetention: '需扣除扩产资本开支。',
    qUncertainty: '若订单取消则假设失效。', qExpectations: '当前价可能隐含较高增长。',
    qMethodReasoning: '参考可比公司与增长质量。', qProfitEvidence: '财报披露订单和毛利率。',
    qValuationEvidence: '同业估值与利率水平。', qAssumptionChange: '公告前后订单假设变化。',
    qPriceReaction: '同时观察行业指数和其他公告。'
  })) await page.locator('#' + id).fill(value);
  for (const [id, value] of Object.entries({
    analysisOcf: '20', analysisCapex: '5', analysisCurrentPrice: '20', analysisProfit: '30', analysisShares: '10', analysisPe: '15',
    analysisBeforePrice: '10', analysisAfterPrice: '12'
  })) await page.locator('#' + id).fill(value);
  await page.locator('#analysisPriceDate').fill(today);
  await page.locator('#analysisBeforeDate').fill(yesterday);
  await page.locator('#analysisAfterDate').fill(today);
  await page.locator('#questionForm button[type="submit"]').click();
  const output = await page.locator('#questionOutput').inputValue();
  assert.match(await page.locator('#questionProgress').textContent(), /已回答 9 \/ 9 问/);
  assert.match(output, /20 − 5 = 15 亿元/);
  assert.match(output, /预测每股收益 3 元；乘目标市盈率 15 倍 = 情景估值 45 元\/股/);
  assert.match(output, /约 6\.67 倍远期市盈率/);
  assert.match(output, /观察涨跌幅 20%/);
  assert.match(output, /价格变化不能单独归因于该消息/);
  await page.waitForFunction(() => {
    const note = JSON.parse(localStorage.getItem('yingMarketDraftV1:account-1') || 'null');
    return note?.fields?.questionOutput?.includes('情景估值 45 元/股');
  });
  await page.waitForFunction(() => document.getElementById('marketStorageStatus').textContent.includes('按账号同步'));
  await page.reload();
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#analysisCompany').inputValue(), '示例公司 000001');
  assert.match(await page.locator('#questionOutput').inputValue(), /情景估值 45 元\/股/);
  await page.locator('#analysisMethod').selectOption('manual');
  assert.equal(await page.locator('#peMethodFields').isVisible(), false);
  await page.locator('#analysisManualFormula').fill('按未来现金流折现并扣除净债务');
  await page.locator('#analysisManualTarget').fill('40');
  await page.locator('#questionForm button[type="submit"]').click();
  assert.match(await page.locator('#questionOutput').inputValue(), /自行推导结果：40 元\/股（页面未验证该公式）/);
  assert.doesNotMatch(await page.locator('#questionOutput').inputValue(), /情景估值 45 元\/股/);
  await page.locator('#hotspotTitle').fill('新的公告');
  assert.equal(await page.locator('#questionOutput').inputValue(), '');
});

test('old market draft is carried into the new page and old link redirects', async t => {
  const legacyMarketDraft = { schemaVersion: 6, createdAt: '2026-10-25T12:00:00Z', form: [
    { id: 'hotspotTitle', type: 'text', value: '旧热点记录' },
    { id: 'hotspotFacts', type: 'textarea', value: '这是以前核实过的事实' },
    { id: 'desk-field-15', type: 'radio', value: 'demand', checked: true },
    { id: 'hotspotOutput', type: 'textarea', value: '之前生成的解读' }
  ] };
  const { page } = await openPage(t, { token: 'valid-token', market: true, legacyMarketDraft });
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#hotspotTitle').inputValue(), '旧热点记录');
  assert.equal(await page.locator('#hotspotOutput').inputValue(), '之前生成的解读');
  assert.equal(await page.locator('[name="hotspotPath"][value="demand"]').isChecked(), true);
  await page.goto('https://ying.test/#marketHotspots');
  await page.waitForURL('https://ying.test/market.html');
  assert.equal(await page.locator('#hotspotTitle').inputValue(), '旧热点记录');
});

test('market page restores a legacy note kept only in decision history', async t => {
  const history = [{ createdAt: '2026-10-25T13:00:00Z', snapshot: { createdAt: '2026-10-25T13:00:00Z', form: [
    { id: 'hotspotTitle', type: 'text', value: '历史快照中的热点' },
    { id: 'hotspotOutput', type: 'textarea', value: '历史解读文本' }
  ] } }];
  const { page } = await openPage(t, { token: 'valid-token', market: true, legacyMarketHistory: history });
  await page.locator('.shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#hotspotTitle').inputValue(), '历史快照中的热点');
  assert.equal(await page.locator('#hotspotOutput').inputValue(), '历史解读文本');
});

test('market page stays hidden without an active account', async t => {
  const { page } = await openPage(t, { market: true });
  assert.equal(await page.locator('#marketAccess').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
  assert.equal(await page.locator('#hotspotNewsList .market-news').count(), 0);
});

test('market page does not reveal the prior account if login changes during cloud loading', async t => {
  const { page, calls } = await openPage(t, { token: 'valid-token', market: true, authDelay: 250 });
  for (let attempt = 0; attempt < 60 && !calls.includes('/api/market/notes'); attempt += 1) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls.includes('/api/market/notes'), true);
  await page.evaluate(() => {
    localStorage.removeItem('rongheAuthTokenV1');
    window.dispatchEvent(new StorageEvent('storage', { key: 'rongheAuthTokenV1', oldValue: 'valid-token', newValue: null }));
  });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#marketAccess').isVisible(), true);
  assert.equal(await page.locator('.shell').isVisible(), false);
});

test('login, redeem, personal center and logout remain usable', async t => {
  const { page, calls } = await openPage(t);
  await page.click('#coverEnter');
  await page.fill('#coverEmail', '12345678');
  await page.fill('#coverPassword', 'password123');
  await page.locator('#coverAuthForm button[type="submit"]').click();
  await page.waitForFunction(() => localStorage.getItem('rongheAuthTokenV1') === 'new-token');
  assert.equal(await page.locator('#bookCover').isVisible(), true);
  assert.equal(await page.locator('#authModal').isVisible(), false);
  await page.fill('#coverCode', 'RONGHE-TEST');
  await page.click('#coverRedeem');
  await page.locator('.shell').waitFor({ state: 'visible' });
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
  await page.locator('.shell').waitFor({ state: 'visible' });
  await page.click('#accountButton');
  await page.waitForFunction(() => document.querySelector('#myMessages')?.textContent.includes('<img'));
  assert.equal(await page.locator('#myMessages img, #myMessages script').count(), 0);
});

test('research backup download still works under the content security policy', async t => {
  const { page } = await openPage(t, { token: 'valid-token' });
  await page.locator('.shell').waitFor({ state: 'visible' });
  const download = page.waitForEvent('download');
  await page.locator('#exportDesk').click();
  assert.match((await download).suggestedFilename(), /^ying-research-.*\.json$/);
});

test('candle page checks the session and chapter controls work on mobile', async t => {
  const { page } = await openPage(t, { token: 'valid-token', candle: true });
  await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await page.locator('.chapter').count() > 0, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#chapterNavToggle').getAttribute('aria-expanded'), 'false');
  await page.click('#chapterNavToggle');
  assert.equal(await page.locator('#chapterNavToggle').getAttribute('aria-expanded'), 'true');
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

test('chapter 14 RSI panels stay readable and zoom controls do not cover them', async t => {
  const candles = Array.from({ length: 39 }, (_, i) => [50 + i * .2, 51 + i * .2, 49 + i * .2, 50.5 + i * .2]);
  const rsi = { id: 'rsi', ch: 'ch14', cn: '相对强弱指数', en: 'RSI', kind: '指标', sig: '中性', desc: '测试', def: '测试', note: '测试', fig: '图14.1 RSI', candle: candles, marks: [{ x: 8, y: 52 }], dates: candles.map((_, i) => `第${i + 1}日`), case2: { fig: '图14.2 RSI', candle: candles.slice(0, 36), marks: [], dates: candles.slice(0, 36).map((_, i) => `第${i + 1}日`) } };
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { page } = await openPage(t, { token: 'valid-token', candle: true, patterns: [rsi], viewport });
    await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
    await page.locator('.cell[data-id="rsi"]').click();
    const charts = page.locator('#mCase .case-chart');
    assert.equal(await charts.count(), 4);
    const geometry = await page.locator('#mCase .chart-frame').first().evaluate(frame => {
      const chart = frame.querySelector('.case-chart').getBoundingClientRect();
      const controls = frame.querySelector('.chart-controls').getBoundingClientRect();
      return { chartWidth: chart.width, chartBottom: chart.bottom, controlsTop: controls.top };
    });
    assert.ok(geometry.controlsTop >= geometry.chartBottom, 'zoom buttons are below the RSI chart');
    if (viewport.width >= 900) assert.ok(geometry.chartWidth >= 620, 'desktop RSI chart uses the full case width');
    assert.equal(await page.locator('#mCase .case-chart .kv-rsi-high').count(), 4);
    assert.equal(await page.locator('#mCase .case-chart .kv-rsi-low').count(), 4);
    assert.equal(await page.locator('#mCase .case-chart .kv-rsi-trend').count(), 2);
  }
});

test('candle catalogue treats API text as text and keeps keyboard focus inside its dialog', async t => {
  const attack = '<img src=x onerror="window.__injected=true">';
  const candles = Array.from({ length: 12 }, (_, i) => [50 + i, 51 + i, 49 + i, 50.5 + i]);
  const pattern = { id: 'unsafe-text', ch: 'ch14', cn: '测试形态', en: 'Test', kind: attack, sig: '中性',
    desc: attack, def: attack, note: '测试', fig: '图14.1', candle: candles,
    dates: candles.map(() => attack), marks: [{ x: 3, y: 53, label: attack }],
    trend: [{ from: [0, 50], to: [8, 58], label: attack }],
    case: { t: attack, f: '日线', d: '测试', c: attack } };
  const { page } = await openPage(t, { token: 'valid-token', candle: true, patterns: [pattern], readingStore: {} });
  await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await page.evaluate(() => Boolean(window.__injected)), false);
  assert.equal(await page.locator('.cell img').count(), 0);
  const cell = page.locator('.cell[data-id="unsafe-text"]');
  await cell.click();
  assert.equal(await page.evaluate(() => Boolean(window.__injected)), false);
  assert.equal(await page.locator('#mCase img, #mBody img').count(), 0);
  assert.equal(await page.locator('#mBody').textContent(), attack);
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#modal .close')), true);
  assert.equal(await page.locator('#main').evaluate(el => el.inert), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'unsafe-text');
  assert.equal(await page.locator('#main').evaluate(el => el.inert), false);
});

test('candle reading and favorite changes sync between devices', async t => {
  const store = {};
  const pattern = { id: 'intro-test', ch: 'ch01', cn: '蜡烛图入门', en: 'Introduction', kind: '学习', sig: '中性', desc: '测试条目', def: '测试定义', note: '测试要点', lesson: true };
  const first = await openPage(t, { token: 'valid-token', candle: true, patterns: [pattern], readingStore: store });
  await first.page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  await first.page.locator('.fav-toggle[data-id="intro-test"]').click();
  await first.page.locator('.cell[data-id="intro-test"]').click();
  await first.page.keyboard.press('Escape');
  for (let i = 0; i < 50 && !store.reading?.favorites.includes('intro-test'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(store.reading?.last, 'intro-test');
  assert.equal(store.reading?.favorites.includes('intro-test'), true);

  const second = await openPage(t, { token: 'valid-token', candle: true, patterns: [pattern], readingStore: store });
  await second.page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await second.page.locator('.fav-toggle[data-id="intro-test"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await second.page.locator('#continueReading').isVisible(), true);
  await second.page.locator('.fav-toggle[data-id="intro-test"]').click();
  for (let i = 0; i < 50 && store.reading?.favorites.includes('intro-test'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(store.reading?.favorites.includes('intro-test'), false);
  await first.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await first.page.waitForFunction(() => document.querySelector('.fav-toggle[data-id="intro-test"]')?.getAttribute('aria-pressed') === 'false');
});

test('candle catalogue remains available with local progress while reading sync is offline', async t => {
  const pattern = { id: 'intro-test', ch: 'ch01', cn: '蜡烛图入门', en: 'Introduction', kind: '学习', sig: '中性', desc: '测试条目', def: '测试定义', note: '测试要点', lesson: true };
  const { page } = await openPage(t, { token: 'valid-token', candle: true, patterns: [pattern], readingUnavailable: true,
    readingData: { chapter: 'ch01', last: 'intro-test', favorites: ['intro-test'] } });
  await page.waitForFunction(() => !document.body.classList.contains('auth-pending'));
  assert.equal(await page.locator('.fav-toggle[data-id="intro-test"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#readingSyncStatus').textContent(), /保存在此浏览器/);
});
