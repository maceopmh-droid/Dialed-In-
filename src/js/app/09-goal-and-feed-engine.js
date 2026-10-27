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

            // v14.6: the group goal and monthly awards count you and your private communities only: never people you
            // just follow, or strangers' sessions loaded for Discover, Everyone or a profile you opened
            // v14.6: each private community has its own goal and awards. Inside withCrewScope(community, ...) everything
            // here counts that community's members only (and its own "counts in group goal" switches)
            crewGroups() {
                if (!(this.acctOn && this.acctOn()) || !this.grState) return [];
                return (this.grState().list || []).filter(g => g && !g.open && Array.isArray(g.members));
            },
            crewScopeOf(g) {
                if (!g) return null;
                return { id: String(g.id), name: String(g.name || ''), since: Date.parse(g.since || '') || 0, names: new Set(g.members.map(x => x.name)), exclude: new Set(g.members.filter(x => x.countsInGoal === false).map(x => String(x.name).toLowerCase())) };
            },
            withCrewScope(g, fn) {
                const was = this._crewScope;
                this._crewScope = this.crewScopeOf(g);
                try { return fn(); } finally { this._crewScope = was; }
            },
            // the private community your profile's awards show: the one picked in Community, or your first
            activeCrewGroup() {
                const list = this.crewGroups();
                if (!list.length) return null;
                const id = this.feedGroupId ? this.feedGroupId() : '';
                return list.find(g => String(g.id) === String(id)) || list[0];
            },

            crewFilter() {
                if (!(this.acctOn && this.acctOn())) return () => true;
                // (v18.6: an "Only me" session counts for nobody: the others' phones can't see it, so goals and awards came
                // out different on each phone)
                if (this._crewScope) { const sc = this._crewScope; return b => sc.names.has(this.getBrewOwner(b)) && b.audience !== 'only_me' && !(this.isCommunity && this.isCommunity('brew', b.id)); }
                const crew = new Set(this.knownPeople());
                return b => crew.has(this.getBrewOwner(b)) && b.audience !== 'only_me' && !(this.isCommunity && this.isCommunity('brew', b.id));
            },
            // v18.6: who's in the crew (likes and comments from anyone else don't count toward its awards and goals)
            crewNames() {
                if (!(this.acctOn && this.acctOn())) return null;
                return this._crewScope ? this._crewScope.names : new Set(this.knownPeople());
            },
            crewSessionsBetween(a, b) { return this.sessionsBetween(a, b).filter(this.crewFilter()); },

            crewPeople(now = Date.now()) {
                const since = now - 56 * 864e5, set = new Set();
                const inCrew = this.crewFilter();
                this.brews.forEach(b => { const t = this.localTime(b.date); if (t >= since && t <= now + 864e5 && inCrew(b)) set.add(this.getBrewOwner(b)); });
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
                    this.adoptColors([...this.peopleState().active.values()]);   // v15.0: the colors on their profiles win
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
                if (this._crewScope) return this._crewScope.exclude.has(String(name || '').toLowerCase());   // v14.6: that community's own switches
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

            // ---- Crew Quest: one shared weekly goal. v14.5: each target is set by pace: what the group usually reaches by
            // Saturday midday (day 5.5 of 7) over the last six weeks, the most recent counting most, scaled to how many
            // people are brewing now. Kept at its usual pace, the group finishes around Friday or Saturday, so it's a
            // challenge most weeks without being out of reach.
            // v15.8: a much bigger set of goals (see goalSpecs / goalPlan in 47-goals.js), paced the same way: each target
            // is what the group usually has by Saturday midday, so at its usual pace it finishes on day 5 or 6.
            crewQuest(now = Date.now(), forceType = '', opts = {}) {
                const start = this.weekStartOf(now), plan = this.goalPlan(start) || (opts.v2 ? { type: 'sessions', prev: '', next: '', idx: 0 } : null), specs = this.goalSpecs();
                const v1 = ['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'];
                if (!plan && !opts.v2 && !(specs[forceType] && !v1.includes(forceType))) return this.crewQuestV1(now, forceType);   // (opts.v2: tests play the new goals back on old weeks)
                const W = 7 * 864e5, PACE = 5.5 * 864e5;
                const end = this.weekStartOf(start + W + 3 * 3600e3);
                const people = this.crewPeople(now);
                const inGoal = b => !this.goalExcluded(this.getBrewOwner(b));
                const weights = [0.30, 0.22, 0.16, 0.13, 0.10, 0.09];
                const past = [];
                for (let i = 1; i <= 6; i++) {
                    const ws = this.weekStartOf(start - i * W + 3 * 3600e3), all = this.crewSessionsBetween(ws, this.weekStartOf(ws + W + 3 * 3600e3)).filter(inGoal);
                    past.push({ w: weights[i - 1], ws, all, early: all.filter(b => this.localTime(b.date) < ws + PACE).sort((a, b) => this.localTime(a.date) - this.localTime(b.date)), active: new Set(all.map(b => this.getBrewOwner(b))).size });
                }
                const recent = new Set([...past[0].all, ...past[1].all].map(b => this.getBrewOwner(b))).size;
                const activeNow = Math.max(1, recent || people.length);
                // weeks with under 40% of the busiest recent week (a trip, a holiday) don't set the pace; then half the
                // six-week pace and half the last two of those weeks, so a group that's picking up isn't done by Wednesday
                const most = Math.max(0, ...past.map(x => x.all.length));
                const busy = past.filter(x => x.all.length && x.all.length >= 0.4 * most);
                const pace = (fn, additive, fallback) => {
                    if (!busy.length) return fallback;
                    const avg = list => { let sum = 0, wsum = 0; list.forEach(x => { const r = Math.max(0.5, Math.min(2, activeNow / Math.max(1, x.active))); sum += x.w * fn(x.early, x.ws, x.ws + PACE) * (additive ? r : Math.sqrt(r)); wsum += x.w; }); return sum / wsum; };
                    return 0.5 * avg(busy) + 0.5 * avg(busy.slice(0, 2));
                };
                const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
                const methodsSeen = new Set(past.flatMap(x => x.all).map(b => b.method).filter(Boolean)).size;
                // a goal's target, and whether the group has been doing that kind of thing lately
                const targetOf = k => {
                    if (k === 'everyone') return { ok: true, target: 0 };
                    const sp = specs[k];
                    const raw = pace((l, a, b) => sp.count(l, a, b).n, sp.add, sp.fb(Math.max(1, people.length)));
                    const max = k === 'methods' ? Math.max(2, Math.min(4, methodsSeen)) : sp.max;
                    const ok = sp.core ? true : k === 'methods' ? methodsSeen >= 2 && raw >= 1.5 : sp.local ? this.anyLocal(people) : raw >= 1.5;
                    return { ok, target: clampInt(raw, sp.min, max) };
                };
                let type = specs[forceType] ? forceType : plan.type, tg = targetOf(type);
                if (!specs[forceType] && !tg.ok) {
                    const core = ['sessions', 'days', 'everyone', 'rated', 'notes'];
                    let i = plan.idx % core.length;
                    for (let n = 0; n < core.length && (core[i] === plan.prev || core[i] === plan.next); n++) i = (i + 1) % core.length;
                    type = core[i]; tg = targetOf(type);
                }
                const cur = this.crewSessionsBetween(start, end).filter(inGoal).sort((a, b) => this.localTime(a.date) - this.localTime(b.date));
                const by = new Map(people.map(p => [p, 0]));
                const credit = name => by.set(name, (by.get(name) || 0) + 1);
                let target = 1, progress = 0, title = '', detail = '', unit = '', per = 0;
                if (type === 'everyone') {
                    per = clampInt(busy.length ? busy.reduce((t, x) => t + x.w * x.early.length / Math.max(1, x.active), 0) / busy.reduce((t, x) => t + x.w, 0) : 1, 1, 5);
                    cur.forEach(b => credit(this.getBrewOwner(b)));
                    target = Math.max(1, people.length); progress = people.filter(p => (by.get(p) || 0) >= per).length;
                    title = per === 1 ? 'Everyone brews at least once' : `Everyone brews ${per}+ times`; unit = 'people there';
                    detail = people.map(p => `${p} ${Math.min(by.get(p) || 0, per)}/${per}`).join(' · ');
                } else {
                    const sp = specs[type], r = sp.count(cur, start, end);
                    target = tg.target; progress = r.n; r.give.forEach(credit);
                    title = sp.title(target); unit = sp.unit; detail = r.labels ? r.labels.join(', ') : '';
                }
                const daysLeft = end > now ? Math.max(0, this.dayNum(end - 1) - this.dayNum(now) + 1) : 0;
                return { type, title, target, progress: Math.min(progress, target), raw: progress, done: progress >= target, unit, detail, start, end, daysLeft, people, per, counts: Object.fromEntries(by), by: [...by.entries()].filter(([, n]) => n > 0) };
            },

            // the goals as they were up to Oct 25, 2026 (six types in turn); past weeks keep these results
            crewQuestV1(now = Date.now(), forceType = '') {
                const W = 7 * 864e5, PACE = 5.5 * 864e5;
                const start = this.weekStartOf(now);
                const end = this.weekStartOf(start + W + 3 * 3600e3);
                const people = this.crewPeople(now);
                const inGoal = b => !this.goalExcluded(this.getBrewOwner(b));
                const weights = [0.30, 0.22, 0.16, 0.13, 0.10, 0.09];
                const past = [];
                for (let i = 1; i <= 6; i++) {
                    const ws = this.weekStartOf(start - i * W + 3 * 3600e3), all = this.crewSessionsBetween(ws, this.weekStartOf(ws + W + 3 * 3600e3)).filter(inGoal);
                    past.push({ w: weights[i - 1], all, early: all.filter(b => this.localTime(b.date) < ws + PACE), active: new Set(all.map(b => this.getBrewOwner(b))).size });
                }
                const recent = new Set([...past[0].all, ...past[1].all].map(b => this.getBrewOwner(b))).size;
                const activeNow = Math.max(1, recent || people.length);
                const busy = past.filter(x => x.all.length);
                const origins = list => new Set(list.map(b => this.originOf(b).toLowerCase()).filter(Boolean)).size;
                const methods = list => new Set(list.map(b => b.method).filter(Boolean)).size;
                // what the group usually has by Saturday midday, scaled to who's brewing now (counts scale with people,
                // variety more slowly)
                const pace = (fn, additive, fallback) => {
                    if (!busy.length) return fallback;
                    let sum = 0, wsum = 0;
                    busy.forEach(x => { const r = Math.max(0.5, Math.min(2, activeNow / Math.max(1, x.active))); sum += x.w * fn(x.early) * (additive ? r : Math.sqrt(r)); wsum += x.w; });
                    return sum / wsum;
                };
                const methodsSeen = methods(past.flatMap(x => x.all));
                const types = ['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'];
                const weekNo = Math.round(start / W);
                const type = types.includes(forceType) ? forceType : types[((weekNo % types.length) + types.length) % types.length];
                const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
                const cur = this.crewSessionsBetween(start, end).filter(inGoal).sort((a, b) => this.localTime(a.date) - this.localTime(b.date));
                const by = new Map(people.map(p => [p, 0]));
                const credit = name => by.set(name, (by.get(name) || 0) + 1);
                let target = 1, progress = 0, title = '', detail = '', unit = '', per = 0;
                if (type === 'sessions') {
                    target = clampInt(pace(l => l.length, true, 2 * people.length), 3, 60); cur.forEach(b => credit(this.getBrewOwner(b))); progress = cur.length;
                    title = `Brew ${target} sessions together`; unit = 'sessions';
                } else if (type === 'origins') {
                    target = clampInt(pace(origins, false, 2), 2, 8);
                    const seen = new Map(); cur.forEach(b => { const o = this.originOf(b); if (o && !seen.has(o.toLowerCase())) { seen.set(o.toLowerCase(), o); credit(this.getBrewOwner(b)); } });
                    progress = seen.size; title = `Taste ${target} different origins`; unit = 'origins';
                    detail = [...seen.values()].join(', ');
                } else if (type === 'rated') {
                    target = clampInt(pace(l => l.filter(b => this.normalizeRating(b.rating) > 0).length, true, people.length + 1), 2, 50); cur.filter(b => this.normalizeRating(b.rating) > 0).forEach(b => credit(this.getBrewOwner(b)));
                    progress = cur.filter(b => this.normalizeRating(b.rating) > 0).length; title = `Rate ${target} sessions`; unit = 'rated';
                } else if (type === 'notes') {
                    target = clampInt(pace(l => l.filter(b => this.extractFlavors(b).length > 0).length, true, people.length), 2, 40); const noted = cur.filter(b => this.extractFlavors(b).length > 0);
                    noted.forEach(b => credit(this.getBrewOwner(b))); progress = noted.length; title = `Log tasting notes on ${target} sessions`; unit = 'with notes';
                } else if (type === 'everyone') {
                    // sessions each brewing person usually has by Saturday midday
                    per = clampInt(busy.length ? busy.reduce((t, x) => t + x.w * x.early.length / Math.max(1, x.active), 0) / busy.reduce((t, x) => t + x.w, 0) : 1, 1, 5);
                    cur.forEach(b => credit(this.getBrewOwner(b)));
                    target = Math.max(1, people.length); progress = people.filter(p => (by.get(p) || 0) >= per).length;
                    title = per === 1 ? 'Everyone brews at least once' : `Everyone brews ${per}+ times`; unit = 'people there';
                    detail = people.map(p => `${p} ${Math.min(by.get(p) || 0, per)}/${per}`).join(' · ');
                } else {
                    target = clampInt(pace(methods, false, 2), 2, Math.max(2, Math.min(4, methodsSeen)));
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
                const since = this._crewScope && this._crewScope.since ? this.weekStartOf(this._crewScope.since) : 0;   // v14.6: a community's goals count from when it was made
                for (let i = 1; i <= 26; i++) {
                    const t = this.weekStartOf(start - i * W + 3 * 3600e3) + 3 * 864e5;
                    if (since && t < since) break;
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

            // v16.8: who gets which part of the bar. Each counted session (or origin, roaster, comment...) is one person's.
            // Past the goal the bar stays full, split by each person's share of everything counted that week; it used to
            // fill person by person and stop at the goal, so whoever came last got no part (the Bookclub's third brewer,
            // 6 of 18 sessions, Oct 24). Up to the goal nothing changes.
            crewSegs(q) {
                if (q.type === 'everyone') return q.people.filter(p => (q.counts[p] || 0) >= q.per).map(p => ({ p, w: 1 / q.target }));
                const all = q.by.reduce((t, [, n]) => t + n, 0), whole = Math.max(q.target, all) || 1;
                return q.by.map(([p, n]) => ({ p, w: n / whole }));
            },
            // the count under the bar: "8 of 12 sessions", and past the goal "18 sessions · goal was 12" (it used to stop at
            // "12 of 12" while the counts by the faces kept going)
            crewCount(q) {
                if (q.type !== 'everyone' && q.raw > q.target) return { n: q.raw, rest: ` ${q.unit} · goal was ${q.target}` };
                return { n: q.progress, rest: ` of ${q.target} ${q.unit}` };
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
                // (v18.6: a canvas's size is its renderer's: setting it back to the markup's 0 x 0 wiped a drawn shape, and one
                // that isn't turning — Reduce Motion — was never drawn again)
                const cv = a.nodeName === 'CANVAS', own = name => cv && (name === 'width' || name === 'height' || name === 'aria-label' || name === 'role' || name === 'style');
                for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(shape && name === 'src') && !own(name)) a.removeAttribute(name);
                for (const { name, value } of [...b.attributes]) {
                    if (photo && (name === 'src' || name === 'data-fallback-index')) continue;
                    if (own(name)) continue;
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
                if (key === 'shot') return this.renderShotPane(brew);   // v16.9: your machine shot's graph
                if (key === 'flavor') return this.renderFlavorPane(brew);
                if (key === 'vs') return this.renderVsPane(brew);
                return this.renderNextPane(brew);
            },

            lazyPanes(brew) {
                const active = this.cardTab(brew);
                return [...(this.hasShotPane && this.hasShotPane(brew) ? ['shot'] : []), 'flavor', 'vs', 'next'].map(k => active === k ? this.paneHtml(brew, k) : `<div class="card-pane pane-block log-wide" data-pane="${k}" data-lazy="${k}"></div>`).join('');
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
                const bar = this.crewBarHtml(q, this.crewSegs(q));
                const count = this.crewCount(q);
                const faces = q.by.map(([p, n]) => `<span class="cq-face" data-profile="${this.esc(p)}"><b data-face="${this.esc(p)}" style="background:${this.esc(this.getUserColor(p))};--ring:${this.esc(this.getUserColor(p))}">${this.esc(this.feedInitial(p))}</b>${n}</span>`).join('');   // v15.8: a ring in their color (a photo hides it), to match their part of the bar
                const left = q.done ? 'Done together' : (q.daysLeft <= 1 ? 'Last day' : `${q.daysLeft} days left`);
                // v15.0: invite people to this community from its goal (its invite link, as in People)
                const sg = this._crewScope && this._crewScope.id !== 'friends' && this.grState ? (this.grState().list || []).find(g => String(g.id) === this._crewScope.id) : null;
                const invite = sg && sg.invite ? `<button type="button" class="cq-invite" data-g="${this.esc(String(sg.id))}" onclick="app.shareCommunity(this.getAttribute('data-g'), event)"><svg class="icon"><use href="#i-share-2"/></svg>Invite</button>` : '';
                return `
                    <section class="feed-card crew-quest${q.done ? ' done' : ''}" aria-label="${this._crewScope ? 'Community goal' : 'Group goal'}">
                        <div class="cq-top"><span class="cq-kicker"><svg class="icon"><use href="#i-target"/></svg>${this._crewScope ? 'Community goal' : 'Group goal'} · this week</span><span class="cq-right"><span class="cq-left">${this.esc(left)}</span>${invite}${q.done && this.storyShareBtn ? this.storyShareBtn(`app.openGoalStory('${app.escJs(this.storyScopeKeep ? this.storyScopeKeep() : '')}')`, 'Share the finished goal as a picture') : ''}</span></div>
                        <div class="cq-title">${this.esc(q.title)}</div>
                        ${bar}
                        <div class="cq-meta"><span><b>${count.n}</b>${this.esc(count.rest)}${q.detail ? ` · ${this.esc(q.detail)}` : ''}</span></div>
                        <div class="cq-foot">${faces || '<span class="cq-empty">First session this week starts the bar.</span>'}${won ? `<span class="cq-won"><svg class="icon"><use href="#i-trophy"/></svg>${won} goal${won === 1 ? '' : 's'} reached together</span>` : ''}</div>
                    </section>`;
            },

