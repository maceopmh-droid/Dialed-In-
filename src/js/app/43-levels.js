            // ===================== v15.1: crema and levels =====================
            // Crema is Dialed In's points: for brewing, trying new coffees, roasters, origins and methods, commenting,
            // likes, achievements, community goals and monthly awards. Twelve levels go from a Seed to Dialed In. Your own
            // app adds up your crema from everything it has and saves the total (set_crema), so everyone sees the same
            // level beside your name; for someone who hasn't opened this version yet, it's estimated from what's here.
            // seventeen levels along coffee's road, farm to cup; the badge's color is its tier (bronze, silver, gold,
            // platinum, then the top: Dialed In), so a higher level reads at a glance; dots under the picture count within a tier
            levelTiers() {
                return [
                    { name: 'Bronze', from: '#D9A06B', to: '#8C532C', ink: '#FFFFFF' },
                    { name: 'Silver', from: '#F3F5F8', to: '#A2ABB7', ink: '#38404B' },
                    { name: 'Gold', from: '#FCE28C', to: '#CB9524', ink: '#5B3B06' },
                    { name: 'Platinum', from: '#C6F3F2', to: '#3E9AA9', ink: '#0E3B44' },
                    { name: 'The top', from: '#3FA06C', to: '#195638', ink: '#FFFFFF', ring: '#F2C94C' },
                ];
            },
            levelList() {
                return this._levels || (this._levels = [
                    { name: 'Seed', min: 0, t: 0, at: '2.68 2.68', s: 0.776, g: '<ellipse cx="12" cy="12" rx="4.4" ry="6.4" transform="rotate(25 12 12)"/><path d="M13.1 6.4c-1.2 3.6-1.3 7.4-.9 11.2" transform="rotate(25 12 12)"/>' },
                    { name: 'Seedling', min: 100, t: 0, at: '2.12 2.20', s: 0.800, g: '<path d="M12 19.5V11"/><path d="M12 11c0-3.6 2.4-6 6.3-6 0 3.7-2.5 6-6.3 6Z"/><path d="M12 13.2c0-3-2.1-5-5.6-5 0 3.2 2.2 5 5.6 5Z"/>' },
                    { name: 'Coffee Bush', min: 250, t: 0, at: '2.95 2.95', s: 0.734, g: '<path d="M12 20.5v-5"/><path d="M8.3 15.5a3.8 3.8 0 0 1-1.6-7.2 5 5 0 0 1 9.6-.9 3.8 3.8 0 0 1-.6 8.1Z"/><circle cx="10" cy="11" r="1" fill="currentColor"/><circle cx="14" cy="12.3" r="1" fill="currentColor"/>' },
                    { name: 'Cherry', min: 450, t: 0, at: '2.40 2.92', s: 0.800, g: '<circle cx="8.4" cy="15" r="3.4"/><circle cx="15.6" cy="15" r="3.4"/><path d="M8.4 11.6c.5-3.8 2.5-6.3 5.8-7.3M15.6 11.6c-.3-3-.7-5.4-1.4-7.3"/>' },
                    { name: 'Processed', min: 700, t: 1, at: '2.40 2.40', s: 0.800, g: '<circle cx="12" cy="12" r="7.2"/><ellipse cx="10" cy="12" rx="1.7" ry="3.6"/><ellipse cx="14" cy="12" rx="1.7" ry="3.6"/>' },
                    { name: 'Green Bean', min: 1000, t: 1, at: '4.09 4.09', s: 0.660, g: '<ellipse cx="12" cy="12" rx="5.2" ry="7.6" transform="rotate(35 12 12)"/><path d="M15.2 6.3c-2.2 1.3-2.1 3.6-3.4 4.9s-3.5 1.5-4.4 4.6"/>' },
                    { name: 'First Crack', min: 1400, t: 1, at: '4.18 4.22', s: 0.654, g: '<ellipse cx="11" cy="13" rx="4.6" ry="6.8" transform="rotate(35 11 13)"/><path d="M13.9 8.2l-2 2.4 1.5 1.3-2.8 2 1.1 1.4-3 2.2"/><path d="M17.6 6.4l1.6-1.6M18.4 9.6h2.2M15.4 4.4V2.6"/>' },
                    { name: 'Light Roast', min: 1900, t: 1, at: '3.64 3.46', s: 0.697, g: '<ellipse cx="12" cy="14.6" rx="3.6" ry="5.2" transform="rotate(35 12 14.6)"/><path d="M14.2 10.8c-1.6.9-1.5 2.6-2.5 3.6s-2.6 1.1-3.2 3.3"/><path d="M12 3.6c-.7 1 .7 1.8 0 2.9"/>' },
                    { name: 'Medium Roast', min: 2500, t: 2, at: '3.64 3.46', s: 0.697, g: '<ellipse cx="12" cy="14.6" rx="3.6" ry="5.2" transform="rotate(35 12 14.6)"/><path d="M14.2 10.8c-1.6.9-1.5 2.6-2.5 3.6s-2.6 1.1-3.2 3.3"/><path d="M10 3.6c-.7 1 .7 1.8 0 2.9M14 3.6c-.7 1 .7 1.8 0 2.9"/>' },
                    { name: 'Dark Roast', min: 3200, t: 2, at: '3.64 3.46', s: 0.697, g: '<ellipse cx="12" cy="14.6" rx="3.6" ry="5.2" transform="rotate(35 12 14.6)" fill="currentColor"/><path d="M8 3.6c-.7 1 .7 1.8 0 2.9M12 3.6c-.7 1 .7 1.8 0 2.9M16 3.6c-.7 1 .7 1.8 0 2.9"/>' },
                    { name: 'Ground', min: 4000, t: 2, at: '2.24 3.06', s: 0.739, g: '<path d="M8.4 4h7.2l-.9 3.6H9.3Z"/><path d="M7.2 7.6h9.6v2.6a4.8 4.8 0 0 1-9.6 0Z"/><path d="M9.2 15h5.6l1 5.2H8.2Z"/><path d="M16.8 8.6h2.4"/>' },
                    { name: 'Bloom', min: 5000, t: 2, at: '2.93 2.56', s: 0.756, g: '<path d="M5.2 4.6h13.6l-3.6 7.2H8.8Z"/><path d="M7.2 11.8h9.6"/><path d="M8 14.8h8v2.4a3.2 3.2 0 0 1-3.2 3.2h-1.6A3.2 3.2 0 0 1 8 17.2Z"/>' },
                    { name: 'Extracted', min: 6200, t: 3, at: '2.87 3.41', s: 0.716, g: '<path d="M6.8 11.6h9.6v2.6a4.8 4.8 0 0 1-9.6 0Z"/><path d="M16.4 12.6h1a2.1 2.1 0 0 1 0 4.2h-1.3"/><path d="M10.2 3.6v4.8M13 3.6v4.8"/><path d="M6 20.4h11.2"/>' },
                    { name: 'Golden Cup', min: 7600, t: 3, at: '3.16 4.46', s: 0.670, g: '<path d="M12 2.2l1.15 2.3 2.55.37-1.85 1.8.44 2.53L12 8l-2.29 1.2.44-2.53-1.85-1.8 2.55-.37Z" fill="currentColor" stroke-width="1"/><path d="M6.2 11.4h10.6v3.6a5.3 5.3 0 0 1-10.6 0Z"/><path d="M16.8 12.4h1.1a2.3 2.3 0 0 1 0 4.6h-1.3"/>' },
                    { name: 'Q Grader', min: 9200, t: 3, at: '3.37 3.37', s: 0.767, g: '<ellipse cx="9" cy="9" rx="4.4" ry="3.4" transform="rotate(-45 9 9)" fill="currentColor"/><path d="M12 12l7 7"/>' },
                    { name: 'Cup of Excellence', min: 11000, t: 3, at: '2.51 2.43', s: 0.791, g: '<path d="M7.6 4.6h8.8v4.6a4.4 4.4 0 0 1-8.8 0Z"/><path d="M7.6 6.2H5a2.6 2.6 0 0 0 2.8 3.2M16.4 6.2H19a2.6 2.6 0 0 1-2.8 3.2"/><path d="M12 13.6v3.4M8.8 19.6h6.4M9.8 17h4.4"/>' },
                    { name: 'Dialed In', min: 13500, t: 4, at: '2.62 2.43', s: 0.782, g: '<path d="M4.4 15.4a7.6 7.6 0 0 1 15.2 0"/><path d="M12 15.4l3.8-4.6"/><circle cx="12" cy="15.4" r="1.3" fill="currentColor"/><path d="M6.6 10.2l1.1.9M12 7.8v1.4M17.4 10.2l-1.1.9"/>' },
                ]);
            },
            levelOf(crema) {
                const list = this.levelList(), c = Math.max(0, Number(crema) || 0);
                let i = 0; while (i + 1 < list.length && c >= list[i + 1].min) i++;
                const next = list[i + 1] || null;
                return { i, n: i + 1, ...list[i], crema: c, next, pct: next ? Math.min(100, (c - list[i].min) / (next.min - list[i].min) * 100) : 100 };
            },
            levelSvg(i, size = 24) {
                const L = this.levelList()[i], T = this.levelTiers()[L.t], id = `lvg${i}-${(this._lvgN = (this._lvgN || 0) + 1)}`;
                const inTier = this.levelList().filter(x => x.t === L.t), pos = inTier.indexOf(L) + 1;
                const pips = size >= 28 && inTier.length > 1 ? Array.from({ length: pos }, (_, k) => `<circle cx="${(12 - (pos - 1) * 1.15 + k * 2.3).toFixed(2)}" cy="20.6" r=".78" fill="${T.ink}" fill-opacity=".85"/>`).join('') : '';
                return `<svg class="lvl-badge" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.from}"/><stop offset="1" stop-color="${T.to}"/></linearGradient></defs><circle cx="12" cy="12" r="12" fill="url(#${id})"/><circle cx="12" cy="12" r="11.35" fill="none" stroke="${T.ring || 'rgba(0,0,0,.16)'}" stroke-width="${T.ring ? 1.3 : .9}"/><g transform="translate(${L.at}) scale(${L.s})" fill="none" stroke="${T.ink}" color="${T.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${L.g}</g>${pips}</svg>`;
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
                return `<button type="button" class="lvl-row" data-name="${this.esc(user)}" onclick="app.openLevel(this.getAttribute('data-name'))" aria-label="Level ${L.n}, ${this.esc(L.name)}. ${fmt(L.crema)} crema">${this.levelSvg(L.i, 34)}<span class="lvl-main"><span class="lvl-top"><b>${this.esc(L.name)}</b><em>Level ${L.n}</em></span><span class="lvl-bar"><i style="width:${L.pct.toFixed(1)}%"></i></span><small class="lvl-count">${fmt(L.crema)}${L.next ? ` / ${fmt(L.next.min)}` : ''} crema${L.next ? ` · ${fmt(L.next.min - L.crema)} to ${this.esc(L.next.name)}` : ''}</small></span></button>`;
            },
            // tapping it: the level, its badge, the crema, what's next, every level (by tier), and how to earn more
            openLevel(name) {
                const m = document.getElementById('level-modal'), body = document.getElementById('level-body');
                if (!m || !body) return;
                const own = name === this.user, c = this.cremaOf(name) || 0, L = this.levelOf(c), fmt = x => Math.round(x).toLocaleString();
                const whose = own ? 'Your' : `${this.esc(name)}'s`;
                const tiers = this.levelTiers(), list = this.levelList();
                const ladder = `<div class="lvl-sec"><div class="lvl-cap">Levels</div>${tiers.map((T, t) => `<div class="lvl-tier">${this.esc(T.name)}</div>${list.map((x, i) => x.t !== t ? '' : `<div class="lvl-step${i === L.i ? ' on' : ''}${i > L.i ? ' locked' : ''}">${this.levelSvg(i, 32)}<span><b>${this.esc(x.name)}</b><small>Level ${i + 1}</small></span><em>${fmt(x.min)}</em></div>`).join('')}`).join('')}</div>`;
                const how = `<div class="lvl-sec"><div class="lvl-cap">How to earn crema</div>${this.cremaRules().map(r => `<div class="lvl-line"><span>${this.esc(r[1])}${r[3] ? `<small> · ${this.esc(r[3])}</small>` : ''}</span><b>+${r[2]}</b></div>`).join('')}</div>`;
                body.innerHTML = `<div class="lvl-hero">${this.levelSvg(L.i, 84)}<div class="lvl-kicker">${whose} level · Level ${L.n}</div><h3>${this.esc(L.name)}</h3><div class="lvl-crema"><b>${fmt(L.crema)}</b> crema</div>${L.next ? `<div class="lvl-bar big"><i style="width:${L.pct.toFixed(1)}%"></i></div><div class="lvl-next">${fmt(L.next.min - L.crema)} more to ${this.esc(L.next.name)} (${fmt(L.next.min)})</div>` : '<div class="lvl-next">The top level. Dialed in.</div>'}</div>${ladder}${how}`;
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

            // ---- v15.1: search in the header on a phone (Coffees and Roasters): the search button opens a field where the
            // title was, the same height; the x closes it and clears the search
            openTopSearch() {
                document.body.classList.add('search-open');
                this.closeMobileControls();
                const t = document.getElementById('search-input-top');
                if (t) setTimeout(() => t.focus(), 30);
            },
            closeTopSearch() {
                document.body.classList.remove('search-open');
                const t = document.getElementById('search-input-top'); if (t) { t.value = ''; t.blur(); }
                this.syncSearch('', 'top');
            },

            // ---- v15.1: roast dates belong to bags, so to sessions: each one keeps the roast date of the bag it came from
            // (the log form fills in your last one on that coffee; change it when you open a new bag)
            bagRoastDate(key = this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) : '', user = this.user) {
                if (!key) return '';
                const mine = this.brewsOf(user).filter(b => b.roastDate && this.groupKeyOfBrew(b) === key).sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                if (mine.length) return String(mine[0].roastDate).slice(0, 10);
                const bean = [...this.beans.values()].find(b => b.user === user && b.roastDate && this.beanGroupKey(b) === key);
                return bean ? String(bean.roastDate).slice(0, 10) : '';
            },
            roastDays(roastDate, when) {
                const r = this.parseLocalDate(String(roastDate || '').slice(0, 10)); if (!r) return null;
                const d = this.parseLocalDate(this.dayKey(when ? this.localTime(when) : Date.now()));
                const n = Math.floor((d - r) / 864e5);
                return n >= 0 && n < 400 ? n : null;
            },
            roastDayLabel(brew) {
                const n = brew ? this.roastDays(brew.roastDate, brew.date) : null;
                return n === null ? [] : [n === 0 ? 'Roasted that day' : `Day ${n} off roast`];
            },
            paintRoastDays(when) {
                const f = this.getBrewForm(), el = document.getElementById('roast-days');
                if (!el || !f || !f.roastDate) return;
                const n = this.roastDays(f.roastDate.value, when);
                el.textContent = n === null ? '' : n === 0 ? '· roasted today' : `· day ${n} off roast`;
            },
