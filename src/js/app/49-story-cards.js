            // ===================== v16.1: more things to share as a picture =====================
            // The shot card's look (1080 x 1920, dark, for an Instagram Story) for a coffee, its dial-in curves, its sweet
            // spot, two sessions compared, a roaster, a finished group goal, a month's awards, your level, your palate and a
            // recipe. Each opens the same Share sheet as the shot card: the picture is made first, so Share image opens the
            // share sheet straight from the tap; a coffee and a roaster also keep Share link. Never a grind setting (it only
            // means something on your own grinder).
            storyKit(ctx, fam) {
                const sans = (w, z) => `${w} ${z}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Inter, sans-serif`;
                const nl = !!(this.newLook && this.newLook() && this.nlPal);
                const serif = (w, z) => `${w} ${z}px ui-serif, -apple-system-ui-serif, "New York", "Iowan Old Style", Georgia, serif`;
                const wrap = (text, maxW, maxLines) => {
                    const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
                    let line = '';
                    for (let i = 0; i < words.length; i++) {
                        const test = line ? `${line} ${words[i]}` : words[i];
                        if (ctx.measureText(test).width <= maxW || !line) { line = test; continue; }
                        lines.push(line); line = words[i];
                        if (lines.length === maxLines) { line = ''; break; }
                    }
                    if (line) lines.push(line);
                    const cut = lines.length > maxLines || words.join(' ').length > lines.join(' ').length;
                    const kept = lines.slice(0, maxLines);
                    if (cut && kept.length) { let last = kept[kept.length - 1]; while (last && ctx.measureText(`${last}…`).width > maxW) last = last.replace(/\s*\S+$/, ''); kept[kept.length - 1] = `${(last || kept[kept.length - 1]).replace(/[\s,;:.]+$/, '')}…`; }
                    return kept;
                };
                const round = (x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
                const fit = (text, maxW) => this.fitText(ctx, String(text || ''), maxW);
                const base = { sans, serif, wrap, round, fit, W: 1080, H: 1920, PAD: 78, ink: '#E8EEE8', ink2: '#C2CBC3', muted: '#8D978E', faint: '#5F6A61', box: 'rgba(255,255,255,0.07)', boxLine: 'rgba(255,255,255,0.08)', grid: 'rgba(255,255,255,0.09)' };
                if (!nl) return base;
                // v17.5: the New look's share pictures: the thing's own colors (in the phone's light or dark), Roboto Slab for
                // names and roasters, the serif for titles, soft tiles
                const P = this.nlPal(fam || 'app'), mix = (a, b, t) => this.hexMix(a, b, t), rgba = (hx, a) => this.hexToRgba(hx, a);
                return { ...base, nl: true, P, hand: z => `600 ${z}px "Roboto Slab NL", "Roboto Slab", Georgia, serif`, serif: (w, z) => `500 ${z}px ui-serif, -apple-system-ui-serif, "New York", "Iowan Old Style", Georgia, serif`,
                    bg: P.c, ink: P.t, ink2: mix(P.t, P.l, 0.35), muted: P.l, faint: mix(P.l, P.c, 0.45), name: P.n, accent: P.k,
                    box: P.dark ? rgba(P.n, 0.08) : 'rgba(255,255,255,0.55)', boxLine: P.dark ? rgba(P.n, 0.15) : 'rgba(255,255,255,0.75)', grid: rgba(P.t, 0.1), dark: P.dark };
            },

            // the canvas, the background, who and when, and a title (a small line over a big one); returns where the title ends
            storyStart({ who = this.user, date = Date.now(), sub = '', title = '', titleLines = 2, titleSize = 93, fam = '' } = {}) {
                const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
                const ctx = c.getContext('2d'); if (!ctx) return null;
                // (v17.7: in the New look the picture's words and shapes go on a layer of their own, fitted into Instagram's safe
                // area at the end; the background stays full size)
                const nl = !!(this.newLook && this.newLook() && this.nlPal), cc = nl ? document.createElement('canvas') : null;
                if (cc) { cc.width = c.width; cc.height = c.height; }
                const cx = (cc && cc.getContext('2d')) || ctx;
                const k = this.storyKit(cx, fam || (this.famOfPerson ? this.famOfPerson(who) : 'app')), { W, H, PAD } = k;
                if (k.nl) return this.storyStartNew({ c, ctx, cc: cx === ctx ? null : cc, cx, k, who, date, sub, title, titleLines, titleSize });
                const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.75);
                g.addColorStop(0, '#1E2620'); g.addColorStop(0.6, '#121713'); g.addColorStop(1, '#0C100D');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                const topY = 240;
                ctx.fillStyle = this.getUserColor(who) || '#5B7FA6'; ctx.beginPath(); ctx.arc(PAD + 13, topY - 13, 13.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = k.ink2; ctx.font = k.sans(600, 38); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
                const when = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                ctx.fillText(k.fit([who, when].filter(Boolean).join(' · '), W - PAD * 2 - 300), PAD + 40, topY);
                ctx.font = k.serif(600, 43); ctx.textAlign = 'right'; ctx.fillStyle = k.muted; ctx.fillText('Dialed In', W - PAD, topY);
                ctx.textAlign = 'left';
                let y = topY + 102;
                if (sub) { ctx.fillStyle = k.muted; ctx.font = k.sans(600, 36); ctx.fillText(k.fit(sub, W - PAD * 2), PAD, y); y += 22; }
                if (title) {
                    ctx.font = k.serif(600, titleSize); ctx.fillStyle = k.ink;
                    const LH = Math.round(titleSize * 1.12), lines = k.wrap(title, W - PAD * 2, titleLines);
                    lines.forEach((l, i) => ctx.fillText(l, PAD, y + LH * (i + 1) - Math.round(titleSize * 0.2)));
                    y += LH * lines.length;
                }
                return { c, ctx, k, y };
            },

            // v17.5: the New look's start: its color, the person (picture with a ring in their color, name in Roboto Slab), the
            // small line in the accent, the title in the serif, and Dialed In
            storyStartNew({ c, ctx: bg, cc, cx, k, who, date, sub, title, titleLines, titleSize }) {
                const { W, H, PAD, P } = k, ctx = cx;
                bg.fillStyle = k.bg; bg.fillRect(0, 0, W, H);
                const g = bg.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, H * 0.8);
                g.addColorStop(0, this.hexToRgba(P.dark ? '#FFFFFF' : '#FFFFFF', P.dark ? 0.05 : 0.22)); g.addColorStop(1, this.hexToRgba('#000000', 0));
                bg.fillStyle = g; bg.fillRect(0, 0, W, H);
                const topY = 210;
                if (who) {
                    const col = this.getUserColor(who) || '#5B7FA6';
                    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(PAD + 34, topY - 14, 34, 0, Math.PI * 2); ctx.fill();
                    ctx.lineWidth = 6; ctx.strokeStyle = this.hexMix(col, P.c, 0.35); ctx.beginPath(); ctx.arc(PAD + 34, topY - 14, 41, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = '#FFFFFF'; ctx.font = k.sans(700, 32); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.feedInitial(who), PAD + 34, topY - 12);
                    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                    ctx.font = k.hand(40); ctx.fillStyle = this.nameColor ? this.nameColor(who, P.c) : k.name; ctx.fillText(k.fit(who, W - PAD * 2 - 420), PAD + 96, topY - 4);
                    const when = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                    if (when) { ctx.font = k.sans(600, 30); ctx.fillStyle = k.muted; ctx.fillText(when, PAD + 96, topY + 36); }
                }
                ctx.font = k.hand(40); ctx.textAlign = 'right'; ctx.fillStyle = k.accent; ctx.fillText('Dialed In', W - PAD, topY - 4); ctx.textAlign = 'left';
                let y = topY + 130;
                if (sub) { ctx.fillStyle = k.accent; ctx.font = k.hand(40); ctx.fillText(k.fit(sub, W - PAD * 2), PAD, y); y += 26; }
                if (title) {
                    ctx.font = k.serif(500, titleSize); ctx.fillStyle = k.name;
                    const LH = Math.round(titleSize * 1.08), lines = k.wrap(title, W - PAD * 2, titleLines);
                    lines.forEach((l, i) => ctx.fillText(l, PAD, y + LH * (i + 1) - Math.round(titleSize * 0.2)));
                    y += LH * lines.length;
                }
                if (!cc) return { c, ctx, k, y };
                const app = this, face = who ? { who, x: PAD + 34, y: topY - 14, r: 34 } : null;
                let done = null;
                return { ctx, k, y, get c() { return done || (done = app.storyFinish(c, cc, face)); } };
            },

            // v17.7: Instagram covers the top of a story with its own bars (and, while posting, the bottom with "Add a caption"),
            // so everything that matters stays between these two lines (of 1920). (v17.8: lower, from Maceo's story screen:
            // the image ends above Instagram's bottom buttons on an iPhone, only the caption line sits over it)
            STORY_SAFE: [170, 1860],   // (v17.9: closer to the top and bottom; on a posted story only Instagram's top row covers it)
            // the person's real profile picture, read so it can be drawn into the picture (null when they have none)
            async storyFace(name) {
                try {
                    if (!name || !this.faceStore || !this.faceUrl || typeof Supa === 'undefined' || !Supa.ready || !Supa.ready()) return null;
                    const key = String(name).toLowerCase(), wait = ms => new Promise(r => setTimeout(() => r(null), ms));
                    let have = this.faceStore().get(key);
                    if (!have && Supa.rpc) {
                        const list = await Promise.race([Promise.resolve(Supa.rpc('faces', { names: [name] })).catch(() => null), wait(2500)]);
                        const x = Array.isArray(list) ? list.find(f => String(f.name || '').toLowerCase() === key) : null;
                        have = [(x && x.avatar) || '', Date.now()];
                    }
                    const path = have && have[0];
                    return path ? await Promise.race([this.storyLoadCors(this.faceUrl(path)), wait(5000)]) : null;
                } catch (e) { return null; }
            },
            // the finished picture: the person's picture in its circle, then the words and shapes fitted between the safe
            // lines (moved down or up when they fit, made a little smaller only when they don't), on the full background
            async storyFinish(c, cc, face) {
                const cx = cc.getContext('2d'), W = cc.width, H = cc.height, [T, B] = this.STORY_SAFE;
                if (face) {
                    const img = await this.storyFace(face.who);
                    if (img) { const iw0 = img.naturalWidth || img.width, ih0 = img.naturalHeight || img.height, z = Math.max(face.r * 2 / iw0, face.r * 2 / ih0); cx.save(); cx.beginPath(); cx.arc(face.x, face.y, face.r, 0, Math.PI * 2); cx.clip(); cx.drawImage(img, face.x - iw0 * z / 2, face.y - ih0 * z / 2, iw0 * z, ih0 * z); cx.restore(); }
                }
                let top = -1, bot = -1;
                try {
                    const d = cx.getImageData(0, 0, W, H).data;
                    const row = y => { for (let x = 0; x < W; x += 3) if (d[(y * W + x) * 4 + 3] > 10) return true; return false; };
                    for (let y = 0; y < H; y += 2) if (row(y)) { top = y; break; }
                    for (let y = H - 1; y >= 0; y -= 2) if (row(y)) { bot = y; break; }
                } catch (e) { top = -1; }
                const out = c.getContext('2d');
                if (top < 0) { out.drawImage(cc, 0, 0); return c; }
                const h = bot - top + 1, s = Math.min(1, (B - T) / h), at = Math.min(Math.max(top, T), B - h * s);
                out.drawImage(cc, W / 2 * (1 - s), at - top * s, W * s, H * s);
                return c;
            },

            // number boxes: [{ big: [[text, unit], ...], small }] (the shot card's), one row across
            storyBoxes(S, boxes, y, bh = 150) {
                const { ctx, k } = S; const list = boxes.filter(Boolean);
                if (!list.length) return y;
                const gap = 24, total = k.W - k.PAD * 2, units = list.reduce((s, x) => s + (x.wide ? 1.5 : 1), 0), unit = (total - gap * (list.length - 1)) / units;
                let x = k.PAD;
                list.forEach(bx => {
                    const bw = unit * (bx.wide ? 1.5 : 1);
                    k.round(x, y, bw, bh, 42); ctx.fillStyle = k.box; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = k.boxLine; ctx.stroke();
                    let tx = x + 33; const by = y + 74, room = bw - 60;
                    const big = bx.big.filter(Boolean);
                    // shrink the big text until it fits its box
                    let z = 51; const width = zz => big.reduce((s, part, i) => { ctx.font = k.sans(700, zz); let w = ctx.measureText(part[0]).width + (i ? ctx.measureText(' → ').width : 0); if (part[1]) { ctx.font = k.sans(600, Math.round(zz * 0.65)); w += ctx.measureText(part[1]).width; } return s + w; }, 0);
                    while (z > 30 && width(z) > room) z -= 2;
                    big.forEach((part, i) => {
                        if (i) { ctx.font = k.sans(700, z - 5); ctx.fillStyle = k.ink; ctx.fillText(' → ', tx, by); tx += ctx.measureText(' → ').width; }
                        ctx.font = k.sans(700, z); ctx.fillStyle = k.nl ? k.ink : '#FFFFFF'; ctx.fillText(part[0], tx, by); tx += ctx.measureText(part[0]).width;
                        if (part[1]) { ctx.font = k.sans(600, Math.round(z * 0.65)); ctx.fillStyle = k.nl ? k.muted : 'rgba(255,255,255,0.7)'; ctx.fillText(part[1], tx, by); tx += ctx.measureText(part[1]).width; }
                    });
                    ctx.font = k.sans(600, 31); ctx.fillStyle = k.nl ? k.muted : 'rgba(255,255,255,0.62)'; ctx.fillText(k.fit(bx.small || '', room), x + 33, y + 118);
                    x += bw + gap;
                });
                return y + bh;
            },

            // tasting notes as chips in their wheel family's color; returns where they end
            storyNoteChips(S, notes, y, maxRows = 2) {
                const { ctx, k } = S; if (!notes.length) return y;
                const h = 70, gap = 16; let x = k.PAD, row = 0;
                ctx.font = k.sans(600, 34);
                if (k.nl && this.noteToneKey && this.nlTonePal) {   // v17.5: as the cards show them
                    for (const n of notes) {
                        const tp = this.nlTonePal(this.noteToneKey(n, 'coffee'), k.dark), w = Math.min(k.W - k.PAD * 2, ctx.measureText(n).width + 56);
                        if (x + w > k.W - k.PAD) { row++; x = k.PAD; if (row >= maxRows) break; }
                        const yy = y + row * (h + gap);
                        k.round(x, yy, w, h, 22); ctx.fillStyle = tp ? (k.dark ? tp.chipBg : tp.chipBgL || tp.chipBg) : k.box; ctx.fill();
                        ctx.fillStyle = tp ? (k.dark ? tp.chipFg : tp.chipFgL || tp.chipFg) : k.ink; ctx.fillText(k.fit(n, w - 56), x + 28, yy + 47);
                        x += w + gap;
                    }
                    return y + (row + 1) * (h + gap) - gap;
                }
                for (const n of notes) {
                    const at = this.noteLocate ? this.noteLocate(n) : null, hex = at && at.f >= 0 ? at.color : '#7D8984';
                    const w = Math.min(k.W - k.PAD * 2, ctx.measureText(n).width + 56);
                    if (x + w > k.W - k.PAD) { row++; x = k.PAD; if (row >= maxRows) break; }
                    const yy = y + row * (h + gap);
                    k.round(x, yy, w, h, 35); ctx.fillStyle = this.hexToRgba ? this.hexToRgba(hex, 0.2) : 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = this.hexToRgba ? this.hexToRgba(hex, 0.45) : k.boxLine; ctx.stroke();
                    ctx.fillStyle = '#F2F5F2'; ctx.fillText(k.fit(n, w - 56), x + 28, yy + 47);
                    x += w + gap;
                }
                return y + (row + 1) * (h + gap) - gap;
            },

            hexToRgba(hex, a) {
                const s = String(this.normalizeHexColor(hex) || '#7D8984').slice(1);
                return `rgba(${[0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)).join(',')},${a})`;
            },

            // v17.5: a picture from the photo store, fetched first so the share picture can still be saved (a picture straight
            // from another site would lock the canvas)
            async storyLoadCors(url) {
                try { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return null; const b = await r.blob(); const u = URL.createObjectURL(b); const img = await this.storyLoad(u); setTimeout(() => URL.revokeObjectURL(u), 4000); return img; } catch (e) { return null; }
            },
            storyLoad(src) { return new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); },

            // an icon from the app's set, drawn white (or a color) at any size
            storyIcon(id, color = '#FFFFFF') {
                const sym = typeof document !== 'undefined' ? document.getElementById(id) : null;
                if (!sym) return Promise.resolve(null);
                const vb = sym.getAttribute('viewBox') || '0 0 24 24';
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="96" height="96" color="${color}"><g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sym.innerHTML}</g></svg>`;
                return this.storyLoad('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
            },

            storyShape(vals, ghost, tasted, size = [900, 660], kind = 'coffee', k = null) {
                if (!vals || typeof FlavorShape === 'undefined') return Promise.resolve(null);
                if (k && k.nl) {   // v17.5: as on the cards: the shape, the circle at 10 and the center line; no box, no numbers
                    let url = '';
                    try { url = FlavorShape.snapshot(vals, ghost || null, { width: Math.round(size[0] / 2.25), height: Math.round(size[1] / 2.25), dpr: 2.25, labels: false, lines: false, ring: this.NL_RING || 'axis', fit: true, isSet: x => tasted.includes(x), setKey: 'story-nl-' + tasted.join(',') + (k.P ? k.P.c : ''), names: kind === 'tea' ? 'tea' : null, theme: { line: k.grid, muted: k.muted, ink: k.ink, surface: k.bg, dark: k.dark } }); } catch (e) { url = ''; }
                    return this.storyLoad(url);
                }
                const theme = { line: '#3A443B', muted: '#8D978E', ink: '#E8EEE8', surface: '#141915', dark: true };
                let url = '';
                try { url = FlavorShape.snapshot(vals, ghost || null, { width: Math.round(size[0] / 2.25), height: Math.round(size[1] / 2.25), zoom: 1.12, isSet: k => tasted.includes(k), setKey: 'story-' + tasted.join(','), theme, dpr: 2.4, names: kind === 'tea' ? 'tea' : null }); } catch (e) { url = ''; }
                return this.storyLoad(url);
            },

            // draws an image centered, fitted into a box; returns the bottom
            storyDrawFit(S, img, y, maxW, maxH) {
                if (!img) return y;
                const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
                S.ctx.drawImage(img, (S.k.W - w) / 2, y, w, h);
                return y + h;
            },

            // the average taste of some sessions (only what was tasted), for a coffee's or a palate's shape
            storyAvgShape(brews) {
                const keys = TASTE_KEYS, sum = {}, n = {};
                brews.forEach(b => keys.forEach(k => { const v = this.tasteValue(b, k); if (v !== null) { sum[k] = (sum[k] || 0) + v; n[k] = (n[k] || 0) + 1; } }));
                const tasted = keys.filter(k => n[k]);
                if (!tasted.length) return null;
                const vals = {}; keys.forEach(k => { vals[k] = n[k] ? sum[k] / n[k] : 5; });
                return { vals, tasted };
            },

            storyTopNotes(brews, max = 6) {
                const m = new Map();
                brews.forEach(b => this.extractFlavors(b).forEach(f => { const key = f.toLowerCase(); const cur = m.get(key) || { f, n: 0 }; cur.n++; m.set(key, cur); }));
                return [...m.values()].sort((a, b) => b.n - a.n || a.f.localeCompare(b.f)).slice(0, max).map(x => x.f);
            },

            storyStarsText(r) { return `${this.formatRating(r)}★`; },

            storyFile(c, slug) {
                return new Promise(ok => c.toBlob(b => ok(b ? new File([b], `dialed-in-${String(slug || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'card'}.png`, { type: 'image/png' }) : null), 'image/png'));
            },

            // ---- the sheet: the same one as the shot card
            async openStory({ draw, slug, alt, link = null }) {
                const m = document.getElementById('shot-modal'), body = document.getElementById('shot-body');
                if (!m || !body) return;
                const gen = (this._shotGen || 0) + 1; this._shotGen = gen;
                if (this._shot && this._shot.url) { try { URL.revokeObjectURL(this._shot.url); } catch (e) { /* gone */ } }
                this._shot = { story: true, link };
                const acts = waiting => `<div class="shot-acts"><button type="button" class="btn-primary shot-share" onclick="app.shareShotCard()"${waiting ? ' disabled' : ''}>Share image</button>${link ? '<button type="button" class="btn-outline shot-link" onclick="app.shareShotLink()">Share link</button>' : ''}</div>`;
                body.innerHTML = `<div class="shot-prev is-loading">${this.loaderHtml('Making your picture…')}</div>${acts(true)}`;
                m.classList.add('active');
                try {
                    const canvas = await draw();
                    if (gen !== this._shotGen) return;
                    if (!canvas) throw new Error('nothing to draw');
                    const file = await this.storyFile(canvas, slug);
                    if (gen !== this._shotGen || !file) return;
                    const url = URL.createObjectURL(file);
                    this._shot = { story: true, link, file, url };
                    body.innerHTML = `<div class="shot-prev"><img src="${url}" alt="${this.esc(alt || 'A Story picture')}" width="1080" height="1920"></div>${acts(false)}`;
                } catch (e) {
                    if (gen !== this._shotGen) return;
                    body.innerHTML = `<div class="shot-prev is-empty"><p>That picture couldn't be made.${link ? ' You can still share a link.' : ''}</p></div>${link ? acts(true) : ''}`;
                }
            },

            storyShareBtn(onclick, label = 'Share as a picture') {
                return `<button type="button" class="story-share" aria-label="${this.esc(label)}" onclick="event.stopPropagation(); ${onclick}"><svg class="icon"><use href="#i-share-2"/></svg></button>`;
            },

            // ---- 1. a coffee: your average, your best recipe, its shape and notes
            storyCoffeeData(beanId, who = this.user) {
                const bean = this.beans.get(String(beanId || ''));
                if (!bean) return null;
                const key = this.beanGroupKey(bean);
                const all = [...this.brews.values()].filter(b => this.groupKeyOfBrew(b) === key);
                const mine = all.filter(b => this.getBrewOwner(b) === who);
                const list = mine.length ? mine : all;
                const rated = list.filter(b => this.normalizeRating(b.rating) > 0);
                const avg = rated.length ? rated.reduce((s, b) => s + this.normalizeRating(b.rating), 0) / rated.length : 0;
                const best = rated.slice().sort((a, b) => this.normalizeRating(b.rating) - this.normalizeRating(a.rating) || this.localTime(b.date) - this.localTime(a.date))[0] || null;
                return { bean, list, mine: mine.length > 0, avg, rated: rated.length, best, shape: this.storyAvgShape(list), notes: this.storyTopNotes(list, 6) };
            },

            async drawCoffeeStory(beanId, who = this.user) {
                const D = this.storyCoffeeData(beanId, who); if (!D) return null;
                const b = D.bean, sub = [String(b.roaster || '').trim() || this.teaMakerName(b), b.origin].map(x => String(x || '').trim()).filter(Boolean).join(' · ');   // (v17.1: "Your blend")
                const tea = this.isTeaBean(b);   // v17.0: a tea's picture
                const S = this.storyStart({ who, sub, title: String(b.name || '').trim() || (tea ? 'A tea' : 'A coffee'), fam: this.famOfCoffee ? this.famOfCoffee(b) : '' }); if (!S) return null;
                const { ctx, k } = S; let y = S.y;
                const facts = (tea ? [b.teaType ? `${b.teaType} tea` : '', b.process, b.variety] : [b.process, b.roast ? `${b.roast} roast` : '', b.variety]).map(x => String(x || '').trim()).filter(Boolean).join(' · ');
                if (facts) { ctx.font = k.sans(500, 36); ctx.fillStyle = k.ink2; ctx.fillText(k.fit(facts, k.W - k.PAD * 2), k.PAD, y + 46); y += 66; }
                const chipsH = D.notes.length ? (D.notes.length > 3 ? 172 : 86) + 44 : 0, boxY = k.H - 150 - chipsH - 150;
                const img = D.shape ? await this.storyShape(D.shape.vals, null, D.shape.tasted, [940, 760], tea ? 'tea' : 'coffee', k) : null;
                if (img) this.storyDrawFit(S, img, y + 30 + Math.max(0, (boxY - y - 70 - Math.min(760, boxY - y - 70)) / 2), 940, Math.min(760, boxY - y - 70));
                y = boxY;
                const best = D.best, dose = best ? Number(best.dose) || 0 : 0, out = best ? Number(best.yield) || 0 : 0, t = best ? Number(best.time) || 0 : 0;
                y = this.storyBoxes(S, [
                    D.avg ? { big: [[this.formatRating(D.avg), '★']], small: `avg of ${D.rated}${D.mine ? '' : ' (everyone)'}` } : { big: [[String(D.list.length), '']], small: D.list.length === 1 ? 'session' : 'sessions' },
                    tea && best && best.teabag && out ? { big: [[String(Math.max(1, Number(best.bags) || 1)), Number(best.bags) > 1 ? ' bags' : ' bag'], [this.fmtNum(out, 0), ' ml']], small: `best: ${[Number(best.temp) ? `${Math.round(Number(best.temp))}°C` : '', this.teaTimeText(best)].filter(Boolean).join(' · ') || 'teabag'}`, wide: true } :
                    tea && dose && out ? { big: [[this.fmtNum(dose, 1), ' g'], [this.fmtNum(out, 0), ' ml']], small: `best: ${[Number(best.temp) ? `${Math.round(Number(best.temp))}°C` : '', this.teaTimeText(best)].filter(Boolean).join(' · ') || `1:${this.fmtNum(out / dose, 0)}`}`, wide: true } :
                    dose && out ? { big: [[this.fmtNum(dose, 1), ' g'], [this.fmtNum(out, 1), ' g']], small: `best: 1:${this.fmtNum(out / dose, 1)}${t ? ` · ${best.method === 'Espresso' || !best.method ? `${Math.round(t)} s` : this.clock(t)}` : ''}`, wide: true } : null,
                    best ? { big: [[this.formatRating(this.normalizeRating(best.rating)), '★']], small: 'best' } : null
                ], y);
                if (D.notes.length) this.storyNoteChips(S, D.notes, y + 44, 2);
                return S.c;
            },

            openCoffeeStory(beanId) {
                const bean = this.beans.get(String(beanId || '')); if (!bean) return;
                return this.openStory({ draw: () => this.drawCoffeeStory(beanId), slug: bean.name || (this.isTeaBean(bean) ? 'tea' : 'coffee'), alt: `${bean.name || (this.isTeaBean(bean) ? 'This tea' : 'This coffee')} as a Story picture`, link: () => this.shareItem('coffee', beanId) });
            },

            // ---- 2. the dial-in curves (what the Dial-in tab shows), with your own way there in words
            async drawDialinStory() {
                const all = this.dialinSeries ? this.dialinSeries() : [];
                const series = all.filter(s => !this.dialinMethod || s.method === this.dialinMethod);
                if (!series.some(s => s.ratings.some(Boolean))) return null;
                const meta = this.activeGroup ? this.activeGroup.meta : null;
                const used = new Set();
                series.forEach(s => { let c = this.getUserColor(s.owner); if (used.has(String(c).toLowerCase())) c = (this.beanPalette || []).find(p => !used.has(String(p).toLowerCase())) || c; used.add(String(c).toLowerCase()); s.color = c; });
                const S = this.storyStart({ fam: meta && this.famOfCoffee ? this.famOfCoffee(meta) : '', sub: `Dial-in${this.dialinMethod ? ` · ${this.dialinMethod}` : ''}${meta && meta.roaster ? ` · ${meta.roaster}` : ''}`, title: meta ? String(meta.name || '').trim() || 'This coffee' : 'This coffee' }); if (!S) return null;
                const { ctx, k } = S;
                const L = k.PAD + 76, R = k.W - k.PAD - 10, T = S.y + 60, B = Math.min(T + 880, k.H - 150 - Math.min(series.length, 5) * 118 - 170);
                const maxN = Math.max(2, ...series.map(s => s.shots.length));
                const X = i => L + (i / (maxN - 1)) * (R - L), Y = r => B - ((r - 1) / 4) * (B - T);
                ctx.lineWidth = 2; ctx.strokeStyle = k.grid; ctx.font = k.sans(600, 30); ctx.fillStyle = k.muted; ctx.textAlign = 'right';
                [1, 2, 3, 4, 5].forEach(r => { ctx.beginPath(); ctx.moveTo(L, Y(r)); ctx.lineTo(R, Y(r)); ctx.stroke(); ctx.fillText(`${r}★`, L - 18, Y(r) + 10); });
                ctx.textAlign = 'center';
                const step = maxN > 12 ? Math.ceil(maxN / 6) : (maxN > 6 ? 2 : 1);
                for (let i = 0; i < maxN; i += step) ctx.fillText(String(i + 1), X(i), B + 48);
                ctx.fillText('Session', (L + R) / 2, B + 96);
                ctx.textAlign = 'left';
                const star = (cx, cy, r, color) => { ctx.beginPath(); for (let q = 0; q < 10; q++) { const a = -Math.PI / 2 + q * Math.PI / 5, rr = q % 2 ? r * 0.45 : r; ctx[q ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#141915'; ctx.stroke(); };
                series.forEach(s => {
                    const pts = s.ratings.map((r, i) => (r ? [X(i), Y(r)] : null)).filter(Boolean);
                    if (!pts.length) return;
                    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
                    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1); }
                    ctx.lineWidth = 7; ctx.strokeStyle = s.color; ctx.lineCap = 'round'; ctx.stroke();
                    s.ratings.forEach((r, i) => { if (!r || i === s.dialedAt) return; ctx.beginPath(); ctx.arc(X(i), Y(r), 10, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); });
                    if (s.dialedAt >= 0 && s.ratings[s.dialedAt]) star(X(s.dialedAt), Y(s.ratings[s.dialedAt]), 26, s.color);
                });
                let y = B + 170;
                series.slice(0, 5).forEach(s => {
                    const rated = s.ratings.filter(Boolean), n = s.shots.length;
                    const first = rated[0], top = rated.length ? Math.max(...rated) : 0;
                    const status = s.dialedAt >= 0 ? `Dialed in on session ${s.dialedAt + 1}` : (top ? `Best so far ${this.formatRating(top)}★` : 'No ratings yet');
                    const way = first && top > first ? ` · ${this.formatRating(first)}★ → ${this.formatRating(top)}★` : '';
                    ctx.beginPath(); ctx.arc(k.PAD + 14, y - 13, 14, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
                    ctx.font = k.sans(700, 38); ctx.fillStyle = k.ink; ctx.fillText(k.fit(s.owner, k.W - k.PAD * 2 - 300), k.PAD + 44, y);
                    ctx.textAlign = 'right'; ctx.font = k.sans(500, 34); ctx.fillStyle = k.muted; ctx.fillText(`${n} session${n === 1 ? '' : 's'}`, k.W - k.PAD, y); ctx.textAlign = 'left';
                    ctx.font = k.sans(500, 34); ctx.fillStyle = k.ink2; ctx.fillText(k.fit(`${status}${way}`, k.W - k.PAD * 2 - 44), k.PAD + 44, y + 50);
                    y += 118;
                });
                return S.c;
            },

            openDialinStory() {
                const meta = this.activeGroup ? this.activeGroup.meta : null;
                return this.openStory({ draw: () => this.drawDialinStory(), slug: `${meta && meta.name || 'coffee'}-dial-in`, alt: 'Dial-in curves as a Story picture' });
            },

            // ---- 3. the sweet spot (what the Sweet spot tab shows)
            async drawSweetStory() {
                const all = this.sweetPoints(this.detailBrews || []);
                const points = all.filter(p => (!this.sweetMethod || p.b.method === this.sweetMethod) && (this.sweetWho === 'all' || !this.sweetWho || p.who === this.sweetWho));
                if (points.length < 3) return null;
                const zone = this.sweetZone(points), meta = this.activeGroup ? this.activeGroup.meta : null;
                const S = this.storyStart({ fam: meta && this.famOfCoffee ? this.famOfCoffee(meta) : '', sub: `Sweet spot${this.sweetMethod ? ` · ${this.sweetMethod}` : ''}${this.sweetWho && this.sweetWho !== 'all' ? ` · ${this.sweetWho}` : ''}`, title: meta ? String(meta.name || '').trim() || 'This coffee' : 'This coffee' }); if (!S) return null;
                const { ctx, k } = S;
                const L = k.PAD + 104, R = k.W - k.PAD - 10, T = S.y + 60, B = Math.min(T + 900, 1420);
                const rs = points.map(p => p.ratio), ts = points.map(p => p.time);
                let x0 = Math.min(...rs), x1 = Math.max(...rs), y0 = Math.min(...ts), y1 = Math.max(...ts);
                const padX = Math.max(0.15, (x1 - x0) * 0.12), padY = Math.max(2, (y1 - y0) * 0.12);
                x0 -= padX; x1 += padX; y0 = Math.max(0, y0 - padY); y1 += padY;
                const X = v => L + ((v - x0) / (x1 - x0 || 1)) * (R - L), Y = v => B - ((v - y0) / (y1 - y0 || 1)) * (B - T);
                const ticks = (a, b, n) => { const step = (b - a) / n; const mag = Math.pow(10, Math.floor(Math.log10(step))); const nice = [1, 2, 2.5, 5, 10].map(q => q * mag).find(q => q >= step) || step; const out = []; for (let v = Math.ceil(a / nice) * nice; v <= b + 1e-9; v += nice) out.push(+v.toFixed(6)); return out; };
                ctx.lineWidth = 2; ctx.strokeStyle = k.grid; ctx.font = k.sans(600, 30); ctx.fillStyle = k.muted;
                ctx.textAlign = 'center'; ticks(x0, x1, 4).forEach(v => { ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), B); ctx.stroke(); ctx.fillText(`1:${this.fmtNum(v, 1)}`, X(v), B + 48); });
                ctx.textAlign = 'right'; ticks(y0, y1, 4).forEach(v => { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke(); ctx.fillText(this.fmtSeconds(v), L - 18, Y(v) + 10); });
                ctx.textAlign = 'center'; ctx.fillText('Ratio (out ÷ in)', (L + R) / 2, B + 96); ctx.textAlign = 'left';
                if (zone) {
                    const pad = 30, min = 84, cx = (X(zone.r0) + X(zone.r1)) / 2, cy = (Y(zone.t0) + Y(zone.t1)) / 2;
                    const w = Math.max(min, X(zone.r1) - X(zone.r0) + pad * 2), h = Math.max(min, Y(zone.t0) - Y(zone.t1) + pad * 2);
                    k.round(cx - w / 2, cy - h / 2, w, h, Math.min(38, w / 2, h / 2)); ctx.fillStyle = k.nl ? this.hexToRgba(k.accent, 0.16) : 'rgba(134,172,136,0.16)'; ctx.fill();
                    ctx.setLineDash([12, 12]); ctx.lineWidth = 4; ctx.strokeStyle = k.nl ? this.hexToRgba(k.accent, 0.7) : 'rgba(134,172,136,0.7)'; ctx.stroke(); ctx.setLineDash([]);
                }
                points.slice().sort((p, q) => p.rating - q.rating).forEach(p => {
                    const r = p.rating >= 4.5 ? 19 : 15;
                    ctx.beginPath(); ctx.arc(X(p.ratio), Y(p.time), r, 0, Math.PI * 2);
                    if (p.rating > 0) { ctx.fillStyle = this.ratingColor(p.rating); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = k.nl ? k.bg : '#161C17'; ctx.stroke(); }
                    else { ctx.lineWidth = 4; ctx.strokeStyle = k.muted; ctx.stroke(); }
                });
                let y = B + 160;
                [[2, '2★'], [3.5, '3.5★'], [4.5, '4.5★']].reduce((x, [r, l]) => { ctx.beginPath(); ctx.arc(x + 14, y - 12, 14, 0, Math.PI * 2); ctx.fillStyle = this.ratingColor(r); ctx.fill(); ctx.font = k.sans(600, 32); ctx.fillStyle = k.ink2; ctx.fillText(l, x + 38, y); return x + 38 + ctx.measureText(l).width + 44; }, k.PAD);
                y += 80;
                const shot = this.shotWord ? this.shotWord(this.sweetMethod) : 'shot';
                const line = zone
                    ? `Best ${shot}s cluster at 1:${this.fmtNum(zone.r0, 1)}${this.fmtNum(zone.r1, 1) !== this.fmtNum(zone.r0, 1) ? `–${this.fmtNum(zone.r1, 1)}` : ''} in ${Math.round(zone.t1) === Math.round(zone.t0) ? this.fmtSeconds(zone.t0) : (zone.t1 < 90 ? `${Math.round(zone.t0)}–${Math.round(zone.t1)} s` : `${this.fmtSeconds(zone.t0)}–${this.fmtSeconds(zone.t1)}`)}: those ${zone.n} average ${this.fmtNum(Math.round(zone.avg * 10) / 10)}★ (${this.fmtNum(Math.round(zone.mean * 10) / 10)}★ across all ${zone.of}).`
                    : 'No clear sweet spot yet: no area stands out above the rest.';
                ctx.font = `italic ${k.serif(400, 46)}`; ctx.fillStyle = k.ink2;
                k.wrap(line, k.W - k.PAD * 2, 3).forEach((l, i) => ctx.fillText(l, k.PAD, y + 62 * i));
                return S.c;
            },

            openSweetStory() {
                const meta = this.activeGroup ? this.activeGroup.meta : null;
                return this.openStory({ draw: () => this.drawSweetStory(), slug: `${meta && meta.name || 'coffee'}-sweet-spot`, alt: 'Sweet spot as a Story picture' });
            },

            // ---- 4. two sessions compared (no grind: two grinders don't compare, and it's yours alone anyway)
            async drawCompareStory() {
                const aSel = document.getElementById('compare-a-select'), bSel = document.getElementById('compare-b-select');
                const A = aSel && this.brews.get(String(aSel.value || '')), B = bSel && this.brews.get(String(bSel.value || ''));
                if (!A || !B || A === B) return null;
                const meta = this.activeGroup ? this.activeGroup.meta : null;
                const S = this.storyStart({ fam: meta && this.famOfCoffee ? this.famOfCoffee(meta) : '', sub: `Compare${meta && meta.roaster ? ` · ${meta.roaster}` : ''}`, title: meta ? String(meta.name || '').trim() || 'Two sessions' : 'Two sessions' }); if (!S) return null;
                const { ctx, k } = S; let y = S.y + 30;
                const cw = (k.W - k.PAD * 2 - 24) / 2, ch = 210;
                [[A, 'A', '#4E7B57'], [B, 'B', '#8A63C4']].forEach(([x, tag, col], i) => {
                    const cx = k.PAD + i * (cw + 24), who = this.getBrewOwner(x), r = this.normalizeRating(x.rating);
                    k.round(cx, y, cw, ch, 40); ctx.fillStyle = k.box; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = k.boxLine; ctx.stroke();
                    ctx.fillStyle = col; k.round(cx, y, 12, ch, 6); ctx.fill();
                    ctx.font = k.sans(800, 30); ctx.fillStyle = k.muted; ctx.textAlign = 'right'; ctx.fillText(tag, cx + cw - 30, y + 52); ctx.textAlign = 'left';
                    ctx.beginPath(); ctx.arc(cx + 50, y + 52 - 12, 12, 0, Math.PI * 2); ctx.fillStyle = this.getUserColor(who); ctx.fill();
                    ctx.font = k.sans(700, 40); ctx.fillStyle = k.ink; ctx.fillText(k.fit(who, cw - 140), cx + 74, y + 52);
                    ctx.font = k.sans(500, 33); ctx.fillStyle = k.ink2; ctx.fillText(k.fit(`${new Date(this.localTime(x.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${x.method ? ` · ${x.method}` : ''}`, cw - 80), cx + 40, y + 112);
                    ctx.font = k.sans(700, 44); ctx.fillStyle = '#E3B341'; ctx.fillText(r ? '★'.repeat(Math.round(r)) : '', cx + 40, y + 176);
                    if (r) { const sw = ctx.measureText('★'.repeat(Math.round(r))).width; ctx.fillStyle = k.ink; ctx.font = k.sans(700, 40); ctx.fillText(this.formatRating(r), cx + 52 + sw, y + 174); }
                    else { ctx.font = k.sans(600, 34); ctx.fillStyle = k.muted; ctx.fillText('Unrated', cx + 40, y + 174); }
                });
                y += ch + 40;
                const num = v => { const n = this.num(v); return n > 0 ? n : null; };
                const esp = x => !x.method || x.method === 'Espresso';
                const age = x => this.roastDays ? this.roastDays(x.roastDate, x.date) : null;
                const rows = [];
                const add = (label, av, bv, show) => { if (av === null && bv === null) return; const d = av !== null && bv !== null ? av - bv : null; rows.push([label, av === null ? '–' : show(av), bv === null ? '–' : show(bv), d === null ? '' : Math.abs(d) < 1e-9 ? 'same' : `${d > 0 ? '+' : '−'}${this.fmtNum(Math.abs(d), 2)}`]); };
                const tea = this.isTeaBrew(A);   // v17.0: two teas: leaf, water, temperature, steep, steeps
                if (tea) {
                    add('Leaf', num(A.dose), num(B.dose), v => `${this.fmtNum(v, 1)} g`);
                    add('Water', num(A.yield), num(B.yield), v => `${this.fmtNum(v, 0)} ml`);
                    add('Temp', num(A.temp), num(B.temp), v => `${this.fmtNum(v, 0)}°C`);
                    add('Steep', num(A.time), num(B.time), v => (this.methodProfile(A.method).hours ? `${this.fmtNum(v, 1)} h` : this.fmtSteep(v)));
                    add('Steeps', this.teaStepsOf(A).length || null, this.teaStepsOf(B).length || null, v => String(v));
                } else {
                add('Dose', num(A.dose), num(B.dose), v => `${this.fmtNum(v, 1)} g`);
                add(esp(A) && esp(B) ? 'Pull' : !esp(A) && !esp(B) ? 'Pour' : 'Pull / water', num(A.yield), num(B.yield), v => `${this.fmtNum(v, 1)} g`);
                add('Time', num(A.time), num(B.time), v => (esp(A) && esp(B) ? `${this.fmtNum(v)} s` : this.clock(v)));
                add('Ratio', this.ratioOf(A) || null, this.ratioOf(B) || null, v => `1:${this.fmtNum(v, 2)}`);
                add('Off roast', age(A), age(B), v => (v === 0 ? 'Roast day' : `Day ${v}`));
                }
                add('Rating', this.normalizeRating(A.rating) || null, this.normalizeRating(B.rating) || null, v => `${this.formatRating(v)}★`);
                const tw = k.W - k.PAD * 2, rh = 92, cols = [k.PAD + 40, k.PAD + tw * 0.40, k.PAD + tw * 0.66, k.PAD + tw - 40];
                k.round(k.PAD, y, tw, rh * (rows.length + 1), 40); ctx.fillStyle = k.box; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = k.boxLine; ctx.stroke();
                ctx.font = k.nl ? k.sans(700, 30) : k.sans(800, 28); ctx.fillStyle = k.muted;
                ctx.fillText('A', cols[1], y + 58); ctx.fillText('B', cols[2], y + 58); ctx.textAlign = 'right'; ctx.fillText(k.nl ? 'A vs B' : 'A VS B', cols[3], y + 58); ctx.textAlign = 'left';
                rows.forEach(([l, av, bv, d], i) => {
                    const ry = y + rh * (i + 1);
                    ctx.strokeStyle = k.boxLine; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(k.PAD, ry); ctx.lineTo(k.PAD + tw, ry); ctx.stroke();
                    ctx.font = k.sans(600, 36); ctx.fillStyle = k.ink2; ctx.fillText(l, cols[0], ry + 58);
                    ctx.font = k.sans(700, 38); ctx.fillStyle = k.ink; ctx.fillText(k.fit(av, cols[2] - cols[1] - 16), cols[1], ry + 58); ctx.fillText(k.fit(bv, cols[3] - cols[2] - 130), cols[2], ry + 58);
                    ctx.font = k.sans(700, 32); ctx.fillStyle = d === 'same' ? k.muted : k.ink2; ctx.textAlign = 'right'; ctx.fillText(d, cols[3], ry + 58); ctx.textAlign = 'left';
                });
                y += rh * (rows.length + 1) + 30;
                const ta = this.tastedKeys(A), tb = this.tastedKeys(B);
                if ((ta.length || tb.length) && y < 1560) {
                    const img = await this.storyShape(this.shapeValues(A), this.shapeValues(B), ta, [900, 700], tea ? 'tea' : 'coffee', k.nl ? k : null);
                    if (img) {
                        const bottom = this.storyDrawFit(S, img, y, 900, Math.min(700, k.H - 130 - y));
                        ctx.font = k.sans(700, 30); ctx.fillStyle = k.ink2; ctx.strokeStyle = k.ink2; ctx.lineWidth = 5;
                        ctx.beginPath(); ctx.moveTo(k.PAD + 10, bottom - 10); ctx.lineTo(k.PAD + 60, bottom - 10); ctx.stroke(); ctx.fillText('A', k.PAD + 74, bottom);
                        ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(k.PAD + 130, bottom - 10); ctx.lineTo(k.PAD + 180, bottom - 10); ctx.stroke(); ctx.setLineDash([]); ctx.fillText('B', k.PAD + 194, bottom);
                    }
                }
                return S.c;
            },

            openCompareStory() {
                const meta = this.activeGroup ? this.activeGroup.meta : null;
                return this.openStory({ draw: () => this.drawCompareStory(), slug: `${meta && meta.name || 'coffee'}-compare`, alt: 'Two sessions compared, as a Story picture' });
            },

            // ---- 5. a roaster: its tile, where it is, your local tick, and the coffees from it
            async drawRoasterStory(key, kindIn) {
                // v17.0: a brand's picture lists its teas (the side asked for, else the one on screen, else whichever has it)
                const onScreen = this.roasterViewActive && this.roasterViewActive() ? this.roasterOpenKind : '';
                const kind = kindIn === 'tea' || kindIn === 'coffee' ? kindIn : onScreen === 'tea' || onScreen === 'coffee' ? onScreen : (!this.roasterFind(key, 'coffee') && this.roasterFind(key, 'tea') ? 'tea' : 'coffee'), w = this.drinkWords(kind);
                const r = this.roasterData(kind).byKey.get(key) || this.roasterData().byKey.get(key); if (!r) return null;
                const S = this.storyStart({ sub: '', title: '', fam: this.famOfRoaster ? this.famOfRoaster(r.name, kind) : '' }); if (!S) return null;
                const { ctx, k } = S; let y = 330;
                const set = this.ROASTER_COLORS[r.key] || this.ROASTER_COLORS[RoasterEngine.keyOf(r.name)];
                const cov = k.nl && r.info && r.info.cover, cp = k.nl && this.nlTonePal && this.famOfRoaster ? this.nlTonePal(this.famOfRoaster(r.name, kind), k.dark) : null;   // (v17.7: its own color, never one from a photo)   // v17.5: its picture
                const g = ctx.createLinearGradient(k.PAD, y, k.PAD + 220, y + 220);
                g.addColorStop(0, cp ? cp.tileA : set ? set[0] : `hsl(${r.hue} 44% 60%)`); g.addColorStop(1, cp ? cp.tileB : set ? set[1] : `hsl(${(r.hue + 24) % 360} 40% 40%)`);
                k.round(k.PAD, y, 220, 220, 56); ctx.fillStyle = g; ctx.fill();
                const photo = cov && cov.photo && this.faceUrl ? await this.storyLoadCors(this.faceUrl(cov.photo)) : null;
                if (photo) { ctx.save(); k.round(k.PAD, y, 220, 220, 56); ctx.clip(); const z = Math.max(220 / photo.naturalWidth, 220 / photo.naturalHeight); ctx.drawImage(photo, k.PAD + (220 - photo.naturalWidth * z) / 2, y + (220 - photo.naturalHeight * z) / 2, photo.naturalWidth * z, photo.naturalHeight * z); ctx.restore(); }
                else { ctx.font = k.serif(700, 92); ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.fillText(this.roasterInitials(r.name), k.PAD + 110, y + 142); ctx.textAlign = 'left'; }
                y += 220 + 40;
                const info = r.info || {}, local = (r.localBy || []).includes(this.user);
                ctx.font = k.sans(600, 36); ctx.fillStyle = k.muted;
                const where = String(info.location || '').trim();
                if (where || local) { ctx.fillText(k.fit([w.Company, where].filter(Boolean).join(' · '), k.W - k.PAD * 2 - (local ? 260 : 0)), k.PAD, y + 26); }
                if (local) {
                    const label = 'Local to me', lw = (ctx.font = k.sans(700, 32), ctx.measureText(label).width + 100), lx = k.W - k.PAD - lw;
                    k.round(lx, y - 22, lw, 64, 32); ctx.fillStyle = k.nl ? k.box : 'rgba(134,172,136,0.2)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = k.nl ? k.boxLine : 'rgba(134,172,136,0.5)'; ctx.stroke();
                    const pin = await this.storyIcon('i-pin', k.nl ? k.accent : '#A9CFA9'); if (pin) ctx.drawImage(pin, lx + 22, y - 8, 36, 36);
                    ctx.fillStyle = k.nl ? k.ink : '#C5E3C3'; ctx.fillText(label, lx + 66, y + 22);
                }
                y += 48;
                ctx.font = k.serif(600, 96); ctx.fillStyle = k.nl ? k.name : k.ink;
                const lines = k.wrap(r.name, k.W - k.PAD * 2, 2); lines.forEach((l, i) => ctx.fillText(l, k.PAD, y + 108 * (i + 1) - 18)); y += 108 * lines.length + 40;
                const mine = r.people.find(p => p.name === this.user);
                y = this.storyBoxes(S, [
                    { big: [[String(r.coffees.length), '']], small: r.coffees.length === 1 ? w.item : w.items },
                    { big: [[String(mine ? mine.sessions : r.sessions), '']], small: mine ? 'your sessions' : 'sessions' },
                    (mine ? mine.avg : r.avg) ? { big: [[this.formatRating(mine ? mine.avg : r.avg), '★']], small: mine ? 'your average' : 'average' } : null
                ], y);
                y += 70;
                ctx.font = k.nl ? k.sans(700, 34) : k.sans(800, 30); ctx.fillStyle = k.muted; ctx.fillText(k.nl ? w.Items : w.Items.toUpperCase(), k.PAD, y); y += 34;
                const list = r.coffees.slice().sort((a, b) => b.sessions - a.sessions || (b.avg || 0) - (a.avg || 0)).slice(0, 6);
                list.forEach(cf => {
                    if (y > k.H - 140) return;
                    ctx.strokeStyle = k.boxLine; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(k.PAD, y); ctx.lineTo(k.W - k.PAD, y); ctx.stroke();
                    ctx.font = k.sans(700, 40); ctx.fillStyle = k.ink; ctx.fillText(k.fit(cf.name, k.W - k.PAD * 2 - 260), k.PAD, y + 66);
                    if (cf.origin) { ctx.font = k.sans(500, 31); ctx.fillStyle = k.muted; ctx.fillText(k.fit(cf.origin, k.W - k.PAD * 2 - 260), k.PAD, y + 108); }
                    ctx.textAlign = 'right'; ctx.font = k.sans(700, 40); ctx.fillStyle = cf.avg ? '#E3B341' : k.muted; ctx.fillText(cf.avg ? `${this.formatRating(cf.avg)}★` : '–', k.W - k.PAD, y + 66);
                    ctx.font = k.sans(500, 31); ctx.fillStyle = k.muted; ctx.fillText(`${cf.sessions} session${cf.sessions === 1 ? '' : 's'}`, k.W - k.PAD, y + 108); ctx.textAlign = 'left';
                    y += 140;
                });
                return S.c;
            },

            openRoasterStory(key) {
                const r = this.roasterData(this.roasterOpenKind === 'tea' ? 'tea' : 'coffee').byKey.get(key) || this.roasterData().byKey.get(key); if (!r) return;
                return this.openStory({ draw: () => this.drawRoasterStory(key), slug: r.name, alt: `${r.name} as a Story picture`, link: () => this.shareItem('roaster', r.name) });
            },

            // ---- 6. a finished group goal: the bar, everyone's part, the week
            async drawGoalStory() {
                const q = this.crewQuest(); if (!q || !q.done) return null;
                const scope = this._crewScope;
                const fmt = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const S = this.storyStart({ sub: `${scope ? (scope.id === 'friends' ? 'Friends' : scope.name) : 'Group goal'} · ${fmt(q.start)} – ${fmt(q.end - 1)}`, title: q.title, titleLines: 3, titleSize: 84 }); if (!S) return null;
                const { ctx, k } = S; let y = S.y + 70;
                const trophy = await this.storyIcon('i-trophy', '#F2C94C');
                if (trophy) ctx.drawImage(trophy, k.PAD, y - 6, 64, 64);
                ctx.font = k.sans(800, 52); ctx.fillStyle = '#F2C94C'; ctx.fillText('Done together', k.PAD + (trophy ? 84 : 0), y + 46);
                y += 110;
                const bw = k.W - k.PAD * 2, bh = 64;
                k.round(k.PAD, y, bw, bh, 32); ctx.fillStyle = k.nl ? k.grid : 'rgba(255,255,255,0.08)'; ctx.fill();
                const segs = this.crewSegs(q), count = this.crewCount(q), countText = `${count.n}${count.rest}`;   // v16.8: as on the card
                let used = 0;
                ctx.save(); k.round(k.PAD, y, bw, bh, 32); ctx.clip();
                segs.forEach(s => { const w = Math.max(0, Math.min(1 - used, s.w)); if (w <= 0) return; ctx.fillStyle = this.getUserColor(s.p); ctx.fillRect(k.PAD + used * bw, y, w * bw + 1, bh); used += w; });
                ctx.restore();
                y += bh + 64;
                ctx.font = k.sans(700, 46); ctx.fillStyle = k.ink; ctx.fillText(countText, k.PAD, y);
                if (q.detail) { const w = ctx.measureText(countText).width; ctx.font = k.sans(500, 36); ctx.fillStyle = k.muted; ctx.fillText(k.fit(` · ${q.detail}`, k.W - k.PAD * 2 - w), k.PAD + w, y); }
                y += 110;
                const faces = q.by.slice().sort((a, b) => b[1] - a[1]).slice(0, 8), per = faces.length > 4 ? 4 : faces.length, size = 168, gap = per > 1 ? Math.min(90, (k.W - k.PAD * 2 - size * per) / (per - 1)) : 0, x0 = (k.W - (per * size + (per - 1) * gap)) / 2;
                faces.forEach(([p, n], i) => {
                    const col = i % per, row = Math.floor(i / per), cx = x0 + size / 2 + col * (size + gap), cy = y + size / 2 + row * (size + 150);
                    const color = this.getUserColor(p);
                    ctx.beginPath(); ctx.arc(cx, cy, size / 2 + 9, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.stroke();
                    ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
                    ctx.font = k.sans(800, 70); ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.fillText(this.feedInitial(p), cx, cy + 25);
                    ctx.font = k.sans(700, 36); ctx.fillStyle = k.ink; ctx.fillText(k.fit(p, size + gap - 20), cx, cy + size / 2 + 60);
                    ctx.font = k.sans(500, 32); ctx.fillStyle = k.muted; ctx.fillText(`${n} ${q.type === 'everyone' || q.unit === 'sessions' ? `session${n === 1 ? '' : 's'}` : ''}`.trim(), cx, cy + size / 2 + 104); ctx.textAlign = 'left';
                });
                const won = this.questsWon ? this.questsWon() : 0;
                if (won) { ctx.font = k.sans(600, 36); ctx.fillStyle = k.ink2; ctx.fillText(`${won} goal${won === 1 ? '' : 's'} reached together`, k.PAD, k.H - 170); }
                return S.c;
            },

            openGoalStory() { return this.openStory({ draw: () => this.drawGoalStory(), slug: 'group-goal', alt: 'Your finished group goal as a Story picture' }); },

            // ---- 7. a month's awards (the month the Awards card shows, once it's open)
            async drawAwardsStory(key) {
                const k0 = String(key || this.awardsMonth || ''); if (!k0 || (this.monthLocked && this.monthLocked(k0))) return null;
                const [yy, mm] = k0.split('-').map(Number);
                const awards = this.crewAwardsMemo ? this.crewAwardsMemo(yy, mm - 1) : this.crewAwards(yy, mm - 1);
                if (!awards || !awards.length) return null;
                const scope = this._crewScope;
                const S = this.storyStart({ date: 0, sub: `Monthly awards${scope ? ` · ${scope.id === 'friends' ? 'Friends' : scope.name}` : ''}`, title: this.monthName(k0, true) }); if (!S) return null;
                const { ctx, k } = S; let y = S.y + 40;
                const list = awards.slice(0, 8), cols = 2, gap = 24, cw = (k.W - k.PAD * 2 - gap) / cols, ch = Math.min(300, Math.floor((k.H - 150 - y - gap * 3) / 4));
                for (let i = 0; i < list.length; i++) {
                    const a = list[i], cx = k.PAD + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap);
                    k.round(cx, cy, cw, ch, 40); ctx.fillStyle = k.box; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = k.boxLine; ctx.stroke();
                    ctx.beginPath(); ctx.arc(cx + 72, cy + 74, 42, 0, Math.PI * 2); ctx.fillStyle = a.color || '#5B7FA6'; ctx.fill();
                    const icon = await this.storyIcon(a.icon || 'i-trophy', '#FFFFFF'); if (icon) ctx.drawImage(icon, cx + 48, cy + 50, 48, 48);
                    ctx.font = k.sans(700, 36); ctx.fillStyle = k.ink; k.wrap(a.title, cw - 64, 2).forEach((l, j) => ctx.fillText(l, cx + 32, cy + 168 + j * 42));
                    const ty = cy + ch - 34;
                    ctx.font = k.sans(700, 34); ctx.fillStyle = this.getUserColor(a.winners[0]) || k.ink2; ctx.fillText(k.fit(a.winners.join(' & '), cw - 64), cx + 32, ty - 40);
                    ctx.font = k.sans(500, 30); ctx.fillStyle = k.muted; ctx.fillText(k.fit(String(a.stat || ''), cw - 64), cx + 32, ty);
                }
                return S.c;
            },

            openAwardsStory() { const key = this.awardsMonth; return this.openStory({ draw: () => this.drawAwardsStory(key), slug: `awards-${key}`, alt: 'This month\'s awards as a Story picture' }); },

            // ---- 8. your level: the badge, the crema, what's next, and your latest achievements
            async drawLevelStory(who = this.user) {
                const c = this.cremaOf(who); if (c === null || c === undefined) return null;
                const L = this.levelOf(c), fmt = x => Math.round(x).toLocaleString();
                const S = this.storyStart({ who }); if (!S) return null;
                const { ctx, k } = S; let y = 360;
                const svg = (k.nl && this.nlLevelBadge ? this.nlLevelBadge(L.i, 480) : this.levelSvg(L.i, 480)).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');   // (v17.9: the New look's badge, its icon)
                const badge = await this.storyLoad('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
                if (badge) ctx.drawImage(badge, (k.W - 420) / 2, y, 420, 420);
                y += 420 + 90;
                ctx.textAlign = 'center';
                const unit = ' crema', tier = this.levelTiers()[L.t].name;   // (v17.9: crema in the New look again)
                ctx.font = k.nl ? k.hand(40) : k.sans(700, 36); ctx.fillStyle = k.nl ? k.accent : k.muted; ctx.fillText(k.nl ? `${who === this.user ? 'My' : `${who}'s`} level · ${tier === 'The top' ? 'Top' : tier}` : `${who === this.user ? 'My' : `${who}'s`} level · Level ${L.n}`, k.W / 2, y);
                ctx.font = k.serif(600, 110); ctx.fillStyle = k.nl ? k.name : k.ink; ctx.fillText(k.fit(k.nl ? `Level ${L.n}` : L.name, k.W - k.PAD * 2), k.W / 2, y + 130);
                ctx.font = k.sans(700, 54); ctx.fillStyle = k.nl ? k.ink : '#FFFFFF'; const cr = `${fmt(L.crema)}`; const cw = ctx.measureText(cr).width; ctx.font = k.sans(500, 40); const lw = ctx.measureText(unit).width;
                ctx.textAlign = 'left'; ctx.font = k.sans(700, 54); ctx.fillText(cr, (k.W - cw - lw) / 2, y + 230); ctx.font = k.sans(500, 40); ctx.fillStyle = k.ink2; ctx.fillText(unit, (k.W - cw - lw) / 2 + cw, y + 230);
                y += 300;
                if (L.next) {
                    const bw = k.W - k.PAD * 2 - 120, bx = (k.W - bw) / 2;
                    k.round(bx, y, bw, 30, 15); ctx.fillStyle = k.nl ? k.grid : 'rgba(255,255,255,0.1)'; ctx.fill();
                    const T = this.levelTiers()[L.t], NT = k.nl && this.NL_TIER_LOOK ? this.NL_TIER_LOOK[L.t] : null; const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, NT ? NT.ring : T.from); g.addColorStop(1, NT ? (L.t === 4 ? NT.bg : NT.ink) : T.to);
                    k.round(bx, y, Math.max(30, bw * L.pct / 100), 30, 15); ctx.fillStyle = g; ctx.fill();
                    ctx.textAlign = 'center'; ctx.font = k.sans(500, 36); ctx.fillStyle = k.ink2; ctx.fillText(k.nl ? `${fmt(L.next.min - L.crema)} more to level ${L.n + 1}` : `${fmt(L.next.min - L.crema)} more to ${L.next.name}`, k.W / 2, y + 96); ctx.textAlign = 'left';
                    y += 150;
                } else { ctx.textAlign = 'center'; ctx.font = k.sans(500, 38); ctx.fillStyle = k.ink2; ctx.fillText(k.nl ? 'The top level.' : 'The top level. Dialed in.', k.W / 2, y + 40); ctx.textAlign = 'left'; y += 110; }
                // the latest achievements unlocked
                const recent = [];
                [this.achievementUnlockByBrew, this.achievementUnlockByBean].forEach(map => map && map.forEach(list => list.forEach(u => { if (u.user === who) recent.push(u); })));
                const latest = recent.sort((a, b) => this.toTime(b.date) - this.toTime(a.date)).slice(0, 3);
                if (latest.length && y < k.H - 340) {
                    y += 30; ctx.font = k.nl ? k.sans(700, 34) : k.sans(800, 30); ctx.fillStyle = k.muted; ctx.fillText(k.nl ? 'Latest achievements' : 'LATEST ACHIEVEMENTS', k.PAD, y); y += 30;
                    latest.forEach(u => {
                        if (y > k.H - 160) return;
                        ctx.strokeStyle = k.boxLine; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(k.PAD, y); ctx.lineTo(k.W - k.PAD, y); ctx.stroke();
                        ctx.font = k.sans(700, 38); ctx.fillStyle = k.ink; ctx.fillText(k.fit(`${u.definition.title}${u.definition.thresholds.length > 1 ? ` · Level ${u.level}` : ''}`, k.W - k.PAD * 2 - 200), k.PAD, y + 64);
                        ctx.textAlign = 'right'; ctx.font = k.sans(500, 32); ctx.fillStyle = k.muted; ctx.fillText(new Date(this.toTime(u.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), k.W - k.PAD, y + 64); ctx.textAlign = 'left';
                        y += 100;
                    });
                }
                return S.c;
            },

            openLevelStory() { return this.openStory({ draw: () => this.drawLevelStory(this.user), slug: 'my-level', alt: 'Your level as a Story picture' }); },

            // ---- 9. your palate: what you lean toward, your shape, your notes
            async drawPalateStory(who = this.user) {
                const p = this.palateFor(who); if (!p || p.count < 3) return null;
                const S = this.storyStart({ who, sub: who === this.user ? (p.kind === 'tea' ? 'My tea palate' : 'My palate') : `${who}'s ${p.kind === 'tea' ? 'tea ' : ''}palate` }); if (!S) return null;
                const { ctx, k } = S; let y = S.y + 20;
                ctx.font = k.serif(600, 62); ctx.fillStyle = k.nl ? k.name : k.ink;
                const lines = k.wrap(this.palateSentence(p), k.W - k.PAD * 2, 5); lines.forEach((l, i) => ctx.fillText(l, k.PAD, y + 74 * (i + 1) - 14)); y += 74 * lines.length + 10;
                const shape = this.storyAvgShape(this.brewsOf(who).filter(b => this.isTeaBrew(b) === (p.kind === 'tea')));
                const img = shape ? await this.storyShape(shape.vals, null, shape.tasted, [820, 600], p.kind, k) : null;
                y = img ? this.storyDrawFit(S, img, y + 10, 820, Math.min(600, 1360 - y)) + 10 : y + 30;
                const groups = [['Origins', p.origins], [p.kind === 'tea' ? 'Processing' : 'Process', p.processes], [p.kind === 'tea' ? 'Type' : 'Roast', p.roasts], ['Methods', p.methods]].filter(([, l]) => l.length);
                if (p.notes.length) { ctx.font = k.nl ? k.sans(700, 34) : k.sans(800, 30); ctx.fillStyle = k.muted; ctx.fillText(k.nl ? 'Notes' : 'NOTES', k.PAD, y + 20); y = this.storyNoteChips(S, p.notes.map(n => n.label), y + 44, 2) + 34; }
                groups.slice(0, 3).forEach(([label, list]) => {
                    if (y > k.H - 200) return;
                    ctx.font = k.nl ? k.sans(700, 34) : k.sans(800, 30); ctx.fillStyle = k.muted; ctx.fillText(k.nl ? label : label.toUpperCase(), k.PAD, y + 30);
                    ctx.font = k.sans(600, 38); ctx.fillStyle = k.ink; ctx.fillText(k.fit(list.map(x => x.label).join(' · '), k.W - k.PAD * 2 - 260), k.PAD + 260, y + 30);
                    y += 70;
                });
                if (p.rated && y < k.H - 130) { ctx.font = k.sans(500, 32); ctx.fillStyle = k.muted; ctx.fillText(`From ${p.rated} rated session${p.rated === 1 ? '' : 's'} · avg ${this.formatRating(p.avgRating)}★`, k.PAD, Math.max(y + 40, k.H - 150)); }
                return S.c;
            },

            openPalateStory(who = this.user) { return this.openStory({ draw: () => this.drawPalateStory(who), slug: `${who}-palate`, alt: 'Your palate as a Story picture' }); },

            // ---- 10. the recipe as it's set in the log form (coffee, water, ratio, temperature, steps)
            async drawRecipeStory() {
                const method = this.activeMethod, form = this.getBrewForm();
                const coffee = form ? Number(form.dose.value) : 0, water = form ? Number(form.yield.value) : 0;
                const active = this.recipesFor ? this.recipesFor(method).find(r => r.id === this.recipeId) : null;
                const plan = this.stepPlan(this.recipeSteps || [], water || 0);
                if (!(coffee > 0) || !(water > 0)) return null;
                const x = this.methodExtras || {}, brewer = x.brewer || (active && active.brewer) || '', temp = Number(x.temp) || (active && Number(active.temp)) || 0;
                const S = this.storyStart({ sub: ['Recipe', method, brewer].filter(Boolean).join(' · '), title: active ? active.name : `My ${String(method || 'brew').toLowerCase()} recipe` }); if (!S) return null;
                const { ctx, k } = S; let y = S.y + 40;
                y = this.storyBoxes(S, [{ big: [[this.fmtNum(coffee, 1), ' g'], [this.fmtNum(water, 0), ' g']], small: `1:${this.fmtNum(water / coffee, 1)}`, wide: true }, temp ? { big: [[this.fmtNum(temp, 0), '°']], small: 'water temp' } : null, plan.length ? { big: [[this.clock(plan[plan.length - 1].end), '']], small: 'total time' } : null], y);
                y += 70;
                if (plan.length) {
                    ctx.font = k.nl ? k.sans(700, 34) : k.sans(800, 30); ctx.fillStyle = k.muted; ctx.fillText(k.nl ? 'Steps' : 'STEPS', k.PAD, y); y += 30;
                    const rh = Math.min(104, Math.floor((k.H - 160 - y) / Math.min(plan.length, 12)));
                    plan.slice(0, 12).forEach(st => {
                        const kind = (typeof STEP_KINDS !== 'undefined' && STEP_KINDS[st.k]) || { label: st.k, color: '#8A958C' };
                        ctx.strokeStyle = k.boxLine; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(k.PAD, y); ctx.lineTo(k.W - k.PAD, y); ctx.stroke();
                        ctx.font = k.sans(700, 32); ctx.fillStyle = k.muted; ctx.fillText(this.clock(st.start), k.PAD, y + rh * 0.62);
                        ctx.beginPath(); ctx.arc(k.PAD + 128, y + rh * 0.62 - 11, 12, 0, Math.PI * 2); ctx.fillStyle = kind.color; ctx.fill();
                        const what = st.k === 'pour' && st.to ? `${kind.label} to ${st.to} g` : `${kind.label} ${Math.round(st.end - st.start)} s`;
                        ctx.font = k.sans(700, 38); ctx.fillStyle = k.ink; ctx.fillText(what, k.PAD + 162, y + rh * 0.62);
                        if (st.n) { const w = ctx.measureText(what).width; ctx.font = k.sans(500, 32); ctx.fillStyle = k.muted; ctx.fillText(k.fit(` · ${st.n}`, k.W - k.PAD * 2 - 170 - w), k.PAD + 162 + w, y + rh * 0.62); }
                        y += rh;
                    });
                }
                if (active && active.credit && y < k.H - 130) { ctx.font = `italic ${k.serif(400, 34)}`; ctx.fillStyle = k.muted; ctx.fillText(k.fit(active.credit, k.W - k.PAD * 2), k.PAD, k.H - 140); }
                return S.c;
            },

            openRecipeStory() {
                const active = this.recipesFor ? this.recipesFor(this.activeMethod).find(r => r.id === this.recipeId) : null;
                return this.openStory({ draw: () => this.drawRecipeStory(), slug: active ? active.name : 'recipe', alt: 'Your recipe as a Story picture' });
            },
