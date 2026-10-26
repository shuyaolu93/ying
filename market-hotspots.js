(function () {
  'use strict';

  var API = 'https://ronghe-risk-free.shuyaolu93.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  var pathways = {
    demand: { label: '需求与收入', mechanism: '若事件改变实际需求或订单，影响可能先体现在销量和收入，再传导至利润。需区分短期波动与持续变化。' },
    supply: { label: '供给与成本', mechanism: '若事件改变供给、库存或投入价格，影响可能先体现在成本和毛利率；方向取决于企业的定价能力与合同周期。' },
    liquidity: { label: '流动性与融资', mechanism: '若事件改变融资成本或资金可得性，可能影响投资、再融资和市场估值；单一指标不足以确认政策立场。' },
    valuation: { label: '估值与风险偏好', mechanism: '若事件改变增长预期或风险偏好，估值倍数可能变化；需与盈利、资本成本和实际交易数据交叉核对。' },
    unknown: { label: '暂不明确', mechanism: '目前无法从已核实事实建立可靠的传导路径，应继续收集数据，不据此调整仓位。' }
  };
  var directionLabels = { unknown: '待验证', positive: '可能偏正面（个人判断）', negative: '可能偏负面（个人判断）' };
  var refreshId = 0;
  var fieldIds = [
    'hotspotTitle', 'hotspotPublished', 'hotspotSourceName', 'hotspotSourceUrl', 'hotspotFacts', 'hotspotWatch', 'hotspotCounter', 'hotspotOutput',
    'analysisCompany', 'analysisAsOf', 'analysisYear', 'analysisSource', 'analysisOcf', 'analysisCapex', 'analysisCurrentPrice', 'analysisPriceDate',
    'analysisMethod', 'analysisProfit', 'analysisShares', 'analysisPe', 'analysisManualFormula', 'analysisManualTarget',
    'analysisBeforeDate', 'analysisBeforePrice', 'analysisAfterDate', 'analysisAfterPrice', 'questionOutput',
    'qProfit', 'qOperatingCash', 'qRevenue', 'qCashRetention', 'qUncertainty', 'qExpectations', 'qMethodReasoning',
    'qProfitEvidence', 'qValuationEvidence', 'qAssumptionChange', 'qPriceReaction'
  ];
  var scope = '';
  var accountToken = '';
  var revision = 0;
  var epoch = 0;
  var saveTimer = null;
  var saving = false;
  var dirty = false;
  var applying = false;

  function chinaDate(value) {
    var date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) : '';
  }

  function setValue(id, value) {
    $(id).value = value;
    $(id).dispatchEvent(new Event('input', { bubbles: true }));
  }

  function sourceUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch (_) { return null; }
  }

  function status(message) { var node = $('marketStorageStatus'); if (node) node.textContent = message; }
  function stored(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function noteDate(note) { return Date.parse(note && note.updatedAt) || 0; }
  function capture() {
    var fields = {};
    fieldIds.forEach(function (id) { fields[id] = $(id).value; });
    fields.hotspotPath = $('hotspotForm').querySelector('[name="hotspotPath"]:checked')?.value || '';
    fields.hotspotDirection = $('hotspotForm').querySelector('[name="hotspotDirection"]:checked')?.value || 'unknown';
    return { updatedAt: new Date().toISOString(), fields: fields };
  }
  function apply(note) {
    applying = true;
    var fields = note && note.fields || {};
    fieldIds.forEach(function (id) { $(id).value = typeof fields[id] === 'string' ? fields[id] : (id === 'analysisMethod' ? 'pe' : ''); });
    $('hotspotForm').querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.checked = fields[input.name] === input.value || (!fields[input.name] && input.name === 'hotspotDirection' && input.value === 'unknown');
    });
    $('copyHotspot').disabled = !$('hotspotOutput').value.trim();
    $('copyQuestion').disabled = !$('questionOutput').value.trim();
    $('hotspotNotice').textContent = '';
    $('questionNotice').textContent = '';
    updateMethodFields();
    updateQuestionProgress();
    applying = false;
  }
  function legacyNote(draft) {
    if (!draft || !Array.isArray(draft.form)) return null;
    var fields = {};
    var inMarket = false;
    for (var item of draft.form) {
      if (item.id === 'hotspotTitle') inMarket = true;
      if (!inMarket) continue;
      if (fieldIds.includes(item.id) && typeof item.value === 'string') fields[item.id] = item.value;
      if (item.type === 'radio' && item.checked) {
        if (Object.hasOwn(pathways, item.value)) fields.hotspotPath = item.value;
        else if (Object.hasOwn(directionLabels, item.value)) fields.hotspotDirection = item.value;
      }
      if (item.id === 'hotspotOutput') break;
    }
    return fields.hotspotTitle || fields.hotspotOutput ? { updatedAt: draft.createdAt || '', fields: fields } : null;
  }
  function legacyFromDesk(draft, history) {
    var notes = [legacyNote(draft)];
    if (Array.isArray(history)) for (var item of history) notes.push(legacyNote(item && item.snapshot));
    return notes.filter(Boolean).sort(function (a, b) { return noteDate(b) - noteDate(a); })[0] || null;
  }
  async function api(path, options, token) {
    var response = await fetch(API + path, Object.assign({ cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } }, options || {}));
    var data = await response.json();
    if (!response.ok) { var error = new Error(data.message || '云端暂不可用'); error.status = response.status; throw error; }
    return data;
  }
  function scheduleSave() {
    if (applying || !scope) return;
    var note = capture();
    store('yingMarketDraftV1:' + scope, note);
    dirty = true;
    status('热点记录已保存到此浏览器，正在同步云端…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 900);
  }
  async function flushSave() {
    if (!scope || !dirty || saving) return;
    var current = epoch;
    var key = 'yingMarketDraftV1:' + scope;
    var note = stored(key);
    if (!note) return;
    dirty = false; saving = true;
    try {
      var result = await api('/api/market/notes', { method: 'PUT', body: JSON.stringify({ revision: revision, note: note }) }, accountToken);
      if (current !== epoch) return;
      revision = result.revision;
      status('热点记录已按账号同步');
    } catch (error) {
      if (current !== epoch) return;
      if (error.status === 409) {
        try {
          var remote = await api('/api/market/notes', null, accountToken);
          if (current !== epoch) return;
          revision = remote.revision;
          if (noteDate(remote.note) > noteDate(stored(key))) {
            apply(remote.note); store(key, remote.note);
            status('已加载另一设备更新的热点记录');
          } else dirty = true;
        } catch (_) { dirty = true; status('同步暂时失败，记录已保存在此浏览器'); }
      } else { dirty = true; status(error.status === 413 ? '记录过长，请缩短内容后重试' : '云端同步暂时失败，记录已保存在此浏览器'); }
    } finally {
      if (current === epoch) {
        saving = false;
        if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 3000); }
      }
    }
  }
  function clearAccount() {
    epoch += 1;
    clearTimeout(saveTimer);
    scope = ''; accountToken = ''; revision = 0; dirty = false; saving = false;
    if ($('hotspotForm')) apply(null);
    if ($('hotspotNewsList')) $('hotspotNewsList').replaceChildren();
    status('请先登录并兑换有效卡密。');
  }
  async function setAccount(id, token) {
    clearAccount();
    scope = 'account-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    accountToken = token;
    var current = epoch;
    var local = stored('yingMarketDraftV1:' + scope);
    var oldLocal = legacyFromDesk(stored('tradeDecisionCardDraftV3:' + scope), stored('tradeDecisionCardSnapshotsV2:' + scope));
    var results = await Promise.allSettled([api('/api/market/notes', null, token), api('/api/desk/state', null, token)]);
    if (current !== epoch) return;
    var remote = results[0].status === 'fulfilled' ? results[0].value : null;
    revision = remote ? remote.revision : 0;
    var oldDesk = results[1].status === 'fulfilled' ? results[1].value.state : null;
    var oldRemote = oldDesk ? legacyFromDesk(oldDesk.draft, oldDesk.history) : null;
    var currentNotes = [local, remote && remote.note].filter(Boolean);
    var best = (currentNotes.length ? currentNotes : [oldLocal, oldRemote].filter(Boolean)).sort(function (a, b) { return noteDate(b) - noteDate(a); })[0];
    if (best) {
      apply(best);
      store('yingMarketDraftV1:' + scope, best);
      if (!remote || !remote.note || noteDate(best) > noteDate(remote.note)) { dirty = true; saveTimer = setTimeout(flushSave, 100); }
    }
    status(results[0].status === 'fulfilled' ? (best ? '热点记录已按账号同步' : '可以开始记录热点，输入会自动保存') : '云端暂不可用，当前记录保存在此浏览器');
  }

  function invalidateOutput() {
    if (!$('hotspotOutput').value) return;
    $('hotspotOutput').value = '';
    $('copyHotspot').disabled = true;
    $('hotspotNotice').textContent = '输入已变更，请重新生成解读。';
    $('hotspotOutput').dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderNews(items) {
    var list = $('hotspotNewsList');
    list.replaceChildren();
    if (!items.length) {
      var empty = document.createElement('div'); empty.className = 'market-empty'; empty.textContent = '当前没有可展示的官方动态，可在下方手动填写热点。'; list.append(empty); return;
    }
    for (var item of items) {
      var url = sourceUrl(item.url);
      if (!url || !['www.stats.gov.cn', 'www.pbc.gov.cn'].includes(url.hostname) || typeof item.title !== 'string') continue;
      var card = document.createElement('article'); card.className = 'market-news';
      var title = document.createElement('h3'); title.textContent = item.title;
      var meta = document.createElement('span'); meta.className = 'market-news-meta'; meta.textContent = String(item.source || '国家统计局') + ' · ' + chinaDate(item.publishedAt);
      var link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看原文';
      var button = document.createElement('button'); button.type = 'button'; button.textContent = '选用此热点';
      button.addEventListener('click', function (selected) { return function () {
        setValue('hotspotTitle', selected.title);
        setValue('hotspotPublished', chinaDate(selected.publishedAt));
        setValue('hotspotSourceName', selected.source || '国家统计局');
        setValue('hotspotSourceUrl', selected.url);
        $('hotspotFacts').focus();
        $('hotspotNotice').textContent = '请打开原文核实事实，再填写影响路径和反向证据。';
      }; }(item));
      card.append(title, meta, link, button); list.append(card);
    }
  }

  async function refreshHotspots() {
    var token = window.RongheAuth && window.RongheAuth.getToken();
    if (!token) { $('hotspotNewsStatus').textContent = '登录并兑换有效卡密后可加载官方动态。'; return; }
    var current = ++refreshId;
    var button = $('refreshHotspots'); button.disabled = true;
    $('hotspotNewsStatus').textContent = '正在获取官方动态…';
    try {
      var response = await fetch(API + '/api/market/hotspots', { cache: 'no-store', headers: { authorization: 'Bearer ' + token } });
      var data = await response.json();
      if (current !== refreshId) return;
      if (!response.ok) throw new Error(data.message || '动态加载失败');
      renderNews(Array.isArray(data.items) ? data.items : []);
      $('hotspotNewsStatus').textContent = (data.partial ? '部分来源暂不可用；' : '') + '按发布时间展示最近的官方动态，获取于 ' + new Date(data.fetchedAt).toLocaleString('zh-CN') + '。';
    } catch (error) {
      if (current !== refreshId) return;
      $('hotspotNewsStatus').textContent = error.message + '。仍可在下方手动填写热点。';
      renderNews([]);
    } finally { if (current === refreshId) button.disabled = false; }
  }

  function interpret(event) {
    event.preventDefault();
    var form = $('hotspotForm');
    if (!form.reportValidity()) return;
    var title = $('hotspotTitle').value.trim();
    var facts = $('hotspotFacts').value.trim();
    var watch = $('hotspotWatch').value.trim();
    var counter = $('hotspotCounter').value.trim();
    var url = sourceUrl($('hotspotSourceUrl').value.trim());
    var path = form.querySelector('[name="hotspotPath"]:checked');
    var direction = form.querySelector('[name="hotspotDirection"]:checked');
    var notice = $('hotspotNotice');
    if (!url || !path || !direction || facts.length < 10 || watch.length < 5 || counter.length < 5) {
      notice.textContent = '请填写可核实的来源、至少 10 字事实，以及观察指标和反向证据。'; return;
    }
    var date = $('hotspotPublished').value;
    var sourceAge = Math.floor((Date.now() - new Date(date + 'T00:00:00+08:00').getTime()) / 86400000);
    if (!Number.isFinite(sourceAge) || sourceAge < -1) { notice.textContent = '发布日期不能晚于今天。'; return; }
    var pathway = pathways[path.value];
    var lines = [
      '市场热点解读｜' + title,
      '发布日期：' + date + '｜来源：' + $('hotspotSourceName').value.trim(),
      '原文：' + url.href,
      '',
      '已核实事实：' + facts,
      '可能的影响路径：' + pathway.label + '。' + pathway.mechanism,
      '方向判断：' + directionLabels[direction.value] + '。此项为填写者的假设，尚需后续数据验证。',
      '后续观察：' + watch,
      '反向证据与不确定性：' + counter,
      '如需用于单票决策，应回到交易决策研究室，核对宏观、估值、仓位、风险和行为模块。',
      sourceAge > 7 ? '时效提醒：来源已超过 7 天，请确认是否仍具有市场影响。' : '',
      '本解读是研究记录，不构成独立的买卖信号。'
    ];
    setValue('hotspotOutput', lines.filter(Boolean).join('\n'));
    $('copyHotspot').disabled = false;
    notice.textContent = '解读已生成，正在保存热点记录。';
  }

  function answer(id) { return $(id).value.trim(); }
  function optionalNumber(id) {
    var raw = $(id).value.trim();
    if (!raw) return null;
    var value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  function numberText(value) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2 }).format(value); }
  function response(id) { return answer(id) || '待核实：尚未写下判断与证据。'; }
  function updateMethodFields() {
    var manual = $('analysisMethod').value === 'manual';
    $('peMethodFields').hidden = manual;
    $('manualMethodFields').hidden = !manual;
    $('peMethodFields').querySelectorAll('input').forEach(function (input) { input.disabled = manual; });
    $('manualMethodFields').querySelectorAll('input,textarea').forEach(function (input) { input.disabled = !manual; });
  }
  function answeredQuestions() {
    return [
      Boolean(answer('qProfit')), Boolean(answer('qOperatingCash')), Boolean(answer('qRevenue')),
      Boolean(answer('qCashRetention')), Boolean(answer('qUncertainty')), Boolean(answer('qExpectations')),
      Boolean(answer('qMethodReasoning')), Boolean(answer('qProfitEvidence') && answer('qValuationEvidence')),
      Boolean(answer('qAssumptionChange') && answer('qPriceReaction'))
    ].filter(Boolean).length;
  }
  function updateQuestionProgress() { $('questionProgress').textContent = '已回答 ' + answeredQuestions() + ' / 9 问'; }
  function invalidateQuestionOutput(event) {
    updateQuestionProgress();
    if (event && event.target.id === 'questionOutput') return;
    if (!$('questionOutput').value) return;
    $('questionOutput').value = '';
    $('copyQuestion').disabled = true;
    $('questionNotice').textContent = '输入已变更，请重新生成九问记录。';
    $('questionOutput').dispatchEvent(new Event('input', { bubbles: true }));
  }

  function generateQuestions(event) {
    event.preventDefault();
    var form = $('questionForm');
    if (!form.reportValidity()) return;
    var notice = $('questionNotice');
    var company = answer('analysisCompany');
    var asOf = answer('analysisAsOf');
    var year = Number(answer('analysisYear'));
    var currentYear = Number(asOf.slice(0, 4));
    if (!company || !Number.isInteger(year) || year < currentYear) { notice.textContent = '预测年份不能早于资料截止年份。'; return; }
    var today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
    if (asOf > today || ['analysisPriceDate', 'analysisBeforeDate', 'analysisAfterDate'].some(function (id) { return answer(id) > today; })) {
      notice.textContent = '资料日期和股价观察日期不能晚于今天。'; return;
    }
    if (!answeredQuestions()) { notice.textContent = '请至少填写一项判断与依据后再生成。'; return; }
    var ocf = optionalNumber('analysisOcf');
    var capex = optionalNumber('analysisCapex');
    var cashLine = '简化自由现金流：未计算；需同时填写同一预测期的经营现金流和资本开支。';
    if (ocf !== null && capex !== null && capex >= 0 && Number.isFinite(ocf - capex))
      cashLine = '简化自由现金流：' + numberText(ocf) + ' − ' + numberText(capex) + ' = ' + numberText(ocf - capex) + ' 亿元（经营现金流减资本开支；不等于可全部分配现金）。';

    var currentPrice = optionalNumber('analysisCurrentPrice');
    var priceLine = currentPrice !== null && currentPrice > 0 ? '观察股价：' + numberText(currentPrice) + ' 元/股' + (answer('analysisPriceDate') ? '（' + answer('analysisPriceDate') + '）' : '（日期未填）') + '。' : '观察股价：未填写。';
    var methodLine = '';
    var expectationLine = '';
    if ($('analysisMethod').value === 'pe') {
      var profit = optionalNumber('analysisProfit');
      var shares = optionalNumber('analysisShares');
      var pe = optionalNumber('analysisPe');
      if (profit !== null && profit <= 0) methodLine = '市盈率法不适用：预测归母净利润不是正数。';
      else if (profit !== null && shares !== null && shares > 0 && pe !== null && pe > 0 && Number.isFinite(profit / shares * pe)) {
        var eps = profit / shares;
        var target = eps * pe;
        methodLine = year + ' 年预测归母净利润 ' + numberText(profit) + ' 亿元 ÷ 预测稀释后总股本 ' + numberText(shares) + ' 亿股 = 预测每股收益 ' + numberText(eps) + ' 元；乘目标市盈率 ' + numberText(pe) + ' 倍 = 情景估值 ' + numberText(target) + ' 元/股。该值未折现到当前时点，还需考虑实现时间和股本变化。';
        if (currentPrice !== null && currentPrice > 0 && Number.isFinite(currentPrice / eps) && Number.isFinite((target / currentPrice - 1) * 100)) {
          expectationLine = '按同一 ' + year + ' 年盈利预测口径，当前价格对应约 ' + numberText(currentPrice / eps) + ' 倍远期市盈率；与情景估值相差 ' + numberText((target / currentPrice - 1) * 100) + '%。这不能单独说明市场真实预期或未来回报。';
        }
      } else methodLine = '市盈率情景估值未计算；需填写正的预测利润、稀释后股数和目标市盈率。';
    } else {
      var formula = answer('analysisManualFormula');
      var manualTarget = optionalNumber('analysisManualTarget');
      methodLine = formula ? '其他方法与关键输入：' + formula + (manualTarget !== null && manualTarget > 0 ? '；自行推导结果：' + numberText(manualTarget) + ' 元/股（页面未验证该公式）。' : '；每股结果待核实。') : '其他方法尚未写出公式与关键输入，不能形成目标价。';
      if (formula && manualTarget !== null && manualTarget > 0 && currentPrice !== null && currentPrice > 0 && Number.isFinite((manualTarget / currentPrice - 1) * 100))
        expectationLine = '自行推导结果与观察股价相差 ' + numberText((manualTarget / currentPrice - 1) * 100) + '%；此差额不是预期收益率。';
    }

    var before = optionalNumber('analysisBeforePrice');
    var after = optionalNumber('analysisAfterPrice');
    var beforeDate = answer('analysisBeforeDate');
    var afterDate = answer('analysisAfterDate');
    var reactionLine = '消息前后股价变化：未计算；需填写两个日期及对应股价。';
    if (beforeDate && afterDate && afterDate < beforeDate) reactionLine = '消息前后股价变化：日期顺序有误，请核对。';
    else if (beforeDate && afterDate && before !== null && before > 0 && after !== null && after > 0)
      reactionLine = '消息前 ' + beforeDate + '：' + numberText(before) + ' 元/股；消息后 ' + afterDate + '：' + numberText(after) + ' 元/股；观察涨跌幅 ' + numberText((after / before - 1) * 100) + '%。价格变化不能单独归因于该消息。';

    var related = answer('hotspotTitle');
    var lines = [
      '企业研究九问｜' + company,
      '资料截至：' + asOf + '｜预测年份：' + year,
      '主要资料：' + (answer('analysisSource') || '未填写，应补充可核对的来源与时间'),
      related ? '关联热点：' + related + '（需自行核对原文与适用公司）' : '',
      '',
      '1. 未来利润是否增长：' + response('qProfit'),
      '2. 对未来经营现金流的影响：' + response('qOperatingCash'),
      '3. 收入能否延续、是否可以线性外推：' + response('qRevenue'),
      '4. 未来能留下多少现金流：' + response('qCashRetention'),
      cashLine,
      '5. 需要承担的不确定性：' + response('qUncertainty'),
      '6. 当前价格包含的期待：' + response('qExpectations'),
      priceLine,
      expectationLine,
      '7. ' + year + ' 年估值与目标价推导：' + methodLine,
      '估值假设的理由：' + response('qMethodReasoning'),
      '8. 盈利预测的关键证据：' + response('qProfitEvidence'),
      '8. 估值依据的关键证据：' + response('qValuationEvidence'),
      '9. 新消息改变的假设：' + response('qAssumptionChange'),
      '9. 消息前后市场反应及其他可能原因：' + response('qPriceReaction'),
      reactionLine,
      '',
      '完成度：' + answeredQuestions() + ' / 9 问。未回答项应继续核实，不应视为结论。',
      '盈利、倍数、现金流和情景估值均依赖填写者的假设；本记录不构成买卖建议。'
    ];
    setValue('questionOutput', lines.filter(Boolean).join('\n'));
    $('copyQuestion').disabled = false;
    notice.textContent = '九问记录已生成，正在按账号保存。';
  }

  function mount() {
    if (!$('hotspotForm')) return;
    $('refreshHotspots').addEventListener('click', refreshHotspots);
    $('hotspotForm').addEventListener('submit', interpret);
    $('hotspotForm').addEventListener('input', function (event) { if (event.target.id !== 'hotspotOutput') invalidateOutput(); });
    $('hotspotForm').addEventListener('input', function (event) { if (event.target.id === 'hotspotTitle' || event.target.id === 'hotspotSourceUrl') invalidateQuestionOutput(); });
    $('hotspotForm').addEventListener('change', invalidateOutput);
    $('hotspotForm').addEventListener('input', scheduleSave);
    $('hotspotForm').addEventListener('change', scheduleSave);
    $('copyHotspot').addEventListener('click', async function () {
      try { await navigator.clipboard.writeText($('hotspotOutput').value); $('hotspotNotice').textContent = '解读已复制。'; }
      catch (_) { $('hotspotOutput').select(); $('hotspotNotice').textContent = '请复制已选中的解读文本。'; }
    });
    $('analysisMethod').addEventListener('change', updateMethodFields);
    $('questionForm').addEventListener('input', invalidateQuestionOutput);
    $('questionForm').addEventListener('change', invalidateQuestionOutput);
    $('questionForm').addEventListener('input', scheduleSave);
    $('questionForm').addEventListener('change', scheduleSave);
    $('questionForm').addEventListener('submit', generateQuestions);
    $('copyQuestion').addEventListener('click', async function () {
      try { await navigator.clipboard.writeText($('questionOutput').value); $('questionNotice').textContent = '九问记录已复制。'; }
      catch (_) { $('questionOutput').select(); $('questionNotice').textContent = '请复制已选中的记录文本。'; }
    });
    updateMethodFields();
    updateQuestionProgress();
    window.addEventListener('ying:unlocked', function () {
      $('copyHotspot').disabled = !$('hotspotOutput').value.trim();
      refreshHotspots();
    });
    if (window.RongheAuth && window.RongheAuth.isActive()) refreshHotspots();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  window.YingMarket = { setAccount: setAccount, clearAccount: clearAccount };
}());
