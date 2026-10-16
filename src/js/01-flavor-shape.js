        // ===================== Flavor shape engine (v10) =====================
        // Julian's construction: five sliders as points on the floor of a five-sided box
        // (0 = center, 10 = wall), complexity is the height; neighbors connect, the surface
        // is blended from the triangles. WebGL when available, a flat top view otherwise.
        const FlavorShape = (() => {
            const FLOOR = ['acidity', 'sweetness', 'body', 'bitterness', 'finish'];
            const TOPK = 'balance';
            const NAMES = { acidity: 'Acidity', sweetness: 'Sweetness', body: 'Body', bitterness: 'Bitterness', finish: 'Finish', balance: 'Complexity' };
            const COLORS = { acidity: '#EDB92E', sweetness: '#EE7A62', body: '#A0663F', bitterness: '#8A63C4', finish: '#5F8FDB', balance: '#36B38C' };
            const N = FLOOR.length, SEG = 2 * Math.PI / N, NP = 200, NT = 60;
            const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
            const prefs = (() => { const d = { smooth: true, spin: true }; try { return Object.assign(d, JSON.parse(localStorage.getItem('dialed_shape') || '{}')); } catch (e) { return d; } })();
            const views = new Set();
            function setPref(k, v) {
                prefs[k] = !!v;
                try { localStorage.setItem('dialed_shape', JSON.stringify(prefs)); } catch (e) {}
                views.forEach(fn => fn());
                if (k === 'smooth' && typeof app !== 'undefined' && app.fillShapeImages) { document.querySelectorAll('img[data-shape-for]').forEach(i => i.removeAttribute('src')); app.fillShapeImages(); }
            }
            const rgb01 = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
            const C01 = Object.fromEntries(Object.entries(COLORS).map(([k, c]) => [k, rgb01(c)]));
            const val = (vals, k) => { const v = Number(vals && vals[k]); return Number.isFinite(v) ? clamp(v, 0, 10) : 5; };
            const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
            function radius(vals, phi, sm = true) {
                const R = FLOOR.map(k => Math.max(0.03, val(vals, k) / 10));
                const a = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                const i = Math.min(N - 1, Math.floor(a / SEG)), u = (a - i * SEG) / SEG;
                const g = j => R[((j % N) + N) % N];
                if (!sm) { const r1 = g(i), r2 = g(i + 1), t = a - i * SEG; return (r1 * r2 * Math.sin(SEG)) / (r1 * Math.sin(t) + r2 * Math.sin(SEG - t)); }
                const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
                return Math.max(0.03, 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u));
            }
            const profile = (t, sm = true) => sm ? Math.pow(Math.max(0, Math.cos(t * Math.PI / 2)), 0.85) : 1 - t;
            const heightOf = vals => 2 * Math.max(0.04, val(vals, TOPK) / 10);
            const surf = (vals, phi, t, sm = true) => { const r = radius(vals, phi, sm) * profile(t, sm); return [r * Math.cos(phi), heightOf(vals) * t, r * Math.sin(phi)]; };
            function colorAt(phi, t) {
                let ws = 0; const acc = [0, 0, 0];
                FLOOR.forEach((k, i) => { const c = Math.cos(phi - i * SEG); const w = c > 0 ? c * c * c : 0; ws += w; for (let q = 0; q < 3; q++) acc[q] += C01[k][q] * w; });
                const m = smoothstep(0.4, 1.0, t), top = C01[TOPK];
                return [0, 1, 2].map(q => (acc[q] / (ws || 1)) * (1 - m) + top[q] * m);
            }
            const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
            const M = {
                id() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
                mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
                persp(f, asp, n, fa) { const t = 1 / Math.tan(f / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = 2 * fa * n / (n - fa); return o; },
                trans(x, y, z) { const o = M.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
                rx(a) { const c = Math.cos(a), s = Math.sin(a), o = M.id(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
                ry(a) { const c = Math.cos(a), s = Math.sin(a), o = M.id(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
                apply(m, p) { const [x, y, z] = p; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]; }
            };
            // Julian's literal construction: one flat triangle per pair of neighbors and the top point
            function facets(vals) {
                const H0 = heightOf(vals), T = [0, H0, 0], NF = 28;
                const B = FLOOR.map((k, i) => { const r = Math.max(0.03, val(vals, k) / 10); return [r * Math.cos(i * SEG), 0, r * Math.sin(i * SEG)]; });
                const per = (NF + 1) * (NF + 2) / 2;
                const pos = new Float32Array(N * per * 3), nor = new Float32Array(N * per * 3), col = new Float32Array(N * per * 3), idx = new Uint32Array(N * NF * NF * 3);
                let v = 0, q = 0;
                for (let f = 0; f < N; f++) {
                    const A = B[f], Bb = B[(f + 1) % N];
                    const e1 = [Bb[0] - A[0], Bb[1] - A[1], Bb[2] - A[2]], e2 = [T[0] - A[0], T[1] - A[1], T[2] - A[2]];
                    let n = unit(cross(e1, e2));
                    const cen = [(A[0] + Bb[0]) / 3, (A[1] + Bb[1] + H0) / 3, (A[2] + Bb[2]) / 3];
                    const out = dot(n, [cen[0], cen[1] - 0.3 * H0, cen[2]]) > 0;
                    if (!out) n = n.map(x => -x);
                    const map = [];
                    for (let a = 0; a <= NF; a++) { map.push([]); for (let b = 0; b <= NF - a; b++) {
                        const p = [A[0] + e1[0] * a / NF + e2[0] * b / NF, A[1] + e1[1] * a / NF + e2[1] * b / NF, A[2] + e1[2] * a / NF + e2[2] * b / NF];
                        const i3 = v * 3; pos[i3] = p[0]; pos[i3 + 1] = p[1]; pos[i3 + 2] = p[2]; nor[i3] = n[0]; nor[i3 + 1] = n[1]; nor[i3 + 2] = n[2];
                        const c = colorAt(Math.atan2(p[2], p[0]), H0 > 0 ? p[1] / H0 : 0); col[i3] = c[0]; col[i3 + 1] = c[1]; col[i3 + 2] = c[2];
                        map[a].push(v); v++;
                    } }
                    const push = (x, y, z) => { if (out) { idx[q++] = x; idx[q++] = y; idx[q++] = z; } else { idx[q++] = x; idx[q++] = z; idx[q++] = y; } };
                    for (let a = 0; a < NF; a++) for (let b = 0; b < NF - a; b++) { push(map[a][b], map[a + 1][b], map[a][b + 1]); if (b < NF - a - 1) push(map[a + 1][b], map[a + 1][b + 1], map[a][b + 1]); }
                }
                return { pos, nor, col, idx: idx.subarray(0, q) };
            }
            function mesh(vals) {
                const nv = (NP + 1) * (NT + 1), H0 = heightOf(vals), e = 1e-3;
                const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
                for (let j = 0; j <= NP; j++) {
                    const phi = (j / NP) * 2 * Math.PI;
                    for (let k = 0; k <= NT; k++) {
                        const t = k / NT, i = (j * (NT + 1) + k) * 3, p = surf(vals, phi, t);
                        pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
                        let n = [0, 1, 0];
                        if (t < 1 - 1e-6) {
                            const a = surf(vals, phi + e, t), b = surf(vals, phi - e, t), c = surf(vals, phi, Math.min(1, t + e)), d = surf(vals, phi, Math.max(0, t - e));
                            n = cross([a[0] - b[0], a[1] - b[1], a[2] - b[2]], [c[0] - d[0], c[1] - d[1], c[2] - d[2]]);
                            if (dot(n, [p[0], p[1] - 0.3 * H0, p[2]]) < 0) n = n.map(x => -x);
                            n = unit(n);
                        }
                        nor[i] = n[0]; nor[i + 1] = n[1]; nor[i + 2] = n[2];
                        const c = colorAt(phi, t); col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2];
                    }
                }
                const at = (j, k) => { const i = (j * (NT + 1) + k) * 3; return [pos[i], pos[i + 1], pos[i + 2]]; };
                const a0 = at(10, 10), b0 = at(11, 10), c0 = at(11, 11);
                const ccw = dot(cross([b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]], [c0[0] - a0[0], c0[1] - a0[1], c0[2] - a0[2]]), [a0[0], a0[1] - 0.3 * H0, a0[2]]) > 0;
                const idx = new Uint32Array(NP * NT * 6); let q = 0;
                for (let j = 0; j < NP; j++) for (let k = 0; k < NT; k++) {
                    const a = j * (NT + 1) + k, b = (j + 1) * (NT + 1) + k, c = b + 1, f = a + 1;
                    if (ccw) { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = a; idx[q++] = c; idx[q++] = f; }
                    else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = a; idx[q++] = f; idx[q++] = c; }
                }
                return { pos, nor, col, idx };
            }
            const VS = `#version 300 es
            in vec3 aPos; in vec3 aNor; in vec3 aCol;
            uniform mat4 uMVP; uniform mat4 uMV;
            out vec3 vN; out vec3 vCol; out vec3 vV; out float vY;
            void main(){ vec4 p = uMV * vec4(aPos, 1.0); vV = p.xyz; vN = mat3(uMV) * aNor; vCol = aCol; vY = aPos.y; gl_Position = uMVP * vec4(aPos, 1.0); }`;
            const FS = `#version 300 es
            precision highp float;
            in vec3 vN; in vec3 vCol; in vec3 vV; in float vY;
            uniform float uAlpha; uniform float uDark;
            out vec4 o;
            void main(){
                vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
                vec3 V = normalize(-vV);
                vec3 L = normalize(vec3(-0.5, 0.85, 0.7)); vec3 L2 = normalize(vec3(0.8, 0.15, -0.3));
                float diff = max(dot(N, L), 0.0), fill = max(dot(N, L2), 0.0);
                float spec = pow(max(dot(N, normalize(L + V)), 0.0), 70.0);
                float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
                vec3 col = vCol * (0.44 + 0.66 * diff + 0.24 * fill) + vec3(1.0) * spec * 0.65 + mix(vCol, vec3(1.0), 0.6) * rim * (0.55 + 0.25 * uDark);
                float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, 1.22);
                float c = vY * 5.0, w = max(fwidth(c), 1e-4);
                float line = 1.0 - smoothstep(0.0, w * 1.3, abs(fract(c - 0.5) - 0.5));
                col = mix(col, col * 0.68, line * 0.5 * step(0.03, vY));
                float a = clamp(uAlpha + rim * 0.2, 0.0, 1.0);
                if (!gl_FrontFacing) col *= 0.58;
                o = vec4(col * a, a);
            }`;
            function makeGL(canvas) {
                let gl = null;
                try { gl = canvas.getContext && canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true }); } catch (e) { gl = null; }
                if (!gl) return null;
                const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
                let prog;
                try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); }
                catch (err) { console.warn('Flavor shape: falling back to 2D', err); return null; }
                const U = n => gl.getUniformLocation(prog, n);
                const u = { mvp: U('uMVP'), mv: U('uMV'), alpha: U('uAlpha'), dark: U('uDark') };
                const vao = gl.createVertexArray(), bufs = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()], bIdx = gl.createBuffer();
                gl.bindVertexArray(vao);
                ['aPos', 'aNor', 'aCol'].forEach((name, i) => { const loc = gl.getAttribLocation(prog, name); gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); });
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
                gl.bindVertexArray(null);
                let count = 0, key = '';
                return {
                    upload(vals, sm = true) {
                        const k = (sm ? 's' : 'f') + FLOOR.concat(TOPK).map(x => val(vals, x).toFixed(3)).join(',');
                        if (k === key) return;
                        key = k;
                        const m = sm ? mesh(vals) : facets(vals);
                        gl.bindVertexArray(vao);
                        [m.pos, m.nor, m.col].forEach((arr, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); });
                        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.DYNAMIC_DRAW);
                        gl.bindVertexArray(null);
                        count = m.idx.length;
                    },
                    draw(MVP, MV, dark) {
                        gl.viewport(0, 0, canvas.width, canvas.height);
                        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                        if (!count) return;
                        gl.useProgram(prog); gl.bindVertexArray(vao);
                        gl.uniformMatrix4fv(u.mvp, false, MVP); gl.uniformMatrix4fv(u.mv, false, MV); gl.uniform1f(u.dark, dark ? 1 : 0);
                        gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.CULL_FACE); gl.depthMask(true);
                        gl.cullFace(gl.FRONT); gl.uniform1f(u.alpha, 0.45); gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
                        gl.cullFace(gl.BACK); gl.uniform1f(u.alpha, 0.78); gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
                        gl.bindVertexArray(null);
                    },
                    get triangles() { return count / 3; }
                };
            }
            const themeColors = () => {
                if (typeof getComputedStyle !== 'function') return { line: '#E6E2DA', muted: '#747C76', ink: '#1E2420', surface: '#fff', dark: false };
                const css = getComputedStyle(document.documentElement);
                const v = n => css.getPropertyValue(n).trim();
                return { line: v('--line') || '#E6E2DA', muted: v('--text-muted') || '#747C76', ink: v('--ink') || '#1E2420', surface: v('--surface') || '#fff', dark: document.documentElement.getAttribute('data-theme') === 'dark' };
            };
            function matrices(W, H, yaw, pitch, zoom = 1, lookY = 1) {   // v14.0: lookY = the height the camera aims at
                const P = M.persp(34 * Math.PI / 180, W / H, 0.1, 50);
                const MV = M.mul(M.trans(0, -0.05, -7.6 / zoom), M.mul(M.rx(pitch), M.mul(M.ry(yaw), M.trans(0, -lookY, 0))));
                return { MVP: M.mul(P, MV), MV };
            }
            // box, floor, axes, shadow, ghost outline, points, labels (2D layers under/over the surface)
            function overlay(u, o, vals, ghost, MVP, MV, W, H, dpr, pitch, th, opts) {
                const sm = prefs.smooth;
                const proj = p => { const c = M.apply(MVP, p); return [(c[0] / c[3] * 0.5 + 0.5) * W, (1 - (c[1] / c[3] * 0.5 + 0.5)) * H]; };
                const depth = p => M.apply(MV, p)[2];
                const cz = depth([0, 1, 0]);
                [u, o].forEach(cx => { cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); });
                const seg = (cx, a, b) => { const A = proj(a), B = proj(b); cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]); cx.stroke(); };
                const loop = (cx, pts, close) => { cx.beginPath(); pts.forEach((p, i) => { const s = proj(p); if (i) cx.lineTo(s[0], s[1]); else cx.moveTo(s[0], s[1]); }); if (close) cx.closePath(); };
                if (opts.bare) {   // v14.0: just the shape and its shadow (the welcome screen)
                    const ft = []; for (let j = 0; j < 90; j++) ft.push(surf(vals, (j / 90) * 2 * Math.PI, 0, sm));
                    u.save(); u.shadowColor = 'rgba(10,20,12,0.35)'; u.shadowBlur = 26; u.fillStyle = 'rgba(30,45,32,0.18)'; loop(u, ft, true); u.fill(); u.restore();
                    return;
                }
                const rc = 1 / Math.cos(SEG / 2);
                u.strokeStyle = th.line; u.lineWidth = 0.8; u.globalAlpha = 0.6;
                for (let ring = 1; ring <= 4; ring++) { const rr = (ring / 5) * rc, pts = []; for (let j = 0; j < N; j++) { const a = (j + 0.5) * SEG; pts.push([rr * Math.cos(a), 0, rr * Math.sin(a)]); } loop(u, pts, true); u.stroke(); }
                u.globalAlpha = 1;
                const C = []; for (let j = 0; j < N; j++) { const a = (j + 0.5) * SEG; C.push([rc * Math.cos(a), 0, rc * Math.sin(a)]); }
                for (let j = 0; j < N; j++) C.push([C[j][0], 2, C[j][2]]);
                const E = []; for (let j = 0; j < N; j++) E.push([j, (j + 1) % N], [N + j, N + (j + 1) % N], [j, N + j]);
                E.forEach(([a, b]) => { const back = (depth(C[a]) + depth(C[b])) / 2 < cz; const cx = back ? u : o; cx.strokeStyle = back ? th.line : th.muted; cx.globalAlpha = back ? 1 : 0.4; cx.lineWidth = 1.1; seg(cx, C[a], C[b]); cx.globalAlpha = 1; });
                u.setLineDash([3, 4]); u.lineWidth = 1.2;
                FLOOR.forEach((k, i) => { u.strokeStyle = COLORS[k]; u.globalAlpha = 0.7; seg(u, [0, 0, 0], [Math.cos(i * SEG), 0, Math.sin(i * SEG)]); });
                u.strokeStyle = COLORS[TOPK]; seg(u, [0, 0, 0], [0, 2, 0]);
                u.setLineDash([]); u.globalAlpha = 1;
                const NSAMP = 90, foot = []; for (let j = 0; j < NSAMP; j++) foot.push(surf(vals, (j / NSAMP) * 2 * Math.PI, 0, sm));
                u.save(); u.shadowColor = 'rgba(10,20,12,0.35)'; u.shadowBlur = 20; u.fillStyle = 'rgba(30,45,32,0.16)'; loop(u, foot, true); u.fill(); u.restore();
                if (ghost) {
                    o.setLineDash([4, 4]); o.strokeStyle = th.muted; o.globalAlpha = 0.9; o.lineWidth = 1.3;
                    const g = []; for (let j = 0; j < NSAMP; j++) g.push(surf(ghost, (j / NSAMP) * 2 * Math.PI, 0, sm));
                    loop(o, g, true); o.stroke();
                    FLOOR.forEach((_, i) => { const m = []; for (let k = 0; k <= 14; k++) m.push(surf(ghost, i * SEG, k / 14, sm)); loop(o, m, false); o.stroke(); });
                    o.setLineDash([]); o.globalAlpha = 1;
                }
                const pts = FLOOR.map((k, i) => { const r = Math.max(0.03, val(vals, k) / 10); return [r * Math.cos(i * SEG), 0, r * Math.sin(i * SEG)]; });
                if (!sm) { o.strokeStyle = th.surface; o.globalAlpha = 0.9; o.lineWidth = 1.4; const top = [0, heightOf(vals), 0]; pts.forEach((p, i) => { seg(o, p, pts[(i + 1) % N]); seg(o, p, top); }); o.globalAlpha = 1; }
                const dotAt = (p, color) => { const s = proj(p); const back = depth(p) < depth([0, p[1], 0]) - 1e-6; const a = back ? 0.6 : 1;
                    o.globalAlpha = a * 0.22; o.beginPath(); o.arc(s[0], s[1], 9, 0, 7); o.fillStyle = color; o.fill();
                    o.globalAlpha = a; o.beginPath(); o.arc(s[0], s[1], 5.5, 0, 7); o.fillStyle = color; o.fill(); o.lineWidth = 2.2; o.strokeStyle = th.surface; o.stroke(); o.globalAlpha = 1; };
                pts.forEach((p, i) => dotAt(p, COLORS[FLOOR[i]]));
                dotAt([0, heightOf(vals), 0], COLORS[TOPK]);
                if (opts.labels === false) return;
                const small = W < 260;
                const label = (pos, k) => { const s = proj(pos); o.textAlign = 'center'; o.textBaseline = 'middle';
                    if (k === TOPK) s[1] -= 36 * smoothstep(0.8, 1.45, pitch);
                    o.lineJoin = 'round'; o.strokeStyle = th.surface; o.lineWidth = 4;
                    o.font = `700 ${small ? 9 : 11}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
                    o.strokeText(NAMES[k], s[0], s[1] - 8); o.fillStyle = COLORS[k]; o.fillText(NAMES[k], s[0], s[1] - 8);
                    const shown = (opts.isSet && !opts.isSet(k)) || !vals || vals[k] === undefined || vals[k] === null || vals[k] === '' ? '–' : String(Math.round(val(vals, k) * 10) / 10);
                    o.font = `800 ${small ? 11 : 13}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
                    o.strokeText(shown, s[0], s[1] + 7); o.fillStyle = th.ink; o.fillText(shown, s[0], s[1] + 7); };
                FLOOR.forEach((k, i) => label([1.32 * Math.cos(i * SEG), 0, 1.32 * Math.sin(i * SEG)], k));
                label([0, 2.34, 0], TOPK);
            }
            // flat top view for devices without WebGL2
            function flat(o, vals, ghost, W, H, dpr, th) {
                o.setTransform(dpr, 0, 0, dpr, 0, 0); o.clearRect(0, 0, W, H);
                const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;
                const P = (r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
                o.strokeStyle = th.line; o.lineWidth = 1;
                for (let ring = 1; ring <= 5; ring++) { o.beginPath(); for (let j = 0; j <= N; j++) { const p = P(R * ring / 5 / Math.cos(SEG / 2), (j + 0.5) * SEG); if (j) o.lineTo(p[0], p[1]); else o.moveTo(p[0], p[1]); } o.stroke(); }
                const shape = (v) => { o.beginPath(); for (let j = 0; j <= 120; j++) { const a = (j / 120) * 2 * Math.PI; const p = P(R * radius(v, a), a); if (j) o.lineTo(p[0], p[1]); else o.moveTo(p[0], p[1]); } o.closePath(); };
                const grad = o.createRadialGradient(cx, cy, 2, cx, cy, R);
                grad.addColorStop(0, COLORS[TOPK]); grad.addColorStop(1, COLORS.sweetness);
                shape(vals); o.globalAlpha = 0.75; o.fillStyle = grad; o.fill(); o.globalAlpha = 1;
                if (ghost) { o.setLineDash([4, 4]); o.strokeStyle = th.muted; shape(ghost); o.stroke(); o.setLineDash([]); }
                FLOOR.forEach((k, i) => { const p = P(R * 1.22, i * SEG); o.fillStyle = COLORS[k]; o.font = '700 11px -apple-system, sans-serif'; o.textAlign = 'center'; o.fillText(`${NAMES[k]} ${Math.round(val(vals, k))}`, p[0], p[1]); });
            }
            const h = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };
            const raf = cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(() => cb(Date.now()), 16));
            // ---- live view (log form, bean page, viewer)
            function createView(opts = {}) {
                const probe = document.createElement('div');
                if (!probe || typeof probe.append !== 'function') return { el: probe, start() {}, redraw() {}, state() { return { gl: false, triangles: 0 }; } };
                const stage = h('div', 'shape-stage');
                const under = h('canvas', 'shape-layer'), glc = h('canvas', 'shape-layer'), over = h('canvas', 'shape-layer shape-top');
                stage.append(under, glc, over);
                over.setAttribute('role', 'img');
                const gl = makeGL(glc);
                if (!gl) glc.remove();
                const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
                let yaw = opts.yaw ?? -0.72, pitch = opts.pitch ?? 0.42, pitchTarget = null, dragging = false, px = 0, py = 0, idleSince = 0, last = 0, running = false, ghostOn = opts.ghostOn !== false;
                const cur = {}; const target = () => opts.values() || {};
                FLOOR.concat(TOPK).forEach(k => { cur[k] = val(target(), k); });
                const el = h('div', 'shape-view');
                el.append(stage);
                let topBtn = null, ghostBtn = null, curvedBtn = null, spinBtn = null;
                if (opts.controls !== false) {
                    const row = h('div', 'shape-ctl');
                    topBtn = h('button', 'chip-btn'); topBtn.type = 'button'; topBtn.textContent = 'Top view';
                    topBtn.addEventListener('click', e => { e.stopPropagation(); const to = pitch > 1.3 ? 0.42 : Math.PI / 2; if (reduce) { pitch = to; draw(); } else pitchTarget = to; });
                    row.append(topBtn);
                    if (opts.ghostLabel) {
                        ghostBtn = h('button', 'chip-btn'); ghostBtn.type = 'button'; ghostBtn.textContent = opts.ghostLabel;
                        ghostBtn.addEventListener('click', e => { e.stopPropagation(); ghostOn = !ghostOn; ghostBtn.setAttribute('aria-pressed', String(ghostOn)); draw(); });
                        ghostBtn.setAttribute('aria-pressed', String(ghostOn));
                        row.append(ghostBtn);
                    }
                    if (gl) {
                        const toggle = (label, k) => { const b = h('button', 'chip-btn'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(prefs[k])); b.addEventListener('click', e => { e.stopPropagation(); setPref(k, !prefs[k]); }); return b; };
                        curvedBtn = toggle('Curved', 'smooth'); spinBtn = toggle('Auto-spin', 'spin');
                        row.append(curvedBtn, spinBtn);
                    }
                    el.append(row);
                }
                function size() {
                    const w = stage.clientWidth || 320, hh = stage.clientHeight || 300, dpr = Math.min(2.5, window.devicePixelRatio || 1);
                    [under, glc, over].forEach(c => { if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); } });
                    return { W: w, H: hh, dpr };
                }
                function draw() {
                    if (!stage.isConnected) return;
                    const { W, H, dpr } = size(), th = themeColors(), ghost = ghostOn && opts.ghost ? opts.ghost() : null;
                    const o = over.getContext('2d'), u = under.getContext('2d');
                    if (!o || !u) return;
                    if (!gl) { u.clearRect(0, 0, under.width, under.height); flat(o, cur, ghost, W, H, dpr, th); return; }
                    const { MVP, MV } = matrices(W, H, yaw, pitch, opts.zoom || 1, opts.lookY ?? 1);
                    gl.upload(cur, prefs.smooth); gl.draw(MVP, MV, th.dark);
                    overlay(u, o, cur, ghost, MVP, MV, W, H, dpr, pitch, th, opts);
                    if (topBtn) topBtn.setAttribute('aria-pressed', String(pitch > 1.3));
                    if (curvedBtn) curvedBtn.setAttribute('aria-pressed', String(prefs.smooth));
                    if (spinBtn) spinBtn.setAttribute('aria-pressed', String(prefs.spin));
                    over.setAttribute('aria-label', `Flavor shape: ${FLOOR.concat(TOPK).map(k => `${NAMES[k]} ${Math.round(val(cur, k))}`).join(', ')}`);
                }
                function frame(ts) {
                    // stop completely when hidden (closed sheet, page left); skip work while scrolled off-screen
                    if (!stage.isConnected || !stage.getClientRects || stage.getClientRects().length === 0) { running = false; return; }
                    if (!onScreen) { last = 0; raf(frame); return; }
                    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
                    if (gl && prefs.spin && opts.spin !== false && !reduce && !dragging && performance.now() - idleSince > 2500) yaw += dt * 0.3;
                    if (pitchTarget != null) { pitch += (pitchTarget - pitch) * Math.min(1, dt * 7); if (Math.abs(pitchTarget - pitch) < 0.003) { pitch = pitchTarget; pitchTarget = null; } }
                    const t = target(); FLOOR.concat(TOPK).forEach(k => { const goal = val(t, k); cur[k] += (goal - cur[k]) * Math.min(1, dt * 9); if (Math.abs(goal - cur[k]) < 0.002) cur[k] = goal; });
                    // only redraw when something visible changed (angle, values, size, theme, toggles)
                    const g = ghostOn && opts.ghost ? opts.ghost() : null;
                    const sig = [yaw.toFixed(4), pitch.toFixed(4), FLOOR.concat(TOPK).map(k => cur[k].toFixed(3)).join(','), g ? FLOOR.concat(TOPK).map(k => val(g, k)).join(',') : '-', stage.clientWidth, stage.clientHeight, document.documentElement.getAttribute('data-theme'), prefs.smooth, ghostOn, opts.isSet ? FLOOR.concat(TOPK).map(k => opts.isSet(k) ? 1 : 0).join('') : ''].join('|');
                    if (sig !== lastSig) { lastSig = sig; draw(); }
                    raf(frame);
                }
                if (gl && opts.interactive !== false) {
                    const full = !!opts.fullGestures;
                    over.style.touchAction = full ? 'none' : 'pan-y';
                    over.addEventListener('pointerdown', e => { e.stopPropagation(); dragging = true; pitchTarget = null; px = e.clientX; py = e.clientY; try { over.setPointerCapture(e.pointerId); } catch (err) {} });
                    over.addEventListener('pointermove', e => { if (!dragging) return; yaw += (e.clientX - px) * 0.012; if (full || e.pointerType === 'mouse') pitch = clamp(pitch + (e.clientY - py) * 0.008, 0.05, Math.PI / 2); px = e.clientX; py = e.clientY; if (!running) draw(); });
                    const end = () => { dragging = false; idleSince = performance.now(); };
                    over.addEventListener('pointerup', end); over.addEventListener('pointercancel', end);
                    over.addEventListener('click', e => e.stopPropagation());
                }
                let onScreen = true, lastSig = '';
                if (typeof IntersectionObserver === 'function') { try { new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); }).observe(stage); } catch (e) {} }
                views.add(() => { if (stage.isConnected) draw(); });
                return {
                    el,
                    start() { lastSig = ''; if (running) { draw(); return; } running = true; last = 0; draw(); raf(frame); },
                    redraw() { draw(); },
                    state() { return { gl: !!gl, yaw, pitch, running, triangles: gl ? gl.triangles : 0, cur: { ...cur } }; }
                };
            }
            // ---- still images for cards (one shared offscreen renderer)
            let shared = null; const cache = new Map();
            function snapshot(vals, ghost, opts = {}) {
                const W = opts.width || 300, H = opts.height || 220, dpr = Math.min(2, window.devicePixelRatio || 1);
                const probe = document.createElement('canvas');
                if (!probe || typeof probe.getContext !== 'function') return '';
                const th = themeColors();
                const key = [W, H, th.dark ? 'd' : 'l', FLOOR.concat(TOPK).map(k => val(vals, k)).join(','), ghost ? FLOOR.concat(TOPK).map(k => val(ghost, k)).join(',') : '-', opts.labels === false ? 'n' : 'y', opts.setKey || '', prefs.smooth ? 's' : 'f'].join('|');
                if (cache.has(key)) return cache.get(key);
                try {
                    if (!shared) { const under = document.createElement('canvas'), glc = document.createElement('canvas'), over = document.createElement('canvas'), out = document.createElement('canvas'); shared = { under, glc, over, out, gl: makeGL(glc) }; }
                    const { under, glc, over, out, gl } = shared;
                    [under, glc, over, out].forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
                    const u = under.getContext('2d'), o = over.getContext('2d'), x = out.getContext('2d');
                    if (!u || !o || !x) return '';
                    if (gl) {
                        const yaw = opts.yaw ?? -0.72, pitch = opts.pitch ?? 0.5;
                        const { MVP, MV } = matrices(W, H, yaw, pitch, opts.zoom || 1);
                        gl.upload(vals, prefs.smooth); gl.draw(MVP, MV, th.dark);
                        overlay(u, o, vals, ghost, MVP, MV, W, H, dpr, pitch, th, opts);
                        x.clearRect(0, 0, out.width, out.height); x.drawImage(under, 0, 0); x.drawImage(glc, 0, 0); x.drawImage(over, 0, 0);
                    } else {
                        flat(x, vals, ghost, W, H, dpr, th);
                    }
                    const url = out.toDataURL('image/png');
                    if (cache.size > 160) cache.delete(cache.keys().next().value);
                    cache.set(key, url);
                    return url;
                } catch (err) { console.warn('Flavor shape snapshot failed', err); return ''; }
            }
            return { createView, snapshot, setPref, prefs, FLOOR, TOPK, NAMES, COLORS, KEYS: FLOOR.concat(TOPK) };
        })();

