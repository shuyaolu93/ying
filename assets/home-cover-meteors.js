(function () {
  'use strict';

  var cover = document.getElementById('bookCover');
  var canvas = document.getElementById('coverMeteors');
  if (!cover || !canvas) return;
  var context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  var mobile = window.matchMedia('(max-width: 700px), (max-height: 500px) and (pointer: coarse)');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var width = 0;
  var height = 0;
  var frame = 0;
  var nextMeteorAt = 0;
  var meteors = [];

  function visible() {
    return !mobile.matches && !reducedMotion.matches && !document.hidden &&
      (document.body.classList.contains('auth-gated') || document.body.classList.contains('home-intro'));
  }

  function resize() {
    width = cover.clientWidth;
    height = cover.clientHeight;
    if (!width || !height) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function spawn(now) {
    var bright = Math.random() < .22;
    var angle = (Math.random() * .7 - .25);
    var travel = (bright ? 140 : 85) + Math.random() * (bright ? 135 : 105);
    meteors.push({
      born: now,
      duration: (bright ? 560 : 420) + Math.random() * 280,
      x: width * (.05 + Math.random() * .72),
      y: height * (.07 + Math.random() * .58),
      dx: travel,
      dy: travel * angle,
      tail: (bright ? 90 : 45) + Math.random() * (bright ? 80 : 60),
      alpha: bright ? .95 : .50 + Math.random() * .22,
      thickness: bright ? 1.35 : .75 + Math.random() * .45
    });
  }

  function draw(now) {
    context.clearRect(0, 0, width, height);
    meteors = meteors.filter(function (meteor) { return now - meteor.born < meteor.duration; });
    meteors.forEach(function (meteor) {
      var progress = Math.max(0, Math.min(1, (now - meteor.born) / meteor.duration));
      var fade = Math.min(1, progress / .13, (1 - progress) / .28);
      var opacity = meteor.alpha * Math.max(0, fade);
      if (opacity <= 0) return;
      var distance = Math.hypot(meteor.dx, meteor.dy);
      var tail = meteor.tail * Math.min(1, progress * 5);
      var x = meteor.x + meteor.dx * progress;
      var y = meteor.y + meteor.dy * progress;
      var tailX = x - meteor.dx / distance * tail;
      var tailY = y - meteor.dy / distance * tail;
      var gradient = context.createLinearGradient(tailX, tailY, x, y);
      gradient.addColorStop(0, 'rgba(197,219,255,0)');
      gradient.addColorStop(.55, 'rgba(206,225,255,' + (opacity * .28) + ')');
      gradient.addColorStop(1, 'rgba(250,253,255,' + opacity + ')');
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(x, y);
      context.lineWidth = meteor.thickness;
      context.strokeStyle = gradient;
      context.shadowColor = '#d6e7ff';
      context.shadowBlur = 4;
      context.stroke();
      context.shadowBlur = 7;
      context.fillStyle = 'rgba(255,255,255,' + opacity + ')';
      context.beginPath();
      context.arc(x, y, meteor.thickness * .8, 0, Math.PI * 2);
      context.fill();
    });
    context.shadowBlur = 0;
  }

  function animate(now) {
    if (!visible()) { frame = 0; return; }
    if (width !== cover.clientWidth || height !== cover.clientHeight) resize();
    if (now >= nextMeteorAt) {
      spawn(now);
      nextMeteorAt = now + 480 + Math.random() * 920;
    }
    draw(now);
    frame = window.requestAnimationFrame(animate);
  }

  function update() {
    if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
    if (!visible()) { meteors = []; context.clearRect(0, 0, width, height); return; }
    resize();
    nextMeteorAt = performance.now() + 250;
    frame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('resize', update, { passive: true });
  document.addEventListener('visibilitychange', update);
  if (mobile.addEventListener) mobile.addEventListener('change', update);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', update);
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  update();
}());
