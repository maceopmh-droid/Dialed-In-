            // ===================== v15.8: local roasters and a bigger set of group goals =====================
            // A session is local when the person who brewed it ticked "Local to me" on that coffee's roaster, from the day
            // they ticked it on (so it rewards buying local from then, not a big jump for the past). It counts toward the
            // Go local goal, the Local Legend award, the Local Regular achievement and a little crema.
            isLocalBrew(b) {
                if (!b || !this.roasterData) return false;
                const bean = this.beans.get(String(b.beanId || ''));
                if (!bean || !String(bean.roaster || '').trim()) return false;
                const D = this.roasterData(), r = D.byKey.get(D.keyOfBean(bean));
                const since = r && r.localSince ? r.localSince[this.getBrewOwner(b)] : undefined;
                if (since === undefined) return false;
                const day = new Date(since); day.setHours(0, 0, 0, 0);
                return !(this.localTime(b.date) < day.getTime());
            },

            anyLocal(people) {
                if (!this.roasterData) return false;
                return this.roasterData().roasters.some(r => (r.localBy || []).some(u => !people || people.includes(u)));
            },

            // each person's sessions in order, for "beat your last rating" and "a coffee you hadn't brewed"
            goalHist() {
                const sig = `${this._dataRev || 0}|${this.brews.size}`;
                if (this._goalHist && this._goalHistSig === sig) return this._goalHist;
                const byOwner = new Map();
                this.brews.forEach(b => { const o = this.getBrewOwner(b); if (!byOwner.has(o)) byOwner.set(o, []); byOwner.get(o).push(b); });
                const prevRated = new Map(), first = new Set();
                byOwner.forEach(list => {
                    list.sort((a, b) => this.localTime(a.date) - this.localTime(b.date) || (String(a.id) < String(b.id) ? -1 : 1));
                    const lastRated = new Map(), seenCoffee = new Set();
                    list.forEach(b => {
                        const k = `${this.groupKeyOfBrew(b)}|${b.method || ''}`, ck = this.groupKeyOfBrew(b);
                        if (lastRated.has(k)) prevRated.set(String(b.id), lastRated.get(k));
                        if (this.normalizeRating(b.rating) > 0) lastRated.set(k, b);
                        if (!seenCoffee.has(ck)) { seenCoffee.add(ck); first.add(String(b.id)); }
                    });
                });
                this._goalHistSig = sig; this._goalHist = { prevRated, first };
                return this._goalHist;
            },

            // every goal: how it counts (sessions in a window -> a number and who brewed toward it), its range and words.
            // core goals can always run; the others only when the group did that kind of thing in recent weeks.
            goalSpecs() {
                const rate = b => this.normalizeRating(b.rating), own = b => this.getBrewOwner(b);
                const each = test => list => { const give = []; list.forEach(b => { if (test(b)) give.push(own(b)); }); return { n: give.length, give }; };
                const distinct = keyOf => list => { const seen = new Map(), give = []; list.forEach(b => { const k = keyOf(b); if (k && !seen.has(k[0])) { seen.set(k[0], k[1]); give.push(own(b)); } }); return { n: seen.size, give, labels: [...seen.values()] }; };
                const D = () => this.roasterData();
                const hist = () => this.goalHist();
                return {
                    sessions: { core: true, add: true, min: 3, max: 60, fb: p => 2 * p, title: t => `Brew ${t} sessions together`, unit: 'sessions', count: each(() => true) },
                    days: { core: true, add: true, min: 3, max: 49, fb: p => 2 * p, title: t => `${t} brewing days between you`, unit: 'brewing days',
                        count: list => { const seen = new Set(), give = []; list.forEach(b => { const k = `${own(b)}|${this.dayNum(this.localTime(b.date))}`; if (!seen.has(k)) { seen.add(k); give.push(own(b)); } }); return { n: seen.size, give }; } },
                    everyone: { core: true },
                    rated: { core: true, add: true, min: 2, max: 50, fb: p => p + 1, title: t => `Rate ${t} sessions`, unit: 'rated', count: each(b => rate(b) > 0) },
                    notes: { core: true, add: true, min: 2, max: 40, fb: p => p, title: t => `Log tasting notes on ${t} sessions`, unit: 'with notes', count: each(b => this.extractFlavors(b).length > 0) },
                    high: { add: true, min: 2, max: 20, fb: () => 2, title: t => `Chase the 4.5★: ${t} sessions at 4.5★ or better`, unit: 'at 4.5★+', count: each(b => rate(b) >= 4.5) },
                    levelup: { add: true, min: 2, max: 15, fb: () => 2, title: t => `Level up: beat your last rating on a coffee ${t} times`, unit: 'better than last time',
                        count: each(b => { const p = hist().prevRated.get(String(b.id)); return !!p && rate(b) > rate(p); }) },
                    origins: { add: false, min: 2, max: 8, fb: () => 2, title: t => `Taste ${t} different origins`, unit: 'origins', count: distinct(b => { const o = this.originOf(b); return o ? [o.toLowerCase(), o] : null; }) },
                    roasters: { add: false, min: 2, max: 8, fb: () => 2, title: t => `Roaster tour: ${t} different roasters`, unit: 'roasters',
                        count: distinct(b => { const bean = this.beans.get(String(b.beanId || '')); if (!bean || !String(bean.roaster || '').trim()) return null; const d = D(), k = d.keyOfBean(bean), r = d.byKey.get(k); return [k, r ? r.name : String(bean.roaster).trim()]; }) },
                    methods: { add: false, min: 2, max: 4, fb: () => 2, title: t => `Brew with ${t} different methods`, unit: 'methods', count: distinct(b => b.method ? [b.method, b.method] : null) },
                    newcoffee: { add: true, min: 2, max: 12, fb: () => 2, title: t => `Open something new: ${t} coffees you haven't brewed before`, unit: 'new coffees', count: each(b => hist().first.has(String(b.id))) },
                    comments: { add: true, min: 3, max: 60, fb: p => 2 * p, title: t => `Hype squad: ${t} comments on each other's sessions`, unit: 'comments', window: true,
                        count: (list, a, b) => {
                            const inCrew = this.crewFilter(), give = [];
                            this.brews.forEach(x => {
                                if (!inCrew(x)) return;
                                (Array.isArray(x.comments) ? x.comments : []).forEach(c => {
                                    const who = c && String(c.user || ''), t = c ? this.toTime(c.timestamp) : 0;
                                    if (!who || who === own(x) || this.goalExcluded(who) || !(t >= a && t < b)) return;
                                    give.push(who);
                                });
                            });
                            return { n: give.length, give };
                        } },
                    photos: { add: true, min: 2, max: 30, fb: () => 2, title: t => `Show the cup: ${t} sessions with a photo`, unit: 'with a photo', count: each(b => !!String(b.photo || '').trim()) },
                    early: { add: true, min: 2, max: 30, fb: () => 2, title: t => `Early birds: ${t} sessions before 9 am`, unit: 'before 9 am', count: each(b => { const h = this.sessionHour(b); return h !== null && h >= 4 && h < 9; }) },
                    fresh: { add: true, min: 2, max: 40, fb: () => 2, title: t => `Fresh roast: ${t} sessions within 3 weeks of roasting`, unit: 'fresh',
                        count: each(b => { const bean = this.beans.get(String(b.beanId || '')); const r = bean && bean.roastDate ? this.localTime(bean.roastDate) : NaN; if (!Number.isFinite(r)) return false; const d = (this.localTime(b.date) - r) / 864e5; return d >= -0.5 && d <= 21; }) },
                    swap: { add: true, min: 2, max: 30, fb: () => 2, title: t => `Brew what your friends brew: ${t} sessions of a coffee someone else had this week`, unit: 'shared coffees',
                        count: list => { const by = new Map(); list.forEach(b => { const k = this.groupKeyOfBrew(b); if (!by.has(k)) by.set(k, new Set()); by.get(k).add(own(b)); }); return each(b => by.get(this.groupKeyOfBrew(b)).size > 1)(list); } },
                    local: { add: true, min: 2, max: 30, fb: p => Math.max(2, p), title: t => `Go local: ${t} sessions from your local roasters`, unit: 'local', local: true, count: each(b => this.isLocalBrew(b)) },
                };
            },

            // v15.8: from the week of Oct 26, 2026 every week draws its goal from the whole set: each run through the set is
            // shuffled (the same order on every phone), and a goal the group hasn't done lately is swapped for a core one.
            // Weeks before keep the six goals they had, so past results don't change.
            goalPlan(start) {
                const W = 7 * 864e5, from = this.weekStartOf(new Date(2026, 9, 26, 12).getTime());
                if (start < from) return null;
                const keys = ['sessions', 'local', 'roasters', 'high', 'days', 'comments', 'origins', 'levelup', 'everyone', 'photos', 'newcoffee', 'early', 'rated', 'swap', 'methods', 'fresh', 'notes'];
                const L = keys.length, idx = Math.round((start - from) / W), cyc = Math.floor(idx / L), pos = idx % L;
                let salt = 0; String(this._crewScope ? this._crewScope.id : '').split('').forEach(ch => { salt = (salt * 31 + ch.charCodeAt(0)) >>> 0; });
                const order = c => {
                    let x = ((c + 1) * 2654435761 ^ salt) >>> 0;
                    const rnd = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
                    const a = keys.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
                    if (c === 0) { ['local', 'roasters'].forEach(k => { a.splice(a.indexOf(k), 1); a.unshift(k); }); }   // the first two weeks: a roaster tour, then Go local
                    return a;
                };
                const seq = order(cyc), before = cyc > 0 ? order(cyc - 1) : null, after = order(cyc + 1);
                if (before && seq[0] === before[L - 1]) [seq[0], seq[1]] = [seq[1], seq[0]];   // a new run never repeats last week's goal
                const prev = pos ? seq[pos - 1] : (before ? before[L - 1] : ''), next = pos < L - 1 ? seq[pos + 1] : after[0];
                return { type: seq[pos], prev, next, idx };
            },
