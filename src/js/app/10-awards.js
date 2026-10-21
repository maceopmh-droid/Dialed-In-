            // ---- Crew Party awards
            monthRange(y, m) { return [new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime()]; },

            crewAwards(y, m) {
                const [a, b] = this.monthRange(y, m);
                const list = this.crewSessionsBetween(a, b);
                if (!list.length) return [];
                const owner = x => this.getBrewOwner(x);
                const tally = (fn) => { const t = new Map(); list.forEach(x => { const v = fn(x); if (v) t.set(owner(x), (t.get(owner(x)) || 0) + v); }); return t; };
                const top = (t, min, low = false) => {
                    const rows = [...t.entries()].filter(([, v]) => low ? true : v >= min);
                    if (!rows.length) return null;
                    const best = low ? Math.min(...rows.map(r => r[1])) : Math.max(...rows.map(r => r[1]));
                    const names = rows.filter(r => Math.abs(r[1] - best) < 1e-9).map(r => r[0]).sort();
                    if (names.length > 2) return null;
                    // v12.0: who came closest
                    const others = [...t.entries()].filter(([n, v]) => !names.includes(n) && (low ? Number.isFinite(v) : v > 0));
                    let runner = null;
                    if (others.length) { const rv = low ? Math.min(...others.map(r => r[1])) : Math.max(...others.map(r => r[1])); runner = { names: others.filter(r => Math.abs(r[1] - rv) < 1e-9).map(r => r[0]).sort(), value: rv }; }
                    return { names, value: best, runner };
                };
                const out = [];
                const add = (key, title, icon, color, res, stat, more = {}) => { if (res) out.push({ key, title, icon, color, winners: res.names, value: res.value, stat: stat(res.value), runner: res.runner || null, ...more }); };
                add('early', 'Early Bird', 'i-sun', '#E3AE45', top(tally(x => { const h = this.sessionHour(x); return h !== null && h >= 4 && h < 9 ? 1 : 0; }), 2), v => `${v} sessions before 9 am`);
                add('night', 'Night Owl', 'i-moon', '#6A7FC1', top(tally(x => { const h = this.sessionHour(x); return h !== null && (h >= 21 || h < 4) ? 1 : 0; }), 2), v => `${v} sessions after 9 pm`);
                const grindChanges = new Map(), loyal = new Map(), explore = new Map(), notes = new Map();
                const byPerson = new Map();
                list.forEach(x => { const p = owner(x); if (!byPerson.has(p)) byPerson.set(p, []); byPerson.get(p).push(x); });
                byPerson.forEach((rows, p) => {
                    rows.sort((u, v) => this.localTime(u.date) - this.localTime(v.date));
                    const lastByBean = new Map(), perBean = new Map();
                    let changes = 0;
                    rows.forEach(x => {
                        const key = this.groupKeyOfBrew(x);
                        const g = this.grindText(x.grind);
                        if (g && lastByBean.has(key) && !this.sameGrind(lastByBean.get(key), g)) changes++;
                        if (g) lastByBean.set(key, g);
                        perBean.set(key, (perBean.get(key) || 0) + 1);
                    });
                    grindChanges.set(p, changes);
                    let bestKey = '', bestN = 0; perBean.forEach((n, k) => { if (n > bestN) { bestN = n; bestKey = k; } });
                    loyal.set(p, { n: bestN, key: bestKey });
                    explore.set(p, perBean.size);
                    notes.set(p, new Set(rows.flatMap(x => this.extractFlavors(x).map(n => n.toLowerCase()))).size);
                });
                add('tinker', 'The Tinkerer', 'i-settings', '#4E8F7A', top(grindChanges, 2), v => `${v} grind changes`);
                const loyalT = new Map([...loyal.entries()].map(([p, o]) => [p, o.n]));
                const loyalRes = top(loyalT, 3);
                if (loyalRes) {
                    const o = loyal.get(loyalRes.names[0]);
                    const sample = list.find(x => this.groupKeyOfBrew(x) === o.key);
                    const bean = sample ? this.beans.get(String(sample.beanId)) : null;
                    add('loyal', 'The Loyalist', 'i-repeat', '#B4664F', loyalRes, v => `${v} sessions of ${bean ? this.beanLabel(bean) : 'one coffee'}`);
                }
                add('explorer', 'The Explorer', 'i-compass', '#5F8FDB', top(explore, 2), v => `${v} different coffees`);
                if (y * 12 + m >= 2026 * 12 + 9) add('local', 'Local Legend', 'i-pin', '#6E9C4F', top(tally(x => this.isLocalBrew(x) ? 1 : 0), 2), v => `${v} sessions from local roasters`);   // v15.8: from October 2026 (earlier months keep their awards)
                add('dialed', 'Dialed In', 'i-star', '#36A57F', top(tally(x => this.normalizeRating(x.rating) >= 4.5 ? 1 : 0), 1), v => `${v} shot${v === 1 ? '' : 's'} at 4.5★ or better`);
                const avg = new Map();
                byPerson.forEach((rows, p) => { const r = rows.map(x => this.normalizeRating(x.rating)).filter(v => v > 0); if (r.length >= 3) avg.set(p, r.reduce((s, v) => s + v, 0) / r.length); });
                if (avg.size >= 2) add('critic', 'Toughest Critic', 'i-search', '#8A63C4', top(avg, 0, true), v => `averages ${this.fmtNum(v, 1)}★`);
                const likes = new Map(), comments = new Map();
                list.forEach(x => (Array.isArray(x.likes) ? x.likes : []).forEach(n => { const name = String(n || '').trim(); if (name && name !== owner(x)) likes.set(name, (likes.get(name) || 0) + 1); }));
                const inMonth = ts => { const t = this.localTime(ts); return t >= a && t < b; };
                [...this.brews.values(), ...this.beans.values()].forEach(x => this.normalizeCommentList(x.comments, `aw-${x.id}`, x.date).forEach(c => { if (inMonth(c.timestamp)) comments.set(c.user, (comments.get(c.user) || 0) + 1); }));
                add('hype', 'Hype Man', 'i-heart', '#D9534F', top(likes, 2), v => `${v} likes given`);
                add('chatter', 'Chatterbox', 'i-message-square', '#3F8FB0', top(comments, 2), v => `${v} comments`);
                add('photo', 'Photographer', 'i-camera', '#7D6A58', top(tally(x => x.photo ? 1 : 0), 2), v => `${v} sessions with photos`);
                add('notes', 'Flavor Hunter', 'i-leaf-line', '#A06F98', top(notes, 3), v => `${v} different tasting notes`);
                // ---- v12.0: more awards
                add('workhorse', 'The Workhorse', 'i-coffee', '#8A6240', top(tally(() => 1), 5), v => `${v} sessions`);
                const ratedTop = list.filter(x => this.normalizeRating(x.rating) >= 4);
                if (ratedTop.length) {
                    const likesOf = x => (Array.isArray(x.likes) ? x.likes.length : 0);
                    const bestR = Math.max(...ratedTop.map(x => this.normalizeRating(x.rating)));
                    const tops = ratedTop.filter(x => this.normalizeRating(x.rating) === bestR).sort((u, v) => likesOf(v) - likesOf(u) || this.localTime(u.date) - this.localTime(v.date));
                    const shot = tops[0], shotBean = this.beans.get(String(shot.beanId));
                    add('shot', 'Shot of the Month', 'i-medal', '#C49A2C', { names: [owner(shot)], value: bestR, runner: null }, v => `${this.fmtNum(v)}★ · ${shotBean ? (String(shotBean.name || '').trim() || this.beanLabel(shotBean)) : 'a coffee'}, ${this.shortDate(shot.date)}`, { shotId: String(shot.id) });
                }
                const [pa, pb] = this.monthRange(y, m - 1);
                const prevList = this.crewSessionsBetween(pa, pb);
                const avgOf = rows => { const r = rows.map(x => this.normalizeRating(x.rating)).filter(v => v > 0); return r.length >= 3 ? r.reduce((s, v) => s + v, 0) / r.length : null; };
                const gain = new Map();
                byPerson.forEach((rows, p) => { const nowAvg = avgOf(rows), before = avgOf(prevList.filter(x => owner(x) === p)); if (nowAvg !== null && before !== null && nowAvg - before >= 0.3) gain.set(p, Math.round((nowAvg - before) * 10) / 10); });
                add('improved', 'Most Improved', 'i-trend', '#2E9E6B', top(gain, 0.3), v => `+${this.fmtNum(v, 1)}★ on last month's average`);
                const streak = new Map();
                byPerson.forEach((rows, p) => { const days = [...new Set(rows.map(x => this.dayNum(this.localTime(x.date))))].sort((u, v) => u - v); let best = 0, run = 0, prev = null; days.forEach(d => { run = prev !== null && d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }); streak.set(p, best); });
                add('streak', 'Streak Master', 'i-flame', '#E0663A', top(streak, 3), v => `${v} days in a row`);
                add('weekend', 'Weekend Warrior', 'i-calendar', '#5B7BD5', top(tally(x => { const d = new Date(this.localTime(x.date)).getDay(); return d === 0 || d === 6 ? 1 : 0; }), 3), v => `${v} weekend sessions`);
                const origins = new Map();
                byPerson.forEach((rows, p) => origins.set(p, new Set(rows.map(x => String(this.originOf(x) || '').toLowerCase()).filter(Boolean)).size));
                add('globe', 'Globetrotter', 'i-globe', '#2F8F9D', top(origins, 3), v => `${v} origins`);
                add('fan', 'Fan Favorite', 'i-award', '#D45D8A', top(tally(x => (Array.isArray(x.likes) ? x.likes.filter(n => String(n || '').trim() && String(n).trim() !== owner(x)).length : 0)), 2), v => `${v} likes received`);
                const steady = new Map();
                byPerson.forEach((rows, p) => { const r = rows.filter(x => /espresso/i.test(String(x.method || ''))).map(x => this.num(x.yield) / this.num(x.dose)).filter(v => Number.isFinite(v) && v > 0.5 && v < 6); if (r.length >= 5) { const mu = r.reduce((s, v) => s + v, 0) / r.length; steady.set(p, Math.sqrt(r.reduce((s, v) => s + (v - mu) ** 2, 0) / r.length)); } });
                if (steady.size >= 2) add('metronome', 'The Metronome', 'i-pulse', '#6B6FB5', top(steady, 0, true), v => `steadiest espresso ratio (±${this.fmtNum(Math.max(0.01, v), 2)})`);
                const comeback = new Map(), comebackInfo = new Map();
                byPerson.forEach((rows, p) => { const last = new Map(); rows.forEach(x => { const k = this.groupKeyOfBrew(x), r = this.normalizeRating(x.rating); if (!(r > 0)) return; const before = last.get(k); if (before !== undefined && r >= 4 && r - before >= 1.5 && (!comeback.has(p) || r - before > comeback.get(p))) { comeback.set(p, r - before); comebackInfo.set(p, { from: before, to: r, bean: (bn => bn ? (String(bn.name || '').trim() || this.beanLabel(bn)) : 'a coffee')(this.beans.get(String(x.beanId))) }); } last.set(k, r); }); });
                const cb = top(comeback, 1.5);
                if (cb) { const info = comebackInfo.get(cb.names[0]); add('comeback', 'Comeback Kid', 'i-bolt', '#D9822B', cb, () => `${this.fmtNum(info.from)}★ to ${this.fmtNum(info.to)}★ on ${info.bean}`); }
                const ORDER = ['shot', 'workhorse', 'dialed', 'improved', 'comeback', 'streak', 'early', 'night', 'weekend', 'tinker', 'metronome', 'loyal', 'explorer', 'globe', 'notes', 'critic', 'fan', 'hype', 'chatter', 'photo'];
                out.sort((u, v) => (ORDER.indexOf(u.key) + 1 || 99) - (ORDER.indexOf(v.key) + 1 || 99));

                return out;
            },

            awardMonthKey(d) {
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            },

            awardMonths() {
                // v12.0: this month is always listed (locked until the 1st); finished months with sessions follow
                const now = new Date(), out = [this.awardMonthKey(now)];
                const since = this._crewScope ? this._crewScope.since : 0;   // v14.6: a community's awards start the month it was made
                for (let i = 1; i < 13; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const [a, b] = this.monthRange(d.getFullYear(), d.getMonth()); if (since && b <= since) break; if (this.crewSessionsBetween(a, b).length) out.push(this.awardMonthKey(d)); }
                return out;
            },

            monthLocked(key) {
                const [y, m] = String(key).split('-').map(Number);
                const now = new Date();
                return y > now.getFullYear() || (y === now.getFullYear() && m - 1 >= now.getMonth());
            },

            unlockLabel(date) {
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            },

            daysUntil(date) {
                const now = new Date();
                const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                return Math.max(0, Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - a) / 864e5));
            },

            seenList(store) {
                try { const v = JSON.parse(safeGet(store) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
            },

            markSeen(store, key) {
                const list = this.seenList(store);
                const k = `${this.user || 'anon'}:${key}`;
                if (list.includes(k)) return;
                list.push(k);
                try { safeSet(store, JSON.stringify(list.slice(-60))); } catch (e) {}
            },

            hasSeen(store, key) {
                return this.seenList(store).includes(`${this.user || 'anon'}:${key}`);
            },

            // last month's awards wait sealed until you reveal them
            awardsNeedReveal(key, awards) {
                const now = new Date();
                const prev = this.awardMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
                return key === prev && awards.length > 0 && !this.hasSeen('dialed_awards_revealed', this.awardSeenKey(key));
            },
            // v14.6: revealed once per community
            awardSeenKey(key, gid) {
                const id = gid || (this._crewScope && this._crewScope.id) || '';
                return id ? `${key}@${id}` : key;
            },

            awardStandings(awards) {
                const m = new Map();
                awards.forEach(a => a.winners.forEach(n => m.set(n, (m.get(n) || 0) + 1)));
                return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            },

            // every finished month of the year so far, added up
            awardYearRace(y) {
                const m = new Map();
                let months = 0;
                for (let i = 0; i < 12; i++) {
                    const key = `${y}-${String(i + 1).padStart(2, '0')}`;
                    if (this.monthLocked(key)) break;
                    const aw = this.crewAwardsMemo(y, i);   // v12.7: the frozen months
                    if (aw.length) months++;
                    aw.forEach(a => a.winners.forEach(n => m.set(n, (m.get(n) || 0) + 1)));
                }
                return { months, rows: [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
            },

            awardRivalry(aw, prevAward) {
                // short on purpose: it sits under the stat in a narrow tile
                const parts = [];
                if (prevAward && prevAward.winners.length) parts.push(aw.winners.some(n => prevAward.winners.includes(n)) ? 'Defended' : `Took it from ${prevAward.winners.join(' & ')}`);
                const r = aw.runner;
                if (r && r.names.length && aw.key !== 'shot') {
                    const who = r.names.join(' & ');
                    const isInt = Number.isInteger(aw.value) && Number.isInteger(r.value);
                    const diff = Math.abs(aw.value - r.value);
                    if (isInt && diff === 1) parts.push(`by 1 over ${who}`);
                    else if (isInt) parts.push(`${who} had ${r.value}`);
                    else if (aw.key === 'critic') parts.push(`${who} had ${this.fmtNum(r.value, 1)}★`);
                    else if (diff < 0.15) parts.push(`${who} right behind`);
                    else parts.push(`${who} next`);
                }
                const line = parts.join(' · ');
                return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
            },

            // ---- v12.7: everything as it stood at a moment (the event log replayed up to time t), for finished months
            // v15.0: on the accounts backend the log has only each record's latest version, so a session edited (or
            // re-saved by its owner) after the month closed still counts, as it is now; it used to drop out of that
            // month's awards altogether, which handed September to whoever hadn't touched theirs
            asOfKeeps(e, t) {
                const at = e && e.eventAt ? this.toTime(e.eventAt) : NaN;
                if (!Number.isFinite(at) || at <= t) return true;
                if (!(this.acctOn && this.acctOn()) || !e || (e.type !== 'brew' && e.type !== 'bean')) return false;
                const made = this.toTime(e.date);
                return Number.isFinite(made) && made > 0 && made <= t;
            },

            withStateAsOf(t, fn) {
                const keep = { beans: this.beans, brews: this.brews, gear: this.gearByUser, flavors: this.customFlavors, tombs: this.tombs };
                this.beans = new Map(); this.brews = new Map(); this.gearByUser = new Map(); this.customFlavors = new keep.flavors.constructor(); this.tombs = new Map();
                try {
                    (this.eventLog || []).forEach(e => { if (this.asOfKeeps(e, t)) this.applyEvent(e); });
                    return fn();
                } finally {
                    this.beans = keep.beans; this.brews = keep.brews; this.gearByUser = keep.gear; this.customFlavors = keep.flavors; this.tombs = keep.tombs;
                }
            },

            // a month freezes when it closes; months that closed before the awards existed (v12.0, Oct 8 2026, 7:46 pm
            // Central) freeze at that moment instead, so they stay exactly as everyone first saw them
            awardsCutoff(y, m) { return Math.max(this.monthRange(y, m)[1], Date.parse('2026-10-09T00:46:16Z')); },

            crewAwardsMemo(y, m) {
                const k = `${this._crewScope ? `${this._crewScope.id}:${[...this._crewScope.names].sort().join(',')}` : ''}|${y}-${m}`;   // v14.6: per community (v15.0: and who's in it)
                const cut = this.awardsCutoff(y, m);
                if (Date.now() >= cut) {
                    // v12.7: a finished month: frozen at its close, so later edits can't change the winners
                    const log = this.eventLog || [];
                    let n = 0, last = 0;
                    log.forEach(e => { if (!this.asOfKeeps(e, cut)) return; const at = e && e.eventAt ? this.toTime(e.eventAt) : NaN; n++; if (at > last) last = at; });
                    const stamp = `${n}:${last}`;
                    if (!this._awFrozen) this._awFrozen = new Map();
                    const hit = this._awFrozen.get(k);
                    if (hit && hit.stamp === stamp) return hit.awards;
                    const awards = this.withStateAsOf(cut, () => this.crewAwards(y, m));
                    this._awFrozen.set(k, { stamp, awards });
                    return awards;
                }
                const stamp = `${this.eventLog ? this.eventLog.length : 0}:${this.brews.size}:${this.beans.size}`;
                if (!this._awMemo || this._awMemo.stamp !== stamp) this._awMemo = { stamp, map: new Map() };
                if (!this._awMemo.map.has(k)) this._awMemo.map.set(k, this.crewAwards(y, m));
                return this._awMemo.map.get(k);
            },

            monthName(key, long = true) {
                const [y, m] = key.split('-').map(Number);
                return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'long' });
            },

            awardTilesHtml(awards, compact = false, opts = {}) {
                return awards.map((aw, i) => {
                    const rival = opts.rivalry ? opts.rivalry(aw) : '';
                    return `
                    <div class="aw-tile${compact ? ' compact' : ''}${opts.sealed ? ' sealed' : ''}" style="--ac:${this.esc(aw.color)};--ac-rgb:${this.hexRgb(aw.color)};--i:${i}">
                        <span class="aw-icon"><svg class="icon"><use href="#${this.esc(aw.icon)}"/></svg></span>
                        <div class="aw-body"><div class="aw-title">${this.esc(aw.title)}</div>
                        <div class="aw-win">${opts.sealed ? '<b class="aw-face" style="background:var(--text-faint)">?</b>Sealed' : aw.winners.map(n => `<b class="aw-face" data-face="${this.esc(n)}" style="background:${this.esc(this.getUserColor(n))}">${this.esc(this.feedInitial(n))}</b>${this.esc(n)}`).join('<span class="aw-amp">&amp;</span>')}</div>
                        ${compact ? '' : `<div class="aw-stat">${opts.sealed ? 'Revealed when you tap below' : this.esc(aw.stat)}</div>`}
                        ${rival && !opts.sealed ? `<div class="aw-rival">${this.esc(rival)}</div>` : ''}</div>
                    </div>`;
                }).join('');
            },

            renderCrewAwardsCard() {
                // v14.6: awards belong to a private community (the one picked in Community); on your own there's no one
                // to win against (Discover has the monthly highlights for everyone)
                if (this.acctOn && this.acctOn() && !this._crewScope) {
                    const gr = this.grState ? this.grState() : null;
                    if (gr && !gr.list && !this._grLoading) { this._grLoading = true; this.loadGroups().catch(() => null).finally(() => { this._grLoading = false; if (this.tab === 'profile') this.render(); }); }
                    // v15.1: the circle picked above the card (a community first, if you're in one; then Friends; then Everyone)
                    const c = this.activeCircle ? this.activeCircle() : null;
                    if (!c) return '';
                    if (c.id === 'everyone') return this.renderEveryoneAwardsCard();
                    return this.withCrewScope(c.scope, () => this.renderCrewAwardsCard());
                }
                const months = this.awardMonths();
                if (!this.brews.size) return '';
                if (!months.includes(this.awardsMonth)) {
                    // open on the most recent finished month; this month stays locked
                    this.awardsMonth = months.find(k => !this.monthLocked(k)) || months[0];
                }
                const key = this.awardsMonth;
                const [y, m] = key.split('-').map(Number);
                const name = this.monthName(key, false);
                const picker = `<select class="recap-select" aria-label="Award month" onchange="app.setAwardsMonth(this.value)">${months.map(k => `<option value="${k}"${k === key ? ' selected' : ''}>${this.esc(this.monthName(k))}${this.monthLocked(k) ? ' (locked)' : ''}</option>`).join('')}</select>`;
                const named = this._crewScope && this.tab === 'profile' ? (this._crewScope.id === 'friends' ? 'Friends' : this._crewScope.name) : '';   // v15.1: whose awards (a community's own tab already says)
                // v15.1: the card folds up (just who won); the arrow opens it
                const open = this._awInRow ? true : this.awardsOpen();
                const tog = this._awInRow ? '' : `<button type="button" class="aw-toggle${open ? ' open' : ''}" aria-expanded="${open}" aria-label="${open ? 'Show less' : 'Show all the awards'}" onclick="app.toggleAwards()"><svg class="icon"><use href="#i-chevron-down"/></svg></button>`;
                // the title on one line, whose and how far along under it; the month picker only once it's open
                const head = (sub, share = '') => this._awInRow ? `<div class="aw-month">${picker}${share}</div>` : `<div class="aw-head"><div class="aw-head-t" onclick="app.toggleAwards()"><div class="label">Monthly awards</div><div class="aw-sub">${named ? `${this.esc(named)} · ` : ''}${sub}</div></div>${share}${tog}</div>${open ? `<div class="aw-month">${picker}</div>` : ''}`;
                if (this.monthLocked(key)) {
                    const unlock = new Date(y, m, 1);
                    const days = this.daysUntil(unlock);
                    const ghosts = [['i-sun', '#E3AE45'], ['i-medal', '#C49A2C'], ['i-moon', '#6A7FC1'], ['i-flame', '#E0663A'], ['i-compass', '#5F8FDB'], ['i-star', '#36A57F']]
                        .map(([icon, c]) => `<div class="aw-tile" style="--ac:${c};--ac-rgb:${this.hexRgb(c)}"><span class="aw-icon"><svg class="icon"><use href="#${icon}"/></svg></span><div class="aw-body" style="flex:1"><span class="aw-ghost-bar" style="width:70%"></span><span class="aw-ghost-bar" style="width:45%"></span></div></div>`).join('');
                    if (!open) return `<div class="profile-card crew-awards folded" id="crew-awards">${head(`In progress · unlocks ${this.esc(this.unlockLabel(unlock))}`)}</div>`;
                    return `
                    <div class="profile-card crew-awards" id="crew-awards">
                        ${head(`In progress · unlocks ${this.esc(this.unlockLabel(unlock))}`)}
                        <div class="aw-locked">
                            <div class="aw-grid aw-ghost" aria-hidden="true">${ghosts}</div>
                            <div class="aw-lock-card">
                                <span class="aw-lock-icon"><svg class="icon"><use href="#i-lock"/></svg></span>
                                <div class="aw-lock-title">Come back ${this.esc(this.unlockLabel(unlock))}</div>
                                <div class="aw-lock-sub">${this.esc(name)}'s awards are still up for grabs. Winners are revealed on the 1st.</div>
                                <div class="aw-lock-count">${days <= 1 ? 'Tomorrow' : `${days} days to go`}</div>
                            </div>
                        </div>
                    </div>`;
                }
                const awards = this.crewAwardsMemo(y, m - 1);
                if (!awards.length) return `<div class="profile-card crew-awards" id="crew-awards">${head('Final · from everyone\'s sessions')}<div class="panel-empty">Not enough sessions in ${this.esc(name)} for awards.</div></div>`;
                if (this.awardsNeedReveal(key, awards)) {
                    return `
                    <div class="profile-card crew-awards" id="crew-awards">
                        ${head('Final · ready to reveal')}
                        ${open ? `<div class="aw-grid">${this.awardTilesHtml(awards, false, { sealed: true })}</div>` : ''}
                        <button type="button" class="btn-primary aw-reveal-btn" onclick="app.revealAwards('${app.escJs(key)}', '${app.escJs(this._crewScope ? this._crewScope.id : '')}')">Reveal ${this.esc(name)}'s awards</button>
                    </div>`;
                }
                const prevD = new Date(y, m - 2, 1);
                const prevAwards = this.crewAwardsMemo(prevD.getFullYear(), prevD.getMonth());
                const prevBy = new Map(prevAwards.map(a => [a.key, a]));
                const standings = this.awardStandings(awards);
                const topN = standings.length ? standings[0][1] : 0;
                const champs = standings.filter(r => r[1] === topN).map(r => r[0]);
                const face = n => `<b class="aw-face" data-face="${this.esc(n)}" style="background:${this.esc(this.getUserColor(n))}">${this.esc(this.feedInitial(n))}</b>`;
                const champ = standings.length ? `
                        <div class="aw-champ">
                            <span class="aw-crown"><svg class="icon"><use href="#i-crown"/></svg></span>
                            <div class="aw-champ-body"><div class="aw-champ-title">${champs.length === 1 ? `${this.esc(champs[0])} takes ${this.esc(name)}` : `${this.esc(champs.join(' & '))} share ${this.esc(name)}`}</div>
                            <div class="aw-champ-sub">${standings.map(([n, c]) => `<span>${face(n)}${this.esc(n)} ${c}</span>`).join('')}</div></div>
                        </div>` : '';
                const race = this.awardYearRace(y);
                const raceHtml = race.months >= 2 && race.rows.length ? `<div class="aw-race"><span class="aw-race-label">${y} award race</span>${race.rows.map(([n, c]) => `<span>${face(n)}${this.esc(n)} ${c}</span>`).join('')}</div>` : '';
                const R = this._awReveal;
                const revealT = R && R.key === key ? Date.now() - R.at : -1;
                const revealing = revealT >= 0 && revealT < awards.length * 150 + 1200 && this.motionOK();
                return `
                    <div class="profile-card crew-awards${revealing ? ' revealing' : ''}${open ? '' : ' folded'}" id="crew-awards" style="--n:${awards.length}${revealing ? `;--aw-at:${-revealT}ms` : ''}">
                        ${head(`Final · ${awards.length} award${awards.length === 1 ? '' : 's'}`, this.storyShareBtn ? this.storyShareBtn('app.openAwardsStory()', 'Share these awards as a picture') : '')}
                        ${champ}
                        ${open ? `<div class="aw-grid">${this.awardTilesHtml(awards, false, { rivalry: aw => this.awardRivalry(aw, prevBy.get(aw.key)) })}</div>${raceHtml}` : ''}
                    </div>`;
            },

            setAwardsMonth(key) { this.awardsMonth = key; this.render(); },

            revealAwards(key, gid) {
                const g = gid ? null : this.activeCrewGroup && this.activeCrewGroup();
                this.markSeen('dialed_awards_revealed', this.awardSeenKey(key, gid || (g ? String(g.id) : '')));
                this.awardsMonth = key;
                this._awOpen = true; safeSet('dialed_awards_open', '1');   // v15.1: the reveal opens the card
                this._awReveal = { key, at: Date.now() };
                this.render();
            },

            renderAwardsTeaser() {
                const now = new Date();
                if (now.getDate() > 4) return '';
                const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                if (this._crewScope && this._crewScope.since && this.monthRange(prev.getFullYear(), prev.getMonth())[1] <= this._crewScope.since) return '';   // (the community didn't exist yet)
                const awards = this.crewAwardsMemo(prev.getFullYear(), prev.getMonth());
                if (awards.length < 2) return '';
                const key = this.awardMonthKey(prev);
                const name = this.monthName(key, false);
                if (this.awardsNeedReveal(key, awards)) {
                    return `
                    <section class="feed-card aw-teaser sealed" onclick="app.openAwards('${app.escJs(key)}', true, '${app.escJs(this._crewScope ? this._crewScope.id : '')}')" role="button" tabindex="0">
                        <div class="cq-top"><span class="cq-kicker"><svg class="icon"><use href="#i-trophy"/></svg>${this.esc(name)}'s awards are in</span><span class="cq-left">Tap to reveal ›</span></div>
                        <div class="aw-teaser-icons">${awards.slice(0, 9).map(a => `<span class="aw-icon" style="--ac:${this.esc(a.color)}"><svg class="icon"><use href="#${this.esc(a.icon)}"/></svg></span>`).join('')}<span class="aw-teaser-count">${awards.length} awards waiting</span></div>
                    </section>`;
                }
                return `
                    <section class="feed-card aw-teaser" onclick="app.openAwards('${app.escJs(key)}', false, '${app.escJs(this._crewScope ? this._crewScope.id : '')}')" role="button" tabindex="0">
                        <div class="cq-top"><span class="cq-kicker"><svg class="icon"><use href="#i-trophy"/></svg>${this.esc(name)}'s awards are in</span><span class="cq-left">See all ›</span></div>
                        <div class="aw-grid compact">${this.awardTilesHtml(awards.slice(0, 4), true)}</div>
                    </section>`;
            },

            openAwards(key, reveal = false, gid = '') {
                if (gid && gid !== 'friends') { this._feedGroup = String(gid); safeSet('dialed_feed_group', this._feedGroup); }   // v14.6: that community's awards (v15.0: not your friends' ones)
                if (gid && this.setCircle) { this._circle = gid === 'friends' ? 'friends' : 'g:' + gid; safeSet('dialed_circle', this._circle); }   // v15.1
                this._awOpen = true; safeSet('dialed_awards_open', '1');
                this.awardsMonth = key;
                this.profileSection = 'activity';
                this._noRecapJump = true;
                this.setTab('profile');
                this._noRecapJump = false;
                if (reveal) this.revealAwards(key, gid);
                setTimeout(() => { const el = document.getElementById('crew-awards'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
            },

