(() => {
  'use strict';
  const API = 'https://ronghe-risk-free.shuyaolu93.workers.dev';
  const TOKEN_KEY = 'rongheAuthTokenV1';
  const $ = id => document.getElementById(id);
  const offsets = Object.create(null);
  let token = '';
  try {
    token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}

  async function request(path, options = {}) {
    const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) };
    const response = await fetch(API + path, { ...options, headers, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || data.error || '请求失败');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function date(value) {
    if (!value) return '—';
    const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  }

  function showLogin(message = '') {
    $('dashboard').hidden = true;
    $('loginPanel').hidden = false;
    $('logout').hidden = true;
    $('loginNotice').textContent = message;
  }

  async function openDashboard(user) {
    $('loginPanel').hidden = true;
    $('dashboard').hidden = false;
    $('logout').hidden = false;
    $('adminIdentity').textContent = '当前管理账号：' + user.email;
    await Promise.all([loadOverview(), ...['users', 'codes', 'redemptions', 'logins', 'messages'].map(section => loadSection(section, 0))]);
  }

  async function loadOverview() {
    const stats = $('stats');
    try {
      const { summary } = await request('/api/admin/dashboard?section=overview');
      const fields = [
        ['注册账号', summary.users], ['有效账号', summary.active_users],
        ['已生成卡密', summary.codes], ['累计兑换', summary.redemptions],
        ['登录记录', summary.logins], ['研究记录已同步', summary.desk_synced],
        ['蜡烛图已同步', summary.candle_synced], ['用户留言', summary.messages]
      ];
      stats.replaceChildren(...fields.map(([label, value]) => {
        const card = document.createElement('div'); card.className = 'stat';
        const caption = document.createElement('span'); caption.textContent = label;
        const count = document.createElement('strong'); count.textContent = String(value ?? 0);
        card.append(caption, count); return card;
      }));
    } catch (error) {
      stats.textContent = '概览加载失败：' + error.message;
    }
  }

  function cells(section, item) {
    switch (section) {
      case 'users': return [item.email, date(item.entitlement_until), date(item.last_login), item.active_sessions, date(item.desk_sync), date(item.candle_sync)];
      case 'codes': return ['#' + item.id, item.days + ' 天', item.redeemed_count + ' / ' + item.max_redemptions, date(item.created_at), date(item.expires_at)];
      case 'redemptions': return [item.email, '#' + item.code_id, item.days + ' 天', date(item.redeemed_at)];
      case 'logins': return [item.email, item.event_type === 'register' ? '注册' : '登录', item.ip_address, date(item.created_at)];
      case 'messages': return [item.email, item.message, date(item.created_at)];
      default: return [];
    }
  }

  function renderSection(section, items, nextOffset) {
    const panel = document.querySelector('[data-section="' + section + '"]');
    const body = panel.querySelector('tbody');
    body.replaceChildren();
    if (!items.length) {
      const row = body.insertRow(); const cell = row.insertCell();
      cell.colSpan = panel.querySelectorAll('th').length; cell.className = 'empty'; cell.textContent = '暂无记录';
    } else {
      for (const item of items) {
        const row = body.insertRow();
        cells(section, item).forEach((value, index) => {
          const cell = row.insertCell(); cell.textContent = value == null ? '—' : String(value);
          if (section === 'messages' && index === 1) cell.className = 'message';
        });
        if (section === 'codes') {
          const cell = row.insertCell();
          if (Number(item.redeemed_count) === 0) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'secondary'; button.textContent = '删除';
            button.setAttribute('aria-label', '删除卡密 #' + item.id);
            button.addEventListener('click', () => deleteCode(item.id, button));
            cell.append(button);
          } else {
            cell.textContent = '已兑换';
          }
        }
      }
    }
    const pager = panel.querySelector('.pager'); pager.replaceChildren();
    const previous = document.createElement('button'); previous.className = 'secondary'; previous.textContent = '上一页'; previous.disabled = offsets[section] === 0;
    previous.addEventListener('click', () => loadSection(section, Math.max(0, offsets[section] - 50)));
    const label = document.createElement('span'); label.textContent = '第 ' + (Math.floor(offsets[section] / 50) + 1) + ' 页';
    const next = document.createElement('button'); next.className = 'secondary'; next.textContent = '下一页'; next.disabled = nextOffset == null;
    next.addEventListener('click', () => loadSection(section, nextOffset));
    pager.append(previous, label, next);
  }

  async function loadSection(section, offset) {
    offsets[section] = offset;
    const panel = document.querySelector('[data-section="' + section + '"]');
    try {
      const data = await request('/api/admin/dashboard?section=' + section + '&offset=' + offset);
      if (section === 'codes' && offset > 0 && !data.items.length) return loadSection(section, Math.max(0, offset - 50));
      renderSection(section, data.items, data.nextOffset);
    } catch (error) {
      panel.querySelector('tbody').replaceChildren();
      panel.querySelector('.pager').textContent = '加载失败：' + error.message;
      if (error.status === 401 || error.status === 403) showLogin('登录已失效或没有管理权限，请重新登录。');
    }
  }

  async function deleteCode(id, button) {
    if (!window.confirm('确定删除卡密 #' + id + ' 吗？删除后，持有这张卡密的人将无法兑换，且无法恢复。')) return;
    const notice = $('codeListNotice'); notice.className = 'notice'; notice.textContent = '正在删除卡密 #' + id + '…';
    button.disabled = true;
    try {
      await request('/api/admin/activation-codes/' + id, { method: 'DELETE' });
      notice.className = 'notice good'; notice.textContent = '卡密 #' + id + ' 已删除。';
      await Promise.all([loadOverview(), loadSection('codes', offsets.codes)]);
    } catch (error) {
      notice.textContent = '删除失败：' + error.message;
      button.disabled = false;
      if (error.status === 409 || error.status === 404) await loadSection('codes', offsets.codes);
      if (error.status === 401 || error.status === 403) showLogin('登录已失效或没有管理权限，请重新登录。');
    }
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const notice = $('loginNotice'); notice.textContent = '正在验证管理账号…';
    const button = event.submitter; button.disabled = true;
    try {
      let data, challengeToken = '';
      for (;;) {
        const response = await fetch(API + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: $('account').value.trim(), password: $('password').value, turnstileToken: challengeToken })
        });
        data = await response.json();
        if (response.ok) break;
        if (data.error === 'challenge_required' || data.error === 'challenge_failed') {
          challengeToken = await window.YingLoginChallenge();
          continue;
        }
        throw new Error(data.message || '登录失败');
      }
      if (!data.user?.canViewMessages) throw new Error('此账号没有管理权限');
      token = data.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      $('password').value = '';
      notice.textContent = '';
      await openDashboard(data.user);
    } catch (error) { notice.textContent = error.message; }
    finally { button.disabled = false; }
  });

  $('codeForm').addEventListener('submit', async event => {
    event.preventDefault();
    const days = Number($('days').value), count = Number($('count').value);
    const note = $('codeNotice'); note.className = 'notice';
    if (!Number.isInteger(days) || days < 1 || days > 3650 || !Number.isInteger(count) || count < 1 || count > 100) {
      note.textContent = '请填写 1–3650 天、1–100 张卡密。'; return;
    }
    const button = event.submitter; button.disabled = true; note.textContent = '正在生成…';
    $('codeResult').value = ''; $('copyCodes').disabled = true;
    try {
      const data = await request('/api/admin/activation-codes', { method: 'POST', body: JSON.stringify({ days, count }) });
      $('codeResult').value = data.codes.join('\n'); $('copyCodes').disabled = false;
      note.className = 'notice good'; note.textContent = '生成成功，请立即复制保存。';
      await Promise.all([loadOverview(), loadSection('codes', 0)]);
    } catch (error) { note.textContent = '生成失败：' + error.message; }
    finally { button.disabled = false; }
  });

  $('copyCodes').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('codeResult').value); $('codeNotice').textContent = '卡密已复制。'; }
    catch (_) { $('codeResult').select(); $('codeNotice').textContent = '请复制已选中的卡密。'; }
  });

  $('logout').addEventListener('click', async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    token = ''; try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    showLogin('已退出管理账号。');
  });

  if (!token) showLogin();
  else request('/api/auth/me').then(data => {
    if (!data.user?.canViewMessages) { showLogin('当前登录账号没有管理权限，请使用管理账号登录。'); return; }
    openDashboard(data.user);
  }).catch(() => showLogin('登录状态已失效，请重新登录。'));
})();
