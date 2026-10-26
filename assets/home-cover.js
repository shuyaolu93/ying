(function () {
  'use strict';

  var cover = document.getElementById('bookCover');
  var canvas = document.getElementById('coverParticles');
  if (!cover || !canvas || !canvas.getContext) return;

  var context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  var pointer = canvas.coverPointer || { targetX: .5, targetY: .5, targetStrength: 0 };

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
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    var count = Math.min(20000, Math.max(9000, Math.round(width * height * .016)));
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
        speed: .7 + Math.random() * .7,
        size: .8 + Math.random() * 1.5,
        color: color,
        opacity: .27 + Math.random() * .62,
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
      var progress = point.band === 2 ? point.x : (point.x + time * (point.band ? .000035 : .000028) * point.speed) % 1.2 - .1;
      var x = progress * width;
      var y;
      if (point.band === 2) {
        y = point.y * height;
      } else if (point.band === 0) {
        y = height * (.70 - .16 * progress)
          + Math.sin(progress * 10.5 + time * .00082) * height * .075
          + point.spread * height * .20;
      } else {
        y = height * (.52 - .20 * progress)
          + Math.sin(progress * 10.2 + 1.7 + time * .00068) * height * .095
          + point.spread * height * .18;
      }
      var shimmer = reducedMotion.matches ? 1 : .7 + .3 * Math.sin(time * .0028 + point.phase);
      var effect = 0;
      if (pointer.targetStrength) {
        var dx = x - pointer.targetX * width;
        var dy = y - pointer.targetY * height;
        var radius = Math.max(90, Math.min(160, width * .105));
        var distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < radius * radius) {
          var distance = Math.sqrt(distanceSquared);
          effect = (1 - distance / radius) * pointer.targetStrength;
          x += dx / (distance || 1) * 20 * effect;
          y += dy / (distance || 1) * 20 * effect;
        }
      }
      context.fillStyle = 'rgba(' + (effect > .12 ? '243,236,255' : point.color) + ',' + Math.min(1, point.opacity * shimmer + effect * .52) + ')';
      var size = point.size + effect * 1.2;
      context.fillRect(x, y, size, size);
    }
    drawGlint(time, 0);
    drawGlint(time, 1);
  }

  function drawGlint(time, band) {
    var progress = (time * (band ? .000043 : .000034) + (band ? .46 : .08)) % 1.3 - .12;
    var x = progress * width;
    var y = band
      ? height * (.44 - .16 * progress) + Math.sin(progress * 10.2 + 1.7 + time * .00068) * height * .095
      : height * (.76 - .13 * progress) + Math.sin(progress * 10.5 + time * .00082) * height * .075;
    var color = band ? '126,151,255' : '229,111,211';
    var glow = context.createRadialGradient(x, y, 0, x, y, 35);
    glow.addColorStop(0, 'rgba(' + color + ',.62)');
    glow.addColorStop(.2, 'rgba(' + color + ',.22)');
    glow.addColorStop(1, 'rgba(' + color + ',0)');
    context.fillStyle = glow;
    context.fillRect(x - 35, y - 35, 70, 70);
    context.fillStyle = 'rgba(240,233,255,.82)';
    context.beginPath();
    context.arc(x, y, 1.8, 0, Math.PI * 2);
    context.fill();
  }

  function isVisible() {
    return !document.hidden && (document.body.classList.contains('auth-gated') || document.body.classList.contains('home-intro'));
  }

  function animate(time) {
    if (!isVisible() || reducedMotion.matches) { frame = 0; return; }
    if (time - lastFrame >= 50) {
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
  cover.addEventListener('pointermove', function () { if (reducedMotion.matches && isVisible()) draw(0); }, { passive: true });
  cover.addEventListener('pointerleave', function () { if (reducedMotion.matches && isVisible()) draw(0); });
  new MutationObserver(updateAnimation).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  resize();
  updateAnimation();
}());
