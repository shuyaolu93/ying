(function () {
  'use strict';
  var API = 'https://ronghe-risk-free.shuyaolu93.workers.dev';
  var token = '';
  var blocked = false;
  var checking = false;
  var interval = null;
  try { token = localStorage.getItem('rongheAuthTokenV1') || ''; } catch (error) {}

  function block(message) {
    if (blocked) return;
    blocked = true;
    if (interval) clearInterval(interval);
    document.body.classList.remove('auth-pending');
    document.body.innerHTML = '<main style="max-width:560px;margin:18vh auto;padding:32px;text-align:center;font-family:system-ui;color:#171717"><h1>日本蜡烛图</h1><p>' + message + '</p><a href="./index.html" style="display:inline-block;padding:12px 20px;border:1px solid #aaa;border-radius:999px;text-decoration:none;color:inherit">返回登录并兑换卡密</a></main>';
  }

  function check() {
    if (blocked || checking) return;
    checking = true;
    fetch(API + '/api/auth/me', { cache: 'no-store', headers: { authorization: 'Bearer ' + token } })
      .then(async function (response) {
        const data = await response.json();
        if (!response.ok || !data.user || !data.user.active ||
            new Date(data.user.entitlementUntil).getTime() <= Date.now()) throw new Error('inactive');
        if (typeof window.yingCandleLoad !== 'function') throw new Error('catalogue');
        await window.yingCandleLoad(token);
        if (!blocked) document.body.classList.remove('auth-pending');
      })
      .catch(function (error) {
        block(error.message === 'inactive' ? '登录已失效或卡密已到期，请重新登录并兑换。' : '暂时无法加载图谱，请刷新页面重试。');
      })
      .finally(function () { checking = false; });
  }

  if (!token) {
    block('请先登录账号并兑换有效卡密后使用。');
    return;
  }
  check();
  interval = setInterval(check, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) check();
  });
}());
