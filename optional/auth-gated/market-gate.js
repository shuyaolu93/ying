(function () {
  'use strict';
  var API = 'https://ronghe-risk-free.shuyaolu93.workers.dev';
  var token = '';
  var userId = null;
  var checking = false;
  var active = false;
  var authEpoch = 0;
  try {
    token = sessionStorage.getItem('rongheAuthTokenV1') || localStorage.getItem('rongheAuthTokenV1') || '';
    if (token) sessionStorage.setItem('rongheAuthTokenV1', token);
    localStorage.removeItem('rongheAuthTokenV1');
  } catch (_) {}

  window.RongheAuth = { getToken: function () { return token; }, isActive: function () { return active; } };

  function block(message) {
    active = false;
    userId = null;
    if (window.YingMarket) window.YingMarket.clearAccount();
    document.getElementById('marketAccessMessage').textContent = message;
    document.getElementById('marketAccess').hidden = false;
    document.body.classList.remove('auth-pending');
    document.body.classList.add('auth-blocked');
  }

  async function check() {
    if (checking) return;
    checking = true;
    var currentEpoch = authEpoch;
    try {
      var response = await fetch(API + '/api/auth/me', { cache: 'no-store', headers: { authorization: 'Bearer ' + token } });
      var data = await response.json();
      if (currentEpoch !== authEpoch) return;
      if (!response.ok || !data.user || !data.user.active || new Date(data.user.entitlementUntil).getTime() <= Date.now()) throw new Error('inactive');
      var newlyGranted = !active || userId !== data.user.id;
      if (newlyGranted) {
        if (!window.YingMarket) throw new Error('unavailable');
        await window.YingMarket.setAccount(data.user.id, token);
        if (currentEpoch !== authEpoch) return;
        userId = data.user.id;
      }
      active = true;
      document.getElementById('marketAccess').hidden = true;
      document.body.classList.remove('auth-pending', 'auth-blocked');
      if (newlyGranted) window.dispatchEvent(new Event('ying:unlocked'));
    } catch (error) {
      if (currentEpoch !== authEpoch) return;
      block(error.message === 'inactive' ? '登录已失效或卡密已到期，请重新登录并兑换。' : '暂时无法加载热点页面，请刷新重试。');
    } finally { checking = false; if (currentEpoch !== authEpoch && token) check(); }
  }

  if (!token) block('请先登录账号并兑换有效卡密后使用。');
  else check();
  setInterval(function () { if (token) check(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && token) check(); });
  window.addEventListener('storage', function (event) {
    if (event.key !== 'rongheAuthTokenV1' || event.newValue === token) return;
    token = event.newValue || '';
    authEpoch += 1;
    if (!token) { block('已退出登录，请重新登录并兑换。'); return; }
    active = false;
    if (window.YingMarket) window.YingMarket.clearAccount();
    document.body.classList.remove('auth-blocked');
    document.body.classList.add('auth-pending');
    document.getElementById('marketAccess').hidden = true;
    if (!checking) check();
  });
}());
