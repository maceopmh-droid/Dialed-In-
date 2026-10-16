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
                return `<div class="card-tabs">${tab('session', 'Session')}${tab('flavor', 'Flavor')}${tab('vs', 'Vs. Last Time')}${tab('next', 'Next Shot')}</div>`;
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
                const prev = this.previousBrewFor(brew);
                if (!prev) {
                    return `<div class="card-pane pane-block log-wide${active}" data-pane="vs"><div class="vs-empty">This is ${whose} first ${method} session of this bean, so there's nothing to compare yet.</div></div>`;
                }
                const rows = [];
                const add = (label, a, b, fmtValue, fmtDelta, goodWhenUp) => {
                    if (!(a > 0) && !(b > 0)) return;
                    const delta = b - a;
                    const same = Math.abs(delta) < 1e-9;
                    let cls = 'same';
                    if (!same) cls = goodWhenUp === null ? 'neutral' : ((delta > 0) === goodWhenUp ? 'up' : 'down');
                    const deltaText = same ? 'same' : `${delta > 0 ? '+' : '−'}${fmtDelta(Math.abs(delta))}`;
                    rows.push(`<div class="vs-label">${label}</div><div class="vs-values">${a > 0 ? fmtValue(a) : '–'} → ${b > 0 ? fmtValue(b) : '–'}</div><div class="vs-delta ${cls}">${deltaText}</div>`);
                };
                const n1 = v => this.fmtNum(v, 1);
                const grams = v => `${n1(v)}\u00A0g`;
                if (this.grindNum(prev.grind) !== null && this.grindNum(brew.grind) !== null) add('Grind', this.grindNum(prev.grind), this.grindNum(brew.grind), n1, n1, null);
                else if ((this.grindText(prev.grind) || this.grindText(brew.grind)) && !this.sameGrind(prev.grind, brew.grind)) rows.push(`<div class="vs-label">Grind</div><div class="vs-values">${this.esc(this.grindText(prev.grind) || '–')} → ${this.esc(this.grindText(brew.grind) || '–')}</div><div class="vs-delta neutral">changed</div>`);
                else if (this.grindText(brew.grind)) rows.push(`<div class="vs-label">Grind</div><div class="vs-values">${this.esc(this.grindText(brew.grind))}</div><div class="vs-delta same">same</div>`);
                add('Dose', this.num(prev.dose), this.num(brew.dose), grams, grams, null);
                add(!brew.method || brew.method === 'Espresso' ? 'Pull' : 'Pour', this.num(prev.yield), this.num(brew.yield), grams, grams, null);
                add('Ratio', this.ratioOf(prev), this.ratioOf(brew), v => `1:${this.fmtNum(v, 2)}`, v => this.fmtNum(v, 2), null);
                add('Time', this.num(prev.time), this.num(brew.time), v => `${n1(v)}\u00A0s`, v => `${n1(v)}\u00A0s`, null);
                // v13.1: grams out per second (espresso)
                const flow = b => { const y = this.num(b.yield), t = this.num(b.time); return y > 0 && t > 0 ? Math.round((y / t) * 100) / 100 : 0; };   // rounded so the change matches the numbers shown
                if ((!brew.method || brew.method === 'Espresso') && (!prev.method || prev.method === 'Espresso') && flow(prev) > 0 && flow(brew) > 0) add('Flow', flow(prev), flow(brew), v => `${this.fmtNum(v, 2)}\u00A0g/s`, v => this.fmtNum(v, 2), null);
                add('Rating', this.normalizeRating(prev.rating), this.normalizeRating(brew.rating), v => `${n1(v)}★`, n1, true);
                [['Acidity', 'acidity'], ['Sweetness', 'sweetness'], ['Body', 'body'], ['Finish', 'finish'], ['Bitterness', 'bitterness'], ['Complexity', 'balance']].forEach(([label, key]) => {
                    add(label, this.tasteValue(prev, key) || 0, this.tasteValue(brew, key) || 0, n1, n1, null);
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
                return `<div class="card-pane pane-block log-wide${active}" data-pane="vs"><div class="vs-head">${head}</div><div class="vs-grid">${rows.join('')}</div>${flavors}</div>`;
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
                    detail.push(this.isMasterBrew(brew) ? 'It\'s already pinned as a Master profile.' : 'It\'s worth pinning as a Master profile.');
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
                const advice = this.nextShotAdvice(brew);
                const title = owner === this.user ? 'Your next shot' : `${this.esc(owner)}'s next shot`;
                if (advice.coach) return `<div class="card-pane pane-block log-wide${active}" data-pane="next">${this.coachHtml(advice.coach, owner === this.user ? 'Your next shot' : `${owner}'s next shot`)}</div>`;
                let bestLine = '';
                if (advice.best) {
                    const isThis = String(advice.best.id) === String(brew.id);
                    const label = isThis ? 'This is the best-rated shot of this bean so far' : `Best so far · ${this.esc(this.shortDate(advice.best.date))}`;
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

