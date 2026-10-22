// v16.5: the loading blob. The Dialed In logo (a flavor shape seen from above) that keeps turning into other
// shapes while the app loads. It starts as the logo itself, so the switch from the picture is invisible.
// The turning stays a CSS animation on the holder (smooth even while the phone is busy); this only draws the shape.
// If anything here fails, the holder keeps the logo picture, turning, as before.
try { window.DIBlob = (function () {
  var TAU = Math.PI * 2, K = 6, NS = 72;
  // ---- outlines: a radius for every direction, stored as a few smooth waves so any two blend into each other
  function fourier(s) {
    var n = s.length, c = [0], i, k, j;
    for (i = 0; i < n; i++) c[0] += s[i] / n;
    for (k = 1; k <= K; k++) { var a = 0, b = 0; for (j = 0; j < n; j++) { var t = j / n * TAU; a += s[j] * Math.cos(k * t); b += s[j] * Math.sin(k * t); } c.push(2 * a / n, 2 * b / n); }
    return c;
  }
  function rAt(c, t) { var r = c[0]; for (var k = 1; k <= K; k++) r += c[2 * k - 1] * Math.cos(k * t) + c[2 * k] * Math.sin(k * t); return r; }
  // re-measure an outline from its own middle, scaled so its far edge just fits
  function centered(s, axis) {
    var n = s.length, P = [], j, cx = 0, cy = 0, ar = 0;
    for (j = 0; j < n; j++) { var a = j / n * TAU; P.push([Math.sin(a) * s[j], -Math.cos(a) * s[j]]); }
    for (j = 0; j < n; j++) { var p = P[j], q = P[(j + 1) % n], cr = p[0] * q[1] - q[0] * p[1]; ar += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr; }
    cx /= 3 * ar; cy /= 3 * ar;
    var out = [];
    for (j = 0; j < NS; j++) {
      var th = j / NS * TAU, dx = Math.sin(th), dy = -Math.cos(th), best = 0;
      for (var e = 0; e < n; e++) {
        var A = P[e], B = P[(e + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        var wx = A[0] - cx, wy = A[1] - cy, tt = (wx * ey - wy * ex) / den, uu = (wx * dy - wy * dx) / den;
        if (tt > 0 && uu >= 0 && uu <= 1 && tt > best) best = tt;
      }
      out.push(best);
    }
    var m = Math.max.apply(null, out);
    out = out.map(function (x) { return x / m * 0.96; });
    if (axis === undefined) return out;
    // turn it so its long side points the given way (degrees, 0 = up, clockwise)
    var xx = 0, yy = 0, xy = 0;
    for (j = 0; j < NS; j++) { var a2 = j / NS * TAU, X = Math.sin(a2) * out[j], Y = -Math.cos(a2) * out[j], w2 = out[j] * out[j]; xx += X * X * w2; yy += Y * Y * w2; xy += X * Y * w2; }
    var phi = 0.5 * Math.atan2(2 * xy, xx - yy), now = Math.atan2(Math.cos(phi), -Math.sin(phi)), d = axis / 360 * TAU - now, rot = [];
    for (j = 0; j < NS; j++) { var p2 = (((j / NS * TAU - d) / TAU) % 1 + 1) % 1 * NS, i0 = Math.floor(p2), f = p2 - i0; rot.push(out[i0 % NS] * (1 - f) + out[(i0 + 1) % NS] * f); }
    return rot;
  }
  // a flavor shape's outline: five sliders, smoothed the way the app draws them
  function flavor(v, turn) {
    var N = 5, SEG = TAU / N, out = [], j;
    var g = function (q) { return v[((q % N) + N) % N] / 10; };
    for (j = 0; j < NS; j++) {
      var a = ((j / NS + turn) % 1 + 1) % 1 * TAU, i = Math.floor(a / SEG) % N, u = (a - i * SEG) / SEG;
      var p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      out.push(Math.max(0.12, 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)));
    }
    return out;
  }
  // the logo's own outline, measured every 10 degrees from its middle (0 = up, clockwise)
  var LOGO = [91.5, 84.8, 80.2, 78.8, 82.5, 90.8, 99.8, 108.8, 116.2, 119.2, 119.2, 119.2, 114.8, 108.8, 102.0, 96.0, 91.5, 88.5, 87.0, 87.0, 89.2, 92.2, 95.2, 99.8, 104.2, 108.8, 111.0, 111.8, 112.5, 111.8, 111.0, 108.8, 106.5, 104.2, 101.2, 96.8].map(function (x) { return x / 124; });
  // a shape made straight from waves: [how many bumps, how big, which way]
  function waves(base, terms) {
    var out = [];
    for (var j = 0; j < NS; j++) { var a = j / NS * TAU, r = base; for (var q = 0; q < terms.length; q++) r += terms[q][1] * Math.cos(terms[q][0] * a + terms[q][2]); out.push(r); }
    return out;
  }
  // the shapes it moves through, very different on purpose so you can see it change: the logo (a kidney), a tall
  // snowman, a big round bean, a slanted peanut, a gourd, and a three-leaf clover
  var KEYS = [LOGO, [[10, 3, 5, 10, 3], 0], [[10, 10, 4, 4, 10], 120], [[6, 10, 6, 3, 10], 45], [[10, 4, 10, 10, 4], 175], waves(0.72, [[3, 0.22, 0.6], [2, 0.06, 0.3], [1, 0.03, 2]])].map(function (k, i) {
    return fourier(i === 0 || i === 5 ? k : centered(flavor(k[0], 0), k[1]));
  });
  // the logo's rim colors, every 15 degrees (0 = up, clockwise)
  var RIM = ['#e7b5c6', '#e4b0f3', '#d9b5ec', '#e0bef2', '#babeef', '#96b1ec', '#799cd9', '#7296c3', '#8697aa', '#a49d8b', '#af9d64', '#bea550', '#cca94e', '#cca251', '#c99953', '#c38959', '#cd8766', '#e78c70', '#e99e81', '#eaa784', '#ecac84', '#eeb181', '#eab37f', '#edb296'];
  var GREEN = '#36be8f';
  // how lit each direction around the tip is (0 = up, clockwise), measured from the logo
  var LIGHT = [[0, 1], [28, 1], [42, 0.8], [60, 0.68], [90, 0.52], [125, 0.5], [180, 0.55], [240, 0.57], [270, 0.68], [300, 0.86], [330, 0.98], [360, 1]];
  var STEP = 0.85;   // seconds from one shape to the next
  var ease = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  function coeffsAt(t) {
    var n = KEYS.length, x = Math.max(0, t) / STEP, i = Math.floor(x), u = ease(x - i), a = KEYS[i % n], b = KEYS[(i + 1) % n], out = [];
    for (var j = 0; j < a.length; j++) out.push(a[j] + (b[j] - a[j]) * u);
    return out;
  }
  var ss = function (a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  var bufs = {};
  // draw the blob at time t (seconds) into a square canvas context that is already scaled to S css pixels
  function draw(ctx, S, t, opt) {
    opt = opt || {};
    var c = opt.coeffs || coeffsAt(t), rot = opt.rot || 0;
    var R = S / 2, NPT = S > 60 ? 120 : 64, L = S > 60 ? 40 : 18;
    var pts = [], j, mx = 0, my = 0, far = 0, lw = Math.max(0.7, S / 110);
    for (j = 0; j < NPT; j++) { var a = j / NPT * TAU, r = rAt(c, a) * R; pts.push([Math.sin(a + rot) * r, -Math.cos(a + rot) * r]); mx += pts[j][0] / NPT; my += pts[j][1] / NPT; }
    // centered in its box, and never touching the box's edge (shrunk a little when a shape would)
    for (j = 0; j < NPT; j++) { pts[j][0] -= mx; pts[j][1] -= my; far = Math.max(far, Math.abs(pts[j][0]), Math.abs(pts[j][1])); }
    var breathe = 1 - 0.025 * (1 - Math.cos(t * 2.2)), fit = Math.min(1, (S / 2 - lw - 0.5) / far) * breathe;   // a gentle swell, only ever inward
    for (j = 0; j < NPT; j++) { pts[j][0] *= fit; pts[j][1] *= fit; }
    R *= fit;
    var cx = S / 2, cy = S / 2;
    function trace(x, f) { x.beginPath(); for (var j = 0; j < NPT; j++) { var X = cx + pts[j][0] * f, Y = cy + pts[j][1] * f; if (j) x.lineTo(X, Y); else x.moveTo(X, Y); } x.closePath(); }
    // a shape-shaped fade: solid in the middle, gone by the rim (layers that add up to exactly the right amount)
    function fade(x, from, to) { var A = 0; for (var i = 0; i < L; i++) { var f = 1 - i / L, m = 1 - ss(from, to, f); if (m <= A + 0.001) continue; x.globalAlpha = (m - A) / (1 - A); A = m; trace(x, f); x.fill(); } x.globalAlpha = 1; }
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    trace(ctx, 1); ctx.clip();
    // 1. the rim colors
    if (ctx.createConicGradient) {
      var g = ctx.createConicGradient(rot - Math.PI / 2, cx, cy);
      RIM.forEach(function (col, i) { g.addColorStop(i / RIM.length, col); }); g.addColorStop(1, RIM[0]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    } else {
      for (var w = 0; w < 96; w++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, S, w / 96 * TAU + rot - Math.PI / 2, (w + 1.5) / 96 * TAU + rot - Math.PI / 2); ctx.closePath(); ctx.fillStyle = RIM[Math.floor(w / 96 * RIM.length)]; ctx.fill(); }
    }
    // 2. the green middle (the top of the flavor shape)
    ctx.fillStyle = GREEN; fade(ctx, 0.15, 1.0);
    // 3. light from above: each direction around the tip gets its own shade, strongest in the middle
    if (ctx.createConicGradient && typeof document !== 'undefined') {
      var px = ctx.canvas.width, k = px / S, B = bufs[px];
      if (!B) { B = bufs[px] = [document.createElement('canvas'), document.createElement('canvas')]; B.forEach(function (cv) { cv.width = cv.height = px; }); }
      var bx = B[0].getContext('2d'), kx = B[1].getContext('2d');
      kx.setTransform(1, 0, 0, 1, 0, 0); kx.clearRect(0, 0, px, px); kx.setTransform(k, 0, 0, k, 0, 0); kx.fillStyle = '#000'; fade(kx, 0.4, 0.97);
      bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalCompositeOperation = 'source-over'; bx.clearRect(0, 0, px, px);
      var dk = bx.createConicGradient(rot - Math.PI / 2, cx * k, cy * k);
      LIGHT.forEach(function (p) { dk.addColorStop(p[0] / 360, 'rgba(8,28,20,' + (1 - p[1]).toFixed(3) + ')'); });
      bx.fillStyle = dk; bx.fillRect(0, 0, px, px);
      bx.globalCompositeOperation = 'destination-in'; bx.drawImage(B[1], 0, 0); bx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(B[0], 0, 0); ctx.restore();
    }
    var hi = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    hi.addColorStop(0, 'rgba(255,255,255,0.10)'); hi.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi; ctx.fillRect(0, 0, S, S);
    ctx.restore();
    // 4. a thin light rim and the tip
    trace(ctx, 1); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,255,255,0.36)'; ctx.stroke();
    var d = ctx.createRadialGradient(cx, cy - R * 0.06, 0, cx, cy - R * 0.06, Math.max(1.2, S / 70));
    d.addColorStop(0, 'rgba(255,255,255,0.85)'); d.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = d; ctx.fillRect(0, 0, S, S);
  }
  // ---- keeps every <canvas class="di-blob"> on the page moving, and stops when there are none
  var running = false, start = 0, idleUntil = 0, clock = null, broken = false, can = null;
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  // something went wrong drawing: back to the logo picture everywhere
  function giveUp(err) {
    broken = true;
    try { console.warn('Loading blob off', err); } catch (e) {}
    var list = document.querySelectorAll('.di-morph');
    for (var i = 0; i < list.length; i++) { list[i].classList.remove('di-morph'); var cv = list[i].querySelector('canvas.di-blob'); if (cv) cv.parentNode.removeChild(cv); }
  }
  function paint(t) {
    if (broken) return false;
    var list = document.getElementsByClassName('di-blob'), any = false, dpr = Math.min(3, window.devicePixelRatio || 1);
    try {
      for (var i = 0; i < list.length; i++) {
        var cv = list[i], S = cv.clientWidth;
        if (!S || !cv.getContext) continue;   // hidden (its sheet or page isn't showing)
        any = true;
        var px = Math.round(S * dpr);
        if (cv.width !== px) { cv.width = cv.height = px; }
        var x = cv.getContext('2d'); x.setTransform(px / S, 0, 0, px / S, 0, 0); draw(x, S, t);
      }
    } catch (err) { giveUp(err); return false; }
    return any;
  }
  function loop() {
    var t = clock !== null ? clock : (now() - start) / 1000;
    var any = paint(t);
    if (!broken && (any || now() < idleUntil)) requestAnimationFrame(loop); else running = false;
  }
  // start (or keep) the drawing going; a fresh start begins as the logo
  function kick() {
    if (broken || typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    idleUntil = now() + 1500;
    if (!running) { running = true; start = now(); requestAnimationFrame(loop); }
  }
  // the blob is off for "reduce motion" (the logo then just turns slowly, as before) and where canvas can't draw
  function on() {
    try {
      if (broken) return false;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if (can === null) { var c = document.createElement('canvas'); can = !!(c.getContext && c.getContext('2d')); }
      return can;
    } catch (e) { return false; }
  }
  // turn a logo holder (the start-up screen's, or a small spinner's) into the moving blob
  function mount(el) {
    if (!el || !on() || el.querySelector('canvas.di-blob')) return;
    var cv = document.createElement('canvas'); cv.className = 'di-blob'; cv.setAttribute('aria-hidden', 'true');
    el.appendChild(cv); el.classList.add('di-morph'); kick();
  }
  return { draw: draw, coeffsAt: coeffsAt, kick: kick, mount: mount, on: on, paint: paint, KEYS: KEYS, fourier: fourier, STEP: STEP,
    setClock: function (t) { clock = t; }, running: function () { return running; }, broken: function () { return broken; } };
})(); } catch (e) { window.DIBlob = null; }
// the start-up screen's logo (this runs right after it, before the rest of the app)
try { if (window.DIBlob) window.DIBlob.mount(document.querySelector('#boot-screen .bs-logo')); } catch (e) {}
