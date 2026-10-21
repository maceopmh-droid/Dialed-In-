            // ===================== v13.0: Roasters =====================
            roasterData() {
                const last = this.eventLog && this.eventLog.length ? this.eventLog[this.eventLog.length - 1] : null;
                const sig = `${this.beans.size}|${this.brews.size}|${this.eventLog ? this.eventLog.length : 0}|${last ? (last.eventAt || last.date || '') : ''}|${this.gearByUser.size}`;
                if (this._roData && this._roSig === sig && this._roMaps === this.beans && this._roBrewMap === this.brews && this._roGear === this.gearByUser) return this._roData;
                this._roSig = sig; this._roMaps = this.beans; this._roBrewMap = this.brews; this._roGear = this.gearByUser;
                this._roData = RoasterEngine.build(this);
                return this._roData;
            },

            roasterKey(name) { return this.roasterData().clusterOf(name); },

            roasterInitials(name) {
                const words = String(name || '?').trim().split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}\u{1F1E6}-\u{1F1FF}\p{Extended_Pictographic}]/gu, '')).filter(Boolean);
                if (!words.length) return '?';
                const first = w => { const m = /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*|.)/u.exec(w); return m ? m[0] : ''; };
                const g0 = first(words[0]);
                if (/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(g0)) return g0;
                return words.slice(0, 2).map(first).join('').toUpperCase();
            },

            // a roaster's colors: picked for a few roasters, otherwise from its name (the same on every phone)
            ROASTER_COLORS: {
                'urbana roasters': ['#B5DDF7', '#6FAAD9', '111, 170, 217'],          // baby blue
                'urbana': ['#B5DDF7', '#6FAAD9', '111, 170, 217'],
                'deeper roots coffee': ['#1B6B63', '#073632', '20, 92, 85'],       // dark turquoise green
                'deeper roots': ['#1B6B63', '#073632', '20, 92, 85'],
                'drc': ['#1B6B63', '#073632', '20, 92, 85']
            },

            roasterPaint(r) {
                const set = this.ROASTER_COLORS[r.key] || this.ROASTER_COLORS[RoasterEngine.keyOf(r.name)];
                if (set) return { bg: `linear-gradient(145deg, ${set[0]}, ${set[1]})`, rgb: set[2] };
                const h = r.hue;
                const rgb = (() => { const hh = h / 360, s = 0.44, l = 0.5; const k = n => (n + hh * 12) % 12, a = s * Math.min(l, 1 - l), f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))); return `${f(0)}, ${f(8)}, ${f(4)}`; })();
                return { bg: `linear-gradient(145deg, hsl(${h} 44% 60%), hsl(${(h + 24) % 360} 40% 40%))`, rgb };
            },

            roasterTileHtml(r, big = false) {
                return `<span class="ro-tile${big ? ' big' : ''}" aria-hidden="true" style="background:${this.roasterPaint(r).bg}">${this.esc(this.roasterInitials(r.name))}</span>`;
            },

            // ---- saved choices: each person's gear record carries { merged, notSame, fav, local, info }
            roasterPrefsOf(user) {
                const rec = this.gearByUser.get(String(user || ''));
                return rec && rec.roasters && typeof rec.roasters === 'object' ? rec.roasters : null;
            },

            roasterCarry() {
                const r = this.roasterPrefsOf(this.user);
                return r ? { roasters: r } : {};
            },

            saveRoasterPrefs(change) {
                if (!this.user) { this.showToast('Pick who you are in Settings first.'); return false; }
                const cur = RoasterEngine.prefsOf(this, this.user);
                const next = { merged: [...cur.merged], notSame: [...cur.notSame], fav: [...cur.fav], local: [...cur.local], localOff: [...cur.localOff], info: { ...cur.info } };
                change(next);
                this.pushGearWith({ roasters: next });
                return true;
            },

            mergeRoasters(a, b) {
                const D = this.roasterData(), A = D.byKey.get(a), B = D.byKey.get(b);
                if (!A || !B) return;
                if (!confirm(`Merge "${B.name}" into "${A.name}" for everyone?`)) return;   // v13.4: it changes everyone's stats
                if (this.saveRoasterPrefs(p => { p.merged.push([A.name, B.name, new Date().toISOString()]); })) this.showToast(`Merged into ${A.sessions >= B.sessions ? A.name : B.name}.`);
            },

            notSameRoasters(a, b) {
                const D = this.roasterData(), A = D.byKey.get(a), B = D.byKey.get(b);
                if (!A || !B) return;
                if (this.saveRoasterPrefs(p => { p.notSame.push([A.name, B.name, new Date().toISOString()]); })) this.showToast('Got it. They stay separate.');
            },

            toggleRoasterFav(key) {
                const r = this.roasterData().byKey.get(key);
                if (!r) return;
                const on = r.favBy.includes(this.user);
                const keys = new Set([r.key, ...r.spellings.map(n => RoasterEngine.keyOf(n))]);
                this.saveRoasterPrefs(p => { p.fav = p.fav.filter(k => !keys.has(this.roasterKey(k))); if (!on) p.fav.push(r.name); });
                this.renderRoasterPage();
            },

            // v15.8: "Local to me" is each person's own tick; their sessions of this roaster's coffees count as local
            toggleRoasterLocal(key) {
                const r = this.roasterData().byKey.get(key);
                if (!r) return;
                const on = (r.localBy || []).includes(this.user);
                const keys = new Set([r.key, ...r.spellings.map(n => RoasterEngine.keyOf(n))]);
                const nm = e => Array.isArray(e) ? e[0] : e, mine = e => keys.has(this.roasterKey(nm(e)));
                // v16.0: taking it off leaves [name, when] behind, so a phone that hadn't caught up can't bring it back (and a
                // tick isn't lost to one that hadn't seen it: see mergeLocalTicks)
                if (this.saveRoasterPrefs(p => {
                    const at = new Date().toISOString(), was = p.local.filter(mine);
                    p.local = p.local.filter(e => !mine(e)); p.localOff = p.localOff.filter(e => !mine(e));
                    if (on) p.localOff.push(...[...new Set([r.name, ...was.map(nm)].filter(Boolean))].map(n => [n, at])); else p.local.push([r.name, at]);
                }))
                    this.showToast(on ? `${r.name} isn't marked local anymore.` : 'Marked local. From today, its coffees count for local goals and awards.');
                this.renderRoasterPage();
            },

            // ---- favorite roasters on the profile's Favorites card
            favRoastersOf(who) {
                const D = this.roasterData();
                const mine = r => (r.people.find(p => p.name === who) || { sessions: 0 }).sessions;
                return D.roasters.filter(r => r.favBy.includes(who)).sort((a, b) => mine(b) - mine(a) || a.name.localeCompare(b.name));
            },

            favRoastersHtml(who, list, mine) {
                if (!list.length && !mine) return '';
                const tiles = list.map(r => { const p = r.people.find(x => x.name === who); const paint = this.roasterPaint(r);
                    return `<button type="button" class="fab-tile small ro-fab" data-roaster-key="${this.esc(r.key)}" onclick="app.openRoaster(this.getAttribute('data-roaster-key'))" aria-label="${this.esc(r.name)}"><span class="fab-art" style="background:${paint.bg}"><b>${this.esc(this.roasterInitials(r.name))}</b>${p && p.rated ? `<em>${this.esc(RoasterEngine.f1(p.avg))}★</em>` : ''}</span><span class="fab-name">${this.esc(r.name)}</span><span class="fab-roaster">${p ? `${p.sessions} session${p.sessions === 1 ? '' : 's'}` : 'Not brewed yet'}</span></button>`; }).join('');
                return `<div class="label fab-last-label">Favorite roasters</div>${list.length ? `<div class="fab-row small">${tiles}</div>` : `<div class="fab-sub ro-fab-empty">Tap the heart on a roaster's page to add it here.</div>`}`;
            },

            // a one-word name wider than its tile gets a little smaller instead of being cut off
            fitRoasterTileNames(root) {
                const scope = root || document;
                if (!scope || !scope.querySelectorAll || typeof getComputedStyle !== 'function') return;
                scope.querySelectorAll('.ro-fab .fab-name').forEach(el => {
                    el.style.fontSize = '';
                    let px = parseFloat(getComputedStyle(el).fontSize) || 11;
                    while (el.scrollWidth > el.clientWidth + 1 && px > 9) { px -= 0.5; el.style.fontSize = `${px}px`; }
                });
            },

            setRoasterSort(k) { this.roasterSort = k; this.render(); },

            roasterFilterHtml() {
                const r = this.roasterFilter ? this.roasterFind(this.roasterFilter) : null;
                if (!r) return '';
                return `<div class="lib-filter"><button type="button" class="chip-btn" aria-pressed="true" onclick="app.clearRoasterFilter()" aria-label="Show every roaster's coffees">${this.esc(r.name)}<svg class="icon"><use href="#i-x"/></svg></button></div>`;
            },

            clearRoasterFilter() { this.roasterFilter = ''; this.render(); },

            sortRoasters(list) {
                const k = this.roasterSort || 'brewed';
                const name = r => r.name.replace(/[^\p{L}\p{N} ]/gu, '').trim().toLowerCase() || '￿';
                const by = {
                    brewed: (a, b) => b.sessions - a.sessions || b.last - a.last,
                    rated: (a, b) => (b.rated >= 3) - (a.rated >= 3) || b.avg - a.avg || b.rated - a.rated,
                    recent: (a, b) => b.last - a.last || b.sessions - a.sessions,
                    az: (a, b) => name(a).localeCompare(name(b))
                }[k] || ((a, b) => b.sessions - a.sessions);
                return [...list].sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
            },

            roasterPeopleLabel(r) {
                const names = r.people.length ? r.people.map(p => p.name) : r.loggers;
                return names.length <= 2 ? names.join(' and ') : `${names[0]} +${names.length - 1}`;
            },

            renderRoasterList(grid, q) {
                grid.className = 'roaster-list';
                const D = this.roasterData();
                let list = D.roasters;
                if (q) list = list.filter(r => [r.name, ...r.spellings].some(n => n.toLowerCase().includes(q)));
                list = this.sortRoasters(list);
                const sorts = [['brewed', 'Most brewed'], ['rated', 'Top rated'], ['recent', 'Recent'], ['az', 'A–Z']];
                const cur = this.roasterSort || 'brewed';
                const s = !q && D.suggestions[0];
                const merge = s ? `<div class="profile-card ro-merge"><p><b>${this.esc(s.b.name)}</b> (${this.esc(this.roasterPeopleLabel(s.b))}, ${s.b.sessions} session${s.b.sessions === 1 ? '' : 's'}) and <b>${this.esc(s.a.name)}</b> (${this.esc(this.roasterPeopleLabel(s.a))}, ${s.a.sessions} session${s.a.sessions === 1 ? '' : 's'}) look like the same roaster. Merge them so their stats add up?</p><div class="ro-merge-actions"><button type="button" class="btn-primary" onclick="app.mergeRoasters('${app.escJs(s.a.key)}', '${app.escJs(s.b.key)}')">Merge</button><button type="button" class="btn-outline" onclick="app.notSameRoasters('${app.escJs(s.a.key)}', '${app.escJs(s.b.key)}')">Not the same</button></div></div>` : '';
                grid.innerHTML = [
                    `<div class="ro-sorts" role="group" aria-label="Sort roasters">${sorts.map(([k, l]) => `<button type="button" class="chip-btn" aria-pressed="${k === cur}" onclick="app.setRoasterSort('${app.escJs(k)}')">${l}</button>`).join('')}</div>`,
                    merge,
                    list.length ? list.map(r => this.roasterCardHtml(r)).join('') : `<div class="ro-empty">${q ? 'No roasters match your search.' : 'No roasters yet. Add a coffee and its roaster shows up here.'}</div>`
                ].join('');
                this.fitRoasterBeans(grid);
                if (!this._roResize) {   // re-fit the coffee lines when the width changes or the fonts arrive
                    this._roResize = true;
                    window.addEventListener('resize', () => this.fitRoastersSoon());
                    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.fitRoastersSoon());
                }
            },

            roasterCardHtml(r) {
                const fav = this.user && r.favBy.includes(this.user), local = !!(this.user && (r.localBy || []).includes(this.user));   // v15.8
                const faces = r.people.slice(0, 3).map((p, i) => `<i data-face="${this.esc(p.name)}" style="background:${this.esc(this.getUserColor(p.name))};z-index:${9 - i}">${this.esc(this.feedInitial(p.name))}</i>`).join('') + (r.people.length > 3 ? `<i class="more">+${r.people.length - 3}</i>` : '');
                const n = r.coffees.length;
                return `<div class="card ro-card" role="button" tabindex="0" data-roaster-key="${this.esc(r.key)}" onclick="app.openRoaster(this.getAttribute('data-roaster-key'))">
                    <div class="ro-head">${this.roasterTileHtml(r)}<div class="ro-main"><span class="ro-name">${this.esc(r.name)}</span>${r.rated ? `<div class="ro-rate"><span class="star-meter" style="--fill:${this.starFill(r.avg)}%;--whole:${this.starWhole(r.avg)};--frac:${this.starFrac(r.avg)}"></span><span>${this.esc(RoasterEngine.f1(r.avg))}</span></div>` : ''}</div></div>
                    <div class="ro-meta"><span>${n} coffee${n === 1 ? '' : 's'} · ${r.sessions} session${r.sessions === 1 ? '' : 's'}</span>${fav ? '<svg class="icon ro-heart" aria-label="Favorite"><use href="#i-heart"/></svg>' : ''}${local ? '<span class="ro-local-tag"><svg class="icon"><use href="#i-pin"/></svg>Local</span>' : ''}${faces ? `<span class="dh-faces" aria-label="${this.esc(r.people.map(p => p.name).join(', '))}">${faces}</span>` : ''}</div>
                    <div class="ro-beans" data-total="${n}">${r.coffees.map(c => `<button type="button" class="ro-bean" data-bean="${this.esc(c.beanId)}" onclick="event.stopPropagation(); app.openCoffeeFromRoaster(this.getAttribute('data-bean'))">${this.esc(c.name)}</button>`).join('')}<span class="ro-more" hidden></span></div>
                </div>`;
            },

            // one line of coffees, best-rated first: as many as fit, then "+N others"; never wraps, never cuts a name
            fitRoasterBeans(root) {
                // v13.4: the best-rated names that fit, in order; a leading name too long for the line is skipped instead of hiding
                // the whole line (and the line is measured while visible, so it comes back when the screen gets wider)
                const scope = root || document;
                if (!scope || !scope.querySelectorAll) return;
                scope.querySelectorAll('.ro-beans').forEach(box => {
                    const chips = [...box.querySelectorAll('.ro-bean')], more = box.querySelector('.ro-more'), total = Number(box.getAttribute('data-total')) || chips.length;
                    box.hidden = false;
                    if (!box.clientWidth) return;
                    chips.forEach(c => { c.hidden = true; });
                    let shown = 0;
                    const label = () => { const k = total - shown; more.hidden = k <= 0; more.textContent = `+${k} other${k === 1 ? '' : 's'}`; };
                    const fits = () => box.scrollWidth <= box.clientWidth + 1;
                    for (const c of chips) {
                        c.hidden = false; shown++; label();
                        if (!fits()) { c.hidden = true; shown--; label(); if (shown) break; }
                    }
                    label();
                    if (!fits()) more.hidden = true;
                });
            },

            // ---- going between pages: a stack, so Back steps back one page at a time
            roasterViewActive() { const v = document.getElementById('roaster-view'); return Boolean(v && v.classList.contains('active')); },

            snapPage() {
                if (this.roasterViewActive()) return { kind: 'roaster', key: this.roasterOpen, scroll: document.getElementById('roaster-view').scrollTop };
                if (this.isDetailActive()) return { kind: 'bean', lens: this._lens || '', group: { meta: this.activeGroup.meta, ids: [...this.activeGroup.ids], users: new Set(this.activeGroup.users) }, scroll: document.getElementById('detail-view').scrollTop };
                return null;
            },

            openRoasterFrom(el, ev) {
                if (ev) { ev.stopPropagation(); ev.preventDefault(); }
                const name = el && el.getAttribute('data-roaster');
                if (!name) return;
                this.openRoaster(this.roasterKey(name));
            },

            openRoaster(key) {
                const r = this.roasterFind(key);
                if (r) key = r.key;
                if (!r) { this.showToast('That roaster has no coffees anymore.'); return; }
                const from = this.snapPage();
                if (from && !(from.kind === 'roaster' && from.key === key)) { this.navStack = this.navStack || []; this.navStack.push(from); }
                if (!from) this.navStack = [];
                document.getElementById('detail-view').classList.remove('active');
                this.roasterOpen = key;
                const v = document.getElementById('roaster-view');
                v.classList.add('active'); v.setAttribute('aria-hidden', 'false');
                this.renderRoasterPage();
                v.scrollTop = 0;
            },

            openCoffeeFromRoaster(beanId) {
                if (!this.beans.has(String(beanId))) { this.showToast('That coffee was deleted.'); this.renderRoasterPage(); return; }   // v13.4
                const from = this.snapPage();
                if (from) { this.navStack = this.navStack || []; this.navStack.push(from); } else this.navStack = [];
                this.hideRoasterView();
                this._navKeep = true;
                this.openFeedTarget(beanId, '', false);
                this._navKeep = false;
                const d = document.getElementById('detail-view'); if (d) d.scrollTop = 0;
            },

            hideRoasterView() {
                const v = document.getElementById('roaster-view');
                if (v) { v.classList.remove('active'); v.setAttribute('aria-hidden', 'true'); }
            },

            // Back: the page before this one, or the library
            goBackPage() {
                const prev = (this.navStack || []).pop();
                if (!prev) { this.hideRoasterView(); document.getElementById('detail-view').classList.remove('active'); this.openCommentId = null; this.roasterOpen = ''; this.render(); return; }
                if (prev.kind === 'roaster' && this.roasterFind(prev.key)) {
                    prev.key = this.roasterFind(prev.key).key;
                    document.getElementById('detail-view').classList.remove('active'); this.openCommentId = null;
                    this.roasterOpen = prev.key;
                    const v = document.getElementById('roaster-view'); v.classList.add('active'); v.setAttribute('aria-hidden', 'false');
                    this.renderRoasterPage(); v.scrollTop = prev.scroll || 0;
                    return;
                }
                if (prev.kind === 'bean') {
                    const ids = prev.group.ids.filter(id => this.beans.has(String(id)));
                    if (ids.length) {
                        this.hideRoasterView();
                        const brews = Array.from(this.brews.values()).filter(b => ids.includes(b.beanId));
                        this._navKeep = true;
                        this._lensKeep = prev.lens || '';   // v15.1: back to the same take on it
                        this.openDetail({ ...prev.group, ids }, brews);
                        this._navKeep = false;
                        document.getElementById('detail-view').scrollTop = prev.scroll || 0;
                        return;
                    }
                }
                this.goBackPage();   // that page is gone: step back once more
            },

            backLabel() {
                const prev = (this.navStack || [])[this.navStack ? this.navStack.length - 1 : 0];
                if (!prev) return ({ feed: 'Feed', profile: 'Profile', roasters: 'Roasters' })[this.tab] || 'Coffees';   // v13.4: where Back actually goes
                if (prev.kind === 'roaster') { const r = this.roasterFind(prev.key); return r ? r.name : 'Back'; }
                return (prev.group && prev.group.meta && prev.group.meta.name) || 'Back';
            },

            setDetailBackLabel() {
                const b = document.querySelector('#detail-view .dh-back');
                if (!b) return;
                const text = this.backLabel();
                let span = b.querySelector('.dh-back-t');
                if (!span) { [...b.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); }); span = document.createElement('span'); span.className = 'dh-back-t'; b.appendChild(span); }
                span.textContent = text;
            },

            roasterLastLabel(t) {
                if (!t) return '–';
                const d = this.dayNum(Date.now()) - this.dayNum(t);
                if (d <= 0) return 'Today';
                if (d === 1) return 'Yesterday';
                const dt = new Date(t), now = new Date();
                return dt.toLocaleDateString(undefined, dt.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
            },

            roasterBarHtml(label, counts, order, colors) {
                let e = Object.entries(counts || {}).filter(([, v]) => v > 0);
                if (!e.length) return '';
                e = order ? e.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])) : e.sort((a, b) => b[1] - a[1]);
                const total = e.reduce((s, [, v]) => s + v, 0);
                const pct = v => Math.max(1, Math.round((v / total) * 100));
                const col = k => colors[k] || '#8E958F';
                const word = k => k.charAt(0) + k.slice(1).toLowerCase();
                return `<div class="ro-barwrap"><div class="ro-bar-h">${label}</div><div class="ro-bar" role="img" aria-label="${this.esc(label)}: ${this.esc(e.map(([k, v]) => `${word(k)} ${pct(v)}%`).join(', '))}">${e.map(([k, v]) => `<i style="flex:${v} 1 0;background:${col(k)}"></i>`).join('')}</div><div class="ro-legend">${e.map(([k, v]) => `<span><b style="background:${col(k)}"></b>${this.esc(word(k))} ${pct(v)}%</span>`).join('')}</div></div>`;
            },

            renderRoasterPage() {
                const page = document.getElementById('ro-page');
                if (!page || !this.roasterViewActive()) return;
                const r = this.roasterFind(this.roasterOpen);   // v13.4: still there after a merge from another phone
                if (!r) { this.goBackPage(); return; }
                this.roasterOpen = r.key;
                const esc = s => this.esc(s);
                const fav = this.user && r.favBy.includes(this.user), local = !!(this.user && (r.localBy || []).includes(this.user));   // v15.8
                const info = r.info || {};
                const site = info.website ? info.website.replace(/^https?:\/\//i, '').replace(/\/$/, '') : '';
                const href = info.website ? (/^https?:\/\//i.test(info.website) ? info.website : `https://${info.website}`) : '';
                const where = [info.location ? esc(info.location) : '', site ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(site)}</a>` : ''].filter(Boolean).join(' · ');
                const n = r.coffees.length;
                const ROAST_C = { Light: '#D7B188', 'Medium-Light': '#B88A5F', Medium: '#8E6542', 'Medium-Dark': '#6B4832', Dark: '#45301F' };
                const PROC_C = { Washed: '#4F86A6', Natural: '#B4566E', Honey: '#D4A238', Fermented: '#7A5D8F', Anaerobic: '#563F6E', Mixed: '#8E958F' };
                const rgb = this.roasterPaint(r).rgb;
                const best = r.best, bc = r.bestCoffee;
                const bestCard = best && bc ? `<button type="button" class="profile-card ro-sec" data-bean="${esc(best.beanId)}" onclick="app.openCoffeeFromRoaster(this.getAttribute('data-bean'))"><div class="label">Best ${esc(this.shotWord(best.method))}</div><div class="ro-best"><div class="ro-best-main"><div class="ro-best-name">${esc(bc.name)}</div><div class="ro-best-line"><span>${esc(this.getBrewOwner(best))} · ${esc(this.shortDate(best.date))}</span><span class="star-meter" style="--fill:${this.starFill(best.rating)}%;--whole:${this.starWhole(best.rating)};--frac:${this.starFrac(best.rating)}"></span><span>${esc(this.formatRating(best.rating))}</span></div>${this.recipeLine(best, false) ? `<div class="ro-best-recipe">${esc(best.method || '')}${best.method ? ' · ' : ''}${esc(this.recipeLine(best, false))}</div>` : ''}</div><svg class="icon ro-go"><use href="#i-chevron-down"/></svg></div></button>` : '';
                const coffees = `<section class="profile-card ro-sec"><div class="label">Their coffees</div>${this.moreHtml(r.coffees.map(c => `<button type="button" class="ro-cof" data-bean="${esc(c.beanId)}" onclick="app.openCoffeeFromRoaster(this.getAttribute('data-bean'))"><span class="ro-cof-main"><span class="ro-cof-name">${esc(c.name)}</span><span class="ro-cof-sub">${c.sessions} session${c.sessions === 1 ? '' : 's'}</span></span>${c.rated ? `<span class="ro-meter"><i style="width:${(c.avg / 5) * 100}%"></i></span><span class="ro-cof-n">${RoasterEngine.f1(c.avg)}★</span>` : ''}<svg class="icon ro-go"><use href="#i-chevron-down"/></svg></button>`), 4, 'coffees')}</section>`;
                const who = r.people.length ? `<section class="profile-card ro-sec"><div class="label">Who drinks it</div>${this.moreHtml(r.people.map(p => `<div class="ro-who" data-profile="${esc(p.name)}"><span class="person-dot" data-face="${esc(p.name)}" style="background:${esc(this.getUserColor(p.name))}">${esc(this.feedInitial(p.name))}</span><span class="ro-who-t">${esc(p.name)}<small>${p.sessions} session${p.sessions === 1 ? '' : 's'}${p.rated ? ` · ${RoasterEngine.f1(p.avg)}★ average` : ''}</small></span>${p.top ? `<span class="ro-badge">${esc(p.name)}'s top roaster</span>` : ''}</div>`), 4, 'people')}</section>` : '';
                const e = r.espresso;
                const range = (a, f) => a ? (Math.abs(a[1] - a[0]) < 1e-9 ? f(a[0]) : `${f(a[0])}–${f(a[1])}`) : '';
                const ratio = e && e.ratio ? range(e.ratio, x => `1:${x.toFixed(1)}`) : '', secs = e && e.time ? range(e.time, x => `${this.fmtNum(x, 0)}`) + ' s' : '';
                const esp = e ? `<section class="profile-card ro-sec"><div class="label">Dialing in their espresso</div><div class="ro-esp">4★+ shots of their coffees ran ${ratio ? `<b>${esc(ratio)}</b>` : ''}${ratio && secs ? ' in ' : ''}${secs ? `<b>${esc(secs)}</b>` : ''}.</div><div class="ro-sub" style="margin:6px 0 0">From ${e.shots} shots. Ratios and times only: grind numbers differ by grinder.</div></section>` : '';
                page.innerHTML = `
                    <div class="dh-top ro-top"><button type="button" class="dh-pill dh-back" onclick="app.goBackPage()"><svg class="icon"><use href="#i-arrow-left"/></svg><span>${esc(this.backLabel())}</span></button><div class="dh-actions"><button type="button" class="btn-clean ro-fav" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Favorite this roaster'}" onclick="app.toggleRoasterFav('${app.escJs(r.key)}')"><svg class="icon"><use href="#i-heart"/></svg></button><button type="button" class="btn-clean" aria-label="Share this roaster" data-roaster="${esc(r.name)}" onclick="app.shareItem('roaster', this.getAttribute('data-roaster'), event)"><svg class="icon"><use href="#i-share-2"/></svg></button><button type="button" class="btn-clean" aria-label="Edit roaster details" onclick="app.openRoasterEdit('${app.escJs(r.key)}')"><svg class="icon"><use href="#i-edit-2"/></svg></button></div></div>
                    <section class="profile-card profile-hero ro-hero" style="--pc-rgb:${rgb}">
                        <div class="ro-hero-row">${this.roasterTileHtml(r, true)}<div style="min-width:0"><h2>${esc(r.name)}</h2>${where ? `<div class="ro-where">${where}</div>` : `<button type="button" class="ro-add" onclick="app.openRoasterEdit('${app.escJs(r.key)}')">+ Add location &amp; website</button>`}${this.user ? `<button type="button" class="ro-local" aria-pressed="${local}" onclick="app.toggleRoasterLocal('${app.escJs(r.key)}')"><svg class="icon"><use href="#i-pin"/></svg>Local to me</button>` : ''}</div></div>
                        ${info.note ? `<p class="ro-note">${esc(info.note)}</p>` : ''}
                        <p class="ro-style">${esc(r.style)}</p>
                        <div class="stat-row"><div class="stat-box"><div class="stat-num">${n}</div><div class="stat-cap">${n === 1 ? 'Coffee' : 'Coffees'}</div></div><div class="stat-box"><div class="stat-num">${r.sessions}</div><div class="stat-cap">${r.sessions === 1 ? 'Session' : 'Sessions'}</div></div><div class="stat-box"><div class="stat-num">${r.rated ? `${RoasterEngine.f1(r.avg)}<small>★</small>` : '–'}</div><div class="stat-cap">${r.rated} rated</div></div><div class="stat-box"><div class="stat-num word">${esc(this.roasterLastLabel(r.last))}</div><div class="stat-cap">Last brewed</div></div></div>
                        ${this.roasterBarHtml('Roast', r.roast, RoasterEngine.ROASTS, ROAST_C)}
                        ${this.roasterBarHtml('Process', r.proc, null, PROC_C)}
                    </section>
                    ${bestCard}${coffees}${who}${esp}
                    <div class="ro-acts"><button type="button" class="btn-primary" onclick="app.logCoffeeForRoaster('${app.escJs(r.key)}')"><svg class="icon" style="width:16px;height:16px;stroke:currentColor"><use href="#i-plus"/></svg>Add a coffee</button><button type="button" class="btn-outline" onclick="app.showRoasterCoffees('${app.escJs(r.key)}')">All coffees</button></div>`;
            },

            openRoasterEdit(key) {
                const r = this.roasterData().byKey.get(key);
                if (!r) return;
                const f = document.querySelector('#roaster-modal form'), info = r.info || {};
                f.elements.key.value = r.key; f.elements.location.value = info.location || ''; f.elements.website.value = info.website || ''; f.elements.note.value = info.note || '';
                document.getElementById('roaster-modal-title').innerText = r.name;
                this.openModal('roaster-modal');
            },

            saveRoasterEdit(ev) {
                if (ev) ev.preventDefault();
                const f = document.querySelector('#roaster-modal form');
                const r = this.roasterData().byKey.get(f.elements.key.value);
                if (!r) { this.closeModals(); return; }
                const val = n => String(f.elements[n].value || '').trim().replace(/\s+/g, ' ').slice(0, n === 'note' ? 280 : 120);
                const ok = this.saveRoasterPrefs(p => { p.info[r.name] = { location: val('location'), website: val('website'), note: val('note'), at: new Date().toISOString() }; });
                this.closeModals();
                if (ok) { this.renderRoasterPage(); this.showToast('Saved.'); }
            },

            logCoffeeForRoaster(key) {
                const r = this.roasterData().byKey.get(key);
                this.openBeanModal();
                const f = this.getBeanForm();
                if (r && f && f.elements.roaster) f.elements.roaster.value = r.name;
                setTimeout(() => { if (f && f.elements.name) f.elements.name.focus(); }, 60);
            },

            showRoasterCoffees(key) {
                this.navStack = [];
                this.hideRoasterView();
                document.getElementById('detail-view').classList.remove('active');
                this.roasterOpen = '';
                this.roasterFilter = key;
                this.coffeeScope = 'all';   // v15.1: that roaster's coffees, everyone's, on the Coffees tab
                this.setTab('my');
                window.scrollTo(0, 0);
            },

            // the add-coffee form suggests the roasters already logged (the names they go by)
            fillRoasterSuggestions() {
                const list = document.getElementById('roaster-names');
                if (!list) return;
                const names = this.sortRoasters(this.roasterData().roasters).map(r => r.name);
                list.innerHTML = names.map(n => `<option value="${this.esc(n)}"></option>`).join('');
            },

            fitRoastersSoon() {
                clearTimeout(this._roFitT);
                this._roFitT = setTimeout(() => this.fitRoasterBeans(document.getElementById('grid')), 80);
            },


