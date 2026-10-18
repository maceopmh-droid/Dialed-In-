            // ===================== v15.1: crema and levels =====================
            // Crema is Dialed In's points: for brewing, trying new coffees, roasters, origins and methods, commenting,
            // likes, achievements, community goals and monthly awards. Twelve levels go from a Seed to Dialed In. Your own
            // app adds up your crema from everything it has and saves the total (set_crema), so everyone sees the same
            // level beside your name; for someone who hasn't opened this version yet, it's estimated from what's here.
            levelList() {
                return this._levels || (this._levels = [
                    { name: 'Seed', min: 0, color: '#8C9A6B', g: '<ellipse cx="12" cy="12.5" rx="4.2" ry="6" transform="rotate(25 12 12.5)"/><path d="M12 8.5c.8 2.6.8 5.4 0 8"/>' },
                    { name: 'Seedling', min: 150, color: '#5FA35E', g: '<path d="M12 20v-8"/><path d="M12 12c0-3.4 2.2-5.6 6-5.6 0 3.5-2.4 5.6-6 5.6Z"/><path d="M12 14c0-2.9-2-4.8-5.3-4.8 0 3.1 2.1 4.8 5.3 4.8Z"/>' },
                    { name: 'Cherry', min: 400, color: '#C8484F', g: '<circle cx="8.3" cy="15.6" r="3.4"/><circle cx="15.8" cy="15.6" r="3.4"/><path d="M8.3 12.2C8.9 8.2 11 5.6 14.4 4.6M15.8 12.2c-.3-3.1-.7-5.6-1.4-7.6"/>' },
                    { name: 'Green Bean', min: 800, color: '#6E9E58', g: '<ellipse cx="12" cy="12" rx="5.2" ry="7.6" transform="rotate(35 12 12)"/><path d="M15.2 6.3c-2.2 1.3-2.1 3.6-3.4 4.9s-3.5 1.5-4.4 4.6"/>' },
                    { name: 'First Crack', min: 1400, color: '#C3955A', g: '<ellipse cx="12" cy="12" rx="5.2" ry="7.6" transform="rotate(35 12 12)"/><path d="M15.4 6.6 13 9.4l1.7 1.5-3.2 2.3 1.3 1.6-3.6 2.6"/>' },
                    { name: 'City Roast', min: 2200, color: '#B06A32', g: '<path d="M12 20.5c-3.5 0-5.8-2.3-5.8-5.5 0-3.5 2.7-5.2 3.8-8.8 1.7 1.5 2.3 3.2 2.2 4.9 1-.6 1.9-1.8 2.1-3.2 2 1.9 3.5 4.2 3.5 7.1 0 3.2-2.3 5.5-5.8 5.5Z"/>' },
                    { name: 'Full City', min: 3200, color: '#7A4B2E', g: '<path d="M6.6 8h10.8l1.1 12H5.5Z"/><path d="M6.6 8 8.2 4.6h7.6L17.4 8"/><ellipse cx="12" cy="14" rx="2.3" ry="3.4" transform="rotate(30 12 14)"/><path d="M13 11.4c-.9 1-1 2.1-1.6 3.1"/>' },
                    { name: 'Bloom', min: 4500, color: '#4F8E8A', g: '<path d="M5.2 4.6h13.6l-3.6 7.2H8.8Z"/><path d="M7.2 11.8h9.6"/><path d="M8 14.8h8v2.4a3.2 3.2 0 0 1-3.2 3.2h-1.6A3.2 3.2 0 0 1 8 17.2Z"/>' },
                    { name: 'Golden Cup', min: 6000, color: '#D5A23A', g: '<path d="M5.4 9.5h10.6v4a5.3 5.3 0 0 1-5.3 5.3h0a5.3 5.3 0 0 1-5.3-5.3Z"/><path d="M16 10.6h1.1a2.4 2.4 0 0 1 0 4.8h-1.4"/><path d="M8.2 6.6c-.5-.9.5-1.5 0-2.6M11.6 6.6c-.5-.9.5-1.5 0-2.6"/><path d="M18.6 3.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z"/>' },
                    { name: 'Q Grader', min: 8000, color: '#5476B8', g: '<ellipse cx="9" cy="9" rx="4.4" ry="3.4" transform="rotate(-45 9 9)" fill="#fff"/><path d="M12 12l7 7"/>' },
                    { name: 'Cup of Excellence', min: 10500, color: '#B8862B', g: '<path d="M7.6 4.6h8.8v4.6a4.4 4.4 0 0 1-8.8 0Z"/><path d="M7.6 6.2H5a2.6 2.6 0 0 0 2.8 3.2M16.4 6.2H19a2.6 2.6 0 0 1-2.8 3.2"/><path d="M12 13.6v3.4M8.8 19.6h6.4M9.8 17h4.4"/>' },
                    { name: 'Dialed In', min: 14000, color: '#3E8A5F', ring: '#E2B84E', g: '<path d="M4.4 16.4a7.6 7.6 0 0 1 15.2 0"/><path d="M12 16.4l3.8-4.6"/><circle cx="12" cy="16.4" r="1.3"/><path d="M6.6 11.2l1.1.9M12 8.8v1.4M17.4 11.2l-1.1.9"/>' },
                ]);
            },
            levelOf(crema) {
                const list = this.levelList(), c = Math.max(0, Number(crema) || 0);
                let i = 0; while (i + 1 < list.length && c >= list[i + 1].min) i++;
                const next = list[i + 1] || null;
                return { i, n: i + 1, ...list[i], crema: c, next, pct: next ? Math.min(100, (c - list[i].min) / (next.min - list[i].min) * 100) : 100 };
            },
            levelSvg(i, size = 24) {
                const L = this.levelList()[i];
                return `<svg class="lvl-badge" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="${L.color}"/>${L.ring ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${L.ring}" stroke-width="1.6"/>` : ''}<g transform="translate(3 3) scale(.75)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${L.g}</g></svg>`;
            },
            cremaRules() {
                return [
                    ['session', 'Each session you log', 10, 'up to 5 a day'],
                    ['complete', 'Rating it, with its taste or notes', 5],
                    ['coffee', 'A coffee you hadn’t brewed before', 25],
                    ['roaster', 'A new roaster', 15],
                    ['origin', 'A new origin country', 20],
                    ['method', 'A new brew method', 30],
                    ['master', 'Pinning a master recipe', 10],
                    ['comment', 'A comment', 3, 'up to 10 a day'],
                    ['likeGiven', 'A like you give', 1],
                    ['likeGot', 'A like on your session', 2],
                    ['helpful', 'An answer marked most helpful', 25],
                    ['achievement', 'An achievement level', 20],
                    ['goal', 'A community goal you brewed toward', 50],
                    ['award', 'A monthly award', 40],
                    ['champ', 'Taking the month (the most awards)', 100],
                ];
            },
            // everything that earns crema for one person. full: also community goals and monthly awards (your own: the
            // app can only be sure of those for you)
            cremaFor(name, full = false) {
                const circles = full && this.acctOn && this.acctOn() ? `${(this.grState().list || []).map(g => `${g.id}:${(g.members || []).length}`).join(',')}|${this.ppState().data ? this.friendNames().length : -1}|${safeGet('dialed_awards_revealed') || ''}`.length + ':' + ((this.grState().list || []).length) : '';
                const ver = `${name}|${full}|${this.eventLog ? this.eventLog.length : 0}|${this.brews.size}|${this.beans.size}|${JSON.stringify(this.achievementLevelsByUser[name] || {}).length}|${circles}`;
                this._cremaMemo = this._cremaMemo || new Map();
                if (this._cremaMemo.has(ver)) return this._cremaMemo.get(ver);
                const n = {}; Object.keys(Object.fromEntries(this.cremaRules().map(r => [r[0], 0]))).forEach(k => { n[k] = 0; });
                const mine = this.brewsOf(name).filter(b => !(this.isCommunity && this.isCommunity('brew', b.id)));
                const perDay = new Map();
                const coffees = new Set(), roasters = new Set(), origins = new Set(), methods = new Set();
                mine.forEach(b => {
                    const d = this.dayKey(this.localTime(b.date)); perDay.set(d, (perDay.get(d) || 0) + 1);
                    const tasted = Array.isArray(b.tasted) && b.tasted.length, notes = String(this.getBrewNotes(b) || '').trim(), fl = this.extractFlavors(b).length;
                    if (this.normalizeRating(b.rating) > 0 && (tasted || notes || fl)) n.complete++;
                    coffees.add(this.groupKeyOfBrew(b));
                    const bean = this.beans.get(String(b.beanId || ''));
                    if (bean && String(bean.roaster || '').trim()) roasters.add(this.roasterKey(bean.roaster));
                    const country = bean && this.coffeeCountry ? this.coffeeCountry(bean.origin) : '';
                    if (country) origins.add(country);
                    if (b.method) methods.add(String(b.method).toLowerCase());
                    if (b.isMaster === true || b.isMaster === 'true') n.master++;
                    n.likeGot += (Array.isArray(b.likes) ? b.likes.filter(x => String(x || '').trim() && x !== name).length : 0);
                });
                perDay.forEach(c => { n.session += Math.min(c, 5); });
                n.coffee = coffees.size; n.roaster = roasters.size; n.origin = origins.size; n.method = methods.size;
                const cmtDay = new Map();
                this.brews.forEach(b => {
                    if (Array.isArray(b.likes) && b.likes.includes(name) && this.getBrewOwner(b) !== name) n.likeGiven++;
                    (Array.isArray(b.comments) ? b.comments : []).forEach(c => {
                        if (!c || c.user !== name) return;
                        const d = this.dayKey(this.toTime(c.timestamp) || this.localTime(b.date)); cmtDay.set(d, (cmtDay.get(d) || 0) + 1);
                        if (b.helpfulAnswer && String(b.helpfulAnswer) === String(c.id)) n.helpful++;
                    });
                });
                cmtDay.forEach(c => { n.comment += Math.min(c, 10); });
                const lv = this.achievementLevelsByUser[name] || {};
                n.achievement = Object.values(lv).reduce((s, x) => s + (Number(x) || 0), 0);
                if (full && this.acctOn && this.acctOn()) {
                    const groups = this.crewGroups().filter(g => g.members.length >= 2 && g.members.some(m => m.name === name));
                    const W = 7 * 864e5, thisWeek = this.weekStartOf(Date.now());
                    groups.forEach(g => this.withCrewScope(g, () => {
                        const since = Date.parse(g.since || '') || 0;
                        for (let i = 0; i <= 26; i++) {   // this week too, once it's reached
                            const ws = this.weekStartOf(thisWeek - i * W + 3 * 3600e3);
                            if (since && ws + W < since) break;
                            const q = this.crewQuest(ws + 3 * 864e5);
                            if (q && q.done && q.counts && q.counts[name] > 0) n.goal++;
                        }
                    }));
                    const fr = this.friendsCrew ? this.friendsCrew() : null;
                    [...groups, ...(fr ? [fr] : [])].forEach(c => this.withCrewScope(c, () => {
                        this.awardMonths().filter(k => !this.monthLocked(k)).forEach(k => {
                            const [y, m] = k.split('-').map(Number), awards = this.crewAwardsMemo(y, m - 1);
                            if (!awards.length || this.awardsNeedReveal(k, awards)) return;   // revealing them is when they count
                            n.award += awards.filter(a => a.winners.includes(name)).length;
                            const st = this.awardStandings(awards), top = st.length ? st[0][1] : 0;
                            if (top && st.some(r => r[0] === name && r[1] === top)) n.champ++;
                        });
                    }));
                }
                const pts = Object.fromEntries(this.cremaRules().map(r => [r[0], r[2]]));
                const parts = this.cremaRules().map(([k, label, p]) => ({ k, label, n: n[k], pts: n[k] * p })).filter(x => x.n > 0);
                const out = { total: parts.reduce((s, x) => s + x.pts, 0), parts, full };
                if (this._cremaMemo.size > 60) this._cremaMemo.clear();
                this._cremaMemo.set(ver, out);
                return out;
            },
            // whose level to show: yours live; others' as they saved it, else an estimate from what's here
            cremaOf(name) {
                if (!name) return null;
                if (name === this.user) return this.cremaFor(name, true).total;
                const f = this.faceStore ? this.faceStore().get(String(name).toLowerCase()) : null;
                if (f && typeof f[2] === 'number') return f[2];
                const theirs = this.brewsOf(name).filter(b => !(this.isCommunity && this.isCommunity('brew', b.id)));
                return theirs.length ? this.cremaFor(name, false).total : null;
            },
            // your total, saved for everyone else (a few seconds after things settle; again when it changes)
            publishCremaSoon() {
                if (!(this.acctOn && this.acctOn()) || !this.user || !Supa.ready() || !this.syncedOnce) return;
                if (!this.grState().list || !this.ppState().data) return;   // not until your communities and friends are in (goals and awards count)
                clearTimeout(this._cremaPubT);
                this._cremaPubT = setTimeout(async () => {
                    const total = this.cremaFor(this.user, true).total, last = Number(safeGet('dialed_crema_pub') || -1);
                    if (total === last) return;
                    try { await Supa.rpc('set_crema', { points: total }); safeSet('dialed_crema_pub', String(total)); } catch (e) { /* next time */ }
                }, 4000);
            },
            // the small level mark beside a name on a session: drawn by a style rule per person, so cards already on
            // screen get it as soon as the level is known
            levelDotHtml(name) { return name ? `<i class="lvl-dot" data-lvl="${this.esc(name)}" aria-hidden="true"></i>` : ''; },
            paintLevelRules() {
                if (typeof document === 'undefined') return;
                if (!document.getElementById('lvl-vars')) {
                    const v = document.createElement('style'); v.id = 'lvl-vars';
                    v.textContent = `:root{${this.levelList().map((L, i) => `--lvl-${i}:url("data:image/svg+xml,${encodeURIComponent(this.levelSvg(i).replace('class="lvl-badge" ', 'xmlns="http://www.w3.org/2000/svg" '))}")`).join(';')}}`;
                    document.head.appendChild(v);
                }
                let st = document.getElementById('lvl-rules');
                if (!st) { st = document.createElement('style'); st.id = 'lvl-rules'; document.head.appendChild(st); }
                const names = new Set([...document.querySelectorAll('.lvl-dot[data-lvl]')].map(el => el.getAttribute('data-lvl')));
                const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                const rules = [];
                names.forEach(nm => { const c = this.cremaOf(nm); if (c === null || c === undefined) return; rules.push(`.lvl-dot[data-lvl=${q(nm)}]{display:inline-block;background-image:var(--lvl-${this.levelOf(c).i})}`); });
                const css = rules.join('\n');
                if (st.textContent !== css) st.textContent = css;
                this.publishCremaSoon();
            },
            // the level on the profile card: the badge, the level, and how far to the next
            levelRowHtml(user) {
                const c = this.cremaOf(user);
                if (c === null || c === undefined) return '';
                const L = this.levelOf(c), fmt = x => Math.round(x).toLocaleString();
                return `<button type="button" class="lvl-row" data-name="${this.esc(user)}" onclick="app.openLevel(this.getAttribute('data-name'))" aria-label="Level ${L.n}, ${this.esc(L.name)}. ${fmt(L.crema)} crema">${this.levelSvg(L.i, 34)}<span class="lvl-main"><span class="lvl-top"><b>${this.esc(L.name)}</b><small>Level ${L.n}</small><em>${fmt(L.crema)}${L.next ? ` / ${fmt(L.next.min)}` : ''} crema</em></span><span class="lvl-bar"><i style="width:${L.pct.toFixed(1)}%"></i></span></span></button>`;
            },
            // tapping it: the level, its badge, the crema, what's next, where it came from, every level, how to earn more
            openLevel(name) {
                const m = document.getElementById('level-modal'), body = document.getElementById('level-body');
                if (!m || !body) return;
                const own = name === this.user, c = this.cremaOf(name) || 0, L = this.levelOf(c), fmt = x => Math.round(x).toLocaleString();
                const C = own ? this.cremaFor(name, true) : null;
                const whose = own ? 'Your' : `${this.esc(name)}'s`;
                const parts = C && C.parts.length ? `<div class="lvl-sec"><div class="lvl-cap">Where your crema comes from</div>${C.parts.slice().sort((a, b) => b.pts - a.pts).map(p => `<div class="lvl-line"><span>${this.esc(p.label)}<small> × ${p.n}</small></span><b>${fmt(p.pts)}</b></div>`).join('')}</div>` : '';
                const ladder = `<div class="lvl-sec"><div class="lvl-cap">Levels</div>${this.levelList().map((x, i) => `<div class="lvl-step${i === L.i ? ' on' : ''}${i > L.i ? ' locked' : ''}">${this.levelSvg(i, 30)}<span><b>${this.esc(x.name)}</b><small>Level ${i + 1}</small></span><em>${fmt(x.min)}</em></div>`).join('')}</div>`;
                const how = own ? `<div class="lvl-sec"><div class="lvl-cap">How you earn crema</div>${this.cremaRules().map(r => `<div class="lvl-line"><span>${this.esc(r[1])}${r[3] ? `<small> · ${this.esc(r[3])}</small>` : ''}</span><b>+${r[2]}</b></div>`).join('')}</div>` : '';
                body.innerHTML = `<div class="lvl-hero">${this.levelSvg(L.i, 84)}<div class="lvl-kicker">${whose} level · Level ${L.n}</div><h3>${this.esc(L.name)}</h3><div class="lvl-crema"><b>${fmt(L.crema)}</b> crema</div>${L.next ? `<div class="lvl-bar big"><i style="width:${L.pct.toFixed(1)}%"></i></div><div class="lvl-next">${fmt(L.next.min - L.crema)} more to ${this.esc(L.next.name)} (${fmt(L.next.min)})</div>` : '<div class="lvl-next">The top level. Dialed in.</div>'}</div>${parts}${ladder}${how}`;
                m.classList.add('active');
            },
            closeLevel() { const m = document.getElementById('level-modal'); if (m) m.classList.remove('active'); },

            // ===================== v15.1: report a bug (Settings) =====================
            // What happened in their words, plus the app version, the phone and where they were. It goes to the reviewers
            // (the bell and their phone); without an account it opens an email instead.
            bugContext() {
                const meta = document.querySelector('meta[name="dialed-in-version"]');
                return { version: meta ? meta.getAttribute('content') : '', app: window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? 'iPhone app' : (navigator.standalone ? 'home screen' : 'browser'), device: String(navigator.userAgent || '').slice(0, 220), screen: `${window.innerWidth}×${window.innerHeight}`, theme: document.documentElement.getAttribute('data-theme') || '', where: [this.tab, this.tab === 'profile' ? this.profileSection : this.tab === 'feed' ? this.feedMode && this.feedMode() : ''].filter(Boolean).join(' · '), at: new Date().toISOString() };
            },
            openBugReport() {
                const m = document.getElementById('bug-modal'); if (!m) return;
                document.getElementById('bug-body').innerHTML = `<p class="bug-sub">What went wrong, or what was confusing? A sentence is plenty. We'll add your app version and phone so we can find it.</p><textarea id="bug-text" maxlength="2000" rows="6" placeholder="For example: the timer stopped when I locked my phone."></textarea><button type="button" class="btn-primary bug-send" onclick="app.sendBugReport()">Send</button>`;
                m.classList.add('active');
                setTimeout(() => { const t = document.getElementById('bug-text'); if (t) t.focus(); }, 80);
            },
            closeBugReport() { const m = document.getElementById('bug-modal'); if (m) m.classList.remove('active'); },
            async sendBugReport() {
                const t = document.getElementById('bug-text'), text = String(t && t.value || '').trim();
                if (!text) { this.showToast('Say what happened first.'); return; }
                const ctx = this.bugContext();
                if (!(this.acctOn && this.acctOn()) || !Supa.ready()) {
                    const body = `${text}\n\n— Dialed In ${ctx.version} · ${ctx.app} · ${ctx.screen} · ${ctx.where}\n${ctx.device}`;
                    window.location.href = `mailto:dialedincoffeeapp@gmail.com?subject=${encodeURIComponent('Dialed In bug report')}&body=${encodeURIComponent(body)}`;
                    this.closeBugReport(); return;
                }
                const btn = document.querySelector('#bug-modal .bug-send'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
                try { await Supa.rpc('report_bug', { body: text, context: ctx }); this.closeBugReport(); this.showToast('Thanks. It’s on its way to us.'); }
                catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Send'; } this.showToast(e && /fast/.test(String(e.message)) ? String(e.message) : 'Couldn’t send it. Check your connection and try again.'); }
            },
            // reviewers: what people reported
            async openBugReports() {
                const m = document.getElementById('bugs-modal'); if (!m) return;
                this._bugs = { list: null, error: '' };
                m.classList.add('active'); this.renderBugReports();
                try { const list = await Supa.rpc('review_bugs', { max_items: 60 }); this._bugs.list = Array.isArray(list) ? list : []; }
                catch (e) { this._bugs.error = e && e.message ? e.message : 'Couldn’t load them.'; }
                this.renderBugReports();
            },
            closeBugReports() { const m = document.getElementById('bugs-modal'); if (m) m.classList.remove('active'); },
            renderBugReports() {
                const body = document.getElementById('bugs-body'), st = this._bugs || {};
                if (!body) return;
                if (st.error) { body.innerHTML = `<p class="pp-empty">${this.esc(st.error)}</p>`; return; }
                if (!st.list) { body.innerHTML = this.loadingBlockHtml('pp-empty'); return; }
                if (!st.list.length) { body.innerHTML = '<p class="pp-empty">No bug reports yet.</p>'; return; }
                body.innerHTML = st.list.map(b => { const c = b.context || {}; return `<div class="bug-item${b.status === 'done' ? ' done' : ''}"><div class="bug-head"><b>${this.esc(b.name || 'Someone')}</b><small>${this.esc(this.formatRelativeDate(b.at))}</small></div><div class="bug-text">${this.esc(b.body)}</div><div class="bug-ctx">${this.esc([c.version ? `v${c.version}` : '', c.app, c.screen, c.where].filter(Boolean).join(' · '))}</div><button type="button" class="chip-btn" data-id="${this.esc(b.id)}" data-done="${b.status === 'done' ? '0' : '1'}" onclick="app.markBug(this.getAttribute('data-id'), this.getAttribute('data-done') === '1')">${b.status === 'done' ? 'Reopen' : 'Mark done'}</button></div>`; }).join('');
            },
            async markBug(id, done) {
                try { await Supa.rpc('close_bug', { bug_id: id, done }); const b = (this._bugs.list || []).find(x => String(x.id) === String(id)); if (b) b.status = done ? 'done' : 'open'; this.renderBugReports(); }
                catch (e) { this.showToast('Couldn’t change it. Try again.'); }
            },
