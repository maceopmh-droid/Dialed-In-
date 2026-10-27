            // ===================== v17.2: the New look =====================
            // A second look behind a switch (Settings, Appearance), saved per phone. Off is the app exactly as before:
            // every rule in 25-new-look.css sits under html[data-look="new"], and every new piece of markup here is only
            // drawn when newLook() says so. The data, features and who-sees-what are the same in both looks.
            newLook() { return typeof document !== 'undefined' && !!document.documentElement && typeof document.documentElement.getAttribute === 'function' && document.documentElement.getAttribute('data-look') === 'new'; },

            toggleNewLook(btn) {
                const on = !(window.__dialedLook && window.__dialedLook.isNew());
                if (window.__dialedLook) window.__dialedLook.set(on ? 'new' : 'classic');
                if (btn) btn.setAttribute('aria-checked', String(on));
                if (this.haptic) this.haptic('tick');
                this._nlFam = null; this._nlStamp = '';
                if (!on) this.closeSession(true);
                this.onThemeChange();
                this.nlRefreshSheets();
            },

            renderLookControl() {
                const sw = document.getElementById('set-look-sw');
                if (sw) sw.setAttribute('aria-checked', String(this.newLook()));
            },

            // any open sheet whose markup is drawn by a function gets drawn again in the look now on
            nlRefreshSheets() {
                const on = id => { const el = document.getElementById(id); return !!(el && el.classList.contains('active')); };
                try {
                    if (on('notif-modal') && this.renderNotifications) this.renderNotifications();
                    if (on('people-modal') && this.renderPeople) this.renderPeople();
                    if (on('level-modal') && this.renderLevel) this.renderLevel();
                    if (on('achievement-modal') && this.renderAchievementLocker) this.renderAchievementLocker();
                    if (on('settings-modal') && this.renderSettingsAcct) this.renderSettingsAcct();
                    if (on('shot-modal') && this.renderShotCard) this.renderShotCard();
                } catch (err) { console.warn('new look sheets', err); }
                if (this.roasterViewActive && this.roasterViewActive() && this.renderRoasterPage) { try { this.renderRoasterPage(); } catch (err) {} }
            },

            // ---- families: every coffee, session, roaster and palate wears the color of how it tastes
            NL_WHEEL_FAM: { 'Fruity': 'fruity', 'Floral': 'floral', 'Sweet': 'sweet', 'Nutty & cocoa': 'nutty', 'Nutty & toasty': 'nutty', 'Spice': 'spice', 'Spice & wood': 'spice', 'Roasted & earthy': 'earthy', 'Earthy & smoky': 'earthy', 'Fermented': 'fermented', 'Vegetal': 'vegetal', 'Herbal': 'herbal', 'Tastes off': 'off' },
            // the card palettes, for what CSS can't color (canvas: the share image and the flavor shapes): c t k n l
            NL_PAL: {
                dark: { app: ['#141915', '#EEEAE2', '#8DB791', '#EEEAE2', '#959287'], nutty: ['#221913', '#E9DCCD', '#CFA383', '#EED8BF', '#B39A85'], fruity: ['#2E1719', '#EEDDD8', '#DC948A', '#F4CFC6', '#BC968F'], floral: ['#24141F', '#E8CEE0', '#CE8CBB', '#EDC5E1', '#B08CA5'], sweet: ['#241F14', '#EAE0CD', '#D2BA89', '#EFE0C3', '#B2A58A'], spice: ['#251913', '#EBD6CC', '#D6A085', '#F1D1C0', '#B49788'], earthy: ['#201C18', '#E2DBD5', '#BEAC9D', '#E3D8CF', '#A79D95'], fermented: ['#201523', '#E1CFE7', '#BD8ECD', '#E2C6EC', '#A78DAF'], vegetal: ['#1A2016', '#DCE3D2', '#A9C08F', '#D7E5C6', '#9DA690'], herbal: ['#15201D', '#D3E2DD', '#8EC2B3', '#CBE6DD', '#93A9A2'] },
                light: { app: ['#FCF9F3', '#1E2420', '#4E6B52', '#1E2420', '#6E6A61'], nutty: ['#EDE0CF', '#3E2B1F', '#8A5A3B', '#5E3519', '#735846'], fruity: ['#F3DCD5', '#45231E', '#9C4A3F', '#7E2A22', '#85564E'], floral: ['#EDCFE4', '#3C2033', '#70335E', '#591C47', '#6B4860'], sweet: ['#EEE3CD', '#3D331F', '#745D2F', '#5D4619', '#6D6046'], spice: ['#F0D8CC', '#3F281D', '#77452C', '#602E15', '#6F5244'], earthy: ['#E5DDD6', '#352D27', '#615142', '#4A3A2B', '#625950'], fermented: ['#E5D0EC', '#34213B', '#60346F', '#491E58', '#62496A'], vegetal: ['#DFE7D3', '#2C3324', '#4F6638', '#344A20', '#5A6250'], herbal: ['#D3E6E0', '#213430', '#326A5C', '#1F4B40', '#4D625C'] }
            },
            NL_MORE: '<svg class="nl-ic nl-dots" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
            NL_CHIP: { fruity: ['#FBE9E4', '#9A3E33'], floral: ['#F5E8F2', '#7E4A74'], sweet: ['#F8EDCF', '#765510'], nutty: ['#F1E5D7', '#6E4A33'], spice: ['#F6E2D3', '#8A4C24'], earthy: ['#ECE6E0', '#5A4A3E'], fermented: ['#EEE3F0', '#6A4A75'], off: ['#E6ECE9', '#4A5A52'], vegetal: ['#E8EFDD', '#4A6131'], herbal: ['#DDEFEA', '#2F6556'] },

            nlDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; },
            nlPal(fam) {
                const dark = this.nlDark();
                const tp = this.nlTonePal && this.nlTonePal(fam, dark);   // v17.4: any hue
                if (tp) return { c: tp.c, t: tp.t, k: tp.k, n: tp.n, l: tp.l, pg: dark ? this.hexMix(tp.c, '#000000', 0.18) : this.hexMix(tp.c, '#ffffff', 0.45), dark };
                const P = this.NL_PAL[dark ? 'dark' : 'light'], p = P[fam] || P.app;
                const pg = fam === 'app' || !P[fam] ? (dark ? '#0C100D' : '#F3EEE4') : (dark ? this.hexMix(p[0], '#000000', 0.18) : this.hexMix(p[0], '#ffffff', 0.45));
                return { c: p[0], t: p[1], k: p[2], n: p[3], l: p[4], pg, dark };
            },

            // the family a note belongs to (fruity, floral, ... off), or null when it isn't on a wheel
            noteFam(name, kind) {
                const at = this.noteLocate(name, kind);
                if (!at || at.f < 0) return null;
                const W = at.wheel === 'tea' ? TEA_WHEEL : NOTE_WHEEL;
                return (W[at.f] && this.NL_WHEEL_FAM[W[at.f].fam]) || null;
            },

            // the main family of a set of notes: [[name, strength 1-3, kind], ...] in the order they were listed. Strengths add
            // up per family, "Tastes off" never wins, a tie goes to the family of the earliest note; none left: null
            lookFamily(notes) {
                const sum = new Map(), first = new Map();
                (notes || []).forEach(([name, s, kind], i) => {
                    const f = this.noteFam(name, kind);
                    if (!f || f === 'off') return;
                    sum.set(f, (sum.get(f) || 0) + (Number(s) >= 1 && Number(s) <= 3 ? Number(s) : 2));
                    if (!first.has(f)) first.set(f, i);
                });
                let best = null;
                sum.forEach((v, f) => { if (!best || v > sum.get(best) || (v === sum.get(best) && first.get(f) < first.get(best))) best = f; });
                return best;
            },

            brewNoteList(brew) {
                const kind = this.kindOfBrew ? this.kindOfBrew(brew) : 'coffee', ni = this.noteIntensities(brew);
                return this.extractFlavors(brew).map(n => [n, ni[n] || 2, kind]);
            },

            // families are cached per thing and worked out again when the data changes
            nlFamCache() {
                const stamp = `${this.brews.size}|${this.beans.size}|${this._nlDataGen || 0}`;
                if (!this._nlFam || this._nlStamp !== stamp) { this._nlFam = new Map(); this._nlStamp = stamp; }
                return this._nlFam;
            },
            nlFamOf(key, work) {
                const cache = this.nlFamCache();
                if (!cache.has(key)) cache.set(key, work() || 'app');
                return cache.get(key);
            },
            // v17.4: a session wears the blend of its own notes (its coffee's colors when it has none); a coffee its picture's
            // color; a roaster its own color (the one on its tile); a person theirs. Only a session's colors follow what's in it.
            famOfBrew(brew) {
                if (!brew) return 'app';
                return this.nlFamOf(`b:${brew.id}`, () => this.toneOfNotes(this.brewNoteList(brew)) || (this.beans.get(String(brew.beanId)) ? this.famOfCoffee(this.beans.get(String(brew.beanId))) : 'app'));
            },
            famOfCoffee(bean) { return bean ? this.coffeeToneKey(bean) : 'app'; },
            famOfRoaster(name, kind) {
                const rk = this.roasterKey ? this.roasterKey(name) : String(name || '').toLowerCase();
                return this.nlFamOf(`r:${rk}`, () => {
                    const r = this.roasterData ? this.roasterData().byKey.get(rk) : null;
                    const pk = r && r.info && this.coverPicked ? this.coverPicked(r.info.cover) : null;
                    if (pk) return this.nlToneKey(pk.hue, 0.012 + 0.12 * Math.max(0.1, pk.tone / 100));   // v17.5: its picture's color (v17.7: only a color picked, never one from a photo)
                    const set = r && this.ROASTER_COLORS && (this.ROASTER_COLORS[r.key] || (typeof RoasterEngine !== 'undefined' && this.ROASTER_COLORS[RoasterEngine.keyOf(r.name)]));
                    if (set) return this.nlToneOfHex(set[1]);
                    const hue = r ? r.hue : (typeof RoasterEngine !== 'undefined' ? RoasterEngine.hashHue(rk) : this.nlNameHue(rk));
                    return this.nlToneOfHex(this.hslHex ? this.hslHex(hue, 44, 50) : '#7A8A7C');
                });
            },
            famOfPerson(name) { return this.nlFamOf(`p:${name}`, () => this.nlToneOfHex(this.getUserColor(name))); },
            hslHex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0'); return `#${f(0)}${f(8)}${f(4)}`; },

            // ---- a person's name, in their own color made to read on what's behind it (at least 4.5:1)
            nlLum(hex) {
                const s = String(this.normalizeHexColor(hex) || '#808080').slice(1);
                const ch = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
                return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
            },
            nlContrast(a, b) { const x = this.nlLum(a), y = this.nlLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); },
            nameColor(person, bg) {
                const dark = this.nlDark(), base = this.getUserColor(person);
                const back = bg || (dark ? '#2E1719' : '#F3DCD5');   // (the lightest card in dark, the darkest in light, when not told)
                const to = dark ? '#ffffff' : '#000000';
                let t = dark ? 0.35 : 0.15, c = this.hexMix(base, to, t);
                while (this.nlContrast(c, back) < 4.5 && t < 1) { t = Math.min(1, t + 0.05); c = this.hexMix(base, to, t); }
                return c;
            },

            nlAvatar(person, cls = 'nl-pfp') {
                return `<span class="${cls}" data-face="${this.esc(person)}" data-profile="${this.esc(person)}" style="background:${this.esc(this.getUserColor(person))}">${this.esc(this.feedInitial(person))}</span>`;
            },
            nlSig(person, bg, cls = 'nl-sig', size = 0) {
                return `<span class="${cls}" data-profile="${this.esc(person)}" style="color:${this.esc(this.nameColor(person, bg))}${size ? `;font-size:${size}px` : ''}">${this.esc(person)}</span>`;
            },

            // ---- small things are pills: a note with its three strength pills
            nlNote(name, strength, kind, cls = '') {
                const f = this.noteToneKey ? this.noteToneKey(name, kind) : (this.noteFam(name, kind) || 'off'), s = Math.max(1, Math.min(3, Number(strength) || 2));   // (v17.4: each note in its own color)
                return `<span class="nl-nt${cls ? ' ' + cls : ''}" data-nf="${f}">${this.esc(name)}<span class="nl-lv" role="img" aria-label="${['a hint', 'some', 'lots'][s - 1]}">${[1, 2, 3].map(i => `<i${i <= s ? ' class="on"' : ''}></i>`).join('')}</span></span>`;
            },
            nlNotesHtml(brew, cls = '', chipCls = '') {
                const list = this.brewNoteList(brew);
                return list.length ? `<div class="nl-notes${cls ? ' ' + cls : ''}">${list.map(([n, s, k]) => this.nlNote(n, s, k, chipCls)).join('')}</div>` : '';
            },

            nlStarsHtml(r, size = 20) {
                const whole = Math.floor(r), half = r - whole >= 0.5;
                return `<span class="nl-stars" style="font-size:${size}px" aria-hidden="true">${'★'.repeat(whole)}${half ? '<span class="h">★</span>' : ''}<span class="o">${'★'.repeat(5 - whole - (half ? 1 : 0))}</span></span>`;
            },

            // ---- numbers live in soft tiles
            nlTile(v, label) { return `<div class="nl-tile"><div class="nl-sv">${v}</div><div class="nl-sl">${this.esc(label)}</div></div>`; },
            nlU(u) { return `<small>${this.esc(u)}</small>`; },
            nlTimeVal(b) {
                const time = this.num(b.time);
                if (!(time > 0)) return '';
                const tea = this.isTeaBrew && this.isTeaBrew(b), p = tea ? this.methodProfile(b.method) : {};
                if (b.timeUnit === 'h' || b.method === 'Cold Brew' || p.hours) return `${this.esc(this.fmtNum(time, 1))}${this.nlU(' h')}`;
                if (b.timeUnit === 'm' || p.minutes) return `${this.esc(this.fmtNum(time, 1))}${this.nlU(' min')}`;
                if ((!b.method || b.method === 'Espresso') && !tea) return `${this.esc(this.fmtNum(time))}${this.nlU(' s')}`;
                return time >= 60 ? this.esc(this.clock(time)) : `${this.esc(this.fmtNum(time))}${this.nlU(' s')}`;
            },
            // the feed card's three: in → out (ratio), time, rating; tea: leaf · water, temp, steeps or rating
            nlCardTiles(b) {
                const tiles = [], dose = this.num(b.dose), yld = this.num(b.yield), r = this.normalizeRating(b.rating);
                const star = r > 0 ? this.nlTile(`${this.esc(this.fmtNum(r, 1))}<span class="nl-st"> ★</span>`, 'rating') : '';
                if (this.isTeaBrew && this.isTeaBrew(b)) {
                    const bags = b.teabag ? Math.max(1, Number(b.bags) || 1) : 0, steeps = this.teaStepsOf(b), temp = this.num(b.temp);
                    const st = b.method === 'Matcha' && this.matchaStyle ? this.matchaStyle(b) : null;
                    const leaf = bags ? `${bags}${this.nlU(bags === 1 ? ' bag' : ' bags')}` : dose > 0 ? `${this.esc(this.fmtNum(dose, 1))}${this.nlU(' g')}` : '';
                    const water = yld > 0 ? `${this.esc(this.fmtNum(yld, 0))}${this.nlU(' ml')}` : '';
                    if (leaf || water) tiles.push(this.nlTile([leaf, water].filter(Boolean).join(' · '), st ? st.short.toLowerCase() : [leaf ? (bags ? 'teabag' : 'leaf') : '', water ? 'water' : ''].filter(Boolean).join(' · ')));
                    if (temp > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(temp, 0))}${this.nlU('°')}`, 'temp'));
                    if (steeps.length > 1) tiles.push(this.nlTile(String(steeps.length), 'steeps'));
                    else if (star) tiles.push(star);
                    return tiles;
                }
                const esp = !b.method || b.method === 'Espresso';
                if (dose > 0 && yld > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(dose, 1))}${this.nlU(' g')} → ${this.esc(this.fmtNum(yld, 1))}${this.nlU(' g')}`, this.fmtRatio(yld / dose)));
                else if (dose > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(dose, 1))}${this.nlU(' g')}`, 'dose'));
                else if (yld > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(yld, 1))}${this.nlU(' g')}`, esp ? 'pull' : 'water'));
                const t = this.nlTimeVal(b);
                if (t) tiles.push(this.nlTile(t, 'time'));
                if (star) tiles.push(star);
                return tiles;
            },
            nlTilesHtml(tiles, cls = '') {
                if (!tiles.length) return '';
                const cols = tiles.length === 3 && !cls ? '' : ` t${tiles.length}`;
                return `<div class="nl-tiles${cols}${cls ? ' ' + cls : ''}">${tiles.join('')}</div>`;
            },

            // ---- the photo, or the flavor shape where there's none
            nlPhoto(brew) {
                const photo = this.normalizePhoto(brew && brew.photo);
                if (!photo) return null;
                const fallbacks = this.buildDriveFallbackUrls(photo.fileId || this.extractDriveFileId(photo.url), photo.url);
                if (this._brokenPhotos && this._brokenPhotos.has(fallbacks.join('|'))) return null;
                return { src: fallbacks[0] || photo.url, fallbacks };
            },
            nlPhotoImg(ph, cls = 'nl-photo', alt = 'Session photo') {
                return `<img class="${cls}" src="${this.esc(ph.src)}" alt="${this.esc(alt)}" loading="lazy" decoding="async" data-fallback-index="0" data-fallbacks="${this.esc(ph.fallbacks.join('|'))}" onerror="app.nlPhotoErr(this)">`;
            },
            nlPhotoErr(img) {
                this.handlePhotoFallback(img);
                const raw = img.getAttribute('data-fallbacks') || '';
                if (this._brokenPhotos && this._brokenPhotos.has(raw)) {   // every source failed: draw it again without the photo
                    const host = img.closest('[data-fkey]');
                    if (host && this.dirtyKeys) this.dirtyKeys(host.getAttribute('data-fkey'));
                    clearTimeout(this._nlPhotoTimer);
                    this._nlPhotoTimer = setTimeout(() => { try { this.render(); } catch (e) {} }, 300);
                }
            },
            nlHasShape(brew) { return this.tastedKeys(brew).length > 0; },
            // a flavor shape as a picture in the card's own colors (filled in after drawing, when it comes near the screen)
            nlShapeImg(brew, fam, o = {}) {
                return `<img class="${o.cls || 'nl-shape'}" alt="${this.esc(o.alt || 'Flavor shape')}" data-nl-shape="${this.esc(brew.id)}" data-nl-fam="${this.esc(fam)}"${o.labels ? ' data-nl-labels="1"' : ''}${o.pg ? ' data-nl-pg="1"' : ''}${o.w ? ` data-nl-w="${o.w}" data-nl-h="${o.h}"` : ''}>`;
            },
            nlShapeTheme(fam, where) {   // where: true = on the page, 'box' = in a box (the labels' outline is the color behind them)
                const p = this.nlPal(fam), s = String(this.normalizeHexColor(p.n) || '#888888').slice(1), rgb = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)).join(',');
                const box = fam === 'app' ? p.c : p.dark ? this.hexMix(p.c, '#ffffff', 0.03) : this.hexMix(p.c, '#ffffff', 0.88);   // (the same mix as --box)
                return { line: `rgba(${rgb},0.22)`, muted: p.l, ink: p.t, surface: where === 'box' ? box : where ? p.pg : p.c, dark: p.dark };
            },
            nlFillShapes(root) {
                if (typeof FlavorShape === 'undefined' || typeof document === 'undefined') return;
                const imgs = [...(root || document).querySelectorAll('img[data-nl-shape]:not([src])')];
                if (!imgs.length) return;
                const fill = img => {
                    if (img.getAttribute('src')) return;
                    const brew = this.brews.get(img.getAttribute('data-nl-shape'));
                    if (!brew) return;
                    const fam = img.getAttribute('data-nl-fam') || 'app', tasted = this.tastedKeys(brew), labels = img.hasAttribute('data-nl-labels');
                    const w = Number(img.getAttribute('data-nl-w')) || 300, h = Number(img.getAttribute('data-nl-h')) || 220;
                    const url = FlavorShape.snapshot(this.shapeValues(brew), null, { width: w, height: h, zoom: 1.12, labels, isSet: k => tasted.includes(k), setKey: `${tasted.join(',')}|nl-${fam}-${img.hasAttribute('data-nl-pg') ? 'pg' : 'c'}-${labels ? 'l' : ''}`, names: this.kindOfBrew(brew) === 'tea' ? 'tea' : null, theme: this.nlShapeTheme(fam, img.hasAttribute('data-nl-pg')) });
                    if (url) img.src = url;
                };
                if (typeof IntersectionObserver !== 'function') { imgs.forEach(fill); return; }
                if (!this._nlShapeIO) this._nlShapeIO = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { this._nlShapeIO.unobserve(e.target); fill(e.target); } }), { rootMargin: '900px 0px' });
                imgs.forEach(img => this._nlShapeIO.observe(img));
            },

            // ---- v17.4: a flavor shape that turns: on a card on its own (no box or lines), on the Session screen under a finger
            // too. One shared renderer draws them all, only near the screen (FlavorShape.spin).
            nlSpinHtml(brew, fam, o = {}) {
                const cv = `<canvas class="nl-spin ${o.drag ? 'nl-drag' : 'nl-auto'}${o.cls ? ' ' + o.cls : ''}" data-nl-spin="${this.esc(brew.id)}" data-nl-fam="${this.esc(fam)}"${o.pg ? ' data-nl-pg="1"' : ''}${o.labels ? ' data-nl-labels="1"' : ''}${o.lines ? ' data-nl-lines="1"' : ''} width="0" height="0" aria-label="Flavor shape"></canvas>`;
                if (!o.drag) return cv;
                // v17.5: on the Session screen you can stop it turning and look straight down on it
                return `<div class="nl-spinwrap">${cv}<div class="nl-spinctl"><button type="button" class="nl-sc-pause" aria-label="Stop turning" aria-pressed="false" onclick="app.nlSpinCtl(this, 'pause')">${this.NL_IC_PAUSE}</button><button type="button" class="nl-sc-top" aria-label="Look from the top" aria-pressed="false" onclick="app.nlSpinCtl(this, 'top')">${this.NL_IC_TOP}</button></div></div>`;
            },
            NL_IC_PAUSE: '<svg viewBox="0 0 24 24" class="nl-ic" aria-hidden="true"><rect x="7" y="6" width="3.2" height="12" rx="1.2" fill="currentColor"/><rect x="13.8" y="6" width="3.2" height="12" rx="1.2" fill="currentColor"/></svg>',
            NL_IC_PLAY: '<svg viewBox="0 0 24 24" class="nl-ic" aria-hidden="true"><path d="M8.5 6.2v11.6c0 .6.7 1 1.2.7l9-5.8c.5-.3.5-1.1 0-1.4l-9-5.8c-.5-.3-1.2.1-1.2.7z" fill="currentColor"/></svg>',
            NL_IC_TOP: '<svg viewBox="0 0 24 24" class="nl-ic" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>',
            NL_IC_SIDE: '<svg viewBox="0 0 24 24" class="nl-ic" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="16" rx="7.5" ry="3"/><path d="M12 4v12"/></svg>',
            nlSpinCtl(btn, what) {
                const wrap = btn && btn.closest ? btn.closest('.nl-spinwrap') : null, c = wrap && wrap.querySelector('canvas'), h = c && c._nlSpin;
                if (!h || !h.state) return;
                const st = h.state();
                if (what === 'pause') { const on = !st.paused; h.pause(on); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Turn again' : 'Stop turning'); btn.innerHTML = on ? this.NL_IC_PLAY : this.NL_IC_PAUSE; }
                else { const on = !st.top; h.view(on); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Look from the side' : 'Look from the top'); btn.innerHTML = on ? this.NL_IC_SIDE : this.NL_IC_TOP; }
                if (this.haptic) this.haptic('tick');
            },
            // v17.5: the quiet measure on a turning shape: a circle at 10 and the center line ('axis'), or just the circle ('ring')
            NL_RING: 'disc',
            nlFillSpins(root) {
                if (typeof FlavorShape === 'undefined' || !FlavorShape.spin || typeof document === 'undefined') return;
                const scope = root || document;
                if (!scope.querySelectorAll) return;
                scope.querySelectorAll('canvas[data-nl-spin]').forEach(c => {
                    if (c._nlSpin) return;
                    const id = c.getAttribute('data-nl-spin'), first = this.brews.get(id);
                    if (!first) return;
                    const fam = c.getAttribute('data-nl-fam') || 'app', pg = c.closest('.nl-box') ? 'box' : c.hasAttribute('data-nl-pg'), labels = c.hasAttribute('data-nl-labels'), drag = c.classList.contains('nl-drag');
                    const brew = () => this.brews.get(id) || first, tasted = () => this.tastedKeys(brew()), themes = {};
                    c._nlSpin = FlavorShape.spin(c, {
                        id: `${id}|${c.className}`, values: () => this.shapeValues(brew()), isSet: k => tasted().includes(k),
                        names: this.kindOfBrew(first) === 'tea' ? 'tea' : null,
                        theme: () => { const d = this.nlDark() ? 'd' : 'l'; return themes[d] || (themes[d] = this.nlShapeTheme(fam, pg)); },
                        labels, lines: c.hasAttribute('data-nl-lines'), interactive: drag, fit: !labels, zoom: labels ? 1.08 : 1, fps: drag ? 0 : 30, speed: 0.45,
                        // v17.5: the measure (not in the boxed view), and where it sits: a card's shape lower, on its bottom edge
                        ring: labels ? '' : this.NL_RING, ...(c.classList.contains('nl-mini') ? { cy: 0.7, padB: 2 } : c.classList.contains('nl-bigspin') ? { cy: 0.6, padB: 4 } : c.classList.contains('nls-shape') ? { cy: 0.55, padB: 6 } : {})
                    });
                });
            },

            // a first guess at the coffee name's size from its length (the fit pass below checks it on screen)
            nlNameSize(name, width, max, min, lines) {
                const t = String(name || ''), em = 0.5, longest = Math.max(1, ...t.split(/\s+/).map(w => w.length));
                let size = max;
                while (size > min && (longest * size * em > width || Math.ceil(t.length * size * em / width) > lines)) size -= 2;
                return size;
            },
            // the coffee name shrinks to fit: 44 down to 34 on a card (two lines), 60 down to 40 on the Session screen
            // v17.4: a name stays on one line when it can (down to the last number); on a card, when it would run into the turning
            // shape beside it, the shape moves up (out of its way) first. Only a name too long even then takes two lines.
            nlFitNames(root) {
                if (typeof document === 'undefined') return;
                (root || document).querySelectorAll('[data-nl-fit]:not([data-nl-fitted])').forEach(el => {
                    if (!el.getClientRects().length) return;
                    const [max, min, lines, one = min] = el.getAttribute('data-nl-fit').split(',').map(Number);
                    const row = el.closest ? el.closest('.nl-titlerow') : null, mini = row && row.querySelector('.nl-mini');
                    const set = z => { el.style.fontSize = `${z}px`; };
                    const oneLine = to => {   // the biggest size from max down to `to` that fits on one line, or false
                        el.style.whiteSpace = 'nowrap'; el.style.display = 'block';
                        let z = max; set(z);
                        while (z > to && el.scrollWidth > el.clientWidth + 1) { z -= 2; set(z); }
                        if (el.scrollWidth <= el.clientWidth + 1) return true;
                        el.style.whiteSpace = ''; el.style.display = ''; return false;
                    };
                    if (row) row.classList.remove('shape-up');
                    let fits = oneLine(mini ? Math.max(min, max - 10) : one);   // (beside the shape it shrinks only a little before the shape moves)
                    // (the roaster's line shares that room with the name: if it would be cut, the shape moves up too)
                    const ro = mini ? row.querySelector('.nl-roast') : null, roCut = () => { if (!ro) return false; ro.style.whiteSpace = 'nowrap'; const cut = ro.scrollWidth > ro.clientWidth + 1; ro.style.whiteSpace = ''; return cut; };
                    if (mini && (!fits || roCut())) { row.classList.add('shape-up'); fits = oneLine(one); }
                    if (!fits) {
                        let size = max; set(size);
                        const lh = () => parseFloat(getComputedStyle(el).lineHeight) || size * 1.02;
                        const wordSplit = () => { el.style.overflowWrap = 'normal'; el.style.wordBreak = 'normal'; const s = el.scrollWidth > el.clientWidth + 1; el.style.overflowWrap = ''; el.style.wordBreak = ''; return s; };
                        while (size > min && (Math.round(el.scrollHeight / lh()) > lines || wordSplit())) { size -= 2; set(size); }   // (v17.6: lines counted, so a letter's tail below the last line isn't taken for another line)
                    }
                    el.setAttribute('data-nl-fitted', '1');
                });
            },

            // v17.4: a row of tiles whose numbers don't all fit goes a size smaller (twice at most), never cut with "…"
            nlFitTiles(root) {
                if (typeof document === 'undefined') return;
                (root || document).querySelectorAll('.nl-tiles:not([data-nl-fitted])').forEach(row => {
                    if (!row.getClientRects().length) return;
                    const over = () => [...row.querySelectorAll('.nl-sv, .nl-sl')].some(v => v.scrollWidth > v.clientWidth + 1);
                    row.classList.remove('nl-tight', 'nl-tighter');
                    if (over()) { row.classList.add('nl-tight'); if (over()) row.classList.add('nl-tighter'); }
                    row.setAttribute('data-nl-fitted', '1');
                });
                // v17.5: a word in a stat tile ("Yesterday" on the roaster page) shrinks until it fits its tile
                (root || document).querySelectorAll('.stat-num.word:not([data-nl-fitted])').forEach(el => {
                    if (!el.getClientRects().length) return;
                    el.style.fontSize = '';
                    let z = parseFloat(getComputedStyle(el).fontSize) || 14;
                    while (z > 10 && el.scrollWidth > el.clientWidth + 1) { z -= 0.5; el.style.fontSize = `${z}px`; }
                    el.setAttribute('data-nl-fitted', '1');
                });
            },

            // after every draw: shapes, names, and the Session screen if it's open
            nlAfterRender() {
                if (!this._nlFellChecked) {   // v17.3: the New look couldn't open on this phone last time (theme-boot turned it off)
                    this._nlFellChecked = true;
                    let fell = false; try { fell = localStorage.getItem('dialed_look_fell') === '1'; if (fell) localStorage.removeItem('dialed_look_fell'); } catch (e) {}
                    if (fell && this.showToast) setTimeout(() => this.showToast('The New look didn\'t open on this phone, so it\'s off for now. Settings, Appearance turns it back on.'), 1500);
                }
                if (this.newLook() && !this._nlBootOk) {   // up and drawing: this start counts as a good one
                    this._nlBootOk = true;
                    setTimeout(() => { try { localStorage.setItem('dialed_look_boot', '0'); } catch (e) {} }, 8000);
                }
                const tinted = () => typeof document !== 'undefined' && document.getElementById ? [document.getElementById('main-content'), document.getElementById('grid'), document.querySelector ? document.querySelector('.header-sticky') : null] : [];
                if (!this.newLook()) { const bd = typeof document !== 'undefined' ? document.body : null; if (bd && bd.hasAttribute && bd.hasAttribute('data-nltab')) bd.removeAttribute('data-nltab'); tinted().forEach(el => { if (el && el.hasAttribute && el.hasAttribute('data-fam')) el.removeAttribute('data-fam'); }); this.nlExtras(false); return; }
                if (document.body.getAttribute('data-nltab') !== this.tab) document.body.setAttribute('data-nltab', this.tab);
                // a profile (and its top bar) wears the person's colors
                const pf = this.tab === 'profile' && this.profileUser ? this.famOfPerson(this.profileUser) : null;
                tinted().forEach((el, i) => { if (!el) return; const want = i === 0 ? pf : null; if (want) { if (el.getAttribute('data-fam') !== want) el.setAttribute('data-fam', want); } else if (el.hasAttribute('data-fam')) el.removeAttribute('data-fam'); });
                this.nlExtras(true);
                this.nlRingRules();
                this.nlFillShapes();
                this.nlFillSpins();
                this.nlFitNames();
                this.nlFitTiles();
                if (this.sessionViewActive()) this.renderSession(true);
                // cards drawn later (the rest of the feed, a patched row) get their shapes and name sizes too
                if (!this._nlMO && typeof MutationObserver === 'function') {
                    let queued = false;
                    this._nlMO = new MutationObserver(() => {
                        if (queued || !this.newLook()) return;
                        queued = true;
                        requestAnimationFrame(() => { queued = false; if (this.newLook()) { this.nlRingRules(); this.nlFillShapes(); this.nlFillSpins(); this.nlFitNames(); this.nlFitTiles(); } });
                    });
                    this._nlMO.observe(document.body, { childList: true, subtree: true });
                }
            },

            // ===================== v17.5: levels, simpler (the New look) =====================
            // A level is a round badge in its tier's colors (Bronze, Silver, Gold, Platinum, Top) with the level's own icon
            // (v17.9: not its number; the app's soft colors, like its note chips; each icon measured so it sits in the
            // middle); crema, the app's own word (v17.9, Maceo: "bring back crema"); the same words for tea and coffee.
            NL_TIER_LOOK: [
                { bg: '#EAD3C0', ink: '#7A4729', ring: '#C99D80' },   // Bronze: clay
                { bg: '#E3E7E4', ink: '#46524D', ring: '#ABB6B0' },   // Silver: mist
                { bg: '#F1DFAE', ink: '#6B4A0F', ring: '#CFAB5D' },   // Gold: crema
                { bg: '#D3E5DD', ink: '#2A574C', ring: '#90B7AA' },   // Platinum: sage
                { bg: '#8DB791', ink: '#0B160D', ring: '#EFE6D2' }    // Top: matcha, a cream ring
            ],
            // v18.1: the New look's own level icons (Maceo: "a bit less coffee centric… some are still ugly and unclear without
            // the description"): plain pictures anyone reads at a glance, a little coffee and tea in them. [name, the icon in a
            // 24-unit square]; the classic look keeps its own (43-levels.js)
            NL_LEVEL_ICONS: [
                ["Sprout", "<path d=\"M12 20.5V11.5\"/><path d=\"M12 11.5C12 7.6 14.6 5 18.8 5c0 4.1-2.7 6.5-6.8 6.5Z\"/><path d=\"M12 14c0-3.3-2.3-5.6-6.2-5.6 0 3.4 2.4 5.6 6.2 5.6Z\"/><path d=\"M8.5 20.5h7\"/>"],
                ["Leaf", "<path d=\"M5.5 18.5C5.5 10 10.5 5 18.5 5c0 8.3-5 13.5-13 13.5Z\"/><path d=\"M5.5 18.5 14 10\"/>"],
                ["First Cup", "<path d=\"M5 10.5h11V14a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 5 14Z\"/><path d=\"M16 11.5h1.2a2.6 2.6 0 0 1 0 5.2H16\"/><path d=\"M8.6 3.6c-.9 1.1.9 2.1 0 3.3M12.2 3.6c-.9 1.1.9 2.1 0 3.3\"/>"],
                ["Morning Ritual", "<path d=\"M3.5 18.5h17\"/><path d=\"M7.5 18.5a4.5 4.5 0 0 1 9 0\"/><path d=\"M12 12.2v-2.4M15.2 13.1l1.2-2.1M8.8 13.1l-1.2-2.1M17.4 15.4l2.1-1.2M6.6 15.4l-2.1-1.2\"/>"],
                ["Regular", "<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14.5\" rx=\"2.6\"/><path d=\"M4 10h16M8.5 3.5v4M15.5 3.5v4\"/><path d=\"M9 15l2.1 2.1L15.3 13\"/>"],
                ["Timed", "<circle cx=\"12\" cy=\"13.5\" r=\"7\"/><path d=\"M12 13.5V9.6\"/><path d=\"M9.8 3.5h4.4M12 3.5v3\"/><path d=\"M17.6 7.7l1.5-1.5\"/>"],
                ["Steady Pour", "<path d=\"M12 3.5c3.4 4.1 6.2 7.5 6.2 10.7a6.2 6.2 0 0 1-12.4 0c0-3.2 2.8-6.6 6.2-10.7Z\"/><path d=\"M9.3 14.6a2.9 2.9 0 0 0 2.5 2.8\"/>"],
                ["Warmed Up", "<path d=\"M12 20.8c3.5 0 6.1-2.5 6.1-5.9 0-3.6-2.5-5.6-3.9-8.4-.6 1.8-1.5 2.9-2.8 3.4.3-2.6-.6-5.1-2.4-6.6.1 3.3-1.7 5.2-3.2 7.4-.9 1.3-1.9 2.6-1.9 4.2 0 3.4 2.6 5.9 6.1 5.9Z\"/><path d=\"M12 20.8a2.6 2.6 0 0 1-2.6-2.6c0-1.6 1.3-2.6 2.6-4.3 1.3 1.7 2.6 2.7 2.6 4.3a2.6 2.6 0 0 1-2.6 2.6Z\"/>"],
                ["Explorer", "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1Z\"/>"],
                ["Fine-Tuner", "<path d=\"M4 7h9.2M16.8 7H20M4 12h3.2M10.8 12H20M4 17h11.2M18.8 17H20\"/><circle cx=\"15\" cy=\"7\" r=\"1.9\"/><circle cx=\"9\" cy=\"12\" r=\"1.9\"/><circle cx=\"17\" cy=\"17\" r=\"1.9\"/>"],
                ["Connoisseur", "<path d=\"M12 3.8l2.5 5.1 5.6.8-4.05 3.95.96 5.6L12 16.6l-5.01 2.65.96-5.6L3.9 9.7l5.6-.8Z\"/>"],
                ["Devoted", "<path d=\"M12 19.6S4.4 15.1 4.4 9.6A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.6 2.2c0 5.5-7.6 10-7.6 10Z\"/>"],
                ["Medalist", "<circle cx=\"12\" cy=\"15.2\" r=\"4.8\"/><path d=\"M8.7 3.6l2.3 6.8M15.3 3.6 13 10.4\"/><path d=\"M8 3.6h8\"/><circle cx=\"12\" cy=\"15.2\" r=\"1.6\"/>"],
                ["Summit", "<path d=\"M3.2 19.8l6.6-10.6 3.9 6.1 2.4-3.6 4.7 8.1Z\"/><path d=\"M9.8 9.2V4.1l3.6 1.5-3.6 1.6\"/>"],
                ["Master", "<path d=\"M4.3 17 3.6 7.8l4.6 4 3.8-6.1 3.8 6.1 4.6-4-.7 9.2Z\"/><path d=\"M4.6 20h14.8\"/>"],
                ["Legend", "<path d=\"M8 3.8h8v5.4a4 4 0 0 1-8 0Z\"/><path d=\"M8 5.4H5.4a2.6 2.6 0 0 0 2.8 3.9M16 5.4h2.6a2.6 2.6 0 0 1-2.8 3.9\"/><path d=\"M12 13.2v3.4M9.4 16.6h5.2M8.4 20.2h7.2\"/><path d=\"M9.4 16.6l-1 3.6M14.6 16.6l1 3.6\"/>"],
                ["Dialed In", "<path d=\"M4.4 16.4a7.6 7.6 0 0 1 15.2 0\"/><path d=\"M12 16.4l3.9-4.6\"/><circle cx=\"12\" cy=\"16.4\" r=\"1.4\" fill=\"currentColor\"/><path d=\"M6.4 11.1l1.1 1M12 8.8v1.5M17.6 11.1l-1.1 1\"/>"]
            ],
            // each icon's drawn box (x, y, width, height) and the middle of its ink, in its 24-unit square (measured by drawing it)
            NL_LVL_BOX: [[5, 4.2, 14.6, 17.1, 12.25, 12.04], [4.7, 4.2, 14.6, 15.1, 11.66, 12.07], [4.2, 2.8, 16.4, 17.5, 11.89, 12.68], [2.7, 9, 18.6, 10.3, 11.97, 15.59], [3.2, 2.7, 17.6, 18.1, 11.99, 11.96], [4.2, 2.7, 15.7, 18.6, 12.3, 11.81], [5, 2.7, 14, 18.5, 11.79, 13.12], [3.1, 2.5, 15.8, 19.1, 11.2, 13.57], [2.7, 2.7, 18.6, 18.6, 11.97, 11.97], [3.2, 4.3, 17.6, 15.4, 12.44, 11.98], [3.1, 3, 17.8, 17.05, 11.98, 12.32], [3.6, 4.6, 16.8, 15.8, 11.97, 11.3], [6.4, 2.8, 11.2, 18, 11.98, 11.9], [2.4, 3.3, 19.2, 17.3, 11.82, 14.3], [2.8, 4.9, 18.4, 15.9, 11.98, 13.89], [4.2, 3, 15.6, 18, 11.97, 11.05], [3.6, 8, 16.8, 10.6, 12.21, 12.91]],
            nlLevelBadge(i, size = 40) {
                const L = this.levelList()[i], C = this.NL_TIER_LOOK[L.t] || this.NL_TIER_LOOK[0], box = this.NL_LVL_BOX[i], art = this.NL_LEVEL_ICONS[i];
                let icon = '';
                if (art && box) {
                    const [x, y, w, h, mx, my] = box;
                    const cx = (x + w / 2) * 0.75 + mx * 0.25, cy = (y + h / 2) * 0.75 + my * 0.25;   // (the box's middle, nudged a little toward where the ink is)
                    const k = Math.min(17 / Math.sqrt(w * h), 21 / Math.max(w, h));   // (about the same weight for every icon, none too big)
                    icon = `<g transform="translate(20 20) scale(${k.toFixed(3)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})" fill="none" stroke="${C.ink}" color="${C.ink}" stroke-width="${(1.9 / k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${art[1]}</g>`;
                }
                return `<svg class="nl-lvl-badge" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="${C.bg}"/><circle cx="20" cy="20" r="${L.t === 4 ? 18.6 : 19}" fill="none" stroke="${C.ring}" stroke-width="${L.t === 4 ? 1.8 : 1.1}"/>${icon}</svg>`;
            },
            nlLevelName(i) { const a = this.NL_LEVEL_ICONS[i]; return a ? a[0] : (this.levelList()[i] || {}).name || ''; },   // (v18.1: shown with the level)
            nlTierName(L) { const t = this.levelTiers()[L.t].name; return t === 'The top' ? 'Top' : t; },
            nlLevelRowHtml(user) {
                const c = this.cremaOf(user);
                if (c === null || c === undefined) return '';
                const L = this.levelOf(c), fmt = x => Math.round(x).toLocaleString();
                return `<button type="button" class="lvl-row nl-lvl-row" data-name="${this.esc(user)}" onclick="app.openLevel(this.getAttribute('data-name'))" aria-label="Level ${L.n}${this.NL_LEVEL_ICONS[L.i] ? ` (${this.esc(this.NL_LEVEL_ICONS[L.i][0])})` : ''}, ${this.esc(this.nlTierName(L))}. ${fmt(L.crema)} crema">${this.nlLevelBadge(L.i, 44)}<span class="lvl-main"><span class="lvl-top"><b>${this.esc(this.nlLevelName(L.i))}</b><em>Level ${L.n} · ${this.esc(this.nlTierName(L))}</em></span><span class="lvl-bar"><i style="width:${L.pct.toFixed(1)}%"></i></span><small class="lvl-count">${fmt(L.crema)} crema${L.next ? ` · ${fmt(L.next.min - L.crema)} to level ${L.n + 1}` : ' · the top level'}</small></span></button>`;
            },
            nlLevelBody(name) {
                const own = name === this.user, L = this.levelOf(this.cremaOf(name) || 0), fmt = x => Math.round(x).toLocaleString(), list = this.levelList();
                const word = { coffee: 'A coffee or tea you hadn’t had before', roaster: 'A new roaster or tea brand', local: 'A session from a roaster or brand you marked local' };
                const tierOf = t => { const n = this.levelTiers()[t].name; return n === 'The top' ? 'Top' : n; };
                const ladder = `<div class="lvl-sec"><div class="lvl-cap">Levels</div>${list.map((x, i) => `<div class="nl-lvl-tier${i === L.i ? ' on' : ''}${i > L.i ? ' locked' : ''}">${this.nlLevelBadge(i, 34)}<span><b>${this.esc(this.nlLevelName(i))}</b><small>Level ${i + 1} · ${this.esc(tierOf(x.t))}</small></span><em>${fmt(x.min)}</em></div>`).join('')}</div>`;   // (v18.1: every level, by name)
                const how = `<div class="lvl-sec"><div class="lvl-cap">How to earn crema</div>${this.cremaRules().map(r => `<div class="lvl-line"><span>${this.esc(word[r[0]] || r[1])}${r[3] ? `<small> · ${this.esc(r[3])}</small>` : ''}</span><b>+${r[2]}</b></div>`).join('')}</div>`;
                const share = own && this.openLevelStory ? '<button type="button" class="btn-outline lvl-share" onclick="app.openLevelStory()"><svg class="icon"><use href="#i-share-2"/></svg>Share</button>' : '';
                return `<div class="lvl-hero nl-lvl-hero">${this.nlLevelBadge(L.i, 92)}<div class="lvl-kicker">${own ? 'Your level' : `${this.esc(name)}'s level`}</div><h3>${this.esc(this.nlLevelName(L.i))}</h3><div class="lvl-crema">Level ${L.n} · ${this.esc(this.nlTierName(L))} · <b>${fmt(L.crema)}</b> crema</div>${L.next ? `<div class="lvl-bar big"><i style="width:${L.pct.toFixed(1)}%"></i></div><div class="lvl-next">${fmt(L.next.min - L.crema)} more to level ${L.n + 1}</div>` : '<div class="lvl-next">The top level.</div>'}${share}</div>${ladder}${how}`;
            },

            // v17.5: an achievement on a card: its own little card in the color of whoever earned it; tap it for their achievements
            nlUnlockHtml(u) {
                if (!u || !u.definition) return '';
                const d = u.definition, who = u.user || '', lv = d.thresholds.length > 1 ? ` · Level ${u.level}` : '';
                return `<button type="button" class="nl-ach" style="--ac:${this.esc(this.getUserColor(who))}" onclick="event.stopPropagation(); app.openAchievementLocker('${app.escJs(who)}')" aria-label="${this.esc(`${who === this.user ? 'You' : who} unlocked ${d.title}${lv}. Open achievements`)}"><span class="nl-ach-ic"><svg class="icon"><use href="#i-trophy"/></svg></span><span class="nl-ach-t"><small>Achievement unlocked</small><b>${this.esc(d.title)}${this.esc(lv)}</b><span>${this.esc(who === this.user ? 'You' : who)} ${this.esc(d.sentence(u.threshold))}</span></span><svg class="icon nl-ach-go" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>`;
            },

            // ===================== the feed card =====================
            nlWho(person, date, onPhoto, bg) {
                return `<div class="nl-who${onPhoto ? '' : ' flat'}">${this.nlAvatar(person)}<span class="nl-stack">${onPhoto ? `<span class="nl-sig" data-profile="${this.esc(person)}">${this.esc(person)}</span>` : this.nlSig(person, bg)}<span class="nl-ago" data-time="${this.esc(String(date || ''))}">${this.esc(this.nlAgo(date))}</span></span></div>`;
            },
            // "3h ago" within a week, then "Oct 15" ("Oct 15, 2025" another year), never 10/15/2026
            nlAgo(value) {
                const ts = this.toTime(value);
                if (!ts) return '';
                if (Date.now() - ts < 7 * 864e5) return this.formatRelativeDate(value);
                const d = new Date(ts), o = { month: 'short', day: 'numeric' };
                if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
                try { return d.toLocaleDateString(undefined, o); } catch (e) { return d.toDateString().slice(4, 10); }
            },
            nlMethodPill(method, solid, compact) {
                const label = this.methodLabel(method) || 'Espresso';
                // (v18.6: compact, just its icon, beside a Follow button: the three crowded the name)
                if (compact) return `<span class="nl-mpill compact${solid ? ' solid' : ''}" role="img" aria-label="${this.esc(label)}" title="${this.esc(label)}"><svg class="nl-ic"><use href="${this.methodIconUse(method)}"/></svg></span>`;
                return `<span class="nl-mpill${solid ? ' solid' : ''}"><svg class="nl-ic"><use href="${this.methodIconUse(method)}"/></svg>${this.esc(label)}</span>`;
            },
            nlRoasterHtml(bean, tea, cls = 'nl-roast') {
                if (!bean) return '';
                if (bean.roaster) return `<div class="${cls}"><span class="ro-link" role="link" tabindex="0" data-roaster="${this.esc(bean.roaster)}"${tea ? ' data-kind="tea"' : ''} onclick="app.openRoasterFrom(this, event)">${this.esc(bean.roaster)}</span></div>`;
                const maker = this.teaMakerName ? this.teaMakerName(bean) : '';
                return maker ? `<div class="${cls}">${this.esc(maker)}</div>` : '';
            },
            nlWords(brew, cls = 'nl-words') {
                const notes = this.getBrewNotes(brew);
                return notes ? `<p class="${cls}">“${this.esc(notes)}”</p>` : '';
            },
            nlHelpfulHtml(brew, fam) {
                if (!brew.helpfulAnswer || !Array.isArray(brew.comments)) return '';
                const c = brew.comments.find(x => x && String(x.id) === String(brew.helpfulAnswer));
                if (!c || !c.text) return '';
                return `<div class="nl-helpful"><div class="nl-helpful-who">${this.nlAvatar(c.user, 'nl-av s28')}${this.nlSig(c.user, this.nlPal(fam).c, 'nl-sig', 16)}<span class="nl-badge"><svg class="nl-ic"><use href="#i-check"/></svg>Most helpful</span></div><p>${this.esc(c.text)}</p></div>`;
            },
            nlSocial(kind, item, likes, likeFn) {
                return this.renderThread(kind, item, { inputId: `feed-comment-input-${kind}-${item.id}`, lead: `<button class="social-btn like-btn ${likes.includes(this.user) ? 'liked' : ''}${this.likePopClass(kind, item.id)}"${this.likePopStyle(kind, item.id)} onclick="${likeFn}" aria-label="Like" title="Like"><svg class="heart-icon"><use href="#i-heart"/></svg></button>${likes.length ? `<div class="social-like-line">${this.esc(this.formatLikers(likes))}</div>` : ''}` });
            },

            renderFeedSessionCardNew(entry) {
                const brew = this.brews.get(String(entry.brewId || ''));
                if (!brew) return '';
                const owner = this.getBrewOwner(brew), bean = this.beans.get(String(brew.beanId || '')), tea = this.isTeaBrew(brew);
                const fam = this.famOfBrew(brew), pal = this.nlPal(fam);
                const coffeeName = (bean ? String(bean.name || '').trim() : String(entry.beanName || '')) || (tea ? 'Tea' : 'Coffee');
                const likes = this.normalizeLikeList(brew.likes, owner);
                const unlocks = this.achievementUnlockByBrew.get(String(brew.id)) || [];
                const ph = this.nlPhoto(brew), shape = this.nlHasShape(brew);
                const follow = entry.community ? this.communityFollowHtml(owner) : '';
                const right = `<div class="nl-tright">${follow}${this.nlMethodPill(brew.method, false, !!follow)}<button type="button" class="nl-glass" onclick="app.shareItem('session', '${app.escJs(brew.id)}', event)" aria-label="Share"><svg class="nl-ic"><use href="#i-share-2"/></svg></button></div>`;
                const top = onPhoto => `<div class="nl-ctop${onPhoto ? '' : ' flat'}">${this.nlWho(owner, entry.date || brew.date, onPhoto, pal.c)}${right}</div>`;
                const media = ph ? `<div class="nl-ph session-photo-wrap">${this.nlPhotoImg(ph)}<div class="nl-fade"></div>${top(true)}</div>`
                    : shape ? `<div class="nl-ph nl-shapemedia flat">${this.nlSpinHtml(brew, fam, { cls: 'nl-bigspin' })}<div class="nl-fade short"></div>${top(false)}</div>`
                    : `<div class="nl-flattop">${top(false)}</div>`;
                const steeps = tea ? this.teaStepsOf(brew) : [];
                const help = this.helpTagHtml ? this.helpTagHtml(brew) : '';
                return `
                    <article class="nl-card ${ph ? 'has-photo' : shape ? 'has-shape' : 'is-flat'}" data-fam="${fam}" data-card-brew="${this.esc(brew.id)}" onclick="app.openSession('${app.escJs(brew.id)}')">
                        ${media}
                        <div class="nl-body">
                            ${help ? `<div class="nl-help">${help}</div>` : ''}
                            <div class="nl-titlerow${ph && shape ? ' has-mini' : ''}"><div class="nl-titles">${this.nlRoasterHtml(bean, tea)}<h2 class="nl-name" data-nl-fit="44,28,3,28" style="font-size:${this.nlNameSize(coffeeName, ph && shape ? 190 : 322, 44, 34, 2)}px"${bean ? ` role="link" tabindex="0" onclick="event.stopPropagation(); app.openFeedTarget('${app.escJs(bean.id)}','',false)"` : ''}>${this.esc(coffeeName)}</h2></div>${ph && shape ? this.nlSpinHtml(brew, fam, { cls: 'nl-mini' }) : ''}</div>
                            ${this.nlTilesHtml(this.nlCardTiles(brew))}
                            ${steeps.length > 1 ? `<div class="nl-steeps">${steeps.map(s => `<span class="nl-badge">${this.esc(this.fmtSteep(s).replace(/s$/, ' s'))}</span>`).join('')}</div>` : ''}
                            ${this.nlWords(brew)}
                            ${this.nlNotesHtml(brew)}
                            ${this.nlHelpfulHtml(brew, fam)}
                            ${unlocks.map(u => this.nlUnlockHtml(u)).join('')}
                            ${this.nlSocial('brew', brew, likes, `app.toggleLike('${app.escJs(brew.id)}', event)`)}
                        </div>
                    </article>`;
            },

            renderFeedBeanCardNew(entry) {
                const bean = this.beans.get(String(entry.beanId || ''));
                if (!bean) return '';
                const owner = String(bean.user || bean.owner || 'Unknown'), tea = this.isTeaBean(bean);
                const fam = this.famOfCoffee(bean), pal = this.nlPal(fam);
                const likes = this.normalizeLikeList(bean.likes, owner);
                const comments = this.normalizeCommentList(bean.comments, `bean-${bean.id}`, bean.date);
                const key = this.beanGroupKey(bean);
                const brews = [...this.brews.values()].filter(b => { const bn = this.beans.get(String(b.beanId)); return bn && this.beanGroupKey(bn) === key; }).sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                const withShape = brews.find(b => this.nlHasShape(b));
                const cov = this.coverOf(this.coverBean(bean) || bean), coverUrl = cov && cov.photo && this.faceUrl ? this.faceUrl(cov.photo) : '';   // v17.4: its own picture
                const ph = coverUrl && !(this._brokenPhotos && this._brokenPhotos.has(coverUrl)) ? { src: coverUrl, fallbacks: [coverUrl] } : null;   // (v18.6: one that won't load is drawn without it, like a session's)
                const right = `<div class="nl-tright"><span class="nl-mpill">${this.esc(entry.kindLabel || (tea ? 'New tea' : 'New coffee'))}</span><button type="button" class="nl-glass" onclick="event.stopPropagation(); app.openCoffeeStory('${app.escJs(bean.id)}')" aria-label="Share"><svg class="nl-ic"><use href="#i-share-2"/></svg></button></div>`;
                const top = onPhoto => `<div class="nl-ctop${onPhoto ? '' : ' flat'}">${this.nlWho(owner, entry.date || bean.date, onPhoto, pal.c)}${right}</div>`;
                const media = ph ? `<div class="nl-ph session-photo-wrap">${this.nlPhotoImg(ph, 'nl-photo', 'Coffee photo')}<div class="nl-fade"></div>${top(true)}</div>`
                    : withShape ? `<div class="nl-ph nl-shapemedia flat">${this.nlSpinHtml(withShape, fam, { cls: 'nl-bigspin' })}<div class="nl-fade short"></div>${top(false)}</div>`
                    : `<div class="nl-flattop">${top(false)}</div>`;
                const tags = [tea ? bean.teaType : '', bean.variety, bean.origin, bean.process].filter(Boolean).slice(0, 3);
                return `
                    <article class="nl-card ${ph ? 'has-photo' : withShape ? 'has-shape' : 'is-flat'}" data-fam="${fam}" onclick="app.openFeedTarget('${app.escJs(bean.id)}','',false)">
                        ${media}
                        <div class="nl-body">
                            <div class="nl-titlerow nl-beanrow">${ph ? '' : this.nlCoverHtml(bean, 'nl-cover nl-bcover')}<div class="nl-titles">${this.nlRoasterHtml(bean, tea)}<h2 class="nl-name" data-nl-fit="44,26,2,34" style="font-size:${this.nlNameSize(bean.name, 230, 44, 26, 2)}px">${this.esc(bean.name || (tea ? 'Tea' : 'Coffee'))}</h2></div></div>
                            ${tags.length ? `<div class="nl-badges">${tags.map(t => `<span class="nl-badge">${this.esc(t)}</span>`).join('')}</div>` : ''}
                            ${this.nlSocial('bean', { ...bean, comments }, likes, `app.toggleBeanLike('${app.escJs(bean.id)}', event)`)}
                        </div>
                    </article>`;
            },

            // ===================== the Session screen =====================
            sessionViewActive() { const v = typeof document !== 'undefined' && document.getElementById ? document.getElementById('session-view') : null; return !!(v && v.classList && v.classList.contains('active')); },

            openSession(brewId, opts = {}) {
                const brew = this.brews.get(String(brewId));
                if (!brew) { this.showToast('That session no longer exists.'); return; }
                let v = document.getElementById('session-view');
                if (!v) {
                    v = document.createElement('div'); v.id = 'session-view'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Session');
                    v.innerHTML = '<div class="nls-page" id="nls-page"></div>';
                    // a tap that leaves for another page (a person, a roaster) closes this one first
                    v.addEventListener('click', e => { const t = e.target && e.target.closest ? e.target.closest('[data-profile], [data-roaster]') : null; if (t && v.contains(t)) this.closeSession(true); }, true);
                    document.body.appendChild(v);
                }
                this._sessionId = String(brewId);
                this._nlsHtml = ''; this._nlsKey = '';
                v.classList.remove('closing'); v.hidden = false;
                v.classList.add('active'); v.setAttribute('aria-hidden', 'false');
                document.body.classList.add('nls-open');
                v.scrollTop = 0;   // (before drawing: the bar's look is read from where the page is; the last session's spot made it solid for a moment)
                this.renderSession();
                v.scrollTop = 0;
                if (opts.comments) setTimeout(() => {
                    const c = document.getElementById('nls-comments');
                    if (c) { v.scrollTop = Math.max(0, c.offsetTop - 80); const inp = document.getElementById(`nls-comment-input-${this._sessionId}`); if (inp) inp.focus({ preventScroll: true }); }
                }, 60);
            },

            closeSession(instant) {
                if (!this.sessionViewActive()) return;
                const v = document.getElementById('session-view');
                document.body.classList.remove('nls-open');
                const done = () => { v.classList.remove('active', 'closing'); v.setAttribute('aria-hidden', 'true'); v.hidden = true; v.style.transform = ''; this._sessionId = ''; const pg = document.getElementById('nls-page'); if (pg) pg.innerHTML = ''; this._nlsHtml = ''; this._nlsKey = ''; };
                if (instant) { done(); return; }
                v.classList.add('closing');
                setTimeout(done, 200);
            },

            nlSessionTiles(b) {
                const tea = this.isTeaBrew(b), tiles = [], dose = this.num(b.dose), yld = this.num(b.yield), temp = this.num(b.temp);
                const bags = tea && b.teabag ? Math.max(1, Number(b.bags) || 1) : 0;
                if (bags) tiles.push(this.nlTile(`${bags}${this.nlU(bags === 1 ? ' bag' : ' bags')}`, 'teabag'));
                else if (dose > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(dose, 1))}${this.nlU(' g')}`, tea ? (b.method === 'Matcha' ? 'matcha' : 'leaf') : 'dose'));
                if (yld > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(yld, tea ? 0 : 1))}${this.nlU(tea ? ' ml' : ' g')}`, tea || (b.method && b.method !== 'Espresso') ? 'water' : 'pull'));   // (the words the Log form uses)
                if (dose > 0 && yld > 0) tiles.push(this.nlTile(tea ? `1:${this.esc(this.fmtNum(yld / dose, 0))}` : this.esc(this.fmtRatio(yld / dose)), 'ratio'));
                const t = this.nlTimeVal(b);
                if (t) tiles.push(this.nlTile(t, tea ? (b.method === 'Matcha' ? 'whisk' : 'steep') : 'time'));
                if (!tea && this.grindText(b.grind)) tiles.push(this.nlTile(this.esc(this.grindText(b.grind)), 'grind'));   // (the owner's own grind, on their own session)
                if (temp > 0) tiles.push(this.nlTile(`${this.esc(this.fmtNum(temp, 0))}${this.nlU(' °C')}`, 'temp'));
                return tiles;
            },

            renderSession(soft) {
                const v = document.getElementById('session-view'), page = document.getElementById('nls-page');
                if (!v || !page) return;
                const brew = this.brews.get(this._sessionId || '');
                if (!brew) { this.closeSession(true); return; }
                const act = document.activeElement;
                if (soft && act && v.contains(act) && /^(INPUT|TEXTAREA)$/.test(act.tagName)) { this._nlsStale = true; if (!this._nlsBlur) { this._nlsBlur = true; v.addEventListener('focusout', () => { setTimeout(() => { if (this._nlsStale && this.sessionViewActive()) { this._nlsStale = false; this.renderSession(true); } }, 50); }); } return; }
                const html = this.sessionHtml(brew);
                if (soft && html === this._nlsHtml) return;
                // v18.6: when only the "5m ago" labels moved on, they change in place: redrawing the page every minute undid a
                // paused or top-view shape, closed the ⋯ menu and cut off a drag
                const AGO = />(Just now|\d+[mhd] ago)</g, key = html.replace(AGO, '><');
                if (soft && key === this._nlsKey && page.firstChild) {
                    const fresh = [...html.matchAll(AGO)].map(m => m[1]);
                    const els = [...page.querySelectorAll('*')].filter(el => el.childElementCount === 0 && /^(Just now|\d+[mhd] ago)$/.test(el.textContent));
                    if (els.length === fresh.length) { els.forEach((el, i) => { if (el.textContent !== fresh[i]) el.textContent = fresh[i]; }); this._nlsHtml = html; return; }
                }
                const drafts = soft && this.captureDrafts ? this.captureDrafts() : null;
                this._nlsHtml = html; this._nlsKey = key;
                page.setAttribute('data-fam', this.famOfBrew(brew));
                page.innerHTML = html;
                if (drafts && this.restoreDrafts) this.restoreDrafts(drafts);
                this.nlFillShapes(page);
                this.nlFillSpins(page);
                this.nlFitNames(page);
                this.nlFitTiles(page);
                this.nlBindNav(v); this.nlNavPaint(v, !soft);
            },

            sessionHtml(brew) {
                const owner = this.getBrewOwner(brew), mine = owner === this.user, bean = this.beans.get(String(brew.beanId || '')), tea = this.isTeaBrew(brew);
                const fam = this.famOfBrew(brew), pal = this.nlPal(fam), kind = tea ? 'tea' : 'coffee';
                const name = (bean ? String(bean.name || '').trim() : '') || (tea ? 'Tea' : 'Coffee');
                const ph = this.nlPhoto(brew), shape = this.nlHasShape(brew), rating = this.normalizeRating(brew.rating);
                const likes = this.normalizeLikeList(brew.likes, owner), id = String(brew.id);
                const more = mine || this.acctOn() ? `<button type="button" class="nl-glass" onclick="app.nlSessionMore(event)" aria-label="More">${this.NL_MORE}</button>` : '';
                const hero = `
                    <div class="nls-hero ${ph ? 'has-photo' : shape ? 'has-shape' : 'is-flat'}">
                        ${ph ? `${this.nlPhotoImg(ph, 'nls-photo')}<div class="nl-pfade"></div>` : shape ? `<div class="nls-bigshape">${this.nlSpinHtml(brew, fam, { cls: 'nls-shape', pg: true, drag: true })}</div>` : ''}
                        <div class="nls-id">
                            <div class="nls-whorow">${this.nlWho(owner, brew.date, !!ph && pal.dark, pal.pg)}${this.nlMethodPill(brew.method, true)}</div>
                            ${this.nlRoasterHtml(bean, tea, 'nl-roast nls-roast')}
                            <h1 class="nl-name nls-name" data-nl-fit="60,40,3" style="font-size:${this.nlNameSize(name, 354, 60, 40, 3)}px" role="link" tabindex="0" onclick="app.nlSessionCoffee()">${this.esc(name)}</h1>
                            ${rating > 0 ? `<div class="nls-rate">${this.nlStarsHtml(rating, 20)}<b>${this.esc(this.fmtNum(rating, 1))}</b></div>` : ''}
                        </div>
                    </div>`;
                const tiles = this.nlSessionTiles(brew);
                const hasTemp = this.num(brew.temp) > 0;
                const badges = [...this.resolveEquipmentNames(brew).map(n => ['#i-wl-grinder', n]), ...(this.roastDayLabel ? this.roastDayLabel(brew) : []).map(n => ['', n]), ...this.sessionExtras(brew).filter(x => !(hasTemp && /°C$/.test(x))).map(n => ['', n])];
                const sec = (h, body, extra = '') => body ? `<section class="nls-sec"${extra}>${h ? `<h3 class="nl-h3">${h}</h3>` : ''}${body}</section>` : '';
                const words = this.getBrewNotes(brew);
                const tasted = this.tastedKeys(brew);
                const taste = shape || tasted.length ? `<div class="nl-box nls-taste">${shape ? this.nlSpinHtml(brew, fam, { cls: 'nls-tshape', labels: true, lines: true, drag: true }) : ''}${(d => d ? `<p class="nls-desc">${this.esc(d)}</p>` : '')(this.describeCup(this.shapeValues(brew), tasted, this.extractFlavors(brew), this.noteIntensities(brew), kind))}${tasted.map(k => { const val = this.tasteValue(brew, k); return `<div class="nl-srow"><span>${this.esc(this.tasteLabel(k, kind))}</span><span class="nl-bar"><i style="width:${Math.max(4, val * 10)}%;background:${FlavorShape.COLORS[k]}"></i></span><span class="nl-num">${this.esc(this.fmtNum(val, 1))}</span></div>`; }).join('')}</div>` : '';
                const prev = this.previousBrewFor(brew);
                const vs = prev ? `<div class="nl-box nls-vs">${this.renderVsPane(brew)}</div>` : '';
                const next = `<div class="nls-next">${this.renderNextPane(brew)}</div>`;
                const comments = this.normalizeCommentList(brew.comments, `brew-${id}`, brew.date);
                const bar = `<div class="nls-top nl-navbar"${ph ? ' data-photo' : ''}><button type="button" class="nl-glass" onclick="app.closeSession()" aria-label="Back"><svg class="nl-ic"><use href="#i-arrow-left"/></svg></button><div class="nl-tright"><button type="button" class="nl-glass" onclick="app.shareItem('session', '${app.escJs(id)}', event)" aria-label="Share"><svg class="nl-ic"><use href="#i-share-2"/></svg></button>${more}<button type="button" class="nl-glass" onclick="app.openSettings()" aria-label="Settings"><svg class="nl-ic"><use href="#i-gear"/></svg></button></div></div>`;
                return `${bar}
                    <div class="nls-wrap" data-card-brew="${this.esc(id)}">
                        ${hero}
                        <section class="nls-sec nls-first">${this.nlTilesHtml(tiles, 'nls-tiles')}${badges.length ? `<div class="nls-badges">${badges.map(([ic, t]) => `<span class="nl-badge lg">${this.esc(t)}</span>`).join('')}</div>` : ''}</section>
                        ${sec(`In ${this.esc(owner)}'s words`, words ? `<p class="nls-words">“${this.esc(words)}”</p>` : '')}
                        ${sec('Flavors', this.nlNotesHtml(brew, 'wrap', 'lg'))}
                        ${this.hasShotPane && this.hasShotPane(brew) ? sec('The shot <span>· from the Shot Logger</span>', `<div class="nl-box nls-shot">${this.renderShotPane(brew)}</div>`) : ''}
                        ${sec('Taste', taste)}
                        ${sec(prev ? 'Vs. last time' : '', vs)}
                        ${sec('', next)}
                        <section class="nls-sec nls-social">
                            <div class="nls-likes"><div class="thread-lead"><button class="social-btn like-btn ${likes.includes(this.user) ? 'liked' : ''}${this.likePopClass('brew', id)}"${this.likePopStyle('brew', id)} onclick="app.toggleLike('${app.escJs(id)}', event)" aria-label="Like" title="Like"><svg class="heart-icon"><use href="#i-heart"/></svg></button>${likes.length ? `<div class="social-like-line">${this.esc(this.formatLikers(likes))}</div>` : ''}</div></div>
                            <h3 class="nl-h3" id="nls-comments">Comments${comments.length ? ` <span>· ${comments.length}</span>` : ''}</h3>
                            ${this.renderThread('brew', brew, { inputId: `nls-comment-input-${id}` })}
                        </section>
                    </div>`;
            },

            nlSessionCoffee() {
                const brew = this.brews.get(this._sessionId || '');
                if (!brew) return;
                this.closeSession(true);
                this.openFeedTarget(brew.beanId, '', false);
            },

            // ⋯ on the Session screen: Edit and Delete (yours), Report (someone else's), as the app allows today
            nlSessionMore(event) {
                if (event) event.stopPropagation();
                const brew = this.brews.get(this._sessionId || '');
                if (!brew) return;
                const mine = this.getBrewOwner(brew) === this.user, id = String(brew.id);
                let m = document.getElementById('nls-more');
                if (m) { m.remove(); return; }
                m = document.createElement('div'); m.id = 'nls-more'; m.className = 'nls-more'; m.setAttribute('role', 'menu');
                m.innerHTML = mine
                    ? `<button type="button" role="menuitem" onclick="app.nlMoreGo('edit')"><svg class="nl-ic"><use href="#i-edit-2"/></svg>Edit</button><button type="button" role="menuitem" class="danger" onclick="app.nlMoreGo('delete')"><svg class="nl-ic"><use href="#i-trash-2"/></svg>Delete</button>`
                    : `<button type="button" role="menuitem" onclick="app.nlMoreGo('report')"><svg class="nl-ic"><use href="#i-flag"/></svg>Report</button>`;
                (document.getElementById('nls-page') || document.getElementById('session-view')).appendChild(m);
                // (v18.6: a second tap on ⋯ closes it; it used to reopen at once)
                setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off, true); if (e.target.closest && e.target.closest('[onclick^="app.nlSessionMore"]')) { e.stopPropagation(); e.preventDefault(); } } }, true), 0);
                m.setAttribute('data-id', id);
            },
            nlMoreGo(what) {
                const m = document.getElementById('nls-more'), id = m ? m.getAttribute('data-id') : this._sessionId;
                if (m) m.remove();
                if (!id) return;
                if (what === 'edit') { this.closeSession(true); const b = this.brews.get(id); if (b) this.openFeedTarget(b.beanId, '', false); this.editBrew(id); }
                else if (what === 'delete') { this.delete('brew', id); setTimeout(() => { if (!this.brews.has(id)) this.closeSession(); }, 400); }
                else if (what === 'report') this.reportItem('session', id);
            },

            // ---- v17.4: pages about one thing (a coffee, a roaster, a session) keep their Back bar at the top, like the tabs'
            // top bar: clear over a photo, the page's color once you scroll, tucked away scrolling down (the strip behind the
            // clock stays), back when you scroll up. In the classic look the coffee page's bar goes back where it was.
            nlNavBars() {
                if (typeof document === 'undefined' || !document.getElementById) return;
                try { this.nlNavBarsNow(); } catch (err) { console.warn('new look bars', err); }
            },
            nlNavBarsNow() {
                const nl = this.newLook();
                const dv = document.getElementById('detail-view'), hero = dv && dv.querySelector ? dv.querySelector('.detail-hero') : null;
                const top = dv && dv.querySelector ? dv.querySelector('.dh-top:not(.ro-top)') : null;
                if (dv && hero && top) {
                    if (nl) { if (top.parentElement !== dv) dv.insertBefore(top, dv.firstChild); top.classList.add('nl-navbar'); if (hero.classList && hero.classList.contains('nl-has-photo')) top.setAttribute('data-photo', ''); else top.removeAttribute('data-photo'); }
                    else { if (top.parentElement !== hero) hero.insertBefore(top, hero.firstChild); top.classList.remove('nl-navbar', 'nl-solid', 'nl-tucked'); top.removeAttribute('data-photo'); }
                }
                const ro = document.querySelector ? document.querySelector('#ro-page > .ro-top') : null;
                if (ro) ro.classList.toggle('nl-navbar', nl);
                ['detail-view', 'roaster-view', 'session-view'].forEach(id => { const sc = document.getElementById(id); if (sc) { this.nlBindNav(sc); this.nlNavPaint(sc, true); } });
                this.nlExtras(nl);
            },
            // v17.5: typing a comment (the New look): once the keyboard is up, the box sits just above it. iPhone sometimes threw it
            // to the top of the screen (or left it under the keyboard); this puts it back where you'd expect, and leaves it alone
            // when it's already in view.
            bindCommentKeyboard() {
                if (this._ckb || typeof document === 'undefined' || typeof window === 'undefined' || !window.visualViewport) return;
                this._ckb = true;
                const vv = window.visualViewport;
                let target = null, t = 0;
                const place = () => {
                    if (!target || document.activeElement !== target || !(this.newLook && this.newLook())) return;
                    const sc = target.closest('#session-view, #detail-view, #roaster-view, #main-content');
                    if (!sc) return;
                    if (window.scrollY) window.scrollTo(0, 0);
                    const r = target.getBoundingClientRect(), bottom = vv.offsetTop + vv.height;
                    const head = sc.id === 'main-content' ? document.querySelector('.header-sticky') : sc.querySelector('.nl-navbar');
                    const top = vv.offsetTop + (head ? Math.max(0, head.getBoundingClientRect().bottom) : 60) + 8;
                    if (r.bottom <= bottom - 8 && r.top >= top) return;   // (in view: leave it)
                    sc.scrollTop += r.top - (bottom - 14 - r.height);
                };
                document.addEventListener('focusin', e => { const el = e.target; if (!el || !el.classList || !el.classList.contains('comment-input')) return; target = el; clearTimeout(t); t = setTimeout(place, 340); });
                vv.addEventListener('resize', () => { if (target) { clearTimeout(t); t = setTimeout(place, 80); } });
                document.addEventListener('focusout', e => { if (e.target === target) { target = null; clearTimeout(t); } });
            },
            // v17.5: a ring in each person's own color around their picture: one style rule per person (by name), written when a
            // new name shows up on screen, so a redraw never loses it and a changed color updates it
            nlRingRules() {
                if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function' || !document.head) return;
                const seen = this._nlRings || (this._nlRings = new Map());
                let changed = false;
                document.querySelectorAll('[data-face], .cmt-avatar[data-profile], .feed-avatar[data-profile]').forEach(el => {
                    const n = String(el.getAttribute('data-face') || el.getAttribute('data-profile') || '').trim();
                    if (!n || seen.size > 400) return;
                    const c = this.normalizeHexColor(this.getUserColor(n)) || '';
                    if (seen.get(n) !== c) { seen.set(n, c); changed = true; }
                });
                if (!changed) return;
                let st = document.getElementById('nl-rings');
                if (!st) { st = document.createElement('style'); st.id = 'nl-rings'; document.head.appendChild(st); }
                const q = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                st.textContent = [...seen].filter(([, c]) => c).map(([n, c]) => `html[data-look="new"] [data-face=${q(n)}], html[data-look="new"] .cmt-avatar[data-profile=${q(n)}] { --ring: ${c}; }`).join('\n');
            },
            // v17.4: Settings on every page (the coffee and roaster pages' bars too) and the Achievement Locker's Done at its top:
            // put in for the New look only, and taken out again for the classic look (which stays exactly as it was)
            nlExtras(nl) {
                if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
                document.querySelectorAll('#detail-view .dh-top .dh-actions, #ro-page > .ro-top .dh-actions').forEach(a => {
                    const has = [...a.children].find(c => c.classList.contains('nl-navset'));
                    if (nl && !has) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-clean nl-navset'; b.setAttribute('aria-label', 'Settings'); b.setAttribute('onclick', 'app.openSettings()'); b.innerHTML = '<svg class="icon"><use href="#i-gear"/></svg>'; a.appendChild(b); }
                    else if (!nl && has) has.remove();
                });
                const card = document.querySelector('#achievement-modal .modal-card'), done = card && card.querySelector('.nl-ach-done');
                if (card && nl && !done) { const b = document.createElement('button'); b.type = 'button'; b.className = 'set-done nl-ach-done'; b.textContent = 'Done'; b.setAttribute('onclick', 'app.closeModals()'); const h = card.querySelector('h2'); if (h) h.after(b); else card.prepend(b); }
                else if (card && !nl && done) done.remove();
            },
            nlNavPaint(sc, reset) {
                const bar = sc && sc.querySelector ? sc.querySelector('.nl-navbar') : null;
                if (!bar) return;
                if (reset) { bar.classList.remove('nl-tucked'); sc._nlNavY = sc.scrollTop; sc._nlDown = sc._nlUp = 0; }
                bar.classList.toggle('nl-solid', sc.scrollTop > (bar.hasAttribute('data-photo') ? 230 : 4));
            },
            nlBindNav(sc) {
                if (!sc || sc._nlNav || typeof sc.addEventListener !== 'function') return;
                sc._nlNav = true;
                let queued = false;
                const update = () => {
                    queued = false;
                    if (!this.newLook()) return;
                    const bar = sc.querySelector('.nl-navbar');
                    if (!bar) return;
                    const y = sc.scrollTop, max = sc.scrollHeight - sc.clientHeight, dy = y - (sc._nlNavY || 0);
                    sc._nlNavY = y;
                    this.nlNavPaint(sc);
                    if (y <= 90) { sc._nlDown = sc._nlUp = 0; bar.classList.remove('nl-tucked'); return; }   // near the top it always shows
                    if (y >= max - 2) return;   // (the bounce at the bottom isn't a scroll back up)
                    if (dy > 0) { sc._nlDown = (sc._nlDown || 0) + dy; sc._nlUp = 0; if (sc._nlDown > 12) bar.classList.add('nl-tucked'); }
                    else if (dy < 0) { sc._nlUp = (sc._nlUp || 0) - dy; sc._nlDown = 0; if (sc._nlUp > 8) bar.classList.remove('nl-tucked'); }
                };
                sc.addEventListener('scroll', () => { if (!queued) { queued = true; (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16))(update); } }, { passive: true });
            },

            // a sheet or page in one thing's colors (the New look); with it off, nothing is left behind
            nlTint(sel, fam) {
                const el = typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector(sel) : null;
                if (!el || !el.setAttribute) return;
                if (this.newLook()) el.setAttribute('data-fam', fam || 'app'); else if (el.getAttribute && el.getAttribute('data-fam') !== null && el.removeAttribute) el.removeAttribute('data-fam');
            },

            // ===================== Coffees: a card per coffee, like a roaster's (v17.4) =====================
            // its picture (a photo or its color, chosen once), the roaster in handwriting, the name, its rating, how many sessions
            // and from where, who drinks it, and the notes most tasted; the card wears the picture's color
            nlCoffeeTile(card, group, brews, teaShelf) {
                const bean = group.meta, fam = this.famOfCoffee(bean);
                const added = group.addedAt && group.addedAt !== Infinity ? group.addedAt : this.toTime(bean.date);
                const isNew = added && (Date.now() - added) < 3 * 864e5;
                if (isNew) this.nextFreshExpiry = Math.min(this.nextFreshExpiry, added + 3 * 864e5);
                const avg = this.calculateAverageRating(brews), n = brews.length;
                const notes = this.lookTopNotes(brews, 3);
                const where = [teaShelf ? bean.teaType : '', bean.origin, bean.process].filter(Boolean).join(' · ');
                card.className = 'nl-ccard';
                card.setAttribute('data-fam', fam);
                card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
                const faces = this.coffeeFacesHtml(group, brews);
                card.innerHTML = `
                    <div class="nl-chead">
                        ${this.nlCoverHtml(bean, 'nl-cover')}
                        <div class="nl-cmain">
                            ${this.nlRoasterHtml(bean, teaShelf, 'nl-roast nl-croast')}
                            <div class="nl-cname">${this.esc(bean.name || '')}</div>
                            ${avg > 0 ? `<div class="nl-crate"><span class="star-meter" style="--fill:${this.starFill(avg)}%;--whole:${this.starWhole(avg)};--frac:${this.starFrac(avg)}"></span><b>${this.esc(this.formatRating(avg))}</b></div>` : ''}
                        </div>
                        ${isNew ? `<span class="nl-fresh">New</span>` : ''}
                    </div>
                    <div class="nl-cmeta"><span>${n} session${n === 1 ? '' : 's'}${where ? ` · ${this.esc(where)}` : ''}</span>${faces}</div>
                    ${notes.length ? `<div class="nl-notes">${notes.map(([nm, st, k]) => this.nlNote(nm, st, k)).join('')}</div>` : ''}`;
            },

            // the notes most tasted across sessions, strongest first: [[name, strength, kind]]
            lookTopNotes(brews, count) {
                const tally = new Map();
                brews.forEach(b => { const kind = this.kindOfBrew(b), ni = this.noteIntensities(b); this.extractFlavors(b).forEach(n => { const t = tally.get(n) || { n: 0, s: 0, kind }; t.n += 1; t.s += ni[n] || 2; tally.set(n, t); }); });
                return [...tally.entries()].filter(([n, t]) => this.noteFam(n, t.kind) !== 'off').sort((a, b) => (b[1].n - a[1].n) || (b[1].s - a[1].s)).slice(0, count).map(([n, t]) => [n, Math.max(1, Math.min(3, Math.round(t.s / t.n))), t.kind]);
            },

            // ===================== the coffee page: tinted, its photo leading =====================
            // v18.6: the coffee page's photo didn't load: the page is laid out again without it (it kept the photo's layout,
            // with the name sliding up under the clear Back bar)
            nlDetailPhotoErr(img) {
                const src = img && img.getAttribute('src'); if (!src) return;
                (this._brokenPhotos || (this._brokenPhotos = new Set())).add(src);
                if (this.isDetailActive && this.isDetailActive() && this.activeGroup) this.nlDecorateDetail(this.activeGroup, this.detailAllBrews || []);
                if (this.nlNavBars) this.nlNavBars();
            },

            nlDecorateDetail(group, brews) {
                const view = typeof document !== 'undefined' && document.getElementById ? document.getElementById('detail-view') : null, hero = view && typeof view.querySelector === 'function' ? view.querySelector('.detail-hero') : null;
                if (!view || !hero) return;
                let photo = hero.querySelector('.nl-dphoto');
                if (!this.newLook()) {
                    if (view.getAttribute && view.getAttribute('data-fam') !== null && view.removeAttribute) view.removeAttribute('data-fam');
                    if (photo && photo.remove) photo.remove();
                    const tile = hero.querySelector ? hero.querySelector('.nl-dcover') : null; if (tile && tile.remove) tile.remove();
                    if (hero.classList) hero.classList.remove('nl-has-photo');
                    ['d-origin', 'd-process', 'd-roast'].forEach(id => { const el = document.getElementById(id); if (el && el.hidden && String(el.textContent || '').trim() === '-') el.hidden = false; });
                    if (view.querySelector('.nl-navbar')) this.nlNavBars();   // (the bar goes back into the hero)
                    return;
                }
                const bean = group.meta, fam = this.famOfCoffee(bean);
                view.setAttribute('data-fam', fam);
                // v17.4: the coffee's own picture leads: its photo (chosen once, it doesn't change with each session), or its
                // color tile beside the name, like a roaster's page
                const cov = this.coverOf(this.coverBean(bean) || bean), coverUrl0 = cov && cov.photo && this.faceUrl ? this.faceUrl(cov.photo) : '';
                const coverUrl = coverUrl0 && !(this._brokenPhotos && this._brokenPhotos.has(coverUrl0)) ? coverUrl0 : '';   // (v18.6: one that won't load: the color tile instead)
                if (photo) photo.remove();
                const oldTile = hero.querySelector('.nl-dcover'); if (oldTile) oldTile.remove();
                if (coverUrl) hero.insertAdjacentHTML('afterbegin', `<div class="nl-dphoto"><img class="nl-photo" src="${this.esc(coverUrl)}" alt="${this.esc(bean.name || '')}" decoding="async" onerror="app.nlDetailPhotoErr(this)"><div class="nl-pfade"></div></div>`);
                else { const ro = document.getElementById('d-roaster'); if (ro) ro.insertAdjacentHTML('beforebegin', this.nlCoverHtml(bean, 'nl-cover nl-dcover')); }
                hero.classList.toggle('nl-has-photo', !!coverUrl);
                ['d-origin', 'd-process', 'd-roast'].forEach(id => { const el = document.getElementById(id); if (el && String(el.textContent || '').trim() === '-') el.hidden = true; });   // (no "-" chips for what isn't filled in)
                const notes = this.lookTopNotes(this.detailBrews || brews || [], 3);
                const top = document.getElementById('d-top-flavors');
                if (top) top.innerHTML = notes.map(([n, s, k]) => this.nlNote(n, s, k, 'lg')).join('');
                this.nlFillShapes(view);
                this.nlNavBars();
            },

            // a session on the coffee page: one row (who, when, the numbers, their words); tap it for the Session screen
            // (v17.6: on a profile, o.coffee: the row names the coffee instead of the person)
            nlLogRow(log, o = {}) {
                const owner = this.getBrewOwner(log), fam = this.famOfBrew(log), ph = this.nlPhoto(log), r = this.normalizeRating(log.rating);
                const dose = this.num(log.dose), yld = this.num(log.yield), tea = this.isTeaBrew(log);
                const t = this.nlTimeVal(log).replace(/<\/?small>/g, '');   // ("30 s", like the tiles)
                const spec = [dose > 0 && yld > 0 ? `${this.fmtNum(dose, 1)} g → ${this.fmtNum(yld, tea ? 0 : 1)} ${tea ? 'ml' : 'g'}` : '', t].filter(Boolean).join(' · ');
                const words = this.getBrewNotes(log);
                const thumb = ph ? `<span class="nl-thumb session-photo-wrap">${this.nlPhotoImg(ph, 'nl-photo', '')}</span>` : this.nlHasShape(log) ? `<span class="nl-thumb nl-thumb-shape" data-fam="${fam}">${this.nlShapeImg(log, fam, { cls: 'nl-shape', w: 150, h: 120 })}</span>` : `<span class="nl-thumb nl-thumb-method" data-fam="${fam}"><svg class="nl-ic"><use href="${this.methodIconUse(log.method)}"/></svg></span>`;
                return `<div class="nl-logrow" role="button" tabindex="0" onclick="app.openSession('${app.escJs(log.id)}')">${thumb}<div class="nl-lr-main"><div class="nl-lr-top">${o.coffee ? this.nlLogCoffee(log) : this.nlSig(owner, null, 'nl-sig', 16)}<span class="nl-ago" data-time="${this.esc(String(log.date || ''))}">${this.esc(this.nlAgo(log.date))}</span></div><b>${this.esc(spec || this.methodLabel(log.method) || '')}${r > 0 ? ` <span class="nl-gold">· ${this.esc(this.fmtNum(r, 1))} ★</span>` : ''}</b>${words || log.method ? `<small>${!tea && log.method && log.method !== 'Espresso' ? `${this.esc(this.methodLabel(log.method))} · ` : tea ? `${this.esc(this.methodLabel(log.method))} · ` : ''}${words ? `“${this.esc(this.shortText(words, 70))}”` : ''}</small>` : ''}</div></div>`;
            },

            nlLogCoffee(log) {
                const bean = this.beans.get(String(log.beanId || '')) || {}, tea = this.isTeaBrew(log);
                const name = String(bean.name || '').trim() || (tea ? 'A tea' : 'A coffee');
                return `<span class="nl-lr-coffee">${this.esc(name)}</span>`;
            },
            // v17.6: a profile's sessions as the coffee page shows them: one row each in a box (the coffee, when, the
            // numbers, their words); tap one for the Session screen
            nlProfileSessionsHtml(list, n, more) {
                return `<div class="nl-proflogs">${list.slice(0, n).map(b => this.nlLogRow(b, { coffee: true })).join('')}${more}</div>`;
            },

            // ===================== the share image (1080 x 1920): the card's anatomy =====================
            // photo with its fade (or the shape), who, the roaster in handwriting, the name in serif, three tiles, their own
            // words, the notes, and Dialed In with the mini shape. Never the grind. Colors: the session's family, this theme.
            async drawShotCardNew(b, photo) {
                const W = 1080, H = 1920, s = W / 282, X = v => Math.round(v * s);
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                const ctx = c.getContext('2d'); if (!ctx) return null;
                try { if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load(`600 ${X(14)}px "Roboto Slab NL"`), document.fonts.load(`500 ${X(32)}px ui-serif`)]); } catch (e) {}
                const fam = this.famOfBrew(b), P = this.nlPal(fam), bean = this.beans.get(String(b.beanId || '')) || {}, tea = this.isTeaBrew(b);
                const sans = (w, z) => `${w} ${z}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Inter, sans-serif`;
                const serif = (w, z) => `${w} ${z}px ui-serif, -apple-system-ui-serif, "New York", "Iowan Old Style", Georgia, serif`;
                const hand = z => `600 ${z}px "Roboto Slab NL", "Roboto Slab", Georgia, serif`;   // (v17.4: Roboto Slab in place of the handwriting)
                const rgba = (hex, a) => { const h = String(this.normalizeHexColor(hex) || '#000000').slice(1); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
                const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
                const fit = (text, font, maxW) => { ctx.font = font; let t = String(text || ''); if (ctx.measureText(t).width <= maxW) return t; while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; };
                ctx.fillStyle = P.c; ctx.fillRect(0, 0, W, H);
                // v17.7: made for an Instagram story: everything that matters between its bars, nothing overlapping. v17.8 (Maceo's
                // sketch on the story screen): Dialed In at the top (Instagram already shows who posted it there), the person
                // with their real picture at the bottom, the shape beside the coffee's name, the words lower down.
                const SAFE_T = this.STORY_SAFE[0], SAFE_B = this.STORY_SAFE[1], left = X(14), maxW = W - left * 2;
                const tasted = this.tastedKeys(b);
                const shapeUrl = tasted.length && typeof FlavorShape !== 'undefined' ? FlavorShape.snapshot(this.shapeValues(b), null, { width: 600, height: 450, zoom: 1, labels: false, lines: false, ring: this.NL_RING, fit: true, isSet: k => tasted.includes(k), setKey: `${tasted.join(',')}|nl-share-${fam}`, names: tea ? 'tea' : null, theme: this.nlShapeTheme(fam, false) }) : '';   // (v17.5: as on the cards: no box, the measure)
                const loadImg = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
                const owner = this.getBrewOwner(b) || this.user;
                const [shapeImg, face] = await Promise.all([loadImg(shapeUrl), this.storyFace ? this.storyFace(owner) : null]);
                // --- the words block, measured first and laid from the bottom of the safe area up
                const maker = String(bean.roaster || '').trim() || (this.teaMakerName ? this.teaMakerName(bean) : '');
                const name = String(bean.name || '').trim() || (tea ? 'Tea' : 'Coffee');
                let nz = X(32); ctx.font = serif(500, nz); while (nz > X(21) && ctx.measureText(name).width > maxW) { nz -= X(1); ctx.font = serif(500, nz); }
                const tiles = this.nlCardTiles(b).map(h => { const d = document.createElement('div'); d.innerHTML = h; const sv = d.querySelector('.nl-sv'), sl = d.querySelector('.nl-sl'); return { v: sv ? sv.textContent.replace(/\s+/g, ' ').trim() : '', l: sl ? sl.textContent.trim() : '' }; });
                const words = this.getBrewNotes(b), notes = this.brewNoteList(b);
                ctx.font = sans(400, X(11.5));
                const wrapWords = (n) => { if (!words) return []; const lines = [], parts = `“${words}”`.split(/\s+/); let cur = ''; parts.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); const shown = lines.slice(0, n); if (lines.length > n) shown[n - 1] = fit(shown[n - 1] + '…', sans(400, X(11.5)), maxW); return shown; };
                const whoH = X(24);
                const blockH = lines => (maker ? X(19) : 0) + nz * 1.12 + (tiles.length ? X(10) + X(38) : 0) + (lines ? X(10) + lines * X(16) : 0) + (notes.length ? X(10) + X(20) : 0) + X(14) + whoH;
                let lines = Math.min(3, wrapWords(3).length);
                const room = photo ? SAFE_B - (SAFE_T + X(150)) : SAFE_B - (SAFE_T + X(40) + X(120));   // (a photo keeps some sky above the words; the big shape some room)
                while (lines > 1 && blockH(lines) > room) lines--;
                const shown = wrapWords(lines);
                let y = SAFE_B - blockH(shown.length);
                // --- the photo (from the top down to just under where the words start), melting into the card's color
                const photoB = Math.min(H, y + X(16));
                if (photo) {
                    const r = Math.max(W / photo.width, photoB / photo.height), w = photo.width * r, h = photo.height * r;
                    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, photoB); ctx.clip();
                    const mid = (SAFE_T + y) / 2, top = Math.min(0, Math.max(photoB - h, mid - h / 2));   // (its middle in the middle of what a story shows above the words)
                    ctx.drawImage(photo, (W - w) / 2, top, w, h);
                    ctx.restore();
                    const g0 = Math.max(0, y - X(110)), g = ctx.createLinearGradient(0, g0, 0, photoB);
                    g.addColorStop(0, rgba(P.c, 0)); g.addColorStop(0.62, rgba(P.c, 0.88)); g.addColorStop(1, P.c);
                    ctx.fillStyle = g; ctx.fillRect(0, g0, W, photoB - g0 + 1);
                    const t = ctx.createLinearGradient(0, 0, 0, SAFE_T + X(40));   // (a soft shade behind Dialed In at the top)
                    t.addColorStop(0, 'rgba(0,0,0,0.28)'); t.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = t; ctx.fillRect(0, 0, W, SAFE_T + X(40));
                }
                // --- Dialed In, at the top
                const topY = SAFE_T + X(9);
                ctx.save();
                if (photo) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = X(6); }
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = hand(X(14)); ctx.fillStyle = photo ? '#FFFFFF' : P.k;
                ctx.fillText('Dialed In', left, topY);
                ctx.restore();
                ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
                // --- no photo: the big shape between Dialed In and the words
                if (!photo && shapeImg) {
                    const t0 = topY + X(20), avail = y - X(10) - t0, h = Math.max(0, avail), w = Math.min(maxW, h * shapeImg.width / shapeImg.height), hh = w * shapeImg.height / shapeImg.width;
                    if (hh > X(40)) ctx.drawImage(shapeImg, (W - w) / 2, t0 + (avail - hh) / 2, w, hh);
                }
                // --- under a photo: the shape on the right, just above the coffee's name (beside the roaster)
                let roomW = maxW;
                if (photo && shapeImg) {
                    const bottom = y + (maker ? X(19) : 0) + X(2), h = Math.max(0, Math.min(X(112), bottom - (topY + X(22)))), w = h * shapeImg.width / shapeImg.height;   // (v17.8: bigger)
                    if (h > X(30)) { ctx.drawImage(shapeImg, W - left - w + X(10), bottom - h, w, h); roomW = maxW - w + X(6); }
                }
                // --- roaster, name
                if (maker) { ctx.font = hand(X(13)); ctx.fillStyle = P.k; ctx.fillText(fit(maker, hand(X(13)), roomW), left, y + X(14)); y += X(19); }
                ctx.font = serif(500, nz); ctx.fillStyle = P.n; ctx.fillText(fit(name, serif(500, nz), maxW), left, y + nz * 0.92); y += nz * 1.12;
                // --- three tiles (the card's: in → out, time, rating; tea: leaf · water, temp, steeps or rating)
                if (tiles.length) {
                    y += X(10);
                    const gap = X(5), fr = tiles.length === 3 ? [1.6, 0.85, 1.1] : tiles.map(() => 1), tot = fr.reduce((a, v) => a + v, 0), tw = maxW - gap * (tiles.length - 1), th = X(38);
                    let x = left;
                    tiles.forEach((t, i) => {
                        const w = tw * fr[i] / tot;
                        rr(x, y, w, th, X(11)); ctx.fillStyle = P.dark ? rgba(P.n, 0.08) : 'rgba(255,255,255,0.55)'; ctx.fill();
                        ctx.lineWidth = X(1); ctx.strokeStyle = P.dark ? rgba(P.n, 0.15) : 'rgba(255,255,255,0.7)'; ctx.stroke();
                        const vv = fit(t.v.replace(' ★', '★'), sans(700, X(14)), w - X(14));
                        ctx.fillStyle = P.t; ctx.font = sans(700, X(14)); ctx.fillText(vv, x + X(8), y + X(18));
                        if (/★/.test(vv)) { const wv = ctx.measureText(vv.replace('★', '')).width; ctx.fillStyle = this.nlDark() ? '#EBBE5C' : '#C08A2B'; ctx.fillText('★', x + X(8) + wv, y + X(18)); }
                        ctx.font = sans(500, X(10)); ctx.fillStyle = P.l; ctx.fillText(fit(t.l, sans(500, X(10)), w - X(14)), x + X(8), y + X(31));
                        x += w + gap;
                    });
                    y += th;
                }
                // --- their own words
                if (shown.length) {
                    y += X(10); ctx.font = sans(400, X(11.5)); ctx.fillStyle = P.t;
                    shown.forEach((l, i) => ctx.fillText(l, left, y + X(11) + i * X(16)));
                    y += shown.length * X(16);
                }
                // --- notes as chips, one row (only whole chips)
                if (notes.length) {
                    y += X(10); let x = left; ctx.font = sans(650, X(10));
                    for (const [n, , k] of notes) {
                        const tk = this.noteToneKey(n, k), tp = this.nlTonePal(tk, true), ch = tp ? [tp.chipBg, tp.chipFg] : this.NL_CHIP.off, w = ctx.measureText(n).width + X(12);
                        if (x + w > left + maxW) break;
                        rr(x, y, w, X(20), X(6)); ctx.fillStyle = P.dark ? ch[0] : 'rgba(255,255,255,0.68)'; ctx.fill();
                        ctx.fillStyle = ch[1]; ctx.fillText(n, x + X(6), y + X(13.5)); x += w + X(4);
                    }
                    y += X(20);
                }
                // --- the last row: who, as their picture (or initial) in a ring of their color (v17.8: no name; Maceo: "get rid of
                // the name"), and the session's date beside it (v17.9)
                y += X(14);
                const ar = X(11), ax = left + ar + X(2.6), ay = y + whoH / 2, col = this.getUserColor(owner) || '#5B7FA6';
                ctx.beginPath(); ctx.arc(ax, ay, ar + X(2.6), 0, Math.PI * 2); ctx.lineWidth = X(1.3); ctx.strokeStyle = col; ctx.stroke();
                ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
                if (face) { ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip(); const k = Math.max(ar * 2 / face.width, ar * 2 / face.height); ctx.drawImage(face, ax - face.width * k / 2, ay - face.height * k / 2, face.width * k, face.height * k); ctx.restore(); }
                else { ctx.fillStyle = '#FFFFFF'; ctx.font = sans(700, X(10.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.feedInitial(owner), ax, ay + X(0.5)); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
                const t = this.toTime(b.date);
                if (t) {
                    const d = new Date(t), o = { month: 'short', day: 'numeric' }; if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
                    let when = ''; try { when = d.toLocaleDateString('en-US', o); } catch (e) { when = ''; }
                    if (when) { ctx.font = sans(600, X(12)); ctx.fillStyle = P.l; ctx.textBaseline = 'middle'; ctx.fillText(when, ax + ar + X(9), ay + X(0.5)); ctx.textBaseline = 'alphabetic'; }
                }
                return c;
            },
