            // ===================== crew features (v11) =====================
            // local wall-clock time for a session; date-only values count as local noon
            localTime(v) {
                if (v === null || v === undefined || v === '') return NaN;
                const s = String(v);
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
                if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
                const t = Date.parse(s);
                return Number.isFinite(t) ? t : NaN;
            },

            sessionHour(b) {
                const pick = [b.date, b.eventAt].find(v => typeof v === 'string' && v.includes('T'));
                if (!pick) return null;
                const t = Date.parse(pick);
                return Number.isFinite(t) ? new Date(t).getHours() : null;
            },

            weekStartOf(t) {
                const d = new Date(t); d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
                return d.getTime();
            },

            sessionsBetween(a, b) {
                return Array.from(this.brews.values()).filter(x => { const t = this.localTime(x.date); return t >= a && t < b; });
            },

            crewPeople(now = Date.now()) {
                const since = now - 56 * 864e5, set = new Set();
                this.brews.forEach(b => { const t = this.localTime(b.date); if (t >= since && t <= now + 864e5) set.add(this.getBrewOwner(b)); });
                // v13.4: the same group for everyone who looks (the viewer isn't added just for looking)
                return [...set].filter(Boolean).filter(n => !this.goalExcluded(n)).sort();
            },

            // v13.1: anyone who has logged anything shows up on every device (the list used to live only on each phone)
            syncKnownUsers() {
                // v14.2: on the new backend the list is you and your private groups, exactly as the server sends it
                if (this.acctOn && this.acctOn()) {
                    const next = this.knownPeople();
                    const changed = next.join('|') !== (this.users || []).join('|');
                    this.users = next;
                    this.peopleState().active.forEach(p => { if (p.color && !this.normalizeHexColor(this.userColors[p.name])) this.setUserColor(p.name, p.color, true); });
                    return changed;
                }
                // v14.0: the shared people list, plus anyone who has logged anything
                // v14.1: a removal wins, whatever records the person has (only this device's own user is kept)
                const { active, removed } = this.peopleState();
                const gone = this.removedPeople();
                let added = false;
                const before = this.users.length;
                this.users = this.users.filter(u => u === this.user || !gone.has(String(u).toLowerCase()));
                if (this.users.length !== before) added = true;
                const seen = new Map(this.users.map(u => [String(u).toLowerCase(), u]));
                const add = n => {
                    n = String(n || '').trim();
                    if (!n || n.length > 40 || n.startsWith('__') || /^(unknown|undefined|null)$/i.test(n) || seen.has(n.toLowerCase()) || gone.has(n.toLowerCase())) return;
                    seen.set(n.toLowerCase(), n); this.users.push(n); added = true;
                };
                active.forEach(p => {
                    add(p.name);
                    if (p.color && !this.normalizeHexColor(this.userColors[p.name])) this.setUserColor(p.name, p.color, true);
                });
                this.beans.forEach(b => add(b.owner || b.user));
                this.brews.forEach(b => add(this.getBrewOwner(b)));
                this.gearByUser.forEach((g, owner) => add(owner));
                if (added) safeSet('dialed_users', JSON.stringify(this.users));
                this.sharePeopleOnce(active, removed);
                return added;
            },

            hasLoggedData(name) {
                const k = String(name || '').toLowerCase();
                return Array.from(this.brews.values()).some(b => String(this.getBrewOwner(b)).toLowerCase() === k) || Array.from(this.beans.values()).some(b => String(b.owner || b.user || '').toLowerCase() === k);
            },

            // v13.1: people switched off here don't count toward group goals (shared with everyone)
            goalExcluded(name) {
                const ex = this.groupSettings && Array.isArray(this.groupSettings.goalExclude) ? this.groupSettings.goalExclude : [];
                const k = String(name || '').toLowerCase();
                return ex.some(x => String(x).toLowerCase() === k);
            },

            setGoalExcluded(name, excluded) {
                const cur = this.groupSettings && Array.isArray(this.groupSettings.goalExclude) ? this.groupSettings.goalExclude.slice() : [];
                const next = excluded ? [...new Set([...cur.filter(x => String(x).toLowerCase() !== String(name).toLowerCase()), name])] : cur.filter(x => String(x).toLowerCase() !== String(name).toLowerCase());
                const rec = { ...(this.groupSettings || {}), type: 'gear', id: 'gear-__group__', user: '__group__', owner: '__group__', items: [], lastByMethod: {}, goalExclude: next };
                delete rec.actor; delete rec.actorColor; delete rec.eventAt; delete rec.baseAt; delete rec.date;
                this.push(rec);   // v13.4: push() keeps the settings as they were as the base, so a friend's switch at the same time isn't undone
                this.haptic('tick');
                this.showToast(excluded ? `${name} won't count toward group goals.` : `${name} counts toward group goals again.`);
                if (this.tab === 'feed' && typeof this.render === 'function') this.render();
            },

            originOf(b) {
                const bean = this.beans.get(String(b.beanId || ''));
                return bean ? String(bean.origin || '').split(/\s*(?:,|\/|&| and )\s*/)[0].trim() : '';
            },

            // ---- Crew Quest: one shared weekly goal, scaled to how much the crew has been brewing
            crewQuest(now = Date.now(), forceType = '') {
                const W = 7 * 864e5;
                const start = this.weekStartOf(now);
                const end = this.weekStartOf(start + W + 3 * 3600e3);
                const people = this.crewPeople(now);
                const inGoal = b => !this.goalExcluded(this.getBrewOwner(b));
                const past = [];
                for (let i = 1; i <= 6; i++) { const ws = this.weekStartOf(start - i * W + 3 * 3600e3); past.push(this.sessionsBetween(ws, this.weekStartOf(ws + W + 3 * 3600e3)).filter(inGoal)); }
                const counts = past.map(w => w.length).filter(n => n > 0).sort((a, b) => a - b);
                const base = counts.length ? counts[Math.floor(counts.length / 2)] : 6;
                const busy = past.filter(w => w.length);
                const avgOrigins = busy.length ? busy.reduce((s, w) => s + new Set(w.map(b => this.originOf(b)).filter(Boolean)).size, 0) / busy.length : 1;
                const methodsSeen = new Set(past.flat().map(b => b.method).filter(Boolean)).size;
                const types = ['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'];
                const weekNo = Math.round(start / W);
                const type = types.includes(forceType) ? forceType : types[((weekNo % types.length) + types.length) % types.length];
                const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
                const cur = this.sessionsBetween(start, end).filter(inGoal).sort((a, b) => this.localTime(a.date) - this.localTime(b.date));
                const by = new Map(people.map(p => [p, 0]));
                const credit = name => by.set(name, (by.get(name) || 0) + 1);
                let target = 1, progress = 0, title = '', detail = '', unit = '', per = 0;
                if (type === 'sessions') {
                    target = clampInt(base * 1.15, 4, 40); cur.forEach(b => credit(this.getBrewOwner(b))); progress = cur.length;
                    title = `Brew ${target} sessions together`; unit = 'sessions';
                } else if (type === 'origins') {
                    target = clampInt(avgOrigins + 1, 2, 6);
                    const seen = new Map(); cur.forEach(b => { const o = this.originOf(b); if (o && !seen.has(o.toLowerCase())) { seen.set(o.toLowerCase(), o); credit(this.getBrewOwner(b)); } });
                    progress = seen.size; title = `Taste ${target} different origins`; unit = 'origins';
                    detail = [...seen.values()].join(', ');
                } else if (type === 'rated') {
                    target = clampInt(base * 0.7, 3, 30); cur.filter(b => this.normalizeRating(b.rating) > 0).forEach(b => credit(this.getBrewOwner(b)));
                    progress = cur.filter(b => this.normalizeRating(b.rating) > 0).length; title = `Rate ${target} sessions`; unit = 'rated';
                } else if (type === 'notes') {
                    target = clampInt(base * 0.5, 3, 20); const noted = cur.filter(b => this.extractFlavors(b).length > 0);
                    noted.forEach(b => credit(this.getBrewOwner(b))); progress = noted.length; title = `Log tasting notes on ${target} sessions`; unit = 'with notes';
                } else if (type === 'everyone') {
                    per = clampInt(base / Math.max(1, people.length) / 1.2, 1, 5);
                    cur.forEach(b => credit(this.getBrewOwner(b)));
                    target = Math.max(1, people.length); progress = people.filter(p => (by.get(p) || 0) >= per).length;
                    title = per === 1 ? 'Everyone brews at least once' : `Everyone brews ${per}+ times`; unit = 'people there';
                    detail = people.map(p => `${p} ${Math.min(by.get(p) || 0, per)}/${per}`).join(' · ');
                } else {
                    target = methodsSeen >= 3 ? 3 : 2;
                    const seen = new Map(); cur.forEach(b => { const m = b.method; if (m && !seen.has(m)) { seen.set(m, true); credit(this.getBrewOwner(b)); } });
                    progress = seen.size; title = `Brew with ${target} different methods`; unit = 'methods';
                    detail = [...seen.keys()].join(', ');
                }
                const daysLeft = end > now ? Math.max(0, this.dayNum(end - 1) - this.dayNum(now) + 1) : 0;   // v13.4: calendar days (DST)
                return { type, title, target, progress: Math.min(progress, target), raw: progress, done: progress >= target, unit, detail, start, end, daysLeft, people, per, counts: Object.fromEntries(by), by: [...by.entries()].filter(([, n]) => n > 0) };
            },

            questsWon(now = Date.now()) {
                const W = 7 * 864e5;
                let won = 0;
                const start = this.weekStartOf(now);
                for (let i = 1; i <= 26; i++) {
                    const t = this.weekStartOf(start - i * W + 3 * 3600e3) + 3 * 864e5;
                    const q = this.crewQuest(t);
                    if (q.done) won++;
                }
                return won;
            },

            // ---- v12.0: the group goal bar. Parts glow in each person's color and blend into their neighbors.
            hexMix(a, b, t = 0.5) {
                const p = h => { const s = String(this.normalizeHexColor(h) || '#888888').slice(1); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
                const x = p(a), y = p(b);
                return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
            },

            crewBarHtml(q, segs) {
                // parts as fractions of the whole bar, in order, never past the end
                let used = 0;
                const parts = segs.map(s => { const w = Math.max(0, Math.min(1 - used, s.w)); used += w; return { p: s.p, w, c: this.getUserColor(s.p) }; }).filter(s => s.w > 0);
                const total = Math.min(1, used);
                const aria = `role="progressbar" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${q.progress}"`;
                if (!parts.length) return `<div class="cq-bar" ${aria}></div>`;
                const pct = v => `${(v * 100).toFixed(2)}%`;
                // v13.1: solid parts with a thin gap between people, like the roast bars (no blending, no glow)
                const stops = [];
                let x = 0;
                parts.forEach((s, i) => {
                    const a = x, z = x + s.w; x = z;
                    const lastPart = i === parts.length - 1;
                    stops.push(`${s.c} ${i ? `calc(${pct(a)} + 1px)` : '0%'}`, `${s.c} ${lastPart ? pct(z) : `calc(${pct(z)} - 1px)`}`);
                    if (!lastPart) stops.push(`transparent calc(${pct(z)} - 1px)`, `transparent calc(${pct(z)} + 1px)`);
                });
                stops.push(`transparent ${pct(total)}`);
                const g = `linear-gradient(90deg, ${stops.join(', ')})`;
                const done = q.done && total >= 0.999;
                // what you saw last time: a part that landed since then grows in
                const key = `${q.start}:${q.type}`;
                const grow = this.crewGrowFor(key, total);
                const loopT = done ? this.crewLoopElapsed() : null;
                const cls = ['cq-bar', done ? 'done' : '', grow ? (grow.wait ? 'grow-wait' : 'grow') : '', loopT !== null ? 'loop' : ''].filter(Boolean).join(' ');
                const style = [`--cq-g:${g}`, `--cq-r1:${pct(1 - total)}`, grow ? `--cq-r0:${pct(1 - grow.from)}` : '', grow && !grow.wait ? `--cq-grow-at:${-grow.t}ms` : '', loopT !== null ? `--cq-loop-at:${-loopT}ms` : ''].filter(Boolean).join(';');
                return `<div class="${cls}" ${aria} style="${this.esc(style)}" title="${this.esc(parts.map(s => s.p).join(', '))}"><div class="cq-layer cq-glow"><i class="cq-g"></i></div><div class="cq-layer cq-paint"><i class="cq-g"></i>${done ? '<i class="cq-sheen"></i>' : ''}</div></div>`;
            },

            motionOK() {
                try { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return true; }
            },

            // how far the bar was the last time you looked at it (per week's goal); grows from there once
            crewGrowFor(key, total) {
                const G = this._cqGrow;
                if (G && G.key === key && Math.abs(G.to - total) < 1e-6) {
                    if (!G.at) { this.startCrewGrowSoon(); return { from: G.from, wait: true }; }
                    const t = Date.now() - G.at;
                    if (t < 1100) return { from: G.from, t: Math.max(0, t) };
                    return null;
                }
                let seen = null;
                try { seen = JSON.parse(safeGet('dialed_cq_seen') || 'null'); } catch (e) { seen = null; }
                const from = seen && seen.key === key ? Number(seen.frac) || 0 : 0;
                try { safeSet('dialed_cq_seen', JSON.stringify({ key, frac: total })); } catch (e) {}
                if (!seen || !(total > from + 1e-6) || !this.motionOK() || typeof document === 'undefined' || document.hidden) return null;
                // v12.2: hold at where it was; it grows half a second after the page has drawn
                this._cqGrow = { key, from, to: total, at: 0 };
                this.startCrewGrowSoon();
                return { from, wait: true };
            },

            crewLoopElapsed() {
                const L = this._cqLoop;
                if (!L) return null;
                const t = Date.now() - L.at;
                if (t >= 1700) { this._cqLoop = null; return null; }
                return t;
            },

            // the done-sheen, each time the feed opens: half a second after the page has drawn
            playCrewLoop() {
                if (!this.motionOK() || this._cqLoopTimer) return;
                this._cqLoopTimer = true;
                this.afterSettle(() => {
                    this._cqLoopTimer = false;
                    if (this.tab !== 'feed' || (typeof document !== 'undefined' && document.hidden)) return;
                    const G = this._cqGrow;
                    if (G && (!G.at || Date.now() - G.at < 1100)) return;   // a grow is playing; it brings its own sheen
                    const bar = typeof document !== 'undefined' && document.querySelector ? document.querySelector('.crew-quest .cq-bar.done') : null;
                    if (!bar || !bar.querySelector || !bar.querySelector('.cq-sheen') || !bar.classList || !bar.style || typeof bar.style.setProperty !== 'function') return;
                    this._cqLoop = { at: Date.now() };
                    this.dirtyKeys('top:quest');
                    bar.classList.remove('loop');
                    void bar.offsetWidth;
                    bar.style.setProperty('--cq-loop-at', '0ms');
                    bar.classList.add('loop');
                }, 500);
            },

            // ---- v12.2: redraw only what changed
            canPatchDom(el) {
                if (this._canPatch === undefined) {
                    try {
                        const t = document.createElement('template');
                        this._canPatch = !!(t && t.content && typeof t.content.querySelector === 'function' && typeof Element !== 'undefined' && Element.prototype.replaceWith && typeof document.createDocumentFragment === 'function');
                    } catch (e) { this._canPatch = false; }
                }
                return this._canPatch && (!el || (typeof el.insertBefore === 'function' && 'firstElementChild' in el));
            },

            htmlEl(html, key) {
                const t = document.createElement('template');
                t.innerHTML = String(html).trim();
                let el = t.content.firstElementChild;
                if (!el || t.content.childNodes.length !== 1) {
                    el = document.createElement('div');
                    el.style.display = 'contents';
                    el.append(...t.content.childNodes);
                }
                if (key) el.setAttribute('data-fkey', key);
                return el;
            },

            // make the live node `a` look like the new node `b`, keeping every part that's already right
            morphEl(a, b) {
                if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return b; }
                if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return a; }
                const img = a.nodeName === 'IMG';
                const shape = img && a.hasAttribute('data-shape-for') && a.getAttribute('data-shape-for') === b.getAttribute('data-shape-for');
                const photo = img && a.hasAttribute('data-fallbacks') && a.getAttribute('data-fallbacks') === b.getAttribute('data-fallbacks');
                for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(shape && name === 'src')) a.removeAttribute(name);
                for (const { name, value } of [...b.attributes]) {
                    if (photo && (name === 'src' || name === 'data-fallback-index')) continue;
                    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
                }
                // a centered initial stays as it is when it's the same letter
                if (a.firstElementChild && a.firstElementChild.classList.contains('ini') && a.textContent === b.textContent && a.matches(INITIAL_SEL)) return a;
                const ac = [...a.childNodes].filter(c => !(c.nodeType === 1 && c.classList.contains('hx'))), bc = [...b.childNodes];
                const n = Math.min(ac.length, bc.length);
                for (let i = 0; i < n; i++) this.morphEl(ac[i], bc[i]);
                for (let i = n; i < bc.length; i++) a.appendChild(bc[i]);
                for (let i = n; i < ac.length; i++) ac[i].remove();
                return a;
            },

            // children of `box` keyed by data-fkey; `map` remembers the html each one was drawn from
            patchKeyed(box, items, map) {
                const live = new Map();
                [...box.children].forEach(el => { const k = el.getAttribute('data-fkey'); if (k && !live.has(k)) live.set(k, el); else el.remove(); });
                const seen = new Set();
                items = items.filter(it => it.html && !seen.has(it.key) && seen.add(it.key));
                live.forEach((el, k) => { if (!seen.has(k)) { el.remove(); map.delete(k); } });
                let prev = null;
                items.forEach(it => {
                    let el = live.get(it.key);
                    if (el && map.get(it.key) !== it.html) el = this.morphEl(el, this.htmlEl(it.html, it.key));
                    else if (!el) el = this.htmlEl(it.html, it.key);
                    map.set(it.key, it.html);
                    const at = prev ? prev.nextElementSibling : box.firstElementChild;
                    if (at !== el) box.insertBefore(el, at);
                    prev = el;
                });
            },

            // something on screen was changed by hand: the next redraw re-checks it instead of trusting the saved html
            dirtyKeys(...keys) {
                keys.forEach(k => { if (this._feedHtml) this._feedHtml.delete(k); if (this._logHtml) this._logHtml.delete(k); });
            },

            // first paint, then `ms` more
            afterSettle(fn, ms = 0) {
                const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f => setTimeout(f, 16));
                raf(() => raf(() => setTimeout(fn, ms)));
            },

            feedKey(e) {
                return `${e.kind}:${e.brewId || e.beanId || e.id || ''}`;
            },

            feedCardHtml(e) {
                if (e.kind === 'session') return this.renderFeedSessionCard(e);
                if (e.kind === 'bean' || e.kind === 'library') return this.renderFeedBeanCard(e);
                if (e.kind === 'join') return this.renderJoinCard(e);
                return '';
            },

            appendFeedChunk(grid, count) {
                const entries = this.feedEntries.slice(0, 220);
                const end = Math.min(entries.length, (this._feedShown || 0) + count);
                const frag = document.createDocumentFragment(), added = [];
                for (let i = this._feedShown || 0; i < end; i++) {
                    const e = entries[i], key = this.feedKey(e);
                    if (this._feedHtml.has(key)) continue;
                    const html = this.feedCardHtml(e);
                    if (!html) continue;
                    this._feedHtml.set(key, html);
                    const el = this.htmlEl(html, key);
                    added.push(el);
                    frag.appendChild(el);
                }
                grid.appendChild(frag);
                this._feedShown = end;
                // center their initials before this frame paints (the watcher would only get to them next frame)
                added.forEach(el => this.centerInitials(el));
            },

            // the rest of the feed right after the first screen is up: one small batch per frame (taps and scrolling stay
            // smooth), paused while the goal animation plays
            queueFeedRest() {
                if (this._feedRestQueued) return;
                if ((this._feedShown || 0) >= Math.min(220, this.feedEntries.length)) return;
                this._feedRestQueued = true;
                const step = () => {
                    const grid = document.getElementById('grid');
                    if (this.tab !== 'feed' || !grid || grid.getAttribute('data-view') !== 'feed' || !this._feedHtml) { this._feedRestQueued = false; return; }
                    if (this.crewAnimating() || (typeof document !== 'undefined' && document.hidden)) { setTimeout(step, 200); return; }
                    const t0 = Date.now();
                    do { this.appendFeedChunk(grid, 3); } while (Date.now() - t0 < 12 && this._feedShown < Math.min(220, this.feedEntries.length));
                    // one small batch per frame, so each frame only lays out what was just added
                    if (this._feedShown < Math.min(220, this.feedEntries.length)) raf(step);
                    else this._feedRestQueued = false;
                };
                const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f => setTimeout(f, 16));
                this.afterSettle(step, 0);
                this.bindFeedScroll();
            },

            // scrolling faster than the fill: draw more right away
            bindFeedScroll() {
                if (this._feedScrollBound) return;
                const sc = document.getElementById('main-content');
                if (!sc || typeof sc.addEventListener !== 'function') return;
                this._feedScrollBound = true;
                sc.addEventListener('scroll', () => {
                    if (this.tab !== 'feed' || !this._feedHtml) return;
                    if ((this._feedShown || 0) >= Math.min(220, this.feedEntries.length)) return;
                    if (sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1600) return;
                    const grid = document.getElementById('grid');
                    if (grid && grid.getAttribute('data-view') === 'feed') this.appendFeedChunk(grid, 12);
                }, { passive: true });
            },

            // the whole feed, now (for anything that needs a card further down)
            flushFeed() {
                const grid = document.getElementById('grid');
                if (this.tab !== 'feed' || !grid || grid.getAttribute('data-view') !== 'feed' || !this._feedHtml) return;
                this.appendFeedChunk(grid, 220);
            },

            // ---- v12.2: the coffee-page / card panes, worked out when opened
            paneHtml(brew, key) {
                if (key === 'flavor') return this.renderFlavorPane(brew);
                if (key === 'vs') return this.renderVsPane(brew);
                return this.renderNextPane(brew);
            },

            lazyPanes(brew) {
                const active = this.cardTab(brew);
                return ['flavor', 'vs', 'next'].map(k => active === k ? this.paneHtml(brew, k) : `<div class="card-pane pane-block log-wide" data-pane="${k}" data-lazy="${k}"></div>`).join('');
            },

            // ---- v12.2: a like changes only its own heart and "liked" line
            patchLikeDom(brewId) {
                if (!this.canPatchDom()) return false;
                const id = String(brewId);
                const brew = this.brews.get(id);
                if (!brew) return false;
                const likes = this.normalizeLikeList(brew.likes, this.getBrewOwner(brew));
                const on = likes.includes(this.user);
                const pop = on && this.likePopElapsed('brew', id) >= 0;
                this.dirtyKeys(`session:${id}`, `log-${id}`);
                document.querySelectorAll('[data-card-brew]').forEach(card => {
                    if (card.getAttribute('data-card-brew') !== id) return;
                    const lead = card.querySelector('.thread-lead');
                    const btn = lead && lead.querySelector('.like-btn');
                    if (!btn) return;
                    const had = btn.classList.contains('pop');
                    btn.classList.toggle('liked', on);
                    btn.classList.remove('pop');
                    btn.style.removeProperty('--pop-at');
                    if (pop) { if (had) void btn.offsetWidth; btn.classList.add('pop'); }
                    let line = lead.querySelector('.social-like-line');
                    if (likes.length) {
                        if (!line) { line = document.createElement('div'); line.className = 'social-like-line'; btn.after(line); }
                        line.textContent = this.formatLikers(likes);
                    } else if (line) line.remove();
                });
                return true;
            },

            // ---- v12.2: the goal animation waits for the page
            // a goal animation is playing right now (the feed holds its last cards until it's done)
            crewAnimating() {
                const now = Date.now(), G = this._cqGrow, L = this._cqLoop;
                if (G && G.at && now - G.at < 1150) return true;
                return !!(L && now >= L.at && now - L.at < 1750);
            },

            startCrewGrowSoon() {
                if (this._cqGrowTimer) return;
                this._cqGrowTimer = true;
                this.afterSettle(() => {
                    this._cqGrowTimer = false;
                    const G = this._cqGrow;
                    if (!G || G.at) return;
                    if (this.tab !== 'feed' || (typeof document !== 'undefined' && document.hidden)) return;   // plays next time the feed is up
                    G.at = Date.now();
                    if (G.to >= 0.999) this._cqLoop = { at: G.at + 1000 };
                    const bar = document.querySelector('.crew-quest .cq-bar.grow-wait');
                    if (!bar || !bar.classList || !bar.style || typeof bar.style.setProperty !== 'function') return;
                    this.dirtyKeys('top:quest');
                    bar.classList.remove('grow-wait');
                    bar.style.setProperty('--cq-grow-at', '0ms');
                    bar.classList.add('grow');
                    if (G.to >= 0.999 && bar.classList.contains('done')) { bar.style.setProperty('--cq-loop-at', '1000ms'); bar.classList.add('loop'); }
                }, 500);
            },

            renderCrewQuest() {
                if (!this.brews.size) return '';
                const q = this.crewQuest();
                const won = this.questsWon();
                const segs = q.type === 'everyone'
                    ? q.people.filter(p => (q.counts[p] || 0) >= q.per).map(p => ({ p, w: 1 / q.target }))
                    : q.by.map(([p, n]) => ({ p, w: Math.min(n, q.target) / q.target }));
                const bar = this.crewBarHtml(q, segs);
                const faces = q.by.map(([p, n]) => `<span class="cq-face" data-profile="${this.esc(p)}"><b style="background:${this.esc(this.getUserColor(p))}">${this.esc(this.feedInitial(p))}</b>${n}</span>`).join('');
                const left = q.done ? 'Done together' : (q.daysLeft <= 1 ? 'Last day' : `${q.daysLeft} days left`);
                return `
                    <section class="feed-card crew-quest${q.done ? ' done' : ''}" aria-label="Group goal">
                        <div class="cq-top"><span class="cq-kicker"><svg class="icon"><use href="#i-target"/></svg>Group goal · this week</span><span class="cq-left">${this.esc(left)}</span></div>
                        <div class="cq-title">${this.esc(q.title)}</div>
                        ${bar}
                        <div class="cq-meta"><span><b>${q.progress}</b> of ${q.target} ${this.esc(q.unit)}${q.detail ? ` · ${this.esc(q.detail)}` : ''}</span></div>
                        <div class="cq-foot">${faces || '<span class="cq-empty">First session this week starts the bar.</span>'}${won ? `<span class="cq-won"><svg class="icon"><use href="#i-trophy"/></svg>${won} goal${won === 1 ? '' : 's'} reached together</span>` : ''}</div>
                    </section>`;
            },

