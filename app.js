(function () {
  'use strict';

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return document.querySelectorAll(selector); };
  var state = { x: 0, y: 0, quadrant: '宏观坐标原点', macroValid: true, macroContributions: { pmi: 0, social: 0, m2: 0, yield: 0 }, posture: '均衡姿态', confidence: '低置信', rationaleScore: 0, rationaleSupport: [], rationaleCounter: [], allocationType: 'balance', allocationValues: [45, 25, 10, 20], triggerLabels: [], valuationType: 'stable', valuationCalculated: false, valuationZone: '等待计算', valuationRange: '', scenarioValues: [], phaseDecision: '暂不建议买入', phaseReady: false, behaviorLevel: '未完成', behaviorReady: false, behaviorBlocked: false, viewMode: 'full', lastDataChangeAt: '', lastCalculatedAt: '', summaryGenerated: false, activeRole: 1, undoSnapshot: null, history: [], carryover: 0 };
  var APP_VERSION = '2.5.0-free';
  var RULE_VERSION = 'R2.4';
  var FORMULA_VERSION = 'F1.3';
  state.safetyMargin = null;
  state.postureReady = false;
  state.pauseUntil = 0;
  var restoring = false;
  var statusTimer = null;
  var storageKey = 'tradeDecisionCardSnapshotsV2';
  var draftKey = 'tradeDecisionCardDraftV3';
  var autoSaveTimer = null;
  var navigationLockUntil = 0;
  var navigationTarget = 0;
  var scrollFrame = null;

  function exists(selector) { return Boolean($(selector)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function numberValue(selector, fallback) {
    var element = $(selector);
    var value = element && String(element.value).trim() !== '' ? Number(element.value) : fallback;
    return isFinite(value) ? value : fallback;
  }

  function validNumericInput(selector) {
    var element = $(selector);
    if (!element || String(element.value).trim() === '') return false;
    var value = Number(element.value);
    if (!isFinite(value)) return false;
    if (element.min !== '' && value < Number(element.min)) return false;
    if (element.max !== '' && value > Number(element.max)) return false;
    return true;
  }

  function pad(value) { return value < 10 ? '0' + value : String(value); }
  function isoDate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function displayDateTime(value) {
    var date = value ? new Date(value) : null;
    if (!date || !isFinite(date.getTime())) return '尚未记录';
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }
  function parseIso(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return null;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isFinite(date.getTime()) && isoDate(date) === value ? date : null;
  }
  function today() { var value = new Date(); value.setHours(0, 0, 0, 0); return value; }

  function latestDataDate() {
    var selectors = ['#dataDate', '#pmiDate', '#creditDate', '#yieldDate'];
    var latest = ''; var i;
    for (i = 0; i < selectors.length; i += 1) if (exists(selectors[i]) && $(selectors[i]).value > latest) latest = $(selectors[i]).value;
    return latest;
  }

  function updateVersionPanel() {
    if (exists('#versionApp')) $('#versionApp').textContent = APP_VERSION;
    if (exists('#versionRules')) $('#versionRules').textContent = RULE_VERSION;
    if (exists('#versionFormula')) $('#versionFormula').textContent = FORMULA_VERSION;
    if (exists('#versionData')) $('#versionData').textContent = latestDataDate() ? 'DATA-' + latestDataDate().replace(/-/g, '') : '等待数据日期';
    if (exists('#lastDataChangeAt')) $('#lastDataChangeAt').textContent = state.lastDataChangeAt ? displayDateTime(state.lastDataChangeAt) : '尚未变更';
    if (exists('#lastCalculationAt')) $('#lastCalculationAt').textContent = state.lastCalculatedAt ? displayDateTime(state.lastCalculatedAt) : '尚未计算';
  }

  function markDataChanged() {
    state.lastDataChangeAt = new Date().toISOString();
    updateVersionPanel();
  }

  function markCalculated() {
    state.lastCalculatedAt = new Date().toISOString();
    updateVersionPanel();
  }

  function updateDataFreshness() {
    var element = $('#dataFreshness');
    var input = $('#dataDate');
    if (!element || !input) return;
    var issue = macroDataIssue();
    if (issue) { element.className = 'freshness bad'; element.textContent = issue; return; }
    if (!state.macroValid) { element.className = 'freshness bad'; element.textContent = '请补全宏观指标'; return; }
    var date = parseIso(input.value);
    if (!date) { element.className = 'freshness bad'; element.textContent = '请填写数据日期'; return; }
    var days = Math.floor((today().getTime() - date.getTime()) / 86400000);
    if (days < 0) { element.className = 'freshness bad'; element.textContent = '日期不能晚于今天'; }
    else if (days <= 7) { element.className = 'freshness good'; element.textContent = '数据新鲜 · ' + days + ' 天前'; }
    else if (days <= 31) { element.className = 'freshness'; element.textContent = '建议复核 · ' + days + ' 天前'; }
    else { element.className = 'freshness bad'; element.textContent = '数据已过期 · ' + days + ' 天前'; }
  }

  function macroDataIssue() {
    var dates = [['#dataDate', '数据截至日期', 45], ['#pmiDate', 'PMI 发布日期', 45], ['#creditDate', '社融 / M2 发布日期', 45], ['#yieldDate', '国债数据日期', 7]];
    for (var i = 0; i < dates.length; i += 1) {
      var input = $(dates[i][0]);
      if (!input || !parseIso(input.value)) return '请填写真实的' + dates[i][1];
      var age = daysSinceInput(dates[i][0]);
      if (age < 0) return dates[i][1] + '不能晚于今天';
      if (age > dates[i][2]) return dates[i][1] + '已超过复核期限，请更新数据';
    }
    if (!exists('#dataSource') || !$('#dataSource').value.trim()) return '请填写可核对的数据来源';
    return '';
  }

  function updateContribution(id, value, description) {
    var card = $('#' + id); var textElement = $('#' + id + 'Text');
    if (!card || !textElement) return;
    var normalized = clamp(Math.abs(value), 0, 100);
    var bar = card.querySelector('i');
    card.classList.toggle('negative', value < 0);
    if (bar) bar.style.width = Math.max(4, normalized) + '%';
    textElement.textContent = (value >= 0 ? '+' : '') + value.toFixed(0) + ' 分 · ' + description;
  }

  function showStatus(message) {
    var element = $('#interactionStatus');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () { element.classList.remove('show'); }, 1600);
  }

  function macroValues() {
    return {
      pmi: numberValue('#pmiInput', 50), pmiPrev: numberValue('#pmiPrev', 50),
      social: numberValue('#socialInput', 7.2), socialPrev: numberValue('#socialPrev', 7.2),
      m2: numberValue('#m2Input', 7.5), m2Prev: numberValue('#m2Prev', 7.5),
      bondYield: numberValue('#yieldInput', 1.8), yieldPrev: numberValue('#yieldPrev', 1.8)
    };
  }

  function updateQuadrant() {
    state.summaryGenerated = false;
    updateDataFreshness();
    var macroInputs = ['#pmiInput', '#pmiPrev', '#socialInput', '#socialPrev', '#m2Input', '#m2Prev', '#yieldInput', '#yieldPrev'];
    var invalidInputs = []; var inputIndex;
    for (inputIndex = 0; inputIndex < macroInputs.length; inputIndex += 1) {
      if (!validNumericInput(macroInputs[inputIndex])) invalidInputs.push(macroInputs[inputIndex]);
    }
    var dataIssue = macroDataIssue();
    if (invalidInputs.length || dataIssue) {
      state.x = 0; state.y = 0; state.quadrant = '等待完整宏观数据'; state.macroValid = false;
      state.macroContributions = { pmi: 0, social: 0, m2: 0, yield: 0 };
      if (exists('#quadrantName')) $('#quadrantName').textContent = state.quadrant;
      if (exists('#quadrantReason')) $('#quadrantReason').textContent = dataIssue || '请补全本期与上期指标，并确保数值处于输入范围内。';
      if (exists('#xScore')) $('#xScore').textContent = '—';
      if (exists('#yScore')) $('#yScore').textContent = '—';
      if (exists('#quadrantDot')) { $('#quadrantDot').setAttribute('cx', '180'); $('#quadrantDot').setAttribute('cy', '134'); }
      updateDataFreshness();
      updateContribution('contribPmi', 0, '等待完整数据');
      updateContribution('contribSocial', 0, '等待完整数据');
      updateContribution('contribM2', 0, '等待完整数据');
      updateContribution('contribYield', 0, '等待完整数据');
      markCalculated();
      runScenario();
      if (exists('#autoLink') && $('#autoLink').checked) syncMacroTriggers(0, 0);
      else updatePosture();
      return;
    }
    state.macroValid = true;
    updateDataFreshness();
    var m = macroValues();
    var pmiContribution = clamp((m.pmi - 50) * 22, -82, 82);
    var socialContribution = clamp(-(m.social - m.socialPrev) * 28, -50, 50);
    var m2Contribution = clamp(-(m.m2 - m.m2Prev) * 28, -50, 50);
    var yieldContribution = clamp((m.bondYield - m.yieldPrev) * 90, -50, 50);
    var y = pmiContribution;
    var x = clamp(socialContribution + m2Contribution + yieldContribution, -82, 82);
    var name = quadrantFor(x, y);
    var reason = 'PMI ' + (m.pmi > 50 ? '处于扩张区间' : m.pmi < 50 ? '处于收缩区间' : '位于荣枯线') + '，较上期' + (m.pmi > m.pmiPrev ? '改善' : m.pmi < m.pmiPrev ? '回落' : '持平') + '；流动性评分仅作规则参考，不代表通胀判断。';
    state.x = x; state.y = y; state.quadrant = name;
    state.macroContributions = { pmi: pmiContribution, social: socialContribution, m2: m2Contribution, yield: yieldContribution };
    if (exists('#quadrantName')) $('#quadrantName').textContent = name;
    if (exists('#quadrantReason')) $('#quadrantReason').textContent = reason;
    if (exists('#xScore')) $('#xScore').textContent = x.toFixed(0);
    if (exists('#yScore')) $('#yScore').textContent = y.toFixed(0);
    if (exists('#quadrantDot')) {
      $('#quadrantDot').setAttribute('cx', String(180 + x * 1.45));
      $('#quadrantDot').setAttribute('cy', String(134 - y * 1.1));
    }
    updateContribution('contribPmi', pmiContribution, pmiContribution >= 0 ? '增长偏扩张' : '增长偏收缩');
    updateContribution('contribSocial', -socialContribution, socialContribution <= 0 ? '边际偏宽松' : '边际偏收紧');
    updateContribution('contribM2', -m2Contribution, m2Contribution <= 0 ? '边际偏宽松' : '边际偏收紧');
    updateContribution('contribYield', -yieldContribution, yieldContribution <= 0 ? '利率偏宽松' : '利率偏收紧');
    markCalculated();
    runScenario();
    if (exists('#autoLink') && $('#autoLink').checked) syncMacroTriggers(x, y);
    else updatePosture();
  }

  function resetQuadrant() {
    var neutral = { pmiInput: '50.0', pmiPrev: '50.0', socialInput: '7.2', socialPrev: '7.2', m2Input: '7.5', m2Prev: '7.5', yieldInput: '1.80', yieldPrev: '1.80' };
    var id;
    for (id in neutral) {
      if (Object.prototype.hasOwnProperty.call(neutral, id) && document.getElementById(id)) document.getElementById(id).value = neutral[id];
    }
    updateQuadrant();
    showStatus('已重置：象限红点回到 0 点');
  }

  function syncMacroTriggers(x, y) {
    var triggers = $$('[data-trigger]');
    if (triggers.length < 7) return;
    triggers[0].checked = y > 5;
    triggers[3].checked = y < -5;
    triggers[1].checked = x < -5;
    triggers[4].checked = x > 5;
    triggers[6].checked = Math.abs(x) <= 5 || Math.abs(y) <= 5;
    updatePosture();
  }

  function renderEvidenceList(selector, items, emptyText) {
    var root = $(selector); var i;
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (!items.length) items = [emptyText];
    for (i = 0; i < items.length; i += 1) { var item = document.createElement('li'); item.textContent = items[i]; root.appendChild(item); }
  }

  function updateDecisionRationale(label, confidence, attackLabels, defendLabels, balanceLabels) {
    var support = []; var counter = []; var score = 50; var stale = false;
    if (label === '进攻姿态') { support = attackLabels.slice(0); counter = defendLabels.slice(0); score = 45 + attackLabels.length * 16 - defendLabels.length * 13 - balanceLabels.length * 9; }
    else if (label === '防御姿态') { support = defendLabels.slice(0); counter = attackLabels.slice(0); score = 45 + defendLabels.length * 16 - attackLabels.length * 13 - balanceLabels.length * 9; }
    else {
      support = balanceLabels.slice(0);
      if (attackLabels.length && defendLabels.length) support.push('进攻与防御信号同时存在，方向尚未形成一致');
      counter = attackLabels.concat(defendLabels);
      score = 46 + balanceLabels.length * 18 + (attackLabels.length === defendLabels.length && attackLabels.length ? 14 : 0) - Math.abs(attackLabels.length - defendLabels.length) * 8;
    }
    if (state.macroValid) {
      var macroContext = '宏观象限：' + state.quadrant + '（X ' + state.x.toFixed(0) + ' / Y ' + state.y.toFixed(0) + '）';
      if (label === '进攻姿态') {
        if (state.y > 5 && state.x < -5) support.push(macroContext + '，增长与宽松同向支持进攻');
        else { counter.push(macroContext + '，尚未形成增长与宽松的双重共振'); score -= 14; }
      } else if (label === '防御姿态') {
        if (state.y < -5 && state.x > 5) support.push(macroContext + '，增长与流动性同时偏紧');
        else { counter.push(macroContext + '，尚未形成收缩与收紧的双重防御信号'); score -= 14; }
      } else {
        if ((state.y > 5 && state.x < -5) || (state.y < -5 && state.x > 5)) { counter.push(macroContext + '，宏观已经形成较明确的方向共振'); score -= 14; }
        else support.push(macroContext + '，方向未形成双重共振，支持均衡观察');
      }
    } else counter.push('宏观数据不完整，当前结论不能作为执行依据');
    stale = daysSinceInput('#pmiDate') > 45 || daysSinceInput('#creditDate') > 45 || daysSinceInput('#yieldDate') > 7;
    if (stale || !state.macroValid) { counter.push('宏观数据缺失、日期异常或超过复核期限'); score -= 18; }
    if (!counter.length) counter.push('暂未发现与当前姿态直接相反的已选条件');
    score = Math.round(clamp(score, 10, 95));
    state.rationaleScore = score; state.rationaleSupport = support.slice(0); state.rationaleCounter = counter.slice(0);
    state.confidence = !state.macroValid ? '低置信' : score >= 75 ? '高置信' : score >= 55 ? '中置信' : '低置信';
    confidence = state.confidence;
    if (exists('#rationaleScore')) $('#rationaleScore').textContent = '判断强度 ' + score + ' / 100';
    if (exists('#rationaleBar')) $('#rationaleBar').style.width = score + '%';
    renderEvidenceList('#supportEvidence', support, '尚无支持证据');
    renderEvidenceList('#counterEvidence', counter, '尚无反向证据');
    var reason = confidence + '：强度由支持信号数量、相反信号、混合信号及数据新鲜度共同计算。';
    if (stale) reason += ' 当前已因数据时效性扣分。';
    if (exists('#confidenceReason')) $('#confidenceReason').textContent = reason;
  }

  function updatePosture() {
    state.summaryGenerated = false;
    var triggers = $$('[data-trigger]');
    var attack = 0; var defend = 0; var balance = 0; var selected = 0; var selectedLabels = [];
    var i; var attackLabels = []; var defendLabels = []; var balanceLabels = [];
    for (i = 0; i < triggers.length; i += 1) {
      if (!triggers[i].checked) continue;
      selected += 1;
      var triggerText = triggers[i].parentNode.textContent.trim();
      selectedLabels.push(triggerText);
      if (triggers[i].getAttribute('data-trigger') === 'attack') { attack += 1; attackLabels.push(triggerText); }
      if (triggers[i].getAttribute('data-trigger') === 'defend') { defend += 1; defendLabels.push(triggerText); }
      if (triggers[i].getAttribute('data-trigger') === 'balance') { balance += 1; balanceLabels.push(triggerText); }
    }
    var type = 'Balance'; var label = '均衡姿态'; var allocationType = 'balance';
    var winningCount = Math.max(attack, defend);
    if (!balance && attack >= 2 && attack > defend) { type = 'Attack'; label = '进攻姿态'; allocationType = 'attack'; }
    if (!balance && defend >= 2 && defend > attack) { type = 'Defend'; label = '防御姿态'; allocationType = 'defend'; }
    var confidence = '低置信';
    if (type !== 'Balance' && winningCount >= 3) confidence = '高置信';
    else if (type !== 'Balance' && winningCount >= 2) confidence = '中置信';
    else if (type === 'Balance' && selected >= 3 && attack === defend) confidence = '高置信';
    else if (type === 'Balance' && selected >= 2) confidence = '中置信';
    var cards = $$('.posture-card');
    for (i = 0; i < cards.length; i += 1) cards[i].classList.remove('selected');
    if (exists('#posture' + type)) $('#posture' + type).classList.add('selected');
    if (exists('#postureResult')) $('#postureResult').innerHTML = '当前建议：' + label + '<span class="confidence-badge">' + confidence + '</span>';
    if (exists('#postureEvidence')) $('#postureEvidence').textContent = '已选择 ' + selected + ' / 7 项；支持进攻 ' + attack + ' 项，支持防御 ' + defend + ' 项，混合 ' + balance + ' 项。';
    state.posture = label; state.confidence = confidence; state.triggerLabels = selectedLabels;
    if (exists('#autoLink') && $('#autoLink').checked) state.allocationType = allocationType;
    updateDecisionRationale(label, confidence, attackLabels, defendLabels, balanceLabels);
    state.postureReady = selected > 0 && state.macroValid;
    if (exists('#postureResult')) $('#postureResult').textContent = '当前建议：' + label + ' · ' + state.confidence;
    markCalculated();
    if (exists('#autoLink') && $('#autoLink').checked) {
      updatePie(allocationType, true);
      if (state.valuationCalculated) applyValuationAllocation(state.valuationZone);
    } else updateWorkflow();
  }

  function choosePosture(type) {
    var triggers = $$('[data-trigger]');
    var i;
    if (exists('#autoLink')) $('#autoLink').checked = false;
    for (i = 0; i < triggers.length; i += 1) triggers[i].checked = false;
    if (type === 'attack' && triggers.length >= 2) { triggers[0].checked = true; triggers[1].checked = true; }
    else if (type === 'defend' && triggers.length >= 5) { triggers[3].checked = true; triggers[4].checked = true; }
    else if (triggers.length >= 7) triggers[6].checked = true;
    updatePosture();
    updatePie(type, true);
    showStatus('已手动切换为' + state.posture);
    scheduleAutoSave();
  }

  var valuationMap = {
    stable: { tool: 'DDM 股息折现', guide: '适用于分红稳定、现金流可预测的企业。', formula: '合理价值 = 下一年度每股股息 ÷（股权成本 − 永续增长率）', labels: ['当前股价', '下一年度每股股息', '股权成本%', '永续增长率%'], values: [20, 1.2, 9, 3], steps: ['0.01', '0.01', '0.1', '0.1'], mins: [0, 0.01, 0.1, 0], maxs: [100000, 100000, 100, 50] },
    resource: { tool: 'PB–ROE 分位模型', guide: '适用于周期与资源股，用历史 PB 中位数和 ROE 分位修正合理 PB。', formula: '合理PB = 历史PB中位数 ×（0.7 + 0.6 × ROE分位）；PB分位用于二次校验', labels: ['当前PB', '历史PB中位数', 'ROE分位%', '当前PB分位%'], values: [1.4, 1.5, 55, 48], steps: ['0.01', '0.01', '1', '1'], mins: [0, 0.01, 0, 0], maxs: [100, 100, 100, 100] },
    growth: { tool: 'PEG 成长估值', guide: '适用于盈利成长股，用盈利增速和目标 PEG 推导合理 PE 与合理股价。', formula: '合理PE = 预期利润增速 × 目标PEG；合理股价 = 每股收益 × 合理PE', labels: ['当前股价', '每股收益EPS', '预期利润增速%', '目标PEG'], values: [38, 1.5, 22, 1], steps: ['0.01', '0.01', '0.1', '0.1'], mins: [0, 0.01, 0.1, 0.1], maxs: [100000, 10000, 500, 10] },
    preprofit: { tool: 'PS 分位修正', guide: '适用于未盈利成长企业，以行业 PS 中位数和毛利率、收入增速分位修正。', formula: '合理PS = 行业PS中位数 × [0.6 + 0.8 ×（毛利率分位 + 收入增速分位）÷ 200]', labels: ['当前PS', '行业PS中位数', '毛利率分位%', '收入增速分位%'], values: [5.2, 4.5, 65, 72], steps: ['0.01', '0.01', '1', '1'], mins: [0, 0.01, 0, 0], maxs: [100, 100, 100, 100] }
  };

  function updateValuation(event) {
    var value = event.target.value;
    var config = valuationMap[value];
    if (!config) return;
    state.valuationType = value;
    invalidateValuation();
    state.valuationCalculated = false;
    state.valuationZone = '等待计算';
    state.valuationRange = '';
    state.scenarioValues = [];
    state.summaryGenerated = false;
    if (exists('#valuationTool')) $('#valuationTool').textContent = config.tool;
    if (exists('#valuationGuide')) $('#valuationGuide').textContent = config.guide;
    if (exists('#valuationFormula')) $('#valuationFormula').textContent = '公式：' + config.formula;
    var i;
    for (i = 0; i < 4; i += 1) {
      if (exists('#calcLabel' + i)) $('#calcLabel' + i).textContent = config.labels[i];
      if (exists('#calcInput' + i)) { $('#calcInput' + i).value = String(config.values[i]); $('#calcInput' + i).step = config.steps[i]; $('#calcInput' + i).min = String(config.mins[i]); $('#calcInput' + i).max = String(config.maxs[i]); }
    }
    if (exists('#valuationZone')) { $('#valuationZone').className = 'valuation-zone fair'; $('#valuationZone').textContent = '等待计算'; }
    if (exists('#valuationDetail')) $('#valuationDetail').textContent = '请核对输入数据后点击“计算合理估值”。';
    if (exists('#valuationError')) { $('#valuationError').className = 'input-error'; $('#valuationError').textContent = ''; }
    if (exists('#scenarioBear')) $('#scenarioBear').textContent = '—';
    if (exists('#scenarioBase')) $('#scenarioBase').textContent = '—';
    if (exists('#scenarioBull')) $('#scenarioBull').textContent = '—';
    var phaseChecks = $$('[data-phase-check]');
    if (phaseChecks.length > 1) phaseChecks[1].checked = false;
    updatePhaseCount();
    updateWorkflow();
    showStatus('已加载 ' + config.tool + ' 模板');
  }

  function classifyValue(current, lower, upper, percentile) {
    if ((current > upper && percentile < 35) || (current < lower && percentile > 70)) return '信号冲突';
    if (current < lower) return '偏低';
    if (current > upper) return '偏高';
    return '合理';
  }

  function valuationCenter(type, b, c, d) {
    if (type === 'stable') return c > d ? b / ((c - d) / 100) : 0;
    if (type === 'resource') return b * (0.7 + 0.6 * clamp(c, 0, 100) / 100);
    if (type === 'growth') return b * c * d;
    return b * (0.6 + 0.8 * ((clamp(c, 0, 100) + clamp(d, 0, 100)) / 200));
  }

  function calculateValuation() {
    state.summaryGenerated = false;
    invalidateValuation();
    var type = state.valuationType;
    var a = numberValue('#calcInput0', 0);
    var b = numberValue('#calcInput1', 0);
    var c = numberValue('#calcInput2', 0);
    var d = numberValue('#calcInput3', 0);
    var center = 0; var lower = 0; var upper = 0; var unit = '元'; var zone; var detail;
    var config = valuationMap[type];
    var values = [a, b, c, d]; var invalid = [];
    var i;
    for (i = 0; i < values.length; i += 1) {
      if (!exists('#calcInput' + i) || !String($('#calcInput' + i).value).trim() || !isFinite(values[i]) || values[i] < config.mins[i] || values[i] > config.maxs[i] || (i === 0 && values[i] <= 0)) invalid.push(config.labels[i]);
    }
    if (invalid.length) {
      if (exists('#valuationError')) { $('#valuationError').className = 'input-error show'; $('#valuationError').textContent = '请检查输入范围：' + invalid.join('、'); }
      showStatus('估值参数超出有效范围');
      return;
    }
    if (type === 'stable') {
      if (c <= d || b <= 0) { if (exists('#valuationError')) { $('#valuationError').className = 'input-error show'; $('#valuationError').textContent = 'DDM 要求股权成本高于永续增长率，且股息大于 0。'; } showStatus('股权成本必须高于永续增长率'); return; }
      center = valuationCenter(type, b, c, d);
    } else if (type === 'resource') {
      center = valuationCenter(type, b, c, d);
      unit = '倍PB';
    } else if (type === 'growth') {
      center = valuationCenter(type, b, c, d);
    } else {
      center = valuationCenter(type, b, c, d);
      unit = '倍PS';
    }
    if (!isFinite(center) || center <= 0 || a < 0) { showStatus('请输入有效的正数参数'); return; }
    if (exists('#valuationError')) { $('#valuationError').className = 'input-error'; $('#valuationError').textContent = ''; }
    lower = center * 0.85;
    upper = center * 1.15;
    zone = classifyValue(a, lower, upper, type === 'resource' ? d : undefined);
    state.valuationCalculated = true;
    state.valuationZone = zone;
    state.safetyMargin = (center - a) / center;
    state.valuationRange = lower.toFixed(2) + '–' + upper.toFixed(2) + ' ' + unit;
    detail = '参考区间：' + state.valuationRange + '；当前值 ' + a.toFixed(2) + '，判断为“' + zone + '”。相对中心值折价 ' + (state.safetyMargin * 100).toFixed(1) + '%；买入安全边际门槛为 15%。区间上下 15%、PB/PS 修正系数及三情景参数均为可复核的研究假设，未经过回测校准。';
    if (type === 'stable' && c - d < 1) detail += ' 股权成本与增长率相差不足 1 个百分点，模型高度敏感，不能据此通过买入检查。';
    if (exists('#valuationZone')) { $('#valuationZone').className = 'valuation-zone ' + (zone === '偏低' ? 'low' : zone === '偏高' ? 'high' : 'fair'); $('#valuationZone').textContent = zone; }
    if (exists('#valuationDetail')) $('#valuationDetail').textContent = detail;
    var bear; var bull;
    if (type === 'stable') {
      bear = valuationCenter(type, b * 0.9, c + 1, Math.max(0, d - 0.5));
      var spread = c - d;
      bull = b * 1.1 / ((spread * 0.75) / 100);
    } else if (type === 'resource') {
      bear = valuationCenter(type, b * 0.85, Math.max(0, c - 20), d);
      bull = valuationCenter(type, b * 1.15, Math.min(100, c + 20), d);
    } else if (type === 'growth') {
      bear = valuationCenter(type, b * 0.9, c * 0.8, d * 0.9);
      bull = valuationCenter(type, b * 1.1, c * 1.2, d * 1.1);
    } else {
      bear = valuationCenter(type, b * 0.85, Math.max(0, c - 15), Math.max(0, d - 15));
      bull = valuationCenter(type, b * 1.15, Math.min(100, c + 15), Math.min(100, d + 15));
    }
    state.scenarioValues = [bear, center, bull];
    if (exists('#scenarioBear')) $('#scenarioBear').textContent = bear.toFixed(2) + ' ' + unit;
    if (exists('#scenarioBase')) $('#scenarioBase').textContent = center.toFixed(2) + ' ' + unit;
    if (exists('#scenarioBull')) $('#scenarioBull').textContent = bull.toFixed(2) + ' ' + unit;
    var phaseChecks = $$('[data-phase-check]');
    if (phaseChecks.length > 1 && !valuationAllowsBuy()) phaseChecks[1].checked = false;
    if (exists('#autoLink') && $('#autoLink').checked) applyValuationAllocation(zone);
    updatePhaseCount();
    updateWorkflow();
    markCalculated();
    runScenario();
    scheduleAutoSave();
    showStatus('估值计算完成：' + zone);
  }

  function applyValuationAllocation(zone) {
    var baseType = state.posture === '进攻姿态' ? 'attack' : state.posture === '防御姿态' ? 'defend' : 'balance';
    var preset = allocations[baseType];
    var values = preset.values.slice(0);
    var shift;
    if (zone === '偏高' || zone === '信号冲突') {
      shift = Math.min(10, values[1]);
      values[1] -= shift;
      values[3] += shift;
    } else if (zone === '偏低' && baseType !== 'defend') {
      shift = Math.min(5, values[3]);
      values[1] += shift;
      values[3] -= shift;
    }
    renderAllocation(values, preset.label + ' · 估值' + zone + '修正');
  }

  function invalidateValuation() {
    state.summaryGenerated = false;
    state.valuationCalculated = false;
    state.valuationZone = '等待计算';
    state.valuationRange = '';
    state.safetyMargin = null;
    state.scenarioValues = [];
    ['#scenarioBear', '#scenarioBase', '#scenarioBull'].forEach(function (id) { if (exists(id)) $(id).textContent = '—'; });
    if (exists('#valuationZone')) { $('#valuationZone').className = 'valuation-zone fair'; $('#valuationZone').textContent = '数据已修改，请重新计算'; }
    if (exists('#valuationDetail')) $('#valuationDetail').textContent = '输入值已经变化，请再次点击“计算合理估值”。';
    if (exists('#valuationError')) { $('#valuationError').className = 'input-error'; $('#valuationError').textContent = ''; }
    var phaseChecks = $$('[data-phase-check]');
    if (phaseChecks.length > 1) phaseChecks[1].checked = false;
    if (exists('#autoLink') && $('#autoLink').checked) {
      var type = state.posture === '进攻姿态' ? 'attack' : state.posture === '防御姿态' ? 'defend' : 'balance';
      updatePie(type, true);
    }
    runScenario();
    updatePhaseCount();
    updateWorkflow();
  }

  function valuationAllowsBuy() {
    return state.valuationCalculated && state.valuationZone === '偏低' && state.safetyMargin >= 0.15 &&
      (state.valuationType !== 'stable' || numberValue('#calcInput2', 0) - numberValue('#calcInput3', 0) >= 1);
  }

  function updateCount(selector, outputSelector) {
    var checks = $$(selector); var count = 0; var i;
    for (i = 0; i < checks.length; i += 1) if (checks[i].checked) count += 1;
    if (exists(outputSelector)) $(outputSelector).textContent = String(count);
    return count;
  }
  function evaluatePhase() {
    var selectedStage = $('[name="tradeStage"]:checked');
    var stage = selectedStage ? selectedStage.value : 'buy';
    var stageLabels = { buy: '准备买入', hold: '正在持有', sell: '准备卖出' };
    var panels = $$('[data-phase-panel]'); var i;
    for (i = 0; i < panels.length; i += 1) panels[i].classList.toggle('active', panels[i].getAttribute('data-phase-panel') === stage);
    var allChecks = $$('[data-phase-check]'); var allChecked = 0;
    for (i = 0; i < allChecks.length; i += 1) if (allChecks[i].checked) allChecked += 1;
    var checks = $$('[data-phase-check="' + stage + '"]');
    var evidenceInputs = $$('[data-phase-evidence="' + stage + '"]');
    var checked = 0; var evidenceReady = 0; var evidence = [];
    for (i = 0; i < checks.length; i += 1) {
      var value = evidenceInputs.length > i ? evidenceInputs[i].value.trim() : '';
      if (checks[i].checked) checked += 1;
      if (checks[i].checked && value) { evidenceReady += 1; evidence.push(value); }
      if (evidenceInputs.length > i) evidenceInputs[i].classList.toggle('missing', checks[i].checked && !value);
    }
    var ready = checks.length > 0 && checked === checks.length && evidenceReady === checks.length;
    if (stage === 'buy') ready = ready && valuationAllowsBuy();
    if (stage === 'hold') ready = ready && validNumericInput('#singlePositionInput') && numberValue('#singlePositionInput', 101) <= 15;
    var decision; var detail;
    if (stage === 'buy') {
      decision = ready ? (state.valuationZone === '偏低' ? '可以买入：可从小仓试错开始' : '买入硬条件通过，进入风险复核') : '暂不建议买入';
      detail = ready ? '三项硬条件、证据与至少 15% 的模型折价已通过；仍须通过风险管理和行为自检。' : !valuationAllowsBuy() ? '估值未计算、偏高、信号冲突、安全边际不足 15%，或 DDM 参数过度敏感，不能通过买入检查。' : '请完成买入阶段的 3 项硬条件并填写对应证据。';
    } else if (stage === 'hold') {
      decision = ready ? '继续持有并按验证事件跟踪' : checked ? '持有依据不足，建议降低仓位或补充证据' : '暂不建议无条件持有';
      detail = ready ? '基本面与仓位边界均已确认。' : '持有阶段需要同时确认基本面和仓位，并写下最新证据。';
    } else {
      decision = ready ? '触发卖出复核，可以执行退出计划' : checked ? '卖出条件尚未闭环' : '继续观察，尚未形成卖出证据';
      detail = ready ? '逻辑证伪与资金去向均已记录。' : '卖出阶段需要明确证伪信号及卖出后的资金去向。';
    }
    state.phaseDecision = decision; state.phaseReady = ready;
    if (exists('#phaseCount')) $('#phaseCount').textContent = String(allChecked);
    if (exists('#activePhaseCount')) $('#activePhaseCount').textContent = String(checked);
    if (exists('#activePhaseTotal')) $('#activePhaseTotal').textContent = String(checks.length);
    if (exists('#phaseDecision')) $('#phaseDecision').textContent = decision;
    if (exists('#phaseGate')) $('#phaseGate').textContent = stageLabels[stage] + '｜' + detail;
    return { stage: stage, stageLabel: stageLabels[stage], checked: checked, total: checks.length, ready: ready, decision: decision, evidence: evidence, allChecked: allChecked };
  }

  function evaluateBehavior() {
    if (state.pauseUntil > 0 && state.pauseUntil <= Date.now()) {
      state.pauseUntil = 0;
      var questions = $$('[data-behavior-answer]');
      for (var q = 0; q < questions.length; q += 1) questions[q].checked = false;
      setStoredData('behaviorPauseUntilV1', 0);
    }
    var labels = { yes: '是', unsure: '不确定', no: '否' };
    var answers = []; var completed = 0; var unsure = 0; var no = 0; var i;
    for (i = 1; i <= 5; i += 1) {
      var selected = $('[name="behavior' + i + '"]:checked');
      var value = selected ? selected.value : '';
      if (value) completed += 1;
      if (value === 'unsure') unsure += 1;
      if (value === 'no') no += 1;
      answers.push(value ? labels[value] : '未回答');
    }
    var redFlags = $$('[data-behavior-red]'); var redLabels = [];
    for (i = 0; i < redFlags.length; i += 1) if (redFlags[i].checked) redLabels.push(redFlags[i].getAttribute('data-behavior-red'));
    var score = unsure + no * 2 + redLabels.length * 2;
    var level = '低风险';
    if (redLabels.length >= 2 || no >= 2 || score >= 7 || answers[2] === '否') level = '高风险';
    else if (completed < 5) level = '未完成';
    else if (redLabels.length >= 1 || no >= 1 || unsure >= 1 || score >= 3) level = '中风险';
    if (level === '高风险' && state.pauseUntil <= Date.now()) {
      state.pauseUntil = Date.now() + 24 * 60 * 60 * 1000;
      setStoredData('behaviorPauseUntilV1', state.pauseUntil);
    }
    var blocked = level === '高风险' || state.pauseUntil > Date.now();
    var ready = completed === 5 && level === '低风险' && !blocked;
    var advice = level === '未完成' ? '请先完成全部五问，再判断是否适合执行。' : level === '高风险' ? '当前判断容易受到情绪或认知偏差影响，停止执行并在 24 小时后重新检查。' : level === '中风险' ? '建议等待并补充反对证据，不要立即扩大仓位。' : '行为风险较低，可以继续执行风险与证据复核。';
    state.behaviorLevel = level; state.behaviorReady = ready; state.behaviorBlocked = blocked;
    if (exists('#behaviorCount')) $('#behaviorCount').textContent = String(completed);
    if (exists('#redFlagCount')) $('#redFlagCount').textContent = String(redLabels.length);
    if (exists('#behaviorRisk')) $('#behaviorRisk').textContent = level + (completed === 5 ? ' · ' + score + ' 分' : '') + (blocked ? ' · 暂停中' : '');
    if (exists('#behaviorAdvice')) $('#behaviorAdvice').textContent = advice;
    if (blocked && exists('#behaviorAdvice')) $('#behaviorAdvice').textContent = '暂停至 ' + new Date(state.pauseUntil).toLocaleString() + '；取消勾选或重置模块不会提前解除。到期后须重新检查五问。';
    if (exists('#behaviorResult')) $('#behaviorResult').className = 'behavior-result ' + (level === '高风险' ? 'high' : level === '中风险' ? 'medium' : 'low');
    if (exists('#behaviorPause')) $('#behaviorPause').classList.toggle('show', blocked);
    return { completed: completed, unsure: unsure, no: no, score: score, level: level, ready: ready, blocked: blocked, answers: answers, redLabels: redLabels };
  }

  function updatePhaseCount() { updateWorkflow(evaluatePhase()); }
  function updateBehaviorCount() { updateWorkflow(null, evaluateBehavior()); }
  function updateWeeklyCount() { updateCount('#role8 input[type="checkbox"]', '#weeklyCount'); }

  var allocations = {
    attack: { label: '进攻组合', values: [45, 35, 10, 10] },
    balance: { label: '均衡组合', values: [45, 25, 10, 20] },
    defend: { label: '防御组合', values: [40, 15, 10, 35] }
  };

  function macroProjection(values) {
    var pmiContribution = clamp((values.pmi - 50) * 22, -82, 82);
    var socialContribution = clamp(-(values.social - values.socialPrev) * 28, -50, 50);
    var m2Contribution = clamp(-(values.m2 - values.m2Prev) * 28, -50, 50);
    var yieldContribution = clamp((values.bondYield - values.yieldPrev) * 90, -50, 50);
    return { x: clamp(socialContribution + m2Contribution + yieldContribution, -82, 82), y: pmiContribution };
  }

  function quadrantFor(x, y) {
    if (Math.abs(x) < 1 && Math.abs(y) < 1) return '宏观坐标原点';
    if (Math.abs(x) < 1) return '流动性中性 · ' + (y > 0 ? '扩张' : '收缩');
    if (Math.abs(y) < 1) return (x < 0 ? '宽松' : '收紧') + ' · PMI 位于荣枯线附近';
    if (x < 0 && y >= 0) return '宽松扩张 · 复苏象限';
    if (x >= 0 && y >= 0) return '收紧扩张 · 过热象限';
    if (x < 0 && y < 0) return '宽松收缩 · 衰退象限';
    return '收紧收缩 · 双重偏紧';
  }

  function scenarioAllocation(type) {
    var values = allocations[type].values.slice(0); var shift;
    if (state.valuationCalculated && (state.valuationZone === '偏高' || state.valuationZone === '信号冲突')) { shift = Math.min(10, values[1]); values[1] -= shift; values[3] += shift; }
    else if (state.valuationCalculated && state.valuationZone === '偏低' && type !== 'defend') { shift = Math.min(5, values[3]); values[1] += shift; values[3] -= shift; }
    return values;
  }

  function runScenario() {
    state.summaryGenerated = false;
    if (!exists('#simPmi')) return;
    if (!state.macroValid) {
      ['#simCoordinate', '#simQuadrant', '#simPosture', '#simAllocation'].forEach(function (id) { if (exists(id)) $(id).textContent = '等待有效宏观数据'; });
      if (exists('#simExplanation')) $('#simExplanation').textContent = '请先补齐真实指标、来源及有效日期。';
      return;
    }
    var pmiDelta = numberValue('#simPmi', 0); var socialDelta = numberValue('#simSocial', 0); var m2Delta = numberValue('#simM2', 0); var yieldBps = numberValue('#simYield', 0);
    var base = macroValues();
    var projected = macroProjection({ pmi: base.pmi + pmiDelta, pmiPrev: base.pmiPrev, social: base.social + socialDelta, socialPrev: base.socialPrev, m2: base.m2 + m2Delta, m2Prev: base.m2Prev, bondYield: base.bondYield + yieldBps / 100, yieldPrev: base.yieldPrev });
    var attack = (projected.y > 5 ? 1 : 0) + (projected.x < -5 ? 1 : 0);
    var defend = (projected.y < -5 ? 1 : 0) + (projected.x > 5 ? 1 : 0);
    var type = attack >= 2 && attack > defend ? 'attack' : defend >= 2 && defend > attack ? 'defend' : 'balance';
    var postureLabel = type === 'attack' ? '进攻姿态' : type === 'defend' ? '防御姿态' : '均衡姿态';
    var values = scenarioAllocation(type);
    if (exists('#simPmiValue')) $('#simPmiValue').textContent = (pmiDelta >= 0 ? '+' : '') + pmiDelta.toFixed(1);
    if (exists('#simSocialValue')) $('#simSocialValue').textContent = (socialDelta >= 0 ? '+' : '') + socialDelta.toFixed(1) + '%';
    if (exists('#simM2Value')) $('#simM2Value').textContent = (m2Delta >= 0 ? '+' : '') + m2Delta.toFixed(1) + '%';
    if (exists('#simYieldValue')) $('#simYieldValue').textContent = (yieldBps >= 0 ? '+' : '') + yieldBps.toFixed(0) + 'bp';
    if (exists('#simCoordinate')) $('#simCoordinate').textContent = 'X ' + projected.x.toFixed(0) + ' / Y ' + projected.y.toFixed(0);
    if (exists('#simQuadrant')) $('#simQuadrant').textContent = quadrantFor(projected.x, projected.y);
    if (exists('#simPosture')) $('#simPosture').textContent = postureLabel;
    if (exists('#simAllocation')) $('#simAllocation').textContent = values.join(' / ');
    var unchanged = pmiDelta === 0 && socialDelta === 0 && m2Delta === 0 && yieldBps === 0;
    if (exists('#simExplanation')) $('#simExplanation').textContent = unchanged ? '当前没有施加情景变化。模拟结果只依据四项宏观变量，不会覆盖真实数据。' : '模拟结果：' + quadrantFor(projected.x, projected.y) + '，对应' + postureLabel + '；真实输入、仓位和历史快照均未修改。';
    markCalculated();
  }

  function applyScenarioPreset(name) {
    var presets = { slowdown: [-1.2, -0.4, -0.4, 10], easing: [0.2, 0.8, 0.8, -25], tightening: [-0.5, -0.7, -0.7, 35], reset: [0, 0, 0, 0] };
    var values = presets[name] || presets.reset; var ids = ['#simPmi', '#simSocial', '#simM2', '#simYield']; var i;
    for (i = 0; i < ids.length; i += 1) if (exists(ids[i])) $(ids[i]).value = String(values[i]);
    runScenario();
    showStatus(name === 'reset' ? '情景模拟已归零' : '已载入情景，真实数据未修改');
  }

  function renderAllocation(values, label) {
    if (values.length !== 4 || values.some(function (v) { return !isFinite(v) || v < 0 || v > 100; }) || Math.abs(values.reduce(function (sum, v) { return sum + v; }, 0) - 100) > 0.000001) {
      values = allocations.balance.values.slice(0); label = '无效仓位已恢复为均衡组合';
    }
    var circumference = 282.743;
    var ids = ['#pieBase', '#pieAttack', '#pieTactical', '#pieCash'];
    var labels = ['#allocBase', '#allocAttack', '#allocTactical', '#allocCash'];
    var sliders = $$('[data-allocation-slider]');
    var offset = 0; var i;
    for (i = 0; i < values.length; i += 1) {
      var length = circumference * values[i] / 100;
      if (exists(ids[i])) { $(ids[i]).style.strokeDasharray = length + ' ' + (circumference - length); $(ids[i]).style.strokeDashoffset = String(-offset); }
      if (exists(labels[i])) $(labels[i]).textContent = values[i] + '%';
      if (exists('#sliderValue' + i)) $('#sliderValue' + i).textContent = values[i] + '%';
      if (sliders.length > i) sliders[i].value = String(values[i]);
      offset += length;
    }
    if (exists('#pieLabel')) $('#pieLabel').textContent = label;
    if (exists('#allocationTotal')) $('#allocationTotal').textContent = '100%';
    if (exists('#allocationStatus')) $('#allocationStatus').textContent = '组合有效';
    state.allocationValues = values.slice(0);
    updateWorkflow();
  }

  function updatePie(type, automatic) {
    var preset = allocations[type];
    if (!preset) return;
    state.summaryGenerated = false;
    renderAllocation(preset.values, preset.label);
    var i;
    var buttons = $$('[data-preset]');
    for (i = 0; i < buttons.length; i += 1) buttons[i].classList.toggle('active', buttons[i].getAttribute('data-preset') === type);
    state.allocationType = type;
    if (!automatic && exists('#autoLink')) $('#autoLink').checked = false;
    if (!automatic) showStatus('仓位已切换为' + preset.label);
    if (!automatic) scheduleAutoSave();
  }

  function updateCustomAllocation(event) {
    state.summaryGenerated = false;
    var sliders = $$('[data-allocation-slider]');
    var changed = Number(event.target.getAttribute('data-allocation-slider'));
    var values = []; var i; var total = 0;
    for (i = 0; i < sliders.length; i += 1) { values[i] = Number(sliders[i].value) || 0; total += values[i]; }
    var adjust = changed === 3 ? 0 : 3;
    var corrected = clamp(values[adjust] - (total - 100), 0, 100);
    values[adjust] = corrected;
    total = values[0] + values[1] + values[2] + values[3];
    if (total !== 100) {
      for (i = 0; i < values.length && total !== 100; i += 1) {
        if (i === changed || i === adjust) continue;
        var next = clamp(values[i] - (total - 100), 0, 100);
        total += next - values[i];
        values[i] = next;
      }
    }
    renderAllocation(values, '自定义组合');
    var buttons = $$('[data-preset]');
    for (i = 0; i < buttons.length; i += 1) buttons[i].classList.remove('active');
    state.allocationType = 'custom';
    if (exists('#autoLink')) $('#autoLink').checked = false;
  }

  function checkedTexts(selector) {
    var nodes = $$(selector); var texts = []; var i;
    for (i = 0; i < nodes.length; i += 1) if (nodes[i].checked) texts.push(nodes[i].parentNode.textContent.trim());
    return texts;
  }

  function setWeeklyState(name, recommended, hint) {
    var card = $('[data-weekly="' + name + '"]');
    var hintElement = $('#weekly' + name.charAt(0).toUpperCase() + name.slice(1) + 'Hint');
    if (card) card.classList.toggle('recommended', recommended);
    if (hintElement) hintElement.textContent = hint;
  }

  function validateRisk() {
    var positionValid = validNumericInput('#singlePositionInput');
    var leverageValid = validNumericInput('#leverageInput');
    var position = numberValue('#singlePositionInput', 0);
    var leverage = numberValue('#leverageInput', 0);
    var messages = [];
    var stop = $('#evidenceBuyStop');
    if (!stop || !stop.value.trim() || !exists('#phaseBuyStop') || !$('#phaseBuyStop').checked) messages.push('请在第 4 模块填写并确认止损或逻辑失效条件');
    if (!positionValid) messages.push('请填写有效的单票仓位');
    else if (position > 15) messages.push('单票仓位需 ≤ 15%');
    if (!leverageValid) messages.push('请填写有效的杠杆率');
    else if (leverage > 20) messages.push('杠杆率需 ≤ 20%');
    var output = $('#riskValidation');
    if (output) {
      output.className = messages.length ? 'validation-message bad' : 'validation-message good';
      output.textContent = messages.length ? messages.join('；') : '风险校验通过';
    }
    return messages.length === 0;
  }

  function daysSinceInput(selector) {
    var input = $(selector); if (!input || !input.value) return 9999;
    var date = parseIso(input.value); if (!date) return 9999;
    return Math.floor((today().getTime() - date.getTime()) / 86400000);
  }

  function updateConflicts(riskReady) {
    var conflicts = [];
    var phaseChecks = $$('[data-phase-check]');
    if (state.posture === '防御姿态' && state.allocationValues[1] > 20) conflicts.push('防御姿态与进攻仓 ' + state.allocationValues[1] + '% 存在冲突');
    if (!valuationAllowsBuy() && phaseChecks.length > 1 && phaseChecks[1].checked) conflicts.push('估值未达到买入门槛，但“安全边际”已被勾选');
    if (state.valuationZone === '信号冲突') conflicts.push('PB 模型与历史分位方向相反，需复核数据与估值假设');
    if ((daysSinceInput('#pmiDate') > 45 || daysSinceInput('#creditDate') > 45 || daysSinceInput('#yieldDate') > 7) && state.confidence === '高置信') conflicts.push('部分宏观数据过期，不应维持高置信判断');
    if (!riskReady && state.allocationValues[1] >= 30) conflicts.push('风险校验未通过，但进攻仓位较高');
    if (state.behaviorBlocked) conflicts.push('行为自检为高风险，执行结论已暂停 24 小时');
    var panel = $('#conflictPanel');
    if (panel) { panel.classList.toggle('show', conflicts.length > 0); panel.textContent = conflicts.length ? '联动冲突：' + conflicts.join('；') : ''; }
    return conflicts;
  }

  function updateWeekComparison() {
    var output = $('#weekComparison'); if (!output) return;
    if (!state.history.length || !state.history[0].snapshot || !state.history[0].snapshot.stateData) { output.textContent = '暂无历史快照，保存一次决策后即可比较。'; return; }
    var previous = state.history[0]; var previousState = previous.snapshot.stateData;
    var previousAllocation = previousState.allocationValues && previousState.allocationValues.length === 4 ? previousState.allocationValues : [0, 0, 0, 0];
    var allocationChange = [];
    var labels = ['底仓', '进攻仓', '机动仓', '现金']; var i;
    for (i = 0; i < 4; i += 1) allocationChange.push(labels[i] + (state.allocationValues[i] - previousAllocation[i] >= 0 ? '+' : '') + (state.allocationValues[i] - previousAllocation[i]) + 'pct');
    output.textContent = '上次：' + (previous.label || '未记录象限') + ' / ' + (previous.posture || '未记录姿态') + ' / 估值' + (previous.zone || '未计算') + '；仓位变化：' + allocationChange.join('、') + '。';
  }

  function updateDashboard(score, riskReady, nextText) {
    if (exists('#overviewMacro')) $('#overviewMacro').textContent = state.quadrant;
    if (exists('#overviewPosture')) $('#overviewPosture').textContent = state.posture + ' · ' + state.confidence;
    if (exists('#overviewValuation')) $('#overviewValuation').textContent = state.valuationCalculated ? state.valuationZone : '等待计算';
    if (exists('#overviewAllocation')) $('#overviewAllocation').textContent = state.allocationValues.join(' / ');
    if (exists('#overviewRisk')) $('#overviewRisk').textContent = riskReady ? '已通过' : '未通过';
    if (exists('#overviewProgress')) $('#overviewProgress').textContent = score + ' / 7';
    if (exists('#overviewNext')) $('#overviewNext').textContent = nextText;
    if (exists('#overallStatus')) { $('#overallStatus').className = score === 7 ? 'freshness good' : 'freshness'; $('#overallStatus').textContent = score === 7 ? '决策链完整' : '待完善 ' + (7 - score) + ' 项'; }
  }

  function updateWorkflow(phaseResult, behaviorResult) {
    var phase = phaseResult || evaluatePhase();
    var behavior = behaviorResult || evaluateBehavior();
    var riskReady = validateRisk();
    var allocationTotal = 0; var i;
    for (i = 0; i < state.allocationValues.length; i += 1) allocationTotal += state.allocationValues[i];
    var ready = [state.macroValid, state.postureReady, state.valuationCalculated && state.valuationZone !== '信号冲突', phase.ready, allocationTotal === 100, riskReady, behavior.ready];
    var score = 0;
    for (i = 0; i < ready.length; i += 1) if (ready[i]) score += 1;
    if (exists('#workflowScore')) $('#workflowScore').textContent = '联动完成度 ' + score + ' / 7';
    var advice = '决策链已完整，可以生成摘要并完成本周记录。';
    if (!state.macroValid) advice = '下一步：补全第 1 模块宏观指标，避免空值被误判为市场信号。';
    else if (!state.valuationCalculated) advice = '下一步：完成第 3 模块估值计算，结果会联动交易清单与组合复盘。';
    else if (!phase.ready) advice = '下一步：在第 4 模块完成当前阶段的条件与证据门槛。';
    else if (!riskReady) advice = '下一步：修正并确认第 6 模块风险边界。';
    else if (!behavior.ready) advice = behavior.blocked ? '暂停交易：行为风险过高，至少等待 24 小时后重新自检。' : '下一步：完成第 7 模块五问并消除行为风险红旗。';
    if (exists('#workflowAdvice')) $('#workflowAdvice').textContent = advice;
    setWeeklyState('macro', !state.macroValid || state.quadrant === '宏观坐标原点', !state.macroValid ? '优先：宏观指标不完整' : state.quadrant === '宏观坐标原点' ? '优先：补充最新数据并确认方向' : '已联动：' + state.quadrant);
    setWeeklyState('logic', !state.valuationCalculated || !phase.ready, !state.valuationCalculated ? '优先：尚未计算估值' : phase.stageLabel + '｜' + phase.decision);
    setWeeklyState('allocation', state.valuationZone === '偏高' || allocationTotal !== 100, '姿态：' + state.posture + '；估值：' + state.valuationZone + '；仓位合计 ' + allocationTotal + '%');
    setWeeklyState('risk', !riskReady || !behavior.ready, '风险确认：' + (riskReady ? '完成' : '未完成') + '；行为：' + behavior.level + '，五问 ' + behavior.completed + '/5');
    setWeeklyState('record', !state.summaryGenerated, state.summaryGenerated ? '本周摘要已生成，可复核后记录' : '优先：完成决策链后生成摘要');
    var conflicts = updateConflicts(riskReady);
    if (conflicts.length && score === 7) {
      advice = '存在联动冲突，请先解决冲突后执行。';
      if (exists('#workflowAdvice')) $('#workflowAdvice').textContent = advice;
    }
    updateWeekComparison();
    updateDashboard(score, riskReady, advice);
    if (conflicts.length && exists('#overallStatus')) $('#overallStatus').textContent = '存在联动冲突';
  }

  function generateSummary() {
    updateQuadrant();
    if (!state.macroValid) { showStatus('请先补全第 1 模块宏观指标'); goToRole(1); return false; }
    if (!state.valuationCalculated) { showStatus('请先完成第 3 模块估值计算'); goToRole(3); return false; }
    if (!validateRisk()) { showStatus('风险校验未通过，暂不能生成摘要'); goToRole(6); return false; }
    var m = macroValues();
    var company = $('[name="companyType"]:checked');
    var companyName = company ? company.parentNode.textContent.trim() : '尚未选择';
    var phaseItems = checkedTexts('[data-phase-check]');
    var phase = evaluatePhase();
    var behavior = evaluateBehavior();
    var weeklyItems = checkedTexts('#role8 input[type="checkbox"]');
    var preset = { label: exists('#pieLabel') ? $('#pieLabel').textContent : '当前组合', values: state.allocationValues };
    var valuationTool = exists('#valuationTool') ? $('#valuationTool').textContent : '尚未选择';
    var valuationGuide = exists('#valuationGuide') ? $('#valuationGuide').textContent : '';
    var text = '📌 交易决策摘要\n\n' +
      '一、宏观象限\n' + state.quadrant + '（X ' + state.x.toFixed(0) + ' / Y ' + state.y.toFixed(0) + '）\n' +
      '数据日期：' + (exists('#dataDate') ? $('#dataDate').value : '未填写') + '｜来源：' + (exists('#dataSource') ? $('#dataSource').value : '未填写') + '\n' +
      'PMI：' + m.pmi.toFixed(1) + '，上期 ' + m.pmiPrev.toFixed(1) + '\n' +
      '社融：' + m.social.toFixed(1) + '%，上期 ' + m.socialPrev.toFixed(1) + '%\n' +
      'M2：' + m.m2.toFixed(1) + '%，上期 ' + m.m2Prev.toFixed(1) + '%\n' +
      '10年国债：' + m.bondYield.toFixed(2) + '%，上期 ' + m.yieldPrev.toFixed(2) + '%\n' +
      '分项日期：PMI ' + ($('#pmiDate') ? $('#pmiDate').value : '未填') + '、社融/M2 ' + ($('#creditDate') ? $('#creditDate').value : '未填') + '、国债 ' + ($('#yieldDate') ? $('#yieldDate').value : '未填') + '\n\n' +
      '二、决策姿态\n' + state.posture + '｜' + state.confidence + '｜判断强度 ' + state.rationaleScore + '/100\n触发条件：' + (state.triggerLabels.length ? state.triggerLabels.join('；') : '尚未选择') + '\n支持依据：' + (state.rationaleSupport.length ? state.rationaleSupport.join('；') : '尚无') + '\n反向证据：' + (state.rationaleCounter.length ? state.rationaleCounter.join('；') : '尚无') + '\n\n' +
      '三、估值工具\n' + companyName + '｜' + valuationTool + '\n' + valuationGuide + '\n估值结论：' + state.valuationZone + (state.valuationRange ? '；合理区间 ' + state.valuationRange : '；尚未完成计算') + '\n\n' +
      '四、单票检查\n当前阶段：' + phase.stageLabel + '｜结论：' + phase.decision + '\n已满足 ' + phaseItems.length + '/7 项：' + (phaseItems.length ? phaseItems.join('；') : '尚未勾选') + '\n证据：' + (phase.evidence.length ? phase.evidence.join('；') : '尚未填写') + '\n\n' +
      '五、组合仓位\n' + preset.label + '：底仓 ' + preset.values[0] + '%、进攻仓 ' + preset.values[1] + '%、机动仓 ' + preset.values[2] + '%、现金 ' + preset.values[3] + '%\n\n' +
      '六、风险纪律\n当前单票 ' + numberValue('#singlePositionInput', 0).toFixed(1) + '%，杠杆 ' + numberValue('#leverageInput', 0).toFixed(1) + '%；止损或逻辑失效条件：' + $('#evidenceBuyStop').value.trim() + '。\n\n' +
      '七、行为自检\n风险等级：' + behavior.level + '｜五问：' + behavior.answers.join(' / ') + '\n红旗行为：' + (behavior.redLabels.length ? behavior.redLabels.join('；') : '无') + '\n执行状态：' + (behavior.blocked ? '暂停至 ' + new Date(state.pauseUntil).toLocaleString() : behavior.ready && phase.ready && state.postureReady && !updateConflicts(true).length ? '可以继续执行风险与证据复核' : '条件未完整或存在冲突，暂不执行') + '\n\n八、每周观察：已完成 ' + weeklyItems.length + '/5 项\n\n' +
      '本周主要风险：' + (exists('#weeklyRiskNote') && $('#weeklyRiskNote').value ? $('#weeklyRiskNote').value : '未填写') + '\n' +
      '下周验证事件：' + (exists('#weeklyNextEvent') && $('#weeklyNextEvent').value ? $('#weeklyNextEvent').value : '未填写') + '\n\n' +
      '附：情景模拟（不覆盖正式结论）\n' + (exists('#simQuadrant') ? $('#simQuadrant').textContent : '未运行') + '｜' + (exists('#simPosture') ? $('#simPosture').textContent : '未运行') + '｜仓位 ' + (exists('#simAllocation') ? $('#simAllocation').textContent : '—') + '\n\n' +
      '版本记录：工具 ' + APP_VERSION + '｜规则 ' + RULE_VERSION + '｜公式 ' + FORMULA_VERSION + '｜数据 ' + (latestDataDate() || '未填写') + '｜计算 ' + displayDateTime(state.lastCalculatedAt) + '\n\n' +
      '⚠️ 本摘要用于交易复盘与风险纪律，不构成投资建议。\n#投资复盘 #交易系统 #资产配置';
    if (exists('#summaryOutput')) { $('#summaryOutput').value = text; $('#summaryOutput').focus(); $('#summaryOutput').select(); }
    state.summaryGenerated = true;
    updateWorkflow();
    showStatus('决策摘要已生成');
    scheduleAutoSave();
    return true;
  }

  function captureForm(rootSelector) {
    var root = rootSelector ? $(rootSelector) : document;
    var nodes = root ? root.querySelectorAll('input,textarea') : [];
    var values = []; var i;
    for (i = 0; i < nodes.length; i += 1) {
      if (!nodes[i].id && !nodes[i].getAttribute('data-trigger') && !nodes[i].getAttribute('data-phase-check') && !nodes[i].getAttribute('data-allocation-slider') && !nodes[i].closest('[data-weekly]')) continue;
      values.push({ id: nodes[i].id || '', index: i, type: nodes[i].type, value: nodes[i].value, checked: Boolean(nodes[i].checked) });
    }
    return values;
  }

  function captureSnapshot() {
    return {
      schemaVersion: 6,
      ruleVersion: RULE_VERSION,
      createdAt: new Date().toISOString(),
      form: captureForm('main'),
      stateData: {
        valuationType: state.valuationType,
        valuationCalculated: state.valuationCalculated,
        valuationZone: state.valuationZone,
        valuationRange: state.valuationRange,
        safetyMargin: state.safetyMargin,
        carryover: state.carryover,
        scenarioValues: state.scenarioValues.slice(0),
        allocationType: state.allocationType,
        allocationValues: state.allocationValues.slice(0),
        viewMode: state.viewMode,
        lastDataChangeAt: state.lastDataChangeAt,
        lastCalculatedAt: state.lastCalculatedAt,
        summaryGenerated: state.summaryGenerated
      },
      summary: exists('#summaryOutput') ? $('#summaryOutput').value : ''
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.form) return;
    restoring = true;
    var nodes = $$('main input,main textarea'); var i; var item; var node;
    for (i = 0; i < snapshot.form.length; i += 1) {
      item = snapshot.form[i];
      node = item.id ? document.getElementById(item.id) : snapshot.schemaVersion === 6 ? nodes[item.index] : null;
      if (!node) continue;
      if (item.type === 'checkbox' || item.type === 'radio') node.checked = item.checked;
      else node.value = item.value;
    }
    var restoredAllocation = [45, 25, 10, 20];
    if (snapshot.stateData) {
      state.valuationType = valuationMap[snapshot.stateData.valuationType] ? snapshot.stateData.valuationType : 'stable';
      state.valuationCalculated = Boolean(snapshot.stateData.valuationCalculated);
      state.valuationZone = snapshot.stateData.valuationZone || '等待计算';
      state.valuationRange = snapshot.stateData.valuationRange || '';
      state.safetyMargin = typeof snapshot.stateData.safetyMargin === 'number' ? snapshot.stateData.safetyMargin : null;
      state.carryover = snapshot.stateData.carryover || 0;
      state.scenarioValues = snapshot.stateData.scenarioValues ? snapshot.stateData.scenarioValues.slice(0) : [];
      state.allocationType = snapshot.stateData.allocationType || 'balance';
      state.allocationValues = snapshot.stateData.allocationValues ? snapshot.stateData.allocationValues.slice(0) : [45, 25, 10, 20];
      restoredAllocation = state.allocationValues.slice(0);
      state.viewMode = snapshot.stateData.viewMode === 'quick' ? 'quick' : 'full';
      state.lastDataChangeAt = snapshot.stateData.lastDataChangeAt || '';
      state.lastCalculatedAt = snapshot.stateData.lastCalculatedAt || '';
      state.summaryGenerated = Boolean(snapshot.stateData.summaryGenerated);
    }
    var valuationRadio = $('[name="companyType"][value="' + state.valuationType + '"]');
    var restoredConfig = valuationMap[state.valuationType];
    if (valuationRadio) valuationRadio.checked = true;
    if (restoredConfig) {
      if (exists('#valuationTool')) $('#valuationTool').textContent = restoredConfig.tool;
      if (exists('#valuationGuide')) $('#valuationGuide').textContent = restoredConfig.guide;
      if (exists('#valuationFormula')) $('#valuationFormula').textContent = '公式：' + restoredConfig.formula;
      for (i = 0; i < 4; i += 1) {
        if (exists('#calcLabel' + i)) $('#calcLabel' + i).textContent = restoredConfig.labels[i];
        if (exists('#calcInput' + i)) { $('#calcInput' + i).step = restoredConfig.steps[i]; $('#calcInput' + i).min = String(restoredConfig.mins[i]); $('#calcInput' + i).max = String(restoredConfig.maxs[i]); }
      }
    }
    if (exists('#summaryOutput')) $('#summaryOutput').value = snapshot.summary || '';
    if (snapshot.schemaVersion !== 6 || snapshot.ruleVersion !== RULE_VERSION) {
      ['#dataDate', '#pmiDate', '#creditDate', '#yieldDate'].forEach(function (id) { if (exists(id)) $(id).value = ''; });
    }
    var hadValuation = state.valuationCalculated;
    var confirmedValue = exists('#phaseBuyValue') && $('#phaseBuyValue').checked;
    var restoredType = state.allocationType;
    updateQuadrant(); updatePosture(); invalidateValuation();
    if (hadValuation && snapshot.ruleVersion === RULE_VERSION) calculateValuation();
    if (exists('#phaseBuyValue')) $('#phaseBuyValue').checked = Boolean(confirmedValue && valuationAllowsBuy());
    state.allocationType = restoredType;
    renderAllocation(restoredAllocation, restoredType === 'custom' ? '自定义组合' : '已恢复组合');
    if (exists('#valuationZone')) { $('#valuationZone').textContent = state.valuationCalculated ? state.valuationZone : '等待计算'; $('#valuationZone').className = 'valuation-zone ' + (state.valuationZone === '偏低' ? 'low' : state.valuationZone === '偏高' ? 'high' : 'fair'); }
    if (exists('#valuationDetail') && state.valuationRange) $('#valuationDetail').textContent = '已恢复快照；合理区间：' + state.valuationRange + '。如修改参数，请重新计算。';
    if (state.scenarioValues.length === 3) {
      var scenarioUnit = state.valuationType === 'resource' ? '倍PB' : state.valuationType === 'preprofit' ? '倍PS' : '元';
      if (exists('#scenarioBear')) $('#scenarioBear').textContent = state.scenarioValues[0].toFixed(2) + ' ' + scenarioUnit;
      if (exists('#scenarioBase')) $('#scenarioBase').textContent = state.scenarioValues[1].toFixed(2) + ' ' + scenarioUnit;
      if (exists('#scenarioBull')) $('#scenarioBull').textContent = state.scenarioValues[2].toFixed(2) + ' ' + scenarioUnit;
    }
    setViewMode('full', true); runScenario(); updateVersionPanel(); updatePhaseCount(); updateBehaviorCount(); updateWeeklyCount(); updateDataFreshness(); updateWorkflow();
    if (exists('#carryoverStatus')) $('#carryoverStatus').textContent = '上周未完成 ' + state.carryover + ' 项';
    state.summaryGenerated = false;
    if (exists('#summaryOutput') && snapshot.summary) $('#summaryOutput').value = '历史摘要，仅供参考；当前规则已重新校验，请生成最新摘要。\n\n' + snapshot.summary;
    restoring = false;
    if (state.pauseUntil > Date.now()) setStoredData('behaviorPauseUntilV1', state.pauseUntil);
  }

  function setStoredData(key, value) {
    if (restoring) return Promise.resolve(false);
    key += ':public';
    var serialized;
    try { serialized = JSON.stringify(value); } catch (error) { return Promise.resolve(false); }
    var miniTool = window.xhs && window.xhs.miniTool;
    if (miniTool && typeof miniTool.setStorage === 'function') {
      try {
        return Promise.resolve(miniTool.setStorage({ key: key, data: serialized })).then(function () { return true; }, function () {
          try { window.localStorage.setItem(key, serialized); return true; } catch (fallbackError) { return false; }
        });
      } catch (error2) {}
    }
    try { window.localStorage.setItem(key, serialized); return Promise.resolve(true); }
    catch (error3) { return Promise.resolve(false); }
  }

  function getStoredData(key) {
    key += ':public';
    var miniTool = window.xhs && window.xhs.miniTool;
    if (miniTool && typeof miniTool.getStorage === 'function') {
      try {
        return Promise.resolve(miniTool.getStorage({ key: key })).then(function (result) {
          if (!result || typeof result.data !== 'string') return getBrowserStoredData(key);
          try { return JSON.parse(result.data); } catch (parseError) { return null; }
        }, function () { return getBrowserStoredData(key); });
      } catch (error) {}
    }
    return Promise.resolve(getBrowserStoredData(key));
  }

  function getBrowserStoredData(key) {
    try { var saved = window.localStorage.getItem(key); return saved ? JSON.parse(saved) : null; }
    catch (error) { return null; }
  }

  function storeHistory() { return setStoredData(storageKey, state.history); }

  function loadHistory() {
    return getStoredData(storageKey).then(function (saved) {
      state.history = Array.isArray(saved) ? saved : [];
      renderHistory(); updateWeekComparison();
    });
  }

  function formatDateTime(value) {
    var date = new Date(value);
    if (!isFinite(date.getTime())) return '未知时间';
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function renderHistory() {
    var root = $('#historyList');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (!state.history.length) { var empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = '暂无决策快照'; root.appendChild(empty); return; }
    var limit = Math.min(state.history.length, 8); var i;
    for (i = 0; i < limit; i += 1) {
      (function (index) {
        var item = state.history[index]; var row = document.createElement('div'); row.className = 'history-item';
        var copy = document.createElement('div'); var title = document.createElement('b'); var meta = document.createElement('span');
        title.textContent = (item.label || '决策快照') + ' · ' + (item.zone || '未估值');
        meta.textContent = formatDateTime(item.createdAt) + '｜' + (item.posture || '未选择姿态');
        copy.appendChild(title); copy.appendChild(meta);
        var button = document.createElement('button'); button.type = 'button'; button.textContent = '恢复';
        button.addEventListener('click', function () { state.undoSnapshot = captureSnapshot(); restoreSnapshot(item.snapshot); if (exists('#undoReset')) $('#undoReset').disabled = false; showStatus('历史快照已恢复'); });
        row.appendChild(copy); row.appendChild(button); root.appendChild(row);
      }(i));
    }
  }

  function saveDecisionSnapshot() {
    if (!generateSummary()) return;
    state.history.unshift({ createdAt: new Date().toISOString(), label: state.quadrant, zone: state.valuationZone, posture: state.posture, snapshot: captureSnapshot() });
    if (state.history.length > 20) state.history.length = 20;
    renderHistory(); updateWeekComparison();
    storeHistory().then(function (persisted) { showStatus(persisted ? '决策快照已保存' : '已保留在本次会话，设备存储不可用'); });
  }

  function scheduleAutoSave() {
    if (restoring) return;
    if (autoSaveTimer) window.clearTimeout(autoSaveTimer);
    autoSaveTimer = window.setTimeout(function () {
      setStoredData(draftKey, captureSnapshot()).then(function (saved) {
        if (!exists('#storageState')) return;
        var message = saved ? '草稿已保存到此浏览器' : '本次草稿未持久化';
        if ($('#storageState').textContent !== message) $('#storageState').textContent = message;
      });
    }, 600);
  }

  function loadDraft() {
    return getStoredData(draftKey).then(function (draft) {
      if (!draft || !draft.form) { if (exists('#storageState')) $('#storageState').textContent = '自动保存已开启'; return; }
      restoreSnapshot(draft);
      if (exists('#storageState')) $('#storageState').textContent = '已恢复上次草稿';
    });
  }

  function setWeekRange() {
    var now = today(); var day = now.getDay(); var offset = day === 0 ? -6 : 1 - day;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    if (exists('#weekRange')) $('#weekRange').value = isoDate(monday) + ' 至 ' + isoDate(sunday);
  }

  function startNewWeek() {
    state.summaryGenerated = false;
    var checks = $$('#role8 [data-weekly] input[type="checkbox"]'); var done = 0; var i;
    for (i = 0; i < checks.length; i += 1) { if (checks[i].checked) done += 1; checks[i].checked = false; }
    state.carryover = checks.length - done;
    if (exists('#carryoverStatus')) $('#carryoverStatus').textContent = '上周未完成 ' + state.carryover + ' 项，已带入本周';
    if (exists('#weeklyRiskNote')) $('#weeklyRiskNote').value = '';
    if (exists('#weeklyNextEvent')) $('#weeklyNextEvent').value = '';
    setWeekRange(); updateWeeklyCount(); updateWorkflow(); showStatus('已开始新一周复盘');
    scheduleAutoSave();
  }

  function setViewMode(mode, silent) {
    state.viewMode = 'full';
    document.body.classList.remove('quick-mode');
    if (exists('#fullMode')) $('#fullMode').classList.add('active');
    setActiveRole(state.activeRole || 1);
    if (!silent) { scheduleAutoSave(); showStatus('已进入完整研究模式'); }
  }

  function setActiveRole(number) {
    var nextRole = clamp(number, 1, 8);
    var buttons = $$('#stepNav [data-step]'); var i;
    state.activeRole = nextRole;
    var roles = $$('.role-card[id^="role"]');
    for (i = 0; i < roles.length; i += 1) roles[i].classList.toggle('quick-active', roles[i].id === 'role' + nextRole);
    document.body.classList.toggle('quick-context-macro', nextRole <= 2);
    document.body.classList.toggle('quick-context-summary', nextRole === 8);
    for (i = 0; i < buttons.length; i += 1) buttons[i].classList.toggle('active', Number(buttons[i].getAttribute('data-step')) === nextRole);
    if (exists('#previousStep')) $('#previousStep').disabled = nextRole === 1;
    if (exists('#nextStep')) $('#nextStep').textContent = nextRole === 8 ? '完成' : '下一步';
  }

  function lockNavigation(number) {
    navigationTarget = clamp(number, 1, 8);
    navigationLockUntil = Date.now() + 1300;
    setActiveRole(navigationTarget);
  }

  function releaseNavigationLock() {
    navigationLockUntil = 0;
    navigationTarget = 0;
  }

  function goToRole(number) {
    var target = $('#role' + number);
    if (!target) return;
    lockNavigation(number);
    target.classList.remove('collapsed');
    var nav = $('#stepNav');
    var offset = nav ? nav.getBoundingClientRect().height + 18 : 68;
    var top = window.pageYOffset + target.getBoundingClientRect().top - offset;
    window.scrollTo(0, Math.max(0, top));
  }

  function updateActiveRoleFromScroll() {
    if (Date.now() < navigationLockUntil) return;
    if (navigationTarget) navigationTarget = 0;
    var nav = $('#stepNav'); var navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
    var active = 1; var i; var rect;
    for (i = 1; i <= 8; i += 1) {
      var role = $('#role' + i); if (!role) continue;
      if (role.offsetWidth === 0 && role.offsetHeight === 0) continue;
      rect = role.getBoundingClientRect();
      if (rect.top <= navBottom + 18) active = i;
    }
    if (active === state.activeRole) return;
    setActiveRole(active);
  }

  var quadrantFrame = null;

  function scheduleQuadrantUpdate() {
    if (quadrantFrame !== null) return;
    quadrantFrame = window.requestAnimationFrame(function () {
      quadrantFrame = null;
      markDataChanged();
      updateQuadrant();
    });
  }

  function handlePageScroll() {
    if (scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(function () {
      scrollFrame = null;
      updateActiveRoleFromScroll();
    });
  }

  function addCollapseButtons() {
    var cards = $$('.role-card'); var i;
    for (i = 0; i < cards.length; i += 1) {
      if (cards[i].id === 'decisionSummary') continue;
      var title = cards[i].querySelector('.role-title'); if (!title) continue;
      var button = document.createElement('button'); button.type = 'button'; button.className = 'collapse-button'; button.textContent = '收起'; button.setAttribute('aria-expanded', 'true');
      button.addEventListener('click', function (event) { var card = event.currentTarget.parentNode.parentNode; var collapsed = card.classList.toggle('collapsed'); event.currentTarget.textContent = collapsed ? '展开' : '收起'; event.currentTarget.setAttribute('aria-expanded', collapsed ? 'false' : 'true'); });
      title.appendChild(button);
    }
  }

  function resetElements(root) {
    var nodes = root.querySelectorAll('input,textarea'); var i;
    for (i = 0; i < nodes.length; i += 1) {
      if (nodes[i].type === 'checkbox' || nodes[i].type === 'radio') nodes[i].checked = nodes[i].defaultChecked;
      else nodes[i].value = nodes[i].defaultValue;
    }
  }

  function resetCurrentRole() {
    state.summaryGenerated = false;
    state.undoSnapshot = captureSnapshot(); if (exists('#undoReset')) $('#undoReset').disabled = false;
    var root = $('#role' + state.activeRole); if (!root) return;
    resetElements(root);
    if (state.activeRole === 1) resetQuadrant();
    else if (state.activeRole === 2) updatePosture();
    else if (state.activeRole === 3) { state.valuationType = 'stable'; updateValuation({ target: $('[name="companyType"]:checked') }); }
    else if (state.activeRole === 5) updatePie('balance', true);
    else { updatePhaseCount(); updateBehaviorCount(); updateWeeklyCount(); updateWorkflow(); }
    showStatus('第 ' + state.activeRole + ' 模块已重置');
    scheduleAutoSave();
  }

  function resetAllRoles() {
    if (!window.confirm('确定重置全部 8 个模块吗？重置后仍可点击“撤销上次重置”。')) return;
    state.undoSnapshot = captureSnapshot(); if (exists('#undoReset')) $('#undoReset').disabled = false;
    var cards = $$('.role-card'); var i;
    for (i = 0; i < cards.length; i += 1) resetElements(cards[i]);
    state.valuationType = 'stable'; state.valuationCalculated = false; state.valuationZone = '等待计算'; state.valuationRange = ''; state.scenarioValues = []; state.summaryGenerated = false;
    updateValuation({ target: { value: 'stable' } });
    resetQuadrant(); updatePosture(); updatePie('balance', true); applyScenarioPreset('reset'); updatePhaseCount(); updateBehaviorCount(); updateWeeklyCount(); setWeekRange(); updateWorkflow();
    showStatus('全部模块已重置，可点击撤销');
    scheduleAutoSave();
  }

  function undoLastReset() {
    if (!state.undoSnapshot) return;
    var snapshot = state.undoSnapshot; state.undoSnapshot = null; restoreSnapshot(snapshot);
    if (exists('#undoReset')) $('#undoReset').disabled = true;
    showStatus('已撤销上次重置');
    scheduleAutoSave();
  }

  function bindAll(selector, eventName, handler) {
    var nodes = $$(selector); var i;
    for (i = 0; i < nodes.length; i += 1) nodes[i].addEventListener(eventName, handler);
  }

  function supportsFlexGap() {
    var flex = document.createElement('div');
    flex.style.position = 'absolute';
    flex.style.visibility = 'hidden';
    flex.style.display = 'flex';
    flex.style.flexDirection = 'column';
    flex.style.rowGap = '1px';
    flex.appendChild(document.createElement('div'));
    flex.appendChild(document.createElement('div'));
    document.body.appendChild(flex);
    var supported = flex.scrollHeight === 1;
    flex.parentNode.removeChild(flex);
    return supported;
  }

  function initialize() {
    if (supportsFlexGap()) document.documentElement.classList.add('supports-flex-gap');
    var inputs = $$('main input,main textarea');
    for (var n = 0; n < inputs.length; n += 1) if (!inputs[n].id) inputs[n].id = 'desk-field-' + n;
    setWeekRange();
    addCollapseButtons();
    bindAll('#role1 input', 'input', scheduleQuadrantUpdate);
    if (exists('#dataDate')) $('#dataDate').addEventListener('change', function () { markDataChanged(); updateDataFreshness(); updateWorkflow(); });
    if (exists('#dataSource')) $('#dataSource').addEventListener('input', function () { state.summaryGenerated = false; markDataChanged(); });
    bindAll('[data-trigger]', 'change', function () { if (exists('#autoLink')) $('#autoLink').checked = false; updatePosture(); showStatus('姿态触发条件已更新'); });
    bindAll('[name="companyType"]', 'change', updateValuation);
    bindAll('.valuation-calculator input', 'input', invalidateValuation);
    bindAll('[data-phase-check]', 'change', function () { state.summaryGenerated = false; updatePhaseCount(); showStatus('单票清单已更新'); });
    bindAll('[data-phase-evidence]', 'input', function () { state.summaryGenerated = false; updatePhaseCount(); });
    bindAll('[data-trade-stage]', 'change', function () { state.summaryGenerated = false; updatePhaseCount(); showStatus('已切换当前交易阶段'); });
    bindAll('[data-behavior-answer]', 'change', function () { state.summaryGenerated = false; updateBehaviorCount(); showStatus('行为自检已更新'); });
    bindAll('[data-behavior-red]', 'change', function () { state.summaryGenerated = false; updateBehaviorCount(); showStatus('红旗行为已更新'); });
    bindAll('#role8 input[type="checkbox"]', 'change', function () { state.summaryGenerated = false; updateWeeklyCount(); updateWorkflow(); showStatus('每周观察进度已更新'); });
    bindAll('[data-preset]', 'click', function (event) { updatePie(event.currentTarget.getAttribute('data-preset'), false); });
    bindAll('[data-allocation-slider]', 'input', updateCustomAllocation);
    bindAll('.scenario-control input', 'input', function () { runScenario(); updateWorkflow(); });
    bindAll('[data-scenario-preset]', 'click', function (event) { applyScenarioPreset(event.currentTarget.getAttribute('data-scenario-preset')); updateWorkflow(); scheduleAutoSave(); });
    bindAll('[data-posture]', 'click', function (event) { choosePosture(event.currentTarget.getAttribute('data-posture')); });
    if (exists('#quadrantReset')) $('#quadrantReset').addEventListener('click', resetQuadrant);
    if (exists('#calculateValuation')) $('#calculateValuation').addEventListener('click', calculateValuation);
    if (exists('#generateSummary')) $('#generateSummary').addEventListener('click', generateSummary);
    if (exists('#saveSnapshot')) $('#saveSnapshot').addEventListener('click', saveDecisionSnapshot);
    if (exists('#startNewWeek')) $('#startNewWeek').addEventListener('click', startNewWeek);
    if (exists('#resetCurrent')) $('#resetCurrent').addEventListener('click', resetCurrentRole);
    if (exists('#resetAll')) $('#resetAll').addEventListener('click', resetAllRoles);
    if (exists('#undoReset')) $('#undoReset').addEventListener('click', undoLastReset);
    if (exists('#fullMode')) $('#fullMode').addEventListener('click', function () { setViewMode('full', false); });
    bindAll('#singlePositionInput,#leverageInput', 'input', function () { state.summaryGenerated = false; updateWorkflow(); });
    bindAll('#weeklyRiskNote,#weeklyNextEvent', 'input', function () { state.summaryGenerated = false; updateWorkflow(); });
    if (exists('#autoLink')) $('#autoLink').addEventListener('change', function () { if ($('#autoLink').checked) { updateQuadrant(); showStatus('自动联动已开启'); } else showStatus('自动联动已关闭，可手动选择'); });
    bindAll('#stepNav [data-step]', 'click', function (event) {
      event.preventDefault();
      goToRole(Number(event.currentTarget.getAttribute('data-step')));
    });
    bindAll('.role-card[id^="role"]', 'click', function (event) {
      if (event.target && event.target.closest && event.target.closest('input,textarea,select,button,label,a')) return;
      var number = Number(event.currentTarget.id.replace('role', ''));
      if (number && Date.now() >= navigationLockUntil) setActiveRole(number);
    });
    if (exists('#previousStep')) $('#previousStep').addEventListener('click', function () { goToRole(Math.max(1, state.activeRole - 1)); });
    if (exists('#nextStep')) $('#nextStep').addEventListener('click', function () { if (state.activeRole >= 8) { goToRole(8); generateSummary(); } else goToRole(state.activeRole + 1); });
    if (exists('#mobileSummary')) $('#mobileSummary').addEventListener('click', function () { generateSummary(); });
    bindAll('main input,main textarea', 'input', scheduleAutoSave);
    bindAll('main input,main textarea', 'change', scheduleAutoSave);
    window.addEventListener('scroll', handlePageScroll, { passive: true });
    window.addEventListener('wheel', releaseNavigationLock);
    window.addEventListener('touchstart', releaseNavigationLock);
    setViewMode('full', true);
    updateVersionPanel();
    updateQuadrant();
    updatePhaseCount();
    updateBehaviorCount();
    updateWeeklyCount();
    updateWorkflow();
    getStoredData('behaviorPauseUntilV1').then(function (until) {
      state.pauseUntil = Number(until) || 0;
      return loadHistory();
    }).then(loadDraft).then(updateWorkflow);
    window.setInterval(function () {
      if (state.macroValid && macroDataIssue()) updateQuadrant();
      else updateWorkflow();
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
}());
