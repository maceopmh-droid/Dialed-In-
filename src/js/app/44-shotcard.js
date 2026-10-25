            // ===================== v15.2: the shot card =====================
            // Share on one of your own sessions makes a picture for an Instagram Story (1080 x 1920): your photo on top,
            // then the coffee, dose → yield, time, the rating, the flavor shape and "your cup in words", with your name, the
            // date and Dialed In on it. A session without a photo (or one that can't be read) gets the dark card with the
            // shape on top instead. Never the grind (it only means something on your own grinder). Someone else's session
            // still shares a link. The picture is made when the sheet opens, so Share opens the share sheet at once
            // (iPhone only allows that straight after a tap).
            shotCardData(b) {
                const bean = this.beans.get(String(b.beanId || '')) || {};
                const tasted = this.tastedKeys(b), notes = this.extractFlavors(b);
                const r = this.normalizeRating(b.rating), dose = Number(b.dose) || 0, out = Number(b.yield) || 0, time = Number(b.time) || 0;
                const t = this.localTime(b.date);
                const boxes = [], tea = this.isTeaBrew(b);   // v17.0: a tea's card: leaf in water, the steep (and how many), the temperature
                if (tea) {
                    const temp = Number(b.temp) || 0, steeps = this.teaStepsOf(b), p = this.methodProfile(b.method);
                    const bags = b.teabag ? Math.max(1, Number(b.bags) || 1) : 0, st = b.method === 'Matcha' ? this.matchaStyle(b) : null;
                    if (bags) boxes.push({ big: [[String(bags), bags === 1 ? ' bag' : ' bags'], out ? [this.fmtNum(out, 0), ' ml'] : null].filter(Boolean), small: 'teabag', wide: true });
                    else if (dose || out) boxes.push({ big: [dose ? [this.fmtNum(dose, 1), ' g'] : null, out ? [this.fmtNum(out, 0), ' ml'] : null].filter(Boolean), small: [st ? st.short.toLowerCase() : (b.method === 'Matcha' ? 'matcha' : 'leaf'), dose && out ? `1:${this.fmtNum(out / dose, 0)}` : ''].filter(Boolean).join(' · '), wide: true });
                    if (time) boxes.push({ big: [p.hours ? [this.fmtNum(time, 1), ' h'] : time >= 60 ? [this.clock(time), ''] : [String(Math.round(time)), ' s']], small: steeps.length > 1 ? `${steeps.length} steeps` : 'steep' });
                    else if (temp) boxes.push({ big: [[String(Math.round(temp)), '°C']], small: 'water' });
                    if (r > 0) boxes.push({ big: [[this.formatRating(r), '★']], small: this.methodLabel(b.method) || 'rating' });
                } else {
                if (dose || out) boxes.push({ big: [dose ? [this.fmtNum(dose, 1), ' g'] : null, out ? [this.fmtNum(out, 1), ' g'] : null].filter(Boolean), small: dose && out ? `1:${this.fmtNum(out / dose, 1)}` : (dose ? 'dose' : 'out'), wide: true });
                if (time) boxes.push({ big: [b.method === 'Espresso' || !b.method ? [String(Math.round(time)), ' s'] : [this.clock(time), '']], small: 'time' });
                if (r > 0) boxes.push({ big: [[this.formatRating(r), '★']], small: String(b.method || '') || 'rating' });
                }
                return {
                    name: this.getBrewOwner(b) || this.user, color: this.getUserColor(this.getBrewOwner(b) || this.user),
                    date: t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
                    coffee: String(bean.name || '').trim() || (tea ? 'A tea' : 'A coffee'), roaster: String(bean.roaster || '').trim(), origin: [tea ? bean.teaType : '', String(bean.origin || '').trim()].filter(Boolean).join(' · '),
                    boxes, tasted, shape: tasted.length ? this.shapeValues(b) : null, tea,
                    words: this.describeCup(this.shapeValues(b), tasted, notes, this.noteIntensities(b), tea ? 'tea' : 'coffee') || ''
                };
            },
            // your photo, read so it can be drawn into the picture (a link that doesn't allow that is skipped)
            async shotCardPhoto(b) {
                const photo = this.normalizePhoto(b && b.photo);
                if (!photo) return null;
                const list = /^data:/i.test(photo.url) ? [photo.url] : this.buildDriveFallbackUrls(photo.fileId || this.extractDriveFileId(photo.url), photo.url);
                const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('no image')); i.src = src; });
                for (const src of list) {
                    try {
                        if (/^data:/i.test(src)) return await load(src);
                        const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), 9000) : 0;
                        const res = await fetch(src, { mode: 'cors', cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}) });
                        clearTimeout(timer);
                        if (!res.ok) continue;
                        const blob = await res.blob();
                        if (!/^image\//.test(blob.type || 'image/')) continue;
                        const url = URL.createObjectURL(blob);
                        try { return await load(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
                    } catch (e) { /* the next way of reaching it */ }
                }
                return null;
            },
            async drawShotCard(b, photo) {
                const D = this.shotCardData(b), W = 1080, H = 1920, PAD = 78;
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                const ctx = c.getContext('2d'); if (!ctx) return null;
                const sans = (w, z) => `${w} ${z}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Inter, sans-serif`;
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
                const loadImg = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
                const round = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
                const darkTheme = { line: '#3A443B', muted: '#8D978E', ink: '#E8EEE8', surface: '#141915', dark: true };
                const shapeImg = D.shape && typeof FlavorShape !== 'undefined' ? await loadImg((() => { try { return FlavorShape.snapshot(D.shape, null, { names: D.tea ? 'tea' : null, width: 420, height: 320, zoom: 1.12, labels: !photo, isSet: k => D.tasted.includes(k), setKey: 'shot-' + (photo ? 'p' : 'n'), theme: darkTheme, dpr: 2.4 }); } catch (e) { return ''; } })()) : null;

                // the background
                if (photo) {
                    ctx.fillStyle = '#0C100D'; ctx.fillRect(0, 0, W, H);
                    const PH = 1140, k = Math.max(W / photo.naturalWidth, PH / photo.naturalHeight), pw = photo.naturalWidth * k, ph = photo.naturalHeight * k;
                    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, PH); ctx.clip();   // (a tall photo stays inside its frame: it spilled out under the fade)
                    ctx.drawImage(photo, (W - pw) / 2, (PH - ph) / 2, pw, ph);
                    ctx.restore();
                    const g = ctx.createLinearGradient(0, 0, 0, PH);
                    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.28, 'rgba(0,0,0,0.15)'); g.addColorStop(0.55, 'rgba(12,16,13,0)'); g.addColorStop(1, 'rgba(12,16,13,1)');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, PH + 2);
                } else {
                    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.75);
                    g.addColorStop(0, '#1E2620'); g.addColorStop(0.6, '#121713'); g.addColorStop(1, '#0C100D');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                }

                // the top line: who and when, and Dialed In
                const topY = 240;
                ctx.save();
                if (photo) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 3; }
                ctx.fillStyle = D.color || '#5B7FA6'; ctx.beginPath(); ctx.arc(PAD + 13, topY - 13, 13.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = photo ? '#FFFFFF' : '#C2CBC3'; ctx.font = sans(600, 38); ctx.textBaseline = 'alphabetic';
                ctx.fillText(this.fitText(ctx, [D.name, D.date].filter(Boolean).join(' · '), W - PAD * 2 - 300), PAD + 40, topY);
                ctx.font = serif(600, 43); ctx.textAlign = 'right'; ctx.fillStyle = photo ? '#FFFFFF' : '#8D978E';
                ctx.fillText('Dialed In', W - PAD, topY);
                ctx.restore();

                // the coffee
                let y;
                const sub = photo ? D.roaster : [D.roaster, D.origin].filter(Boolean).join(' · ');
                if (photo) {
                    const sw = 384, sh = shapeImg ? Math.round(sw * shapeImg.naturalHeight / shapeImg.naturalWidth) : 0;
                    if (shapeImg) ctx.drawImage(shapeImg, W - 30 - sw, 1086, sw, sh);
                    y = 1122 + 36;
                } else {
                    y = topY + 66 + 36;
                }
                ctx.textAlign = 'left';
                if (sub) { ctx.fillStyle = photo ? 'rgba(255,255,255,0.72)' : '#8D978E'; ctx.font = sans(600, 36); ctx.fillText(this.fitText(ctx, sub, photo ? 600 : W - PAD * 2), PAD, y); y += 22; }
                ctx.font = serif(600, photo ? 84 : 93); ctx.fillStyle = '#E8EEE8';
                const nameLines = wrap(D.coffee, photo ? 590 : W - PAD * 2, 2), LH = photo ? 94 : 104;
                nameLines.forEach((l, i) => ctx.fillText(l, PAD, y + LH * (i + 1) - 18));
                y += LH * nameLines.length;

                // the shape (no photo): big, under the name
                if (!photo && shapeImg) {
                    const sw = 900, sh = Math.round(sw * shapeImg.naturalHeight / shapeImg.naturalWidth);
                    const room = 1290 - y, w2 = sh > room ? Math.round(sw * room / sh) : sw, h2 = Math.round(w2 * sh / sw);
                    ctx.drawImage(shapeImg, (W - w2) / 2, y + 14, w2, h2);
                    y += h2 + 30;
                } else y += 54;

                // the numbers: dose → yield (ratio), time, rating (method)
                if (D.boxes.length) {
                    const gap = 24, total = W - PAD * 2, units = D.boxes.reduce((s, x) => s + (x.wide ? 1.5 : 1), 0), unit = (total - gap * (D.boxes.length - 1)) / units, bh = 150;
                    let x = PAD;
                    D.boxes.forEach(bx => {
                        const bw = unit * (bx.wide ? 1.5 : 1);
                        round(x, y, bw, bh, 42); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();
                        let tx = x + 33; const by = y + 74;
                        bx.big.forEach((part, i) => {
                            if (i) { ctx.font = sans(700, 46); ctx.fillStyle = '#E8EEE8'; ctx.fillText(' → ', tx, by); tx += ctx.measureText(' → ').width; }
                            ctx.font = sans(700, 51); ctx.fillStyle = '#FFFFFF'; ctx.fillText(part[0], tx, by); tx += ctx.measureText(part[0]).width;
                            if (part[1]) { ctx.font = sans(600, 33); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(part[1], tx, by); tx += ctx.measureText(part[1]).width; }
                        });
                        ctx.font = sans(600, 31); ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fillText(this.fitText(ctx, bx.small, bw - 60), x + 33, y + 118);
                        x += bw + gap;
                    });
                    y += bh;
                }

                // your cup in words
                if (D.words) {
                    ctx.font = photo ? sans(400, 41) : `italic ${serif(400, 44)}`;
                    ctx.fillStyle = photo ? 'rgba(255,255,255,0.78)' : '#C2CBC3';
                    const text = photo ? D.words : `“${D.words}”`, lines = wrap(text, W - PAD * 2, 3), LH2 = photo ? 59 : 63;
                    lines.forEach((l, i) => ctx.fillText(l, PAD, y + 42 + 44 + LH2 * i));
                }
                return c;
            },
            async openShotCard(id) {
                const b = this.brews.get(String(id || ''));
                const m = document.getElementById('shot-modal'), body = document.getElementById('shot-body');
                if (!b || !m || !body) return;
                const gen = (this._shotGen || 0) + 1; this._shotGen = gen;
                if (this._shot && this._shot.url) { try { URL.revokeObjectURL(this._shot.url); } catch (e) { /* gone */ } }
                this._shot = { id: String(id) };
                body.innerHTML = `<div class="shot-prev is-loading">${this.loaderHtml('Making your card…')}</div>${this.shotActsHtml(true)}`;
                m.classList.add('active');
                try {
                    const photo = await this.shotCardPhoto(b);
                    if (gen !== this._shotGen) return;
                    const canvas = await this.drawShotCard(b, photo);
                    if (gen !== this._shotGen || !canvas) return;
                    const type = photo ? 'image/jpeg' : 'image/png';
                    const blob = await new Promise(r => canvas.toBlob(r, type, 0.92));
                    if (gen !== this._shotGen || !blob) return;
                    const bean = this.beans.get(String(b.beanId || '')) || {};
                    const slug = String(bean.name || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'session';
                    const file = new File([blob], `dialed-in-${slug}.${photo ? 'jpg' : 'png'}`, { type });
                    const url = URL.createObjectURL(blob);
                    this._shot = { id: String(id), file, url, photo: Boolean(photo) };
                    body.innerHTML = `<div class="shot-prev"><img src="${url}" alt="Your session as a Story picture" width="1080" height="1920"></div>${this.shotActsHtml(false)}`;
                } catch (e) {
                    if (gen !== this._shotGen) return;
                    body.innerHTML = `<div class="shot-prev is-empty"><p>That picture couldn't be made. You can still share a link.</p></div>${this.shotActsHtml(true)}`;
                }
            },
            shotActsHtml(waiting) {
                return `<div class="shot-acts"><button type="button" class="btn-primary shot-share" onclick="app.shareShotCard()"${waiting ? ' disabled' : ''}>Share image</button><button type="button" class="btn-outline shot-link" onclick="app.shareShotLink()">Share link</button></div>`;
            },
            async shareShotCard() {
                const s = this._shot; if (!s || !s.file) return;
                try { if (navigator.canShare && navigator.canShare({ files: [s.file] })) { await navigator.share({ files: [s.file] }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
                return this.saveFile ? this.saveFile(s.file, s.file.name, 'Dialed In') : null;
            },
            shareShotLink() { const s = this._shot; if (!s) return; if (typeof s.link === 'function') return s.link(); return this.shareSessionLink(s.id); },   // v16.1: a coffee's or roaster's picture carries its own link
            closeShotCard() {
                const m = document.getElementById('shot-modal'); if (m) m.classList.remove('active');
                this._shotGen = (this._shotGen || 0) + 1;
                if (this._shot && this._shot.url) { const u = this._shot.url; setTimeout(() => { try { URL.revokeObjectURL(u); } catch (e) { /* gone */ } }, 500); }
                this._shot = null;
            },
