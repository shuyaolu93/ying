(function () {
  'use strict';

  var cover = document.getElementById('bookCover');
  var canvas = document.getElementById('coverParticles');
  if (!cover || !canvas || !canvas.getContext) return;

  var context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var points = [];
  var frame = 0;
  var lastFrame = 0;
  var width = 0;
  var height = 0;

  function randomSpread() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  function resize() {
    width = Math.max(1, cover.clientWidth);
    height = Math.max(1, cover.clientHeight);
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    var count = Math.min(3200, Math.max(850, Math.round(width * 1.9)));
    points = [];
    for (var i = 0; i < count; i += 1) {
      var band = i < count * .51 ? 0 : 1;
      var x = band ? .22 + Math.random() * .8 : Math.random() * .8;
      var color = band
        ? (Math.random() < .16 ? '174,146,255' : '99,119,249')
        : (Math.random() < .18 ? '214,167,240' : '202,89,176');
      points.push({
        x: x,
        spread: randomSpread(),
        phase: Math.random() * Math.PI * 2,
        size: .55 + Math.random() * 1.5,
        color: color,
        opacity: .13 + Math.random() * .55,
        band: band
      });
    }
    for (var j = 0; j < Math.min(650, Math.round(width * .38)); j += 1) {
      points.push({
        x: Math.random(),
        y: Math.random(),
        phase: Math.random() * Math.PI * 2,
        size: .4 + Math.random() * 1.1,
        color: '195,198,236',
        opacity: .08 + Math.random() * .25,
        band: 2
      });
    }
    draw(0);
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    for (var i = 0; i < points.length; i += 1) {
      var point = points[i];
      var x = point.x * width;
      var y;
      if (point.band === 2) {
        y = point.y * height;
      } else if (point.band === 0) {
        y = height * (.70 - .16 * point.x)
          + Math.sin(point.x * 10.5 + time * .00024) * height * .063
          + point.spread * height * .22;
      } else {
        y = height * (.52 - .20 * point.x)
          + Math.sin(point.x * 10.2 + 1.7 + time * .00019) * height * .080
          + point.spread * height * .19;
      }
      var shimmer = reducedMotion.matches ? 1 : .8 + .2 * Math.sin(time * .0014 + point.phase);
      context.fillStyle = 'rgba(' + point.color + ',' + (point.opacity * shimmer) + ')';
      context.fillRect(x, y, point.size, point.size);
    }
  }

  function isVisible() {
    return !document.hidden && (document.body.classList.contains('auth-gated') || document.body.classList.contains('home-intro'));
  }

  function animate(time) {
    if (!isVisible() || reducedMotion.matches) { frame = 0; return; }
    if (time - lastFrame >= 32) {
      draw(time);
      lastFrame = time;
    }
    frame = window.requestAnimationFrame(animate);
  }

  function updateAnimation() {
    if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
    if (!isVisible()) return;
    if (cover.clientWidth !== width || cover.clientHeight !== height) resize();
    else draw(0);
    if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('resize', function () { resize(); updateAnimation(); }, { passive: true });
  document.addEventListener('visibilitychange', updateAnimation);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', updateAnimation);
  new MutationObserver(updateAnimation).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  resize();
  updateAnimation();
}());
