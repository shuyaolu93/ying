(function () {
  'use strict';
  var API = 'https://ronghe-risk-free.shuyaolu93.workers.dev';
  var tokenKey = 'rongheAuthTokenV1';
  var user = null;
  var token = '';
  try { token = localStorage.getItem(tokenKey) || ''; } catch (error) {}
  var authEpoch = 0;
  function request(path, options) {
    var sentToken = token;
    options = options || {}; options.headers = Object.assign({ 'content-type': 'application/json' }, options.headers || {});
    if (token) options.headers.authorization = 'Bearer ' + token;
    return fetch(API + path, options).then(function (response) { return response.json().then(function (data) { if (sentToken !== token) { var stale = new Error('账户已切换'); stale.stale = true; throw stale; } if (!response.ok) throw new Error(data.message || data.error || '请求失败'); return data; }); });
  }
  function show(message, good) { var note = document.getElementById('authNote'); if (!note) return; note.textContent = message; note.className = 'auth-note ' + (good ? 'good' : 'bad'); }
  function coverMessage(message, good) { var note = document.getElementById('coverNote'); if (!note) return; note.textContent = message || ''; note.style.color = good ? '#2f7d5c' : '#b63b2b'; }
  function enterApp() { document.body.classList.remove('auth-gated'); coverMessage(''); }
  function showCover(message) { document.body.classList.add('auth-gated'); if (message) coverMessage(message); }
  function active() { return Boolean(user && user.active && new Date(user.entitlementUntil).getTime() > Date.now()); }
  function render() {
    var button = document.getElementById('accountButton'); if (!button) return;
    button.textContent = user ? (active() ? '账户 · ' + user.email : '兑换卡密 · ' + user.email) : '登录 / 注册';
    button.classList.toggle('active', Boolean(user)); renderCenter();
  }
  function close() { var modal = document.getElementById('authModal'); if (modal) modal.hidden = true; }
  function open() { var modal = document.getElementById('authModal'); if (modal) { modal.hidden = false; render(); } }
  function syncAccount() {
    var epoch = ++authEpoch;
    showCover(); render();
    var scope = active() ? String(user.id) : null;
    return Promise.resolve(window.RongheDesk ? window.RongheDesk.setAccount(scope) : null).then(function () {
      if (epoch !== authEpoch) return;
      if (active()) { close(); enterApp(); }
      else if (user) { coverMessage('请兑换有效卡密后进入研究室'); open(); }
    });
  }
  function save(data) {
    var sameAccount = active() && data.user && data.user.active && new Date(data.user.entitlementUntil).getTime() > Date.now() && user.id === data.user.id;
    token = data.token || token; user = data.user || user;
    try { if (token) localStorage.setItem(tokenKey, token); } catch (error) { show('浏览器存储不可用，本次登录仅在当前会话有效'); }
    if (sameAccount) { render(); return Promise.resolve(); }
    return syncAccount();
  }
  function clear(error) {
    if (error && error.stale) return;
    authEpoch += 1; token = ''; user = null;
    try { localStorage.removeItem(tokenKey); } catch (error) {}
    if (window.RongheDesk) window.RongheDesk.setAccount(null);
    render(); showCover();
  }
  function logout() {
    request('/api/auth/logout', { method: 'POST' }).catch(function () {});
    clear(); close();
    ['authPassword', 'coverPassword', 'authCode'].forEach(function (id) {
      var field = document.getElementById(id); if (field) field.value = '';
    });
    window.scrollTo(0, 0);
    coverMessage('已退出登录', true);
    var email = document.getElementById('coverEmail'); if (email) email.focus();
  }
  function mount() {
    var pill = document.querySelector('.live-pill'); if (!pill) return;
    pill.outerHTML = '<div class="account-controls"><button type="button" class="account-button" id="accountButton">登录 / 注册</button><button type="button" class="account-button" id="headerLogout">退出登录</button></div>';
    var overlay = document.createElement('div'); overlay.id = 'authModal'; overlay.className = 'auth-overlay'; overlay.hidden = true;
    overlay.innerHTML = '<section class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="authTitle"><button type="button" class="auth-close" id="authClose">×</button><h2 id="authTitle">账户与卡密</h2><p class="auth-subtitle">登录并兑换有效卡密后进入研究室。研究草稿与快照保存在当前浏览器，按账户区分。</p><label>邮箱<input id="authEmail" type="email" autocomplete="email" placeholder="name@example.com"></label><label>密码<input id="authPassword" type="password" autocomplete="current-password" placeholder="至少 8 位"></label><div class="auth-actions"><button type="button" class="primary" id="authLogin">登录</button><button type="button" class="secondary" id="authRegister">注册</button></div><div class="auth-divider"></div><label>卡密<input id="authCode" type="text" autocomplete="off" placeholder="兑换卡密，例如 RONGHE-XXXX"></label><button type="button" class="primary auth-redeem" id="authRedeem">兑换卡密</button><button type="button" class="auth-logout" id="authLogout">退出登录</button><div class="account-center"><b>个人中心</b><span id="accountExpiry">卡密到期日：未兑换</span><label>新密码<input id="newPassword" type="password" placeholder="至少 8 位"></label><button type="button" class="secondary" id="changePassword">修改密码</button><label>留言板<textarea id="messageBoardInput" rows="2" placeholder="留下你的留言"></textarea></label><button type="button" class="secondary" id="postMessage">发布留言</button><div id="messageBoardList"></div></div><div id="authNote" class="auth-note"></div></section>';
    document.body.appendChild(overlay);
    document.getElementById('accountButton').addEventListener('click', open); document.getElementById('authClose').addEventListener('click', close);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    document.getElementById('authLogin').addEventListener('click', function () { request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('authEmail').value, password: document.getElementById('authPassword').value }) }).then(function (data) { save(data); show('登录成功', true); }).catch(function (error) { show(error.message); }); });
    document.getElementById('authRegister').addEventListener('click', function () { request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: document.getElementById('authEmail').value, password: document.getElementById('authPassword').value }) }).then(function (data) { save(data); show('注册成功，请兑换卡密', true); }).catch(function (error) { show(error.message); }); });
    document.getElementById('authRedeem').addEventListener('click', function () { if (!token) return show('请先登录'); request('/api/auth/redeem', { method: 'POST', body: JSON.stringify({ code: document.getElementById('authCode').value.trim() }) }).then(function (data) { return save(data).then(function () { var until = data.user && data.user.entitlementUntil ? String(data.user.entitlementUntil).slice(0, 10) : '未知'; show('兑换成功，有效期至 ' + until, true); }); }).catch(function (error) { show(error.message); }); });
    document.getElementById('authLogout').addEventListener('click', logout);
    function renderCenter(){var e=document.getElementById('accountExpiry'); if(e) e.textContent='卡密到期日：'+(user&&user.entitlementUntil?String(user.entitlementUntil).slice(0,10):'未兑换'); var list=document.getElementById('messageBoardList'); if(list){var key='yingMessages:'+((user&&user.id)||'guest'); var rows=[]; try{rows=JSON.parse(localStorage.getItem(key)||'[]')}catch(_e){} list.innerHTML=rows.map(function(x){return '<p>'+String(x).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})+'</p>'}).join('')||'<small>暂无留言</small>';}}
    document.getElementById('changePassword').addEventListener('click',function(){var p=document.getElementById('newPassword').value;if(p.length<8)return show('新密码至少 8 位');request('/api/auth/password',{method:'POST',body:JSON.stringify({password:p})}).then(function(){show('密码已修改，请重新登录',true);setTimeout(logout,500)}).catch(function(e){show(e.message)});});
    document.getElementById('postMessage').addEventListener('click',function(){var f=document.getElementById('messageBoardInput'),v=f.value.trim();if(!v)return show('请输入留言');var key='yingMessages:'+((user&&user.id)||'guest'),rows=[];try{rows=JSON.parse(localStorage.getItem(key)||'[]')}catch(_e){}rows.unshift(v);localStorage.setItem(key,JSON.stringify(rows.slice(0,50)));f.value='';renderCenter();show('留言已保存',true)});
    document.getElementById('headerLogout').addEventListener('click', logout);
    renderCenter(); if (document.getElementById('coverAccount')) document.getElementById('coverAccount').addEventListener('click', open);
    var coverForm = document.getElementById('coverAuthForm');
    var coverEmail = document.getElementById('coverEmail');
    var coverPassword = document.getElementById('coverPassword');
    if (coverForm) coverForm.addEventListener('submit', function (event) {
      event.preventDefault();
      coverMessage('正在验证…');
      request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: coverEmail.value, password: coverPassword.value }) }).then(function (data) { save(data); }).catch(function (error) { coverMessage(error.message); });
    });
    if (document.getElementById('coverRegister')) document.getElementById('coverRegister').addEventListener('click', function () {
      coverMessage('正在创建账户…');
      request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: coverEmail.value, password: coverPassword.value }) }).then(function (data) { save(data); }).catch(function (error) { coverMessage(error.message); });
    });
    if (token) request('/api/auth/me').then(function (data) { return save(data); }).catch(clear); else { render(); showCover(); }
    window.setInterval(function () {
      if (!user) return;
      if (!active()) syncAccount();
      else request('/api/auth/me').then(save).catch(clear);
    }, 60000);
  }
  window.RongheAuth = { getToken: function () { return token; }, isActive: active, open: open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
}());
