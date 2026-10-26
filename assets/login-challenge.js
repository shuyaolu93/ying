(() => {
  'use strict';
  const sitekey = '0x4AAAAAAFnDu_um5rSw2Khi';
  let loading;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('验证暂时无法加载'));
      script.onerror = () => reject(new Error('验证暂时无法加载'));
      document.head.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  window.YingLoginChallenge = () => new Promise((resolve, reject) => {
    const shade = document.createElement('div');
    shade.className = 'login-challenge-shade';
    const panel = document.createElement('div');
    panel.className = 'login-challenge-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '登录安全验证');
    const title = document.createElement('h2');
    title.textContent = '登录安全验证';
    const note = document.createElement('p');
    note.textContent = '登录尝试较多，请完成验证后继续。';
    const widget = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = '取消';
    panel.append(title, note, widget, cancel);
    shade.append(panel);
    document.body.append(shade);
    let widgetId;
    let done = false;
    const finish = (error, token) => {
      if (done) return;
      done = true;
      if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId);
      shade.remove();
      if (error) reject(error); else resolve(token);
    };
    cancel.onclick = () => finish(new Error('已取消验证'));
    loadTurnstile().then(turnstile => {
      if (done) return;
      widgetId = turnstile.render(widget, {
        sitekey, action: 'login',
        callback: token => finish(null, token),
        'error-callback': () => finish(new Error('验证暂时无法完成，请稍后重试')),
        'expired-callback': () => turnstile.reset(widgetId)
      });
    }).catch(error => finish(error));
    cancel.focus();
  });
})();
