(function () {
  'use strict';

  var cover = document.getElementById('bookCover');
  var canvas = document.getElementById('coverParticles');
  if (!cover || !canvas) return;
  var glow = document.getElementById('coverPointerGlow');
  var pointer = { targetX: .5, targetY: .5, targetStrength: 0, x: .5, y: .5, strength: 0 };
  var renderPointer = null;

  cover.addEventListener('pointermove', function (event) {
    if (event.pointerType === 'touch') return;
    var bounds = cover.getBoundingClientRect();
    pointer.targetX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    pointer.targetY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    pointer.targetStrength = 1;
    if (glow) {
      glow.style.transform = 'translate3d(' + (event.clientX - bounds.left - 140) + 'px,' + (event.clientY - bounds.top - 140) + 'px,0)';
      glow.style.opacity = '1';
    }
    if (renderPointer) renderPointer();
  }, { passive: true });
  cover.addEventListener('pointerleave', function () {
    pointer.targetStrength = 0;
    if (glow) glow.style.opacity = '0';
    if (renderPointer) renderPointer();
  });

  function useCanvasFallback() {
    var replacement = canvas.cloneNode(false);
    replacement.dataset.renderer = 'canvas2d';
    replacement.coverPointer = pointer;
    canvas.replaceWith(replacement);
    var script = document.createElement('script');
    script.src = 'assets/home-cover.js?v=4';
    document.body.appendChild(script);
  }

  var gl;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }); }
  catch (error) {}
  if (!gl) { useCanvasFallback(); return; }

  var vertexSource = [
    'attribute vec4 a_seed;',
    'attribute vec4 a_meta;',
    'uniform float u_time;',
    'uniform float u_ratio;',
    'uniform vec2 u_mouse;',
    'uniform vec2 u_resolution;',
    'uniform float u_mouse_strength;',
    'uniform float u_mouse_radius;',
    'varying vec4 v_color;',
    'void main() {',
    '  float band = a_meta.x;',
    '  float x = a_seed.x;',
    '  float y = a_seed.y;',
    '  vec3 color = vec3(.78, .80, .94);',
    '  if (band < 2.5 || band > 3.5) x = mod(a_seed.x + u_time * a_meta.z, 1.18) - .09;',
    '  if (band < .5) {',
    '    y = .68 - .08 * x + .079 * sin(x * 9.7 + u_time * .69)',
    '      + .024 * sin(x * 20.0 - u_time * .34 + a_seed.z * .16) + a_seed.y * .18;',
    '    color = vec3(.94, .34, .73);',
    '  } else if (band < 1.5) {',
    '    y = .43 - .19 * x + .092 * sin(x * 9.1 + 1.6 + u_time * .62)',
    '      + .025 * sin(x * 18.0 + u_time * .31 + a_seed.z * .18) + a_seed.y * .19;',
    '    color = vec3(.38, .53, 1.0);',
    '  } else if (band < 2.5) {',
    '    y = .50 - .09 * x + .097 * sin(x * 11.0 + .7 + u_time * .55)',
    '      + a_seed.y * .105;',
    '    color = vec3(.73, .48, .97);',
    '  } else if (band > 3.5) {',
    '    y = .55 - .12 * x + .084 * sin(x * 9.5 + u_time * .66);',
    '    color = vec3(.94, .91, 1.0);',
    '  }',
    '  if (a_meta.w > .86) color = mix(color, vec3(.98, .94, 1.0), .80);',
    '  float edge = smoothstep(-.09, .015, x) * (1.0 - smoothstep(.985, 1.09, x));',
    '  vec2 parallax = (u_mouse - .5) * u_mouse_strength * .014 * (1.0 - a_meta.y * .5);',
    '  x += parallax.x;',
    '  y += parallax.y;',
    '  vec2 fromMouse = (vec2(x, y) - u_mouse) * u_resolution;',
    '  float distancePx = length(fromMouse);',
    '  float effect = u_mouse_strength * (1.0 - smoothstep(0.0, u_mouse_radius, distancePx));',
    '  vec2 normal = fromMouse / max(distancePx, .001);',
    '  vec2 tangent = vec2(-normal.y, normal.x);',
    '  vec2 displacement = normal * (20.0 * effect)',
    '    + tangent * (7.0 * effect * sin(u_time * 3.0 + a_seed.z));',
    '  x += displacement.x / u_resolution.x;',
    '  y += displacement.y / u_resolution.y;',
    '  color = mix(color, vec3(.99, .97, 1.0), effect * .84);',
    '  float shimmer = .83 + .17 * sin(u_time * 2.6 + a_seed.z);',
    '  v_color = vec4(color, min(1.0, a_meta.y * shimmer * edge + effect * .52));',
    '  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);',
    '  gl_PointSize = max(1.0, (a_seed.w + effect * 1.2) * u_ratio);',
    '}'
  ].join('\n');

  var fragmentSource = [
    'precision mediump float;',
    'varying vec4 v_color;',
    'void main() {',
    '  float radius = length(gl_PointCoord - vec2(.5));',
    '  float shape = 1.0 - smoothstep(.38, .54, radius);',
    '  gl_FragColor = vec4(v_color.rgb, v_color.a * shape);',
    '}'
  ].join('\n');

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || '粒子着色器编译失败');
    return shader;
  }

  var program;
  var buffer;
  var timeUniform;
  var ratioUniform;
  var mouseUniform;
  var resolutionUniform;
  var mouseStrengthUniform;
  var mouseRadiusUniform;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || '粒子程序链接失败');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    var seedLocation = gl.getAttribLocation(program, 'a_seed');
    var metaLocation = gl.getAttribLocation(program, 'a_meta');
    gl.enableVertexAttribArray(seedLocation);
    gl.enableVertexAttribArray(metaLocation);
    gl.vertexAttribPointer(seedLocation, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(metaLocation, 4, gl.FLOAT, false, 32, 16);
    timeUniform = gl.getUniformLocation(program, 'u_time');
    ratioUniform = gl.getUniformLocation(program, 'u_ratio');
    mouseUniform = gl.getUniformLocation(program, 'u_mouse');
    resolutionUniform = gl.getUniformLocation(program, 'u_resolution');
    mouseStrengthUniform = gl.getUniformLocation(program, 'u_mouse_strength');
    mouseRadiusUniform = gl.getUniformLocation(program, 'u_mouse_radius');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  } catch (error) {
    useCanvasFallback();
    return;
  }

  canvas.dataset.renderer = 'webgl';
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var count = 0;
  var width = 0;
  var height = 0;
  var ratio = 1;
  var frame = 0;
  var lastFrame = 0;
  var startTime = performance.now();
  var destroyed = false;

  function spread() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  function resize() {
    if (destroyed) return;
    width = Math.max(1, cover.clientWidth);
    height = Math.max(1, cover.clientHeight);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);

    count = Math.min(65000, Math.max(16000, Math.round(width * height * .026)));
    var data = new Float32Array((count + 3) * 8);
    for (var i = 0; i < count; i += 1) {
      var band = i < count * .44 ? 0 : i < count * .85 ? 1 : i < count * .95 ? 2 : 3;
      var x = band === 0 ? Math.pow(Math.random(), 1.1) * .91
        : band === 1 ? .25 + Math.random() * .77
        : band === 2 ? .33 + Math.random() * .48 : Math.random();
      var highlight = Math.random() > .86;
      var offset = i * 8;
      data[offset] = x;
      data[offset + 1] = band === 3 ? Math.random() : spread();
      data[offset + 2] = Math.random() * Math.PI * 2;
      data[offset + 3] = band === 3 ? .6 + Math.random() * .9
        : highlight ? 1.6 + Math.random() * 1.6 : .78 + Math.random() * 1.10;
      data[offset + 4] = band;
      data[offset + 5] = band === 3 ? .14 + Math.random() * .39
        : highlight ? .72 + Math.random() * .27 : .36 + Math.random() * .55;
      data[offset + 6] = band === 3 ? 0 : .018 + Math.random() * .032;
      data[offset + 7] = Math.random();
    }
    for (var j = 0; j < 3; j += 1) {
      var index = (count + j) * 8;
      data[index] = .16 + j * .30;
      data[index + 1] = 0;
      data[index + 2] = j * 2.0;
      data[index + 3] = 3.2 + j;
      data[index + 4] = 4;
      data[index + 5] = .93;
      data[index + 6] = .025 + j * .004;
      data[index + 7] = 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    draw(0);
  }

  function draw(seconds) {
    if (destroyed) return;
    var smoothing = reducedMotion.matches ? 1 : .18;
    pointer.x += (pointer.targetX - pointer.x) * smoothing;
    pointer.y += (pointer.targetY - pointer.y) * smoothing;
    pointer.strength += (pointer.targetStrength - pointer.strength) * smoothing;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(timeUniform, seconds);
    gl.uniform1f(ratioUniform, ratio);
    gl.uniform2f(mouseUniform, pointer.x, pointer.y);
    gl.uniform2f(resolutionUniform, width, height);
    gl.uniform1f(mouseStrengthUniform, pointer.strength);
    gl.uniform1f(mouseRadiusUniform, Math.max(90, Math.min(160, width * .105)));
    gl.drawArrays(gl.POINTS, 0, count + 3);
  }

  function visible() {
    return !destroyed && !document.hidden && (document.body.classList.contains('auth-gated') || document.body.classList.contains('home-intro'));
  }

  function animate(now) {
    if (!visible() || reducedMotion.matches) { frame = 0; return; }
    if (now - lastFrame >= 32) {
      draw((now - startTime) / 1000);
      lastFrame = now;
    }
    frame = window.requestAnimationFrame(animate);
  }

  function update() {
    if (destroyed) return;
    if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
    if (!visible()) return;
    if (width !== cover.clientWidth || height !== cover.clientHeight) resize();
    else draw((performance.now() - startTime) / 1000);
    if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);
  }

  renderPointer = function () {
    if (reducedMotion.matches && visible()) draw((performance.now() - startTime) / 1000);
  };

  canvas.addEventListener('webglcontextlost', function (event) {
    event.preventDefault();
    destroyed = true;
    if (frame) window.cancelAnimationFrame(frame);
    useCanvasFallback();
  }, { once: true });
  window.addEventListener('resize', function () { resize(); update(); }, { passive: true });
  document.addEventListener('visibilitychange', update);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', update);
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  resize();
  update();
}());
