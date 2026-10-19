'use strict';

(function () {
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text) node.textContent = text;
    return node;
  }

  function field(parent, id, label, value, min, step) {
    var wrapper = el('label', { class: 'ronghe-risk-field' });
    wrapper.appendChild(el('span', {}, label));
    wrapper.appendChild(el('input', { id: id, type: 'number', value: value, min: min, step: step, inputmode: 'decimal' }));
    parent.appendChild(wrapper);
  }

  function recordAudit(result) {
    var key = 'rongheRiskAuditV1';
    var entries;
    try { entries = JSON.parse(localStorage.getItem(key) || '[]'); } catch (error) { entries = []; }
    entries.unshift({ at: new Date().toISOString(), result: result });
    try { localStorage.setItem(key, JSON.stringify(entries.slice(0, 30))); } catch (error2) {}
  }

  function mount() {
    if (!window.RongheRiskEngine || document.getElementById('rongheRiskPanel')) return;
    var role = document.getElementById('role6');
    if (!role) return;
    var panel = el('div', { id: 'rongheRiskPanel', class: 'ronghe-risk-panel' });
    panel.appendChild(el('h3', {}, 'RONGHE 风控闸门'));
    panel.appendChild(el('p', { class: 'ronghe-risk-intro' }, '把研究结论送入确定性风控层：超过仓位上限或触发回撤熔断时，系统拒绝新仓；减仓始终允许。'));
    var grid = el('div', { class: 'ronghe-risk-grid' });
    field(grid, 'rongheEquity', '账户权益', '100000', '0', '1000');
    field(grid, 'ronghePrice', '当前价格', '20', '0.01', '0.01');
    field(grid, 'rongheQuantity', '计划数量', '1000', '0', '1');
    field(grid, 'ronghePosition', '当前持仓', '0', '0', '1');
    field(grid, 'rongheHighWater', '历史高水位', '100000', '0', '1000');
    field(grid, 'rongheDrawdown', '熔断阈值 %', '15', '0', '0.5');
    field(grid, 'rongheShock', '压力跌幅 %', '20', '0', '1');
    panel.appendChild(grid);
    var actions = el('div', { class: 'ronghe-risk-actions' });
    var button = el('button', { type: 'button', class: 'primary' }, '运行风控检查');
    var result = el('div', { id: 'rongheRiskResult', class: 'ronghe-risk-result' }, '等待检查');
    actions.appendChild(button); actions.appendChild(result); panel.appendChild(actions);
    role.appendChild(panel);
    button.addEventListener('click', async function () {
      var n = function (id) { return Number(document.getElementById(id).value); };
      try {
        var riskInput = { side: 'buy', quantity: n('rongheQuantity'), price: n('ronghePrice'), equity: n('rongheEquity'), currentPosition: n('ronghePosition'), maxPositionPct: 0.15, highWaterMark: n('rongheHighWater'), maxDrawdownPct: n('rongheDrawdown') / 100 };
        var order;
        var remote = true;
        try {
          var response = await fetch('https://ronghe-risk-free.shuyaolu93.workers.dev/api/risk/check', {
            method: 'POST', headers: { 'content-type': 'application/json', ...(window.RongheAuth && window.RongheAuth.getToken() ? { authorization: 'Bearer ' + window.RongheAuth.getToken() } : {}) }, body: JSON.stringify(riskInput)
          });
          if (response.status === 401 || response.status === 403) { result.className = 'ronghe-risk-result bad'; result.textContent = '请先登录并兑换有效卡密，再使用云端风控'; if (window.RongheAuth) window.RongheAuth.open(); return; }
          if (!response.ok) throw new Error('remote risk service returned ' + response.status);
          order = await response.json();
        } catch (remoteError) {
          remote = false;
          order = window.RongheRiskEngine.evaluateOrder(riskInput);
        }
        var stress = window.RongheRiskEngine.stressTest({ equity: n('rongheEquity'), positions: [{ quantity: n('ronghePosition'), price: n('ronghePrice') }] }, -n('rongheShock') / 100);
        var text = '裁决：' + order.decision.toUpperCase() + ' · 允许数量：' + Number(order.quantity).toFixed(0) + ' · 压力后权益：' + stress.equityAfter.toFixed(0) + ' 元 · ' + (remote ? '云端风控' : '本地回退');
        result.className = 'ronghe-risk-result ' + (order.decision === 'allow' ? 'good' : order.decision === 'resize' ? 'warn' : 'bad');
        result.textContent = text + (order.reasons.length ? ' · ' + order.reasons.join('；') : '');
        recordAudit({ decision: order.decision, quantity: order.quantity, stress: stress });
      } catch (error) {
        result.className = 'ronghe-risk-result bad';
        result.textContent = '检查失败：' + error.message;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}());
