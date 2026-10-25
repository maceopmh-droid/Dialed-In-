            getAchievementCatalog() {
                if (this.achievementCatalogCache) return this.achievementCatalogCache;
                const liters = (value) => {
                    const l = value / 1000;
                    if (l < 1) return `${l.toFixed(1)}L`;
                    if (Number.isInteger(l)) return `${l}L`;
                    return `${l.toFixed(1).replace(/\.0$/, '')}L`;
                };
                const duration = (value) => {
                    const sec = Math.round(value);
                    const h = Math.floor(sec / 3600);
                    const m = Math.floor((sec % 3600) / 60);
                    if (!h) return `${m} min`;
                    if (!m) return `${h} hr`;
                    return `${h} hr ${m} min`;
                };
                this.achievementCatalogCache = [
                    {
                        key: 'dose_total',
                        group: 'Brewing',
                        desc: 'Grams of coffee dosed, all time',
                        title: 'Dose Dialed',
                        thresholds: [100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000],
                        metric: stats => stats.doseTotal,
                        format: value => `${Math.round(value)}g`,
                        sentence: value => `logged ${Math.round(value)}g of coffee dose lifetime`
                    },
                    {
                        key: 'yield_total',
                        group: 'Brewing',
                        desc: 'Coffee brewed out, all time',
                        title: 'Pour Volume',
                        thresholds: [500, 1000, 3000, 5000, 8000, 12000, 18000, 26000, 36000, 50000],
                        metric: stats => stats.yieldTotal,
                        format: liters,
                        sentence: value => `brewed ${liters(value)} of coffee output lifetime`
                    },
                    {
                        key: 'brew_time',
                        group: 'Brewing',
                        desc: 'Active brew time logged',
                        title: 'Time Keeper',
                        thresholds: [1800, 3600, 7200, 10800, 14400, 21600, 32400, 43200, 54000, 72000],
                        metric: stats => stats.brewTimeTotal,
                        format: duration,
                        sentence: value => `logged ${duration(value)} of active brew time`
                    },
                    {
                        key: 'sessions',
                        group: 'Brewing',
                        desc: 'Brew sessions recorded',
                        title: 'Session Builder',
                        thresholds: [10, 25, 50, 100, 150, 250, 400, 600, 800, 1000],
                        metric: stats => stats.sessionCount,
                        format: value => `${Math.round(value)}`,
                        sentence: value => `recorded ${Math.round(value)} brew sessions`
                    },
                    {
                        key: 'beans_used',
                        group: 'Exploring',
                        desc: 'Different coffees brewed',
                        title: 'Bean Explorer',
                        thresholds: [5, 10, 20, 35, 50, 75, 100, 150, 200, 300],
                        metric: stats => (stats.beanIds ? stats.beanIds.size : 0),
                        format: value => `${Math.round(value)}`,
                        sentence: value => `used ${Math.round(value)} unique beans`
                    },
                    {
                        key: 'comments_written',
                        group: 'Social',
                        desc: 'Comments left on sessions and coffees',
                        title: 'Community Voice',
                        thresholds: [5, 15, 30, 50, 80, 120, 180, 260, 360, 500],
                        metric: stats => stats.commentsWritten,
                        format: value => `${Math.round(value)}`,
                        sentence: value => `left ${Math.round(value)} helpful comments`
                    },
                    {
                        key: 'likes_received',
                        group: 'Social',
                        desc: 'Likes received from friends',
                        title: 'Crowd Favorite',
                        thresholds: [5, 15, 30, 60, 100, 160, 240, 360, 520, 720],
                        metric: stats => stats.likesReceived,
                        format: value => `${Math.round(value)}`,
                        sentence: value => `earned ${Math.round(value)} likes`
                    },
                    {
                        key: 'brew_master',
                        group: 'Exploring',
                        desc: 'Every brew method in the app used at least once',
                        title: 'Brew Master',
                        thresholds: [6],
                        metric: stats => (stats.methodSet ? stats.methodSet.size : 0),
                        format: value => `${Math.min(6, Math.max(0, Math.round(value)))}/6 methods`,
                        sentence: () => 'used all 6 brew methods in Dialed In'
                    },
                    {
                        key: 'origins',
                        group: 'Exploring',
                        desc: 'Different coffee origins brewed',
                        title: 'Origin Hopper',
                        thresholds: [2, 4, 6, 8, 10, 13, 16, 20, 25, 30],
                        metric: stats => (stats.originSet ? stats.originSet.size : 0),
                        format: value => `${Math.round(value)} origin${Math.round(value) === 1 ? '' : 's'}`,
                        sentence: value => `brewed coffees from ${Math.round(value)} different origins`
                    },
                    {
                        key: 'continents',   // v15.1 (Aidan's idea): a coffee from every continent that grows it
                        group: 'Exploring',
                        desc: 'A coffee from every continent that grows it: Africa, Asia, Oceania, North & Central America, South America',
                        title: 'World Tour',
                        thresholds: [5],
                        metric: stats => (stats.continentSet ? stats.continentSet.size : 0),
                        format: value => `${Math.min(5, Math.max(0, Math.round(value)))}/5 continents`,
                        sentence: () => 'brewed coffee from every continent that grows it'
                    },
                    {
                        key: 'processes',
                        group: 'Exploring',
                        desc: 'Different processing methods brewed (washed, natural, honey...)',
                        title: 'Process Explorer',
                        thresholds: [2, 3, 4, 5, 6],
                        metric: stats => (stats.processSet ? stats.processSet.size : 0),
                        format: value => `${Math.round(value)} process${Math.round(value) === 1 ? '' : 'es'}`,
                        sentence: value => `brewed ${Math.round(value)} different processes`
                    },
                    {
                        key: 'roasters',
                        group: 'Exploring',
                        desc: 'Different roasters brewed',
                        title: 'Roaster Roulette',
                        thresholds: [2, 3, 5, 8, 12, 16, 20, 25, 30, 40],
                        metric: stats => (stats.roasterSet ? stats.roasterSet.size : 0),
                        format: value => `${Math.round(value)} roaster${Math.round(value) === 1 ? '' : 's'}`,
                        sentence: value => `brewed coffees from ${Math.round(value)} different roasters`
                    },
                    {
                        key: 'roast_spectrum',
                        group: 'Exploring',
                        desc: 'Roast levels brewed, light to dark',
                        title: 'Roast Spectrum',
                        thresholds: [2, 3, 4, 5],
                        metric: stats => (stats.roastSet ? stats.roastSet.size : 0),
                        format: value => `${Math.min(5, Math.round(value))}/5 roast levels`,
                        sentence: value => `brewed ${Math.round(value)} different roast levels`
                    },
                    {
                        key: 'local',
                        group: 'Exploring',
                        desc: 'Sessions of coffee from roasters you marked local',
                        title: 'Local Regular',
                        thresholds: [1, 3, 5, 10, 20, 35, 50, 75, 100],
                        metric: stats => stats.localCount || 0,
                        format: value => `${Math.round(value)} local session${Math.round(value) === 1 ? '' : 's'}`,
                        sentence: value => `brewed ${Math.round(value)} session${Math.round(value) === 1 ? '' : 's'} from local roasters`
                    },
                    {
                        key: 'sampler',
                        group: 'Exploring',
                        desc: 'Most different roasters brewed within any 30 days',
                        title: 'Roaster Sampler',
                        thresholds: [3, 4, 5],
                        metric: stats => (stats.samplerMax || 0),
                        format: value => `${Math.round(value)} in 30 days`,
                        sentence: value => `brewed ${Math.round(value)} different roasters within 30 days`
                    },
                    // v17.0: tea's own (they show once someone has logged a tea)
                    { key: 'tea_sessions', group: 'Tea', desc: 'Tea sessions logged', title: 'Tea Time', thresholds: [1, 5, 15, 30, 60, 100, 160, 240],
                      metric: stats => stats.teaSessions || 0, format: value => `${Math.round(value)}`, sentence: value => (Math.round(value) === 1 ? 'logged a first tea session' : `logged ${Math.round(value)} tea sessions`) },
                    { key: 'tea_explorer', group: 'Tea', desc: 'Different teas tried', title: 'Leaf Explorer', thresholds: [2, 5, 10, 20, 35, 50],
                      metric: stats => (stats.teaSet ? stats.teaSet.size : 0), format: value => `${Math.round(value)}`, sentence: value => `tried ${Math.round(value)} different teas` },
                    { key: 'tea_types', group: 'Tea', desc: 'Kinds of tea tried (green, white, yellow, oolong, black, pu-erh, matcha)', title: 'Tea Spectrum', thresholds: [2, 4, 7],
                      metric: stats => (stats.teaTypeSet ? stats.teaTypeSet.size : 0), format: value => `${Math.min(7, Math.round(value))}/7 types`, sentence: value => `tried ${Math.round(value)} kinds of tea` },
                    { key: 'tea_steeps', group: 'Tea', desc: 'Steeps logged, all time', title: 'Steep Count', thresholds: [10, 50, 150, 400, 1000],
                      metric: stats => stats.steepTotal || 0, format: value => `${Math.round(value)}`, sentence: value => `logged ${Math.round(value)} steeps` }
                ];
                return this.achievementCatalogCache;
            },

            getAchievementLevel(value, thresholds) {
                let level = 0;
                thresholds.forEach(threshold => {
                    if (value >= threshold) level += 1;
                });
                return level;
            },

            formatAchievementLine(unlock, forSelf = false) {
                if (!unlock || !unlock.definition) return '';
                const def = unlock.definition;
                const levelText = def.thresholds.length > 1 ? `Lv ${unlock.level}` : '';
                const sentence = def.sentence(unlock.threshold);
                if (forSelf) {
                    return `Achievement unlocked: ${def.title}${levelText ? ` ${levelText}` : ''}. You ${sentence}.`;
                }
                const actor = unlock.user || 'Someone';
                return `${actor} unlocked an achievement: ${actor} ${sentence}.`;
            },

            updateAchievementCount() {
                const el = document.getElementById('achievement-count');
                if (!el) return;
                const byUser = this.achievementLevelsByUser || {};
                const levels = byUser[this.user] || {};
                const total = Object.values(levels).reduce((sum, level) => sum + Number(level || 0), 0);
                el.innerText = String(total || 0);
            },

            openAchievementLocker(user) {
                this.lockerUser = user || this.user;
                this.renderAchievementLocker();
                this.openModal('achievement-modal');
            },

            renderAchievementLocker() {
                const box = document.getElementById('achievement-locker-grid');
                if (!box) return;
                const user = this.lockerUser || this.user;
                const title = document.getElementById('achievement-title');
                if (title) title.innerText = user === this.user ? 'Achievement Locker' : `${user}'s Achievements`;
                const stats = this.achievementStatsByUser[user] || this.createAchievementStats();
                const levels = this.achievementLevelsByUser[user] || {};
                const catalog = this.achievementCatalogFor(user);   // v17.0: tea's appear once there's tea
                const earned = catalog.reduce((s, d) => s + Math.min(d.thresholds.length, Number(levels[d.key] || 0)), 0);
                const total = catalog.reduce((s, d) => s + d.thresholds.length, 0);
                const recent = [];
                [this.achievementUnlockByBrew, this.achievementUnlockByBean].forEach(map => map.forEach(list => list.forEach(u => { if (u.user === user) recent.push(u); })));
                recent.sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                const recentHtml = recent.slice(0, 3).map(u => `<div>${this.esc(u.definition.title)}${u.definition.thresholds.length > 1 ? ` Lv ${u.level}` : ''} · ${this.esc(this.shortDate(u.date))}</div>`).join('');
                const groups = ['Brewing', 'Exploring', 'Tea', 'Social'].map(groupName => {
                    const defs = catalog.filter(d => (d.group || 'Brewing') === groupName);
                    if (!defs.length) return '';
                    return `<div class="ach-group"><div class="ach-group-title">${groupName}</div><div class="ach-cards">${defs.map(d => this.renderAchievementCard(d, stats, levels)).join('')}</div></div>`;
                }).join('');
                box.innerHTML = `<div class="ach-summary"><div><div class="ach-total-num">${earned}<span class="ach-total-of"> / ${total}</span></div><div class="ach-total-cap">Levels unlocked</div></div><div class="ach-recent">${recentHtml ? `<div class="ach-recent-title">Recent</div>${recentHtml}` : 'No unlocks yet'}</div></div>${groups}`;
                this.updateAchievementCount();
            },

            setDetailTab(tab) {
                this.detailTab = tab;
                document.querySelectorAll('.insight-tab').forEach(btn => btn.classList.remove('active'));
                const active = document.querySelector(`[data-detail-tab="${tab}"]`);
                if (active) active.classList.add('active');
                const timeline = document.getElementById('d-timeline-pane');
                const compare = document.getElementById('d-compare-pane');
                if (timeline) timeline.style.display = tab === 'timeline' ? 'block' : 'none';
                if (compare) compare.style.display = tab === 'compare' ? 'block' : 'none';
                const side = document.getElementById('d-side-pane');
                const dialin = document.getElementById('d-dialin-pane');
                if (side) side.style.display = tab === 'side' ? 'block' : 'none';
                if (dialin) dialin.style.display = tab === 'dialin' ? 'block' : 'none';
                const sweet = document.getElementById('d-sweet-pane');
                if (sweet) sweet.style.display = tab === 'sweet' ? 'block' : 'none';
                const everyone = document.getElementById('d-everyone-pane');   // v14.6: Everyone on this coffee
                if (everyone) everyone.style.display = tab === 'everyone' ? 'block' : 'none';
                if (tab === 'everyone' && this.showCoffeeCommunity) this.showCoffeeCommunity();
                if (tab === 'sweet') this.renderSweetSpot();
                if (tab === 'compare') this.renderComparePanel();
                if (tab === 'side') this.renderSidePanel();
                if (tab === 'dialin') this.renderDialinChart();
            },

            renderComparePanel() {
                const aSel = document.getElementById('compare-a-select');
                const bSel = document.getElementById('compare-b-select');
                const results = document.getElementById('compare-results');
                if (!aSel || !bSel || !results) return;
                const brews = [...this.detailBrews].sort((a, b) => this.localTime(b.date) - this.localTime(a.date));
                if (brews.length < 2) {
                    aSel.innerHTML = bSel.innerHTML = brews.length ? `<option value="${this.esc(brews[0].id)}">${this.esc(this.shortDate(brews[0].date))}</option>` : '<option value="">No sessions</option>';
                    results.innerHTML = '<div class="panel-empty">Log at least two sessions of this coffee to compare them.</div>';
                    return;
                }
                const label = b => { const r = this.normalizeRating(b.rating); return `${this.shortDate(b.date)} · ${this.getBrewOwner(b)}${r ? ` · ${this.fmtNum(r)}★` : (b.method ? ` · ${b.method}` : '')}`; };
                const options = brews.map(b => `<option value="${this.esc(b.id)}">${this.esc(label(b))}</option>`).join('');
                const prevA = String(aSel.value || ''), prevB = String(bSel.value || '');
                aSel.innerHTML = options; bSel.innerHTML = options;
                const ids = new Set(brews.map(b => String(b.id)));
                let a = ids.has(prevA) ? prevA : String(brews[0].id);
                let b = ids.has(prevB) ? prevB : '';
                if (!b || b === a) {
                    // default: the latest session against the best-rated other one
                    const others = brews.filter(x => String(x.id) !== a);
                    const best = others.slice().sort((x, y) => this.normalizeRating(y.rating) - this.normalizeRating(x.rating))[0];
                    b = String((best && this.normalizeRating(best.rating) > 0 ? best : others[0]).id);
                }
                aSel.value = a; bSel.value = b;
                const A = this.brews.get(a), Bv = this.brews.get(b);
                if (!A || !Bv) { results.innerHTML = '<div class="panel-empty">Pick two sessions to compare.</div>'; return; }
                const sameOwner = this.getBrewOwner(A) === this.getBrewOwner(Bv);
                const card = (x, tag) => { const r = this.normalizeRating(x.rating); const who = this.getBrewOwner(x); return `<div class="cmp-card ${tag}"><span class="cmp-tag">${tag.toUpperCase()}</span><div class="cmp-who"><i style="background:${this.esc(this.getUserColor(who))}"></i>${this.esc(who)}</div><div class="cmp-date">${this.esc(this.shortDate(x.date))}${x.method ? ` · ${this.esc(x.method)}` : ''}</div><div class="cmp-rating">${r ? `${'★'.repeat(Math.round(r))}<span>${this.esc(this.fmtNum(r))}</span>` : '<span>Unrated</span>'}</div></div>`; };
                const fmt = (v, kind) => v === null || v === undefined || v === '' ? '–' : kind === 'g' ? `${this.fmtNum(v, 1)} g` : kind === 's' ? `${this.fmtNum(v)} s` : kind === 'ratio' ? `1:${this.fmtNum(v, 2)}` : kind === 'r' ? `${this.fmtNum(v)}★` : String(v);
                const chip = (av, bv, good) => {
                    if (av === null || bv === null || av === undefined || bv === undefined) return '<span class="cmp-d none"></span>';
                    const d = av - bv;
                    if (Math.abs(d) < 1e-9) return '<span class="cmp-d same">same</span>';
                    const cls = good === null ? 'neutral' : ((d > 0) === good ? 'up' : 'down');
                    return `<span class="cmp-d ${cls}">${d > 0 ? '+' : '−'}${this.fmtNum(Math.abs(d), 2)}</span>`;
                };
                const num = v => { const n = this.num(v); return n > 0 ? n : null; };
                const rows = [];
                // v17.0: two tea sessions compare in tea terms (leaf, water, temperature, steeps), never grind or roast age
                const tea = this.isTeaBrew(A) && this.isTeaBrew(Bv), kind = tea ? 'tea' : 'coffee';
                const ga = tea ? '' : this.grindText(A.grind), gb = tea ? '' : this.grindText(Bv.grind);
                if (tea) {
                    const ml = v => v === null ? '–' : `${this.fmtNum(v, 0)} ml`, deg = v => v === null ? '–' : `${this.fmtNum(v, 0)}°C`;
                    const st = x => this.teaTimeText(x) || '–', stN = x => { const n = this.num(x.time); return n > 0 ? n : null; };
                    const la = num(A.dose), lb = num(Bv.dose), wa = num(A.yield), wb = num(Bv.yield), ta = num(A.temp), tb = num(Bv.temp);
                    const bagsOf = x => x.teabag ? Math.max(1, Number(x.bags) || 1) : null, ba = bagsOf(A), bb = bagsOf(Bv);
                    const stOf = x => x.method === 'Matcha' && this.matchaStyle(x) ? this.matchaStyle(x).short : '', stA = stOf(A), stB = stOf(Bv);
                    if (stA || stB) rows.push(['Style', this.esc(stA || '–'), this.esc(stB || '–'), stA === stB ? '<span class="cmp-d same">same</span>' : '<span class="cmp-d neutral">changed</span>']);
                    if (ba !== null || bb !== null) rows.push(['Teabags', ba === null ? fmt(la, 'g') : String(ba), bb === null ? fmt(lb, 'g') : String(bb), ba !== null && bb !== null ? chip(ba, bb, null) : '<span class="cmp-d neutral">changed</span>']);
                    else if (la !== null || lb !== null) rows.push([A.method === 'Matcha' && Bv.method === 'Matcha' ? 'Matcha' : 'Leaf', fmt(la, 'g'), fmt(lb, 'g'), chip(la, lb, null)]);
                    if (wa !== null || wb !== null) rows.push(['Water', ml(wa), ml(wb), chip(wa, wb, null)]);
                    const ra = la && wa ? wa / la : null, rb = lb && wb ? wb / lb : null;
                    if (ra || rb) rows.push(['Ratio', ra ? `1:${this.fmtNum(ra, 0)}` : '–', rb ? `1:${this.fmtNum(rb, 0)}` : '–', chip(ra === null ? null : Math.round(ra), rb === null ? null : Math.round(rb), null)]);
                    const ma = num(A.milk), mb = num(Bv.milk);
                    if (ma !== null || mb !== null) rows.push(['Milk', ml(ma), ml(mb), chip(ma, mb, null)]);
                    if (ta !== null || tb !== null) rows.push(['Temp', deg(ta), deg(tb), chip(ta, tb, null)]);
                    if (stN(A) !== null || stN(Bv) !== null) rows.push([A.method === 'Matcha' && Bv.method === 'Matcha' ? 'Whisk' : 'Steep', this.esc(st(A)), this.esc(st(Bv)), chip(stN(A), stN(Bv), null)]);
                    const sa = this.teaStepsOf(A).length || null, sb = this.teaStepsOf(Bv).length || null;
                    if (sa || sb) rows.push(['Steeps', sa ? String(sa) : '–', sb ? String(sb) : '–', chip(sa, sb, null)]);
                }
                if (!tea && (ga || gb)) {
                    const d = !sameOwner ? '<span class="cmp-d note">different grinders</span>' : (this.sameGrind(A.grind, Bv.grind) ? '<span class="cmp-d same">same</span>' : (this.grindNum(A.grind) !== null && this.grindNum(Bv.grind) !== null ? chip(this.grindNum(A.grind), this.grindNum(Bv.grind), null) : '<span class="cmp-d neutral">changed</span>'));
                    rows.push(['Grind', this.esc(ga || '–'), this.esc(gb || '–'), d]);
                }
                if (!tea) [['Dose', 'dose', 'g'], [(() => { const e = x => !x.method || x.method === 'Espresso'; return e(A) && e(Bv) ? 'Pull' : !e(A) && !e(Bv) ? 'Pour' : 'Pull / water'; })(), 'yield', 'g'], ['Time', 'time', 's']].forEach(([lbl, k, kind]) => { const av = num(A[k]), bv = num(Bv[k]); if (av !== null || bv !== null) rows.push([lbl, fmt(av, kind), fmt(bv, kind), chip(av, bv, null)]); });
                if (!tea) {
                    const ra = this.ratioOf(A) || null, rb = this.ratioOf(Bv) || null;
                    if (ra || rb) rows.push(['Ratio', fmt(ra, 'ratio'), fmt(rb, 'ratio'), chip(ra, rb, null)]);
                    // v16.0: how old the beans were (the bag's roast date on each session); the same grind runs faster as they age
                    const age = x => this.roastDays ? this.roastDays(x.roastDate, x.date) : null, da = age(A), db = age(Bv), day = n => n === null ? '–' : n === 0 ? 'Roast day' : `Day ${n}`;
                    if (da !== null || db !== null) rows.push(['Off roast', day(da), day(db), chip(da, db, null)]);
                }
                const rta = this.normalizeRating(A.rating) || null, rtb = this.normalizeRating(Bv.rating) || null;
                rows.push(['Rating', fmt(rta, 'r'), fmt(rtb, 'r'), chip(rta, rtb, true)]);
                const taste = this.tasteMetaFor(kind).map(([k, lbl]) => { const av = this.tasteValue(A, k), bv = this.tasteValue(Bv, k); return (av === null && bv === null) ? null : [lbl, av === null ? '–' : String(av), bv === null ? '–' : String(bv), chip(av, bv, null), FlavorShape ? FlavorShape.COLORS[k] : '']; }).filter(Boolean);
                const table = list => list.map(([lbl, av, bv, d, color]) => `<div class="cmp-r"><span class="cmp-l">${color ? `<i style="background:${color}"></i>` : ''}${lbl}</span><span class="cmp-v">${av}</span><span class="cmp-v">${bv}</span>${d}</div>`).join('');
                const fa = this.extractFlavors(A), fb = this.extractFlavors(Bv);
                const lower = l => l.map(x => x.toLowerCase());
                const both = fa.filter(x => lower(fb).includes(x.toLowerCase())), onlyA = fa.filter(x => !lower(fb).includes(x.toLowerCase())), onlyB = fb.filter(x => !lower(fa).includes(x.toLowerCase()));
                const noteRow = (title, list, cls) => list.length ? `<div class="cmp-notes-row"><span>${title}</span>${list.map(n => `<b class="cmp-note ${cls}">${this.esc(n)}</b>`).join('')}</div>` : '';
                let shape = '';
                if (typeof FlavorShape !== 'undefined' && (this.tastedKeys(A).length || this.tastedKeys(Bv).length)) {
                    const ta = this.tastedKeys(A);
                    const url = FlavorShape.snapshot(this.shapeValues(A), this.shapeValues(Bv), { width: 320, height: 220, zoom: 1.1, isSet: k => ta.includes(k), setKey: `cmp-${ta.join(',')}`, names: tea ? 'tea' : undefined });
                    if (url) shape = `<div class="cmp-shape"><img src="${url}" alt="Flavor shapes compared"><div class="cmp-shape-key"><span><i class="solid"></i>A</span><span><i class="dashed"></i>B</span></div></div>`;
                }
                results.innerHTML = `
                    <div class="cmp-cards">${card(A, 'a')}${card(Bv, 'b')}</div>
                    ${a === b ? '<div class="panel-empty">Pick two different sessions.</div>' : ''}
                    <div class="cmp-table"><div class="cmp-r head"><span></span><span>A</span><span>B</span><span>A vs B</span></div>${table(rows)}</div>
                    ${taste.length ? `<div class="cmp-sub">Taste</div>${shape}<div class="cmp-table">${table(taste)}</div>` : ''}
                    ${fa.length || fb.length ? `<div class="cmp-sub">Tasting notes</div><div class="cmp-notes">${noteRow('Both', both, 'both')}${noteRow('Only A', onlyA, 'a')}${noteRow('Only B', onlyB, 'b')}</div>` : ''}`;
            },

            cloneLatestSession() {
                const all = [...(this.detailBrews || [])].sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                if (!all.length) {
                    this.showToast('No session available to clone.');
                    return;
                }
                // v13.1: your own latest session on this coffee, not whoever logged last
                const mine = all.find(b => this.getBrewOwner(b) === this.user);
                if (mine) {
                    const kept = (Array.isArray(mine.equipment) ? mine.equipment : []).filter(id => this.equipment.some(eq => eq.id === id));
                    this.openBrewModal({
                        method: mine.method || '',
                        grind: mine.grind ?? '',
                        dose: mine.dose ?? '',
                        yield: '',
                        time: '',
                        acidity: mine.acidity ?? 5,
                        sweetness: mine.sweetness ?? 5,
                        body: mine.body ?? 5,
                        finish: mine.finish ?? 5,
                        balance: mine.balance ?? 5,
                        isMaster: false,
                        notes: '',
                        flavors: this.extractFlavors(mine),
                        equipment: kept.length ? kept : (this.lastEquipment[mine.method || ''] || [])
                    });
                    this.showToast('Session cloned. Timer and weights are ready for a live brew.');
                    return;
                }
                // you haven't brewed it yet: their method and dose, your own setup, no grind (grinders differ)
                const theirs = all[0];
                const who = this.getBrewOwner(theirs);
                this.openBrewModal({
                    method: theirs.method || '',
                    grind: '',
                    dose: theirs.dose ?? '',
                    yield: '',
                    time: '',
                    isMaster: false,
                    notes: '',
                    flavors: [],
                    equipment: this.lastEquipment[theirs.method || ''] || []
                });
                this.showToast(`You haven't brewed this one yet, so this copies ${who}'s latest recipe. Grind is left blank (different grinders).`);
            },

            extractFlavors(brew) {
                if (!brew || !brew.flavors) return [];
                const raw = Array.isArray(brew.flavors) ? brew.flavors : String(brew.flavors).split(',');
                return raw.map(f => String(f).trim()).filter(Boolean);
            },

            resolveEquipmentNames(brew) {
                const names = [];
                const ids = Array.isArray(brew.equipment) ? brew.equipment : [];
                ids.forEach(id => {
                    const ownerGear = this.gearByUser.get(this.getBrewOwner(brew));
                    const match = (ownerGear && ownerGear.items.find(eq => eq.id === id)) || this.equipment.find(eq => eq.id === id);
                    if (match) names.push(match.name);
                });
                if (!names.length && Array.isArray(brew.equipmentSnapshot)) {
                    brew.equipmentSnapshot.forEach(name => {
                        const text = String(name || '').trim();
                        if (text) names.push(text);
                    });
                }
                return [...new Set(names)];
            },

            formatLikers(names) {
                const unique = [...new Set((names || []).map(item => String(item || '').trim()).filter(Boolean))];
                if (!unique.length) return '';
                if (unique.length === 1) return `${unique[0]} liked`;
                if (unique.length === 2) return `${unique[0]} and ${unique[1]} liked`;
                return `${unique[0]}, ${unique[1]}, and others liked`;
            },

