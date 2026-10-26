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
  var fieldIds = ['hotspotTitle', 'hotspotPublished', 'hotspotSourceName', 'hotspotSourceUrl', 'hotspotFacts', 'hotspotWatch', 'hotspotCounter', 'hotspotOutput'];
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
    fieldIds.forEach(function (id) { $(id).value = typeof fields[id] === 'string' ? fields[id] : ''; });
    $('hotspotForm').querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.checked = fields[input.name] === input.value || (!fields[input.name] && input.name === 'hotspotDirection' && input.value === 'unknown');
    });
    $('copyHotspot').disabled = !$('hotspotOutput').value.trim();
    $('hotspotNotice').textContent = '';
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
    var oldLocal = legacyNote(stored('tradeDecisionCardDraftV3:' + scope));
    var results = await Promise.allSettled([api('/api/market/notes', null, token), api('/api/desk/state', null, token)]);
    if (current !== epoch) return;
    var remote = results[0].status === 'fulfilled' ? results[0].value : null;
    revision = remote ? remote.revision : 0;
    var oldRemote = results[1].status === 'fulfilled' ? legacyNote(results[1].value.state && results[1].value.state.draft) : null;
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

  function mount() {
    if (!$('hotspotForm')) return;
    $('refreshHotspots').addEventListener('click', refreshHotspots);
    $('hotspotForm').addEventListener('submit', interpret);
    $('hotspotForm').addEventListener('input', function (event) { if (event.target.id !== 'hotspotOutput') invalidateOutput(); });
    $('hotspotForm').addEventListener('change', invalidateOutput);
    $('hotspotForm').addEventListener('input', scheduleSave);
    $('hotspotForm').addEventListener('change', scheduleSave);
    $('copyHotspot').addEventListener('click', async function () {
      try { await navigator.clipboard.writeText($('hotspotOutput').value); $('hotspotNotice').textContent = '解读已复制。'; }
      catch (_) { $('hotspotOutput').select(); $('hotspotNotice').textContent = '请复制已选中的解读文本。'; }
    });
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
