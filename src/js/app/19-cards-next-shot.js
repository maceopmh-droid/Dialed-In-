            // ===================== v9 features =====================

            beanPalette: ['#586A58', '#C27C4E', '#4F7699', '#A15B71', '#D4A82F', '#7A5D8F', '#4D8B75', '#B5654A', '#3F6E8C', '#8A8A3D', '#9C6A4F', '#6E7D4E'],

            // ---- shared helpers ----
            num(value) {
                const n = Number(value);
                return Number.isFinite(n) ? n : 0;
            },

            fmtNum(value, digits = 1) {
                const n = this.num(value);
                const fixed = n.toFixed(digits);
                return fixed.indexOf('.') >= 0 ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
            },

            ratioOf(brew) {
                const dose = this.num(brew && brew.dose);
                const out = this.num(brew && brew.yield);
                return dose > 0 && out > 0 ? out / dose : 0;
            },

            fmtRatio(r) {
                return r > 0 ? `1:${this.fmtNum(r, 1)}` : '-';
            },

            shortDate(value) {
                const t = this.toTime(value);
                if (!t) return '';
                return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            },

            parseLocalDate(value) {
                const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!m) return 0;
                return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
            },

            dayNum(t) {
                const d = new Date(t);
                return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5);
            },

            dayKey(t) {
                const d = new Date(t);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            },

            normalizeTag(value) {
                const text = String(value || '').trim().replace(/\s+/g, ' ');
                if (!text || /^(-|n\/?a|none|unknown|\?)$/i.test(text)) return '';
                return text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            },

            originList(value) {
                return String(value || '')
                    .split(/,|\/|&|\+|\band\b/i)
                    .map(part => this.normalizeTag(part))
                    .filter(Boolean);
            },

            brewsOf(user) {
                return Array.from(this.brews.values()).filter(b => this.getBrewOwner(b) === user);
            },

            groupKeyOfBrew(brew) {
                const bean = this.beans.get(String(brew && brew.beanId));
                return bean ? this.beanGroupKey(bean) : `id:${String(brew && brew.beanId)}`;
            },

            beanLabel(bean) {
                if (!bean) return 'Coffee';
                const roaster = String(bean.roaster || '').trim();
                const name = String(bean.name || '').trim();
                return roaster ? `${roaster} ${name}`.trim() : (name || 'Coffee');
            },

            isMasterBrew(brew) {
                return Boolean(brew) && (brew.isMaster === true || brew.isMaster === 'true');
            },

            knownPeople() {
                // v14.2: on the new backend your people are you and your private groups, as the server lists them (coffees and
                // sessions others can see don't make their owners part of your group)
                if (this.acctOn && this.acctOn()) {
                    const names = [this.user, ...[...this.peopleState().active.values()].map(p => p.name)].filter(n => n && n !== 'Unknown');
                    const list = [...new Set(names)].sort((a, b) => a.localeCompare(b));
                    return this.user && list.includes(this.user) ? [this.user, ...list.filter(n => n !== this.user)] : list;
                }
                const gone = this.removedPeople();   // v14.1: removed people leave every list (their sessions stay)
                const set = new Set((this.users || []).filter(Boolean));
                const addLogged = n => { n = String(n || ''); if (n && (n === this.user || !gone.has(n.toLowerCase()))) set.add(n); };
                this.brews.forEach(b => addLogged(this.getBrewOwner(b)));
                this.beans.forEach(b => { if (b.user) addLogged(b.user); });
                set.delete('Unknown');
                const list = [...set].sort((a, b) => a.localeCompare(b));
                if (this.user && list.includes(this.user)) return [this.user, ...list.filter(n => n !== this.user)];
                return list;
            },

            isEarlier(a, b) {
                const ta = this.toTime(a.date);
                const tb = this.toTime(b.date);
                return ta < tb || (ta === tb && String(a.id) < String(b.id));
            },

            // Same person, same bean (by name and roaster), same method, oldest first.
            sessionsLike(brew) {
                const owner = this.getBrewOwner(brew);
                const key = this.groupKeyOfBrew(brew);
                const method = brew.method;
                return Array.from(this.brews.values())
                    .filter(b => this.getBrewOwner(b) === owner && b.method === method && this.groupKeyOfBrew(b) === key)
                    .sort((a, b) => (this.isEarlier(a, b) ? -1 : (this.isEarlier(b, a) ? 1 : 0)));
            },

            previousBrewFor(brew) {
                const list = this.sessionsLike(brew);
                const idx = list.findIndex(b => String(b.id) === String(brew.id));
                return idx > 0 ? list[idx - 1] : null;
            },

            recipeLine(brew, withGrind) {
                if (!brew) return '';
                if (this.isTeaBrew && this.isTeaBrew(brew)) return this.teaRecipeLine(brew);   // v17.0: leaf · water · °C · steeps
                const parts = [];
                if (withGrind && this.grindText(brew.grind)) parts.push(`grind\u00A0${this.grindText(brew.grind)}`);
                if (this.num(brew.dose) > 0 || this.num(brew.yield) > 0) {
                    const r = this.ratioOf(brew);
                    parts.push(`${this.fmtNum(brew.dose)}\u00A0g → ${this.fmtNum(brew.yield)}\u00A0g${r ? ` (${this.fmtRatio(r)})` : ''}`);
                }
                if (this.num(brew.time) > 0) parts.push(`${this.fmtNum(brew.time)}\u00A0s`);
                return parts.join(' · ');
            },

            // ---- session card tabs ----
            cardTab(brew) {
                return this.cardTabs.get(String(brew.id)) || 'session';
            },

            renderCardTabs(brew) {
                const active = this.cardTab(brew);
                const id = this.esc(brew.id);
                const tab = (key, label) => `<button type="button" class="card-tab${active === key ? ' active' : ''}" data-tab-key="${key}" onclick="app.setCardTab('${app.escJs(id)}','${app.escJs(key)}',event)">${label}</button>`;
                return `<div class="card-tabs">${tab('session', 'Session')}${this.hasShotPane && this.hasShotPane(brew) ? tab('shot', 'Shot') : ''}${tab('flavor', 'Flavor')}${tab('vs', 'Vs. last time')}${tab('next', `Next ${this.shotWord(brew.method)}`)}</div>`;
            },

            setCardTab(brewId, tab, event) {
                if (event) event.stopPropagation();
                const id = String(brewId);
                const brew = this.brews.get(id);
                this.cardTabs.set(id, tab);
                this.dirtyKeys(`session:${id}`, `log-${id}`);
                // the tab row stays under your finger if anything above it changes height
                const tabsEl = event && event.target && event.target.closest ? event.target.closest('.card-tabs') : null;
                const scroller = tabsEl && tabsEl.closest('#grid') ? document.getElementById('main-content') : null;
                const before = scroller ? tabsEl.getBoundingClientRect().top : null;
                document.querySelectorAll('[data-card-brew]').forEach(card => {
                    if (card.getAttribute('data-card-brew') !== id) return;
                    const ph = card.querySelector(`[data-lazy="${tab}"]`);
                    if (ph && brew && this.canPatchDom()) { const el = this.htmlEl(this.paneHtml(brew, tab)); ph.replaceWith(el); }
                    card.querySelectorAll('.card-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-tab-key') === tab));
                    card.querySelectorAll('.card-pane').forEach(pane => pane.classList.toggle('active', pane.getAttribute('data-pane') === tab));
                    if (tab === 'flavor') this.fillShapeImages(card);
                });
                if (scroller && before !== null && tabsEl.isConnected) {
                    const d = tabsEl.getBoundingClientRect().top - before;
                    if (Math.abs(d) > 1) scroller.scrollTop += d;
                }
            },

            renderVsPane(brew) {
                const active = this.cardTab(brew) === 'vs' ? ' active' : '';
                const owner = this.getBrewOwner(brew);
                const whose = owner === this.user ? 'your' : `${this.esc(owner)}'s`;
                const method = this.esc(brew.method || 'brew');
                const prev = this.previousBrewFor(brew), tea = this.isTeaBrew(brew), kind = tea ? 'tea' : 'coffee';   // v17.0
                if (!prev) {
                    return `<div class="card-pane pane-block log-wide${active}" data-pane="vs"><div class="vs-empty">This is ${whose} first ${method} session of this ${tea ? 'tea' : 'bean'}, so there's nothing to compare yet.</div></div>`;
                }
                // v14.6: two short sections, Recipe and Taste. Each row reads "before → now" (the unit once, before muted,
                // now bold) and the change; recipe numbers that didn't move fold into one "Same" line; the taste sliders
                // are small tracks with where it was and where it is now.
                const recipe = [], same = [], taste = [];
                const r1 = v => Math.round(v * 10) / 10;   // what's shown is what's compared, so the change matches the numbers
                const row = (label, a, b, unit, cls, deltaText) => `<div class="vs-row"><span class="vs-label">${label}</span><span class="vs-values">${a !== '' ? `<s>${a}</s> → ` : ''}<b>${b}</b>${unit ? `\u00A0${unit}` : ''}</span><span class="vs-delta ${cls}">${deltaText}</span></div>`;
                const num = (label, a, b, unit, goodWhenUp, opts = {}) => {
                    if (!(a > 0) && !(b > 0)) return;
                    const fa = opts.round ? opts.round(a) : r1(a), fb = opts.round ? opts.round(b) : r1(b), show = opts.show || (v => this.fmtNum(v, 1)), val = v => (opts.prefix || '') + show(v);
                    const d = Math.round((fb - fa) * 100) / 100;
                    if (a > 0 && b > 0 && Math.abs(d) < 1e-9) { same.push(`${label.toLowerCase()} ${val(fb)}${unit ? `\u00A0${unit}` : ''}`); return; }
                    const cls = !(a > 0 && b > 0) ? 'neutral' : goodWhenUp === null || goodWhenUp === undefined ? 'neutral' : ((d > 0) === goodWhenUp ? 'up' : 'down');
                    const dt = !(a > 0 && b > 0) ? 'new' : `${d > 0 ? '+' : '−'}${show(Math.abs(d))}${opts.deltaUnit ? `\u00A0${opts.deltaUnit}` : ''}`;
                    recipe.push(row(label, a > 0 ? val(fa) : '–', b > 0 ? val(fb) : '–', unit, cls, dt));
                };
                const esp = !brew.method || brew.method === 'Espresso';
                const gPrev = this.grinderFor(prev), gNow = this.grinderFor(brew);
                if (tea) { /* (v17.0: a tea has no grind) */ }
                else if (!this.sameGrinder(gPrev, gNow)) {   // v15.7: numbers from two grinders don't compare, so no grind change is worked out
                    recipe.push(row('Grinder', this.esc(gPrev.name), this.esc(gNow.name), '', 'neutral', 'new'));
                    if (this.grindText(prev.grind) || this.grindText(brew.grind)) recipe.push(row('Grind', this.esc(this.grindText(prev.grind) || '–'), this.esc(this.grindText(brew.grind) || '–'), '', 'neutral', ''));
                }
                else if (this.grindNum(prev.grind) !== null && this.grindNum(brew.grind) !== null) num('Grind', this.grindNum(prev.grind), this.grindNum(brew.grind), '', null);
                else if ((this.grindText(prev.grind) || this.grindText(brew.grind)) && !this.sameGrind(prev.grind, brew.grind)) recipe.push(row('Grind', this.esc(this.grindText(prev.grind) || '–'), this.esc(this.grindText(brew.grind) || '–'), '', 'neutral', 'changed'));
                else if (this.grindText(brew.grind)) same.push(`grind ${this.esc(this.grindText(brew.grind))}`);
                num(tea ? 'Leaf' : 'Dose', this.num(prev.dose), this.num(brew.dose), 'g', null, { deltaUnit: 'g' });
                num(tea ? 'Water' : esp ? 'Pull' : 'Pour', this.num(prev.yield), this.num(brew.yield), tea ? 'ml' : 'g', null, { deltaUnit: tea ? 'ml' : 'g' });
                num('Ratio', this.ratioOf(prev), this.ratioOf(brew), '', null, { prefix: '1:', ...(tea ? { round: Math.round, show: v => String(Math.round(v)) } : {}) });
                if (tea) num('Temp', this.num(prev.temp), this.num(brew.temp), '°C', null, { deltaUnit: '°C', round: Math.round, show: v => String(Math.round(v)) });
                const hours = brew.timeUnit === 'h' || brew.method === 'Cold Brew' || this.methodProfile(brew.method).hours;
                num(hours ? 'Steep' : 'Time', this.num(prev.time), this.num(brew.time), hours ? 'h' : 's', null, { deltaUnit: hours ? 'h' : 's', round: hours ? r1 : Math.round, show: hours ? (v => this.fmtNum(v, 1)) : (v => String(Math.round(v))) });
                // v13.1: grams out per second (espresso)
                const flow = b => { const y = this.num(b.yield), t = this.num(b.time); return y > 0 && t > 0 ? y / t : 0; };
                if (esp && !tea && (!prev.method || prev.method === 'Espresso') && flow(prev) > 0 && flow(brew) > 0) num('Flow', flow(prev), flow(brew), 'g/s', null);
                if (tea) num('Steeps', this.teaStepsOf(prev).length, this.teaStepsOf(brew).length, '', null, { round: Math.round, show: v => String(Math.round(v)) });
                // taste: the rating, then the sliders as tracks
                const ra = this.normalizeRating(prev.rating), rb = this.normalizeRating(brew.rating);
                if (ra > 0 || rb > 0) {
                    const d = rb - ra, both = ra > 0 && rb > 0;
                    taste.push(row('Rating', ra > 0 ? this.fmtNum(ra, 1) : '–', rb > 0 ? this.fmtNum(rb, 1) : '–', '★', !both ? 'neutral' : Math.abs(d) < 1e-9 ? 'same' : d > 0 ? 'up' : 'down', !both ? 'new' : Math.abs(d) < 1e-9 ? 'same' : `${d > 0 ? '+' : '−'}${this.fmtNum(Math.abs(d), 1)}`));
                }
                const pos = v => `${(((Math.max(1, Math.min(10, v)) - 1) / 9) * 100).toFixed(1)}%`;
                ['acidity', 'sweetness', 'body', 'finish', 'bitterness', 'balance'].map(key => [this.tasteLabel(key, kind), key]).forEach(([label, key]) => {
                    const a = this.tasteValue(prev, key) || 0, b = this.tasteValue(brew, key) || 0;
                    if (!(a > 0) && !(b > 0)) return;
                    const d = Math.round((b - a) * 10) / 10, both = a > 0 && b > 0;
                    const lo = Math.min(a || b, b || a), span = both ? Math.abs(b - a) : 0;
                    const track = `<span class="vs-track" role="img" aria-label="${label}: ${a > 0 ? this.fmtNum(a, 1) : 'not set'} before, ${b > 0 ? this.fmtNum(b, 1) : 'not set'} now">${span ? `<em style="left:${pos(lo)};width:${((span / 9) * 100).toFixed(1)}%"></em>` : ''}${a > 0 && (!both || span) ? `<i class="was" style="left:${pos(a)}"></i>` : ''}${b > 0 ? `<i class="now" style="left:${pos(b)}"></i>` : ''}</span>`;
                    taste.push(`<div class="vs-row vs-tr"><span class="vs-label">${label}</span>${track}<span class="vs-delta ${!both ? 'neutral' : Math.abs(d) < 1e-9 ? 'same' : 'neutral'}">${!both ? (b > 0 ? 'new' : '–') : Math.abs(d) < 1e-9 ? 'same' : `${d > 0 ? '+' : '−'}${this.fmtNum(Math.abs(d), 1)}`}</span></div>`);
                });
                const before = new Set(this.extractFlavors(prev));
                const after = new Set(this.extractFlavors(brew));
                const added = [...after].filter(f => !before.has(f));
                const dropped = [...before].filter(f => !after.has(f));
                const flavors = (added.length || dropped.length)
                    ? `<div class="vs-flavors">${added.map(f => `<span class="vs-flavor plus">+ ${this.esc(f)}</span>`).join('')}${dropped.map(f => `<span class="vs-flavor minus">− ${this.esc(f)}</span>`).join('')}</div>`
                    : '';
                const days = this.dayNum(this.toTime(brew.date)) - this.dayNum(this.toTime(prev.date));   // v13.1: calendar days
                const head = `vs. ${whose} previous ${method} · ${this.esc(this.shortDate(prev.date))}${days > 0 ? ` · ${days} day${days === 1 ? '' : 's'} earlier` : ''}`;
                const sec = (cap, rows, foot) => rows.length || foot ? `<section class="vs-sec"><div class="vs-cap">${cap}</div>${rows.join('')}${foot || ''}</section>` : '';
                const key = taste.some(r => /vs-tr/.test(r)) ? '<span class="vs-key"><i class="was"></i>before<i class="now"></i>now</span>' : '';
                const sameLine = same.length ? `<div class="vs-same">Same: ${same.join(' · ')}</div>` : '';
                return `<div class="card-pane pane-block log-wide${active}" data-pane="vs"><div class="vs-head">${head}</div><div class="vs-cols">${sec('Recipe', recipe, sameLine)}${sec(`Taste${key}`, taste, '')}</div>${flavors}</div>`;
            },

            // ---- next-shot coaching (standard dial-in rules + the person's own history) ----
            tasteSignal(brew) {
                const verdict = String(brew.verdict || '');
                if (verdict === 'sour' || verdict === 'bitter' || verdict === 'balanced') return { kind: verdict, from: 'verdict' };
                const notes = this.getBrewNotes(brew).toLowerCase();
                const sourWord = /\b(sour|thin|weak|watery|salty|grassy)\b|under-?extract/.test(notes);
                const bitterWord = /\b(bitter|harsh|astringent|ashy|burnt|chalky)\b|over-?extract/.test(notes);
                if (sourWord && bitterWord) return { kind: 'both', from: 'notes' };
                if (sourWord) return { kind: 'sour', from: 'notes' };
                if (bitterWord) return { kind: 'bitter', from: 'notes' };
                const rating = this.normalizeRating(brew.rating);
                if (rating >= 4.5 || this.isMasterBrew(brew)) return { kind: 'balanced', from: 'rating' };
                const v = k => this.num(brew[k]);
                const touched = ['acidity', 'sweetness', 'body', 'finish', 'balance'].some(k => brew[k] !== undefined && brew[k] !== '' && v(k) !== 5);
                if (touched) {
                    if (v('acidity') >= 7 && v('sweetness') <= 4) return { kind: 'sour', from: 'sliders' };
                    if (v('body') <= 3 && v('acidity') <= 6) return { kind: 'weak', from: 'sliders' };
                }
                if (rating > 0 && rating <= 2) return { kind: 'off', from: 'rating' };
                return { kind: 'unknown', from: '' };
            },

            nextShotAdvice(brew) {
                if (brew && this.isTeaBrew(brew)) { const k = this.teaCoach(this.teaFromBrew(brew)); return { signal: { kind: k.mode, from: 'tea' }, headline: k.head, detail: [k.next ? `Next: ${k.next}` : '', ...k.why].filter(Boolean), best: k.ref, evidence: k.ev, conf: k.conf, coach: k }; }   // v17.0: next-cup advice for tea
                if (brew && brew.method) {
                    const k = this.coach(this.coachFromBrew(brew));
                    return { signal: { kind: (k.mode === 'ask' || k.mode === 'hold') ? 'unknown' : k.mode, from: k.from }, headline: k.head, detail: [k.next ? `Next: ${k.next}` : '', ...k.why].filter(Boolean), best: k.ref, evidence: k.ev, conf: k.conf, coach: k };
                }
                return this.nextShotAdviceV1(brew);
            },

            nextShotAdviceV1(brew) {
                const best = (() => {
                    let b = null;
                    this.sessionsLike(brew).forEach(x => {
                        if (String(x.id) === String(brew.id)) return;
                        const r = this.normalizeRating(x.rating); if (r <= 0) return;
                        const br = b ? this.normalizeRating(b.rating) : -1;
                        if (r > br || (r === br && this.isEarlier(b, x))) b = x;
                    });
                    return b;
                })();
                if (best && this.tastedKeys(brew).length) {
                    const a = this.adviseAgainst({ values: this.shapeValues(brew), tasted: this.tastedKeys(brew), notes: this.extractFlavors(brew), method: brew.method, grind: this.grindText(brew.grind) || null, dose: this.num(brew.dose), yield: this.num(brew.yield), time: this.num(brew.time) || null }, best);
                    return { signal: { kind: a.ok ? 'ref' : 'unknown' }, headline: a.head, detail: a.ok && a.detail ? [a.detail] : [], best, evidence: a.evidence || [], conf: a.conf || '', vsBest: true };
                }
                const legacy = this.nextShotAdviceLegacy(brew);
                if (legacy.signal && legacy.signal.kind !== 'unknown') return legacy;
                if (this.tastedKeys(brew).length || this.num(brew.time) > 0) {
                    const ctx = this.firstShotContext(this.groupKeyOfBrew(brew), this.getBrewOwner(brew), brew.method, brew.id);
                    const a = this.adviseFirstShot({ values: this.shapeValues(brew), tasted: this.tastedKeys(brew), notes: this.extractFlavors(brew), method: brew.method, grind: this.grindText(brew.grind) || null, dose: this.num(brew.dose), yield: this.num(brew.yield), time: this.num(brew.time) || null }, ctx);
                    if (a.ok && (a.evidence || []).length && !/^Nothing points/.test(a.head)) return { signal: { kind: 'first' }, headline: a.head, detail: [a.detail, a.note].filter(Boolean), best: null, evidence: a.evidence || [], conf: a.conf || '' };
                }
                return legacy;
            },

            nextShotAdviceLegacy(brew) {
                const espresso = brew.method === 'Espresso';
                const grind = this.grindNum(brew.grind) || 0;
                const time = this.num(brew.time);
                const ratio = this.ratioOf(brew);
                const than = this.grindText(brew.grind) ? ` than ${this.grindText(brew.grind)}` : '';
                const signal = this.tasteSignal(brew);
                const source = { verdict: 'the quick verdict', notes: 'the notes', sliders: 'the taste sliders', rating: 'the rating' }[signal.from] || '';
                let headline = '';
                const detail = [];
                if (signal.kind === 'sour') {
                    headline = espresso ? `Grind a little finer${than}.` : `Grind a little finer${than}, or let it brew a bit longer.`;
                    detail.push(`Reads under-extracted (sour or thin), going by ${source}.`);
                    if (espresso && time > 0 && time < 25) detail.push(`It ran fast (${this.fmtNum(time)} s). Finer should also slow it toward 25–30 s.`);
                    else if (espresso && ratio > 0) detail.push(`Or keep the grind and pull a little longer, around ${this.fmtRatio(ratio + 0.2)}.`);
                } else if (signal.kind === 'bitter') {
                    headline = espresso ? `Grind a little coarser${than}.` : `Grind a little coarser${than}, or shorten the brew.`;
                    detail.push(`Reads over-extracted (bitter or harsh), going by ${source}.`);
                    if (espresso && time > 32) detail.push(`It ran long (${this.fmtNum(time)} s). Coarser should speed it up.`);
                    else if (espresso && ratio > 0) detail.push(`Or keep the grind and stop a little earlier, around ${this.fmtRatio(Math.max(1, ratio - 0.2))}.`);
                } else if (signal.kind === 'both') {
                    headline = espresso ? 'Even out the extraction before changing grind.' : 'Even out the brew before changing grind.';
                    detail.push(espresso
                        ? 'Sour and bitter together usually means channeling. Check distribution and tamping first.'
                        : 'Sour and bitter together usually means uneven extraction. Check your pour and agitation first.');
                } else if (signal.kind === 'weak') {
                    headline = espresso
                        ? `Try a shorter ratio${ratio > 0 ? `, around ${this.fmtRatio(Math.max(1, ratio - 0.3))}` : ''}.`
                        : 'Try a little more coffee for the same water.';
                    detail.push('Body read light on the taste sliders.');
                } else if (signal.kind === 'balanced') {
                    headline = 'Keep this recipe.';
                    detail.push(this.isMasterBrew(brew) ? 'It\'s already pinned as a master recipe.' : 'It\'s worth pinning as a master recipe.');
                } else if (signal.kind === 'off') {
                    headline = 'Low rating, but no taste clue to act on.';
                    detail.push('Add a quick verdict, taste sliders or a note next time, and a specific change will show here.');
                } else {
                    headline = 'Not enough taste info for a suggestion yet.';
                    detail.push('Use the quick verdict, taste sliders or notes when logging, and a suggestion will show here.');
                }
                if (['sour', 'bitter', 'weak'].includes(signal.kind)) detail.push('Change one thing at a time.');
                let best = null;
                this.sessionsLike(brew).forEach(b => {
                    const r = this.normalizeRating(b.rating);
                    if (r <= 0) return;
                    const br = best ? this.normalizeRating(best.rating) : -1;
                    if (r > br || (r === br && this.isEarlier(best, b))) best = b;
                });
                return { signal, headline, detail, best };
            },

            renderNextPane(brew) {
                const active = this.cardTab(brew) === 'next' ? ' active' : '';
                const owner = this.getBrewOwner(brew);
                const advice = this.methodWorded(this.nextShotAdvice(brew), brew.method);
                const w = this.shotWord(brew.method);
                const title = owner === this.user ? `Your next ${w}` : `${this.esc(owner)}'s next ${w}`;
                if (advice.coach) return `<div class="card-pane pane-block log-wide${active}" data-pane="next">${this.coachHtml(advice.coach, owner === this.user ? `Your next ${w}` : `${owner}'s next ${w}`)}</div>`;
                let bestLine = '';
                if (advice.best) {
                    const isThis = String(advice.best.id) === String(brew.id);
                    const label = isThis ? `This is the best-rated ${w} of this coffee so far` : `Best so far · ${this.esc(this.shortDate(advice.best.date))}`;
                    bestLine = `<div class="next-best">${label}: ${this.esc(this.recipeLine(advice.best, true))} · ${this.esc(this.fmtNum(this.normalizeRating(advice.best.rating)))}★</div>`;
                }
                return `<div class="card-pane pane-block log-wide${active}" data-pane="next"><div class="next-card"><div class="next-title">${title}${advice.conf ? ` · ${this.esc(advice.conf)}` : ''}</div><div class="next-headline">${this.esc(advice.headline)}</div>${advice.detail.map(d => `<div class="next-detail">${this.esc(d)}</div>`).join('')}${(advice.evidence || []).length ? `<div class="ev">${advice.evidence.map(e => `<span class="evc ${e.side}">${this.esc(e.text)}</span>`).join('')}</div>` : ''}${bestLine}</div></div>`;
            },

            setVerdict(value) {
                const input = document.getElementById('verdict-input');
                if (!input) return;
                input.value = input.value === value ? '' : value;
                this.renderVerdict();
            },

            renderVerdict() {
                const input = document.getElementById('verdict-input');
                const current = input ? input.value : '';
                document.querySelectorAll('.verdict-chip').forEach(chip => chip.classList.toggle('selected', chip.getAttribute('data-verdict') === current));
            },

