            // ===================== taste (v10) =====================
            tasteWord(k, v) {
                const m = TASTE_META.find(x => x[0] === k);
                return m ? m[2][v <= 3 ? 0 : v >= 8 ? 2 : 1] : '';
            },

            // the value a saved session actually reports for one slider, or null if it was never set
            tasteValue(brew, k) {
                if (!brew) return null;
                const raw = brew[k];
                if (raw === undefined || raw === null || raw === '') return null;
                const v = Number(raw);
                if (!Number.isFinite(v)) return null;
                if (Array.isArray(brew.tasted)) return brew.tasted.includes(k) ? v : null;
                // sessions from before v10 can't tell "left at 5" from "never moved": treat 5 as not set, like v9 did
                return v === 5 ? null : v;
            },

            tastedKeys(brew) {
                return TASTE_KEYS.filter(k => this.tasteValue(brew, k) !== null);
            },

            shapeValues(brew) {
                const out = {};
                TASTE_KEYS.forEach(k => { const v = this.tasteValue(brew, k); out[k] = v === null ? 5 : v; });
                return out;
            },

            noteLocate(name) {
                const key = String(name || '').trim().toLowerCase();
                if (!key) return null;
                for (let f = 0; f < NOTE_WHEEL.length; f++) {
                    const fam = NOTE_WHEEL[f];
                    if (fam.fam.toLowerCase() === key) return { f, g: -1, note: '' };
                    for (let g = 0; g < fam.groups.length; g++) {
                        const hit = fam.groups[g][1].find(n => n.toLowerCase() === key);
                        if (hit) return { f, g, note: hit };
                        if (fam.groups[g][0].toLowerCase() === key) return { f, g, note: '' };
                    }
                }
                const legacy = LEGACY_NOTES[key];
                if (legacy) {
                    const f = NOTE_WHEEL.findIndex(x => x.fam === legacy[0]);
                    const g = legacy[1] ? NOTE_WHEEL[f].groups.findIndex(x => x[0] === legacy[1]) : -1;
                    return { f, g, note: '' };
                }
                return null;
            },

            noteIntensities(brew) {
                const map = brew && brew.flavorNotes && typeof brew.flavorNotes === 'object' ? brew.flavorNotes : {};
                const out = {};
                this.extractFlavors(brew).forEach(n => { const v = Number(map[n]); out[n] = v >= 1 && v <= 3 ? v : 2; });
                return out;
            },

            describeCup(values, tasted, notes, intensities) {
                const on = k => tasted.includes(k);
                const adj = [];
                if (on('acidity')) adj.push({ Flat: 'flat', Balanced: 'gently acidic', Bright: 'bright' }[this.tasteWord('acidity', values.acidity)]);
                if (on('sweetness')) adj.push({ Dry: 'dry', Sweet: 'sweet', Syrupy: 'syrupy' }[this.tasteWord('sweetness', values.sweetness)]);
                if (on('body')) adj.push({ Thin: 'light-bodied', Medium: 'medium-bodied', Heavy: 'heavy-bodied' }[this.tasteWord('body', values.body)]);
                if (on('balance') && values.balance >= 8) adj.push('layered');
                if (on('bitterness') && values.bitterness >= 7) adj.push('bitter-edged');
                const off = new Set(NOTE_WHEEL[7].groups.flatMap(g => g[1]).map(n => n.toLowerCase()));
                const list = notes.filter(n => !off.has(n.toLowerCase())).map(n => ({ n, i: intensities[n] || 2 })).sort((a, b) => b.i - a.i)
                    .map(x => x.i === 3 ? `lots of ${x.n.toLowerCase()}` : x.i === 1 ? `a hint of ${x.n.toLowerCase()}` : x.n.toLowerCase());
                const finish = on('finish') ? { Short: 'a short finish', Clean: 'a clean finish', Lingering: 'a long finish' }[this.tasteWord('finish', values.finish)] : '';
                if (!adj.length && !list.length) return '';
                const join = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
                let out = adj.length ? join(adj) : '';
                if (list.length) out += (out ? ', with ' : 'Notes of ') + join(list);
                if (finish) out += `${out ? ' and ' : ''}${finish}`;
                return out.charAt(0).toUpperCase() + out.slice(1) + '.';
            },

            // ---- the log form
            formTasteValues() {
                const form = this.getBrewForm();
                const out = {};
                TASTE_KEYS.forEach(k => { out[k] = this.tasteTouched.has(k) && form && form[k] ? Number(form[k].value) : 5; });
                return out;
            },

            setTasteValues(values, tasted) {
                const form = this.getBrewForm();
                this.tasteTouched = new Set(tasted || []);
                TASTE_KEYS.forEach(k => { if (form && form[k]) form[k].value = this.tasteTouched.has(k) ? Math.round(this.asNumber(values && values[k], 5)) : 5; });
                this.paintTasteSliders();
            },

            onTasteInput(k, value) {
                this.tasteTouched.add(k);
                this.paintTasteSliders();
                this.renderTasteTip();
                this.renderCupWords();
            },

            paintTasteSliders() {
                const form = this.getBrewForm();
                const ref = this.tasteReference();
                document.querySelectorAll('#brew-modal .ns').forEach(row => {
                    const k = row.getAttribute('data-k');
                    const input = form && form[k];
                    const set = this.tasteTouched.has(k);
                    const v = input ? Number(input.value) : 5;
                    row.classList.toggle('set', set);
                    const valEl = row.querySelector('.ns-val'), wordEl = row.querySelector('.ns-word');
                    if (valEl) valEl.textContent = set ? String(v) : '–';
                    if (wordEl) wordEl.textContent = set ? this.tasteWord(k, v) : 'not set';
                    row.querySelectorAll('.ns-ticks span').forEach((t, i) => t.classList.toggle('on', set && i + 1 === v));
                    if (input) input.style.setProperty('--p', ((Math.min(10, Math.max(1, v)) - 1) / 9).toFixed(4));
                    if (!row.style.getPropertyValue('--c-rgb')) { const c = row.style.getPropertyValue('--c').trim(); if (/^#/.test(c)) row.style.setProperty('--c-rgb', this.hexRgb(c)); }
                    const ghost = row.querySelector('.ns-ghost');
                    const rv = ref ? this.tasteValue(ref, k) : null;
                    if (ghost) {
                        ghost.hidden = rv === null;
                        if (rv !== null) { ghost.style.left = `calc(${(Math.round(rv) - 1) / 9} * (100% - 26px) + 13px)`; ghost.title = `Your best: ${rv}`; }
                    }
                });
            },

            // best-rated session of this coffee by you (same method when possible), not the one being edited
            tasteReference() {
                if (!this.user || !this.activeGroup) return null;
                const form = this.getBrewForm();
                const editing = form && form.elements && form.elements.id ? String(form.elements.id.value || '') : '';
                const method = form && form.method ? form.method.value : '';
                const key = this.beanGroupKey(this.activeGroup.meta);
                const mine = this.brewsOf(this.user).filter(b => String(b.id) !== editing && this.groupKeyOfBrew(b) === key && this.normalizeRating(b.rating) > 0);
                const pool = mine.filter(b => !method || b.method === method);
                const list = method ? pool : mine;
                let best = null;
                list.forEach(b => { const r = this.normalizeRating(b.rating), br = best ? this.normalizeRating(best.rating) : -1; if (r > br || (r === br && this.isEarlier(best, b))) best = b; });
                return best;
            },

            renderTasteSection() {
                const host = document.getElementById('taste-shape');
                if (host && typeof FlavorShape !== 'undefined') {
                    if (!this.tasteView) {
                        this.tasteView = FlavorShape.createView({ values: () => this.formTasteValues(), ghost: () => { const r = this.tasteReference(); return r ? this.shapeValues(r) : null; }, ghostLabel: 'Best', isSet: k => this.tasteTouched.has(k) });
                    }
                    if (this.tasteView.el.parentNode !== host && typeof host.replaceChildren === 'function') host.replaceChildren(this.tasteView.el);
                    this.tasteView.start();
                }
                const ref = this.tasteReference();
                const target = document.getElementById('taste-target');
                if (target) {
                    target.hidden = !ref;
                    if (ref) target.innerHTML = `<span>Target</span><b>Your best ${this.shotWord(this.readFormRecipe().method)} · ${this.esc(this.shortDate(ref.date))} · ${this.esc(this.fmtNum(this.normalizeRating(ref.rating)))}★ · ${this.esc(this.recipeLine(ref, true))}</b>`;
                }
                this.paintTasteSliders();
                this.renderTasteTip();
                this.renderCupWords();
            },

            readFormRecipe() {
                const form = this.getBrewForm();
                const num = name => (form && form[name] && form[name].value !== '' ? Number(form[name].value) : null);
                return { method: form && form.method ? form.method.value : '', grind: form && form.grind ? (this.grindText(form.grind.value) || null) : null, dose: num('dose'), yield: num('yield'), time: num('time') };
            },

            // reads a shot against a reference shot of the same coffee; evidence + confidence
            adviseAgainst(cur, ref) {
                const R = ref, esp = cur.method === 'Espresso';
                const on = k => cur.tasted.includes(k) && this.tasteValue(R, k) !== null;
                const dl = k => on(k) ? cur.values[k] - this.tasteValue(R, k) : null;
                const dA = dl('acidity'), dS = dl('sweetness'), dB = dl('body'), dF = dl('finish'), dX = dl('bitterness');
                const rTime = this.num(R.time), rDose = this.num(R.dose), rYield = this.num(R.yield);
                const dT = cur.time != null && cur.time > 0 && rTime ? cur.time - rTime : null;
                const r = cur.dose && cur.yield ? cur.yield / cur.dose : 0, rR = rDose && rYield ? rYield / rDose : 0;
                const sg = v => (v > 0 ? `+${this.fmtNum(v)}` : `−${this.fmtNum(Math.abs(v))}`);
                let under = 0, over = 0;
                const ev = [];
                const add = (cond, side, w, text) => { if (!cond) return; if (side === 'under') under += w; if (side === 'over') over += w; ev.push({ side, text }); };
                add(dA !== null && dA >= 2, 'under', dA >= 3 ? 1.5 : 1, `More acidic (${sg(dA)})`);
                add(dX !== null && dX >= 2, 'over', dX >= 3 ? 1.5 : 1, `More bitter (${sg(dX)})`);
                add(dB !== null && dB <= -2, 'under', 0.5, `Thinner (${sg(dB)})`);
                add(dF !== null && dF <= -2 && !(dX >= 2), 'under', 0.5, `Shorter finish (${sg(dF)})`);
                add(esp && dT !== null && dT <= -4, 'under', dT <= -7 ? 1.5 : 1, `Ran ${this.fmtNum(-dT)} s faster`);
                add(esp && dT !== null && dT >= 4, 'over', dT >= 7 ? 1.5 : 1, `Ran ${this.fmtNum(dT)} s slower`);
                const offNotes = (cur.notes || []).map(n => String(n).toLowerCase());
                if (offNotes.some(n => ['sour', 'sharp', 'salty', 'grassy', 'thin'].includes(n))) { under += 1; ev.push({ side: 'under', text: 'Tasted sour or sharp' }); }
                if (offNotes.some(n => ['bitter', 'harsh', 'ashy', 'drying', 'burnt'].includes(n))) { over += 1; ev.push({ side: 'over', text: 'Tasted bitter or harsh' }); }
                if (dS !== null && dS <= -2) { ev.push({ side: 'off', text: `Less sweet (${sg(dS)})` }); if (under > over) under += 0.5; else if (over > under) over += 0.5; }
                const tasted = cur.tasted.filter(k => this.tasteValue(R, k) !== null);
                const conf = s => s >= 3 ? 'strong read' : s >= 2 ? 'likely' : 'possible';
                const base = { ok: true, ref: R, evidence: ev };
                if (!tasted.length && dT === null && !ev.length) return { ok: false, ref: R, head: 'Move the sliders that felt different from your best shot, and your tip appears here.', evidence: [] };
                const grindLine = dir => (this.grindText(cur.grind) && this.grindText(R.grind) && !this.sameGrind(cur.grind, R.grind))
                    ? `Your best shot used ${this.grindText(R.grind)}; this one was ${this.grindText(cur.grind)}. Head back toward it.`
                    : `Go a little ${dir}${this.grindText(cur.grind) ? ` than ${this.grindText(cur.grind)}` : ''}.`;
                if ((dA !== null && dA >= 2 && dX !== null && dX >= 2) || (under >= 1 && over >= 1 && under === over))
                    return { ...base, conf: 'likely', head: 'Sour and bitter at once: even out the puck before touching grind.', detail: 'That usually means channeling: part of the bed under-extracts while another part over-extracts. Check distribution and tamping.' };
                if (under >= 1.5 && under >= over * 1.5)
                    return { ...base, conf: conf(under), head: 'Under-extracted: grind finer.', detail: grindLine('finer') + (esp && dT !== null && dT <= -4 ? ` It should also slow the shot back toward ${this.fmtNum(rTime)} s.` : '') };
                if (over >= 1.5 && over >= under * 1.5)
                    return { ...base, conf: conf(over), head: 'Over-extracted: grind coarser.', detail: grindLine('coarser') + (esp && dT !== null && dT >= 4 ? ` It should also speed the shot back toward ${this.fmtNum(rTime)} s.` : '') };
                if (dB !== null && dB <= -2 && dF !== null && dF <= -2) {
                    ev.push({ side: 'off', text: 'Weaker overall' });
                    return { ...base, conf: 'likely', head: esp ? `Too weak: keep the grind, stop earlier${rR ? `, around 1:${Math.max(1, rR - 0.1).toFixed(1)}` : ''}.` : 'Too weak: keep the grind, use a little more coffee.', detail: `Body and finish both dropped without a sour or bitter signal, so it's strength (ratio), not extraction (grind).${rR ? ` Your best shot was 1:${rR.toFixed(1)}${r ? `; this one 1:${r.toFixed(1)}` : ''}.` : ''}` };
                }
                if (dB !== null && dB >= 2 && !(dX >= 2)) {
                    ev.push({ side: 'off', text: `Heavier (${sg(dB)})` });
                    return { ...base, conf: 'possible', head: esp ? `A bit heavy: keep the grind, pull a little longer${rR ? `, around 1:${(rR + 0.2).toFixed(1)}` : ''}.` : 'A bit heavy: keep the grind, use a little less coffee.', detail: 'Body rose without bitterness, which points to strength, not extraction.' };
                }
                if (tasted.every(k => Math.abs(cur.values[k] - this.tasteValue(R, k)) <= 1) && (dT === null || Math.abs(dT) <= 3) && !ev.length) {
                    ev.push({ side: 'ok', text: 'Within 1 of your best on every slider you moved' });
                    return { ...base, conf: '', head: 'Right on your target. Keep this recipe.', detail: 'Worth pinning as Master if it keeps repeating.' };
                }
                if (dS !== null && dS <= -2) return { ...base, conf: 'possible', head: 'Less sweet than your best, but no clear direction yet.', detail: 'If it tasted sharp, raise Acidity. If it tasted harsh or drying, raise Bitterness. Then the tip can tell finer from coarser.' };
                return { ...base, conf: 'possible', head: 'A little different from your best shot, but nothing points to grind or ratio.', detail: 'Keep the recipe and see if the difference repeats.' };
            },

            renderTipHtml(a, method = '') {
                if (!a) return '';
                a = this.methodWorded(a, method);   // v15.1: shot for espresso, brew for the rest
                const w = this.shotWord(method);
                const ev = a.ok && a.evidence && a.evidence.length ? `<div class="ev">${a.evidence.map(e => `<span class="evc ${e.side}">${this.esc(e.text)}</span>`).join('')}</div>` : '';
                const ref = a.ok && a.ref ? `<div class="next-detail">Compared with your best ${w} of this coffee (${this.esc(this.shortDate(a.ref.date))}, ${this.esc(this.fmtNum(this.normalizeRating(a.ref.rating)))}★).</div>` : '';
                return `<div class="next-card${a.ok ? '' : ' empty'}"><div class="next-title">Next ${w}${a.conf ? ` · ${this.esc(a.conf)}` : ''}</div><div class="next-headline">${this.esc(a.head)}</div>${a.ok && a.detail ? `<div class="next-detail">${this.esc(a.detail)}</div>` : ''}${a.note ? `<div class="next-detail">${this.esc(a.note)}</div>` : ''}${ev}${ref}</div>`;
            },

            // v11.7: the Next-shot tip follows everything you type, not just notes and sliders
            onBrewFormInput(e) {
                const t = e && e.target;
                if (!t || !/^(grind|dose|yield|time|rating|recipe-ratio|time-input)$/.test(t.name || t.id || '')) return;
                this.renderTasteTip();   // right away: a deferred refresh could miss the last keystroke
            },

            renderTasteTip() {
                const box = document.getElementById('taste-tip');
                if (!box) return;
                const c = this.coachFromForm();
                if (c.method && this.activeGroup) { box.innerHTML = this.coachHtml(this.coach(c), `Next ${this.shotWord(c.method)}`); return; }
                const ref = this.tasteReference();
                const tasted = [...this.tasteTouched];
                const cur = { values: this.formTasteValues(), tasted, notes: [...this.selFlavors], ...this.readFormRecipe() };
                if (ref) { box.innerHTML = this.renderTipHtml(this.adviseAgainst(cur, ref), cur.method); return; }
                // no best shot of this coffee yet: read the shot on its own
                const form = this.getBrewForm();
                const editing = form && form.elements && form.elements.id ? form.elements.id.value : '';
                const ctx = this.activeGroup ? this.firstShotContext(this.beanGroupKey(this.activeGroup.meta), this.user, cur.method, editing) : {};
                box.innerHTML = this.renderTipHtml(this.adviseFirstShot(cur, ctx), cur.method);
            },

            updateNextShotHint() {
                this.paintTasteSliders();
                this.renderTasteTip();
                const target = document.getElementById('taste-target');
                const ref = this.tasteReference();
                if (target) { target.hidden = !ref; if (ref) target.innerHTML = `<span>Target</span><b>Your best ${this.shotWord(this.readFormRecipe().method)} · ${this.esc(this.shortDate(ref.date))} · ${this.esc(this.fmtNum(this.normalizeRating(ref.rating)))}★ · ${this.esc(this.recipeLine(ref, true))}</b>`; }
            },

            // ---- notes wheel in the log form
            setWheel(f, g, event) {
                if (event) event.stopPropagation();
                this.wheelFam = f; this.wheelGroup = g;
                this.renderNotePicker();
            },

            pickNote(name, event) {
                if (event) event.stopPropagation();
                const i = this.selFlavors.indexOf(name);
                if (i >= 0) { this.selFlavors.splice(i, 1); delete this.noteIntensity[name]; }
                else { this.selFlavors.push(name); this.noteIntensity[name] = this.noteIntensity[name] || 2; }
                this.renderNotePicker();
                this.renderTasteTip();
            },

            cycleNote(name, event) {
                if (event) event.stopPropagation();
                this.noteIntensity[name] = ((this.noteIntensity[name] || 2) % 3) + 1;
                this.renderNotePicker();
            },

            wheelSvg(opts) {
                // opts: { fam, group, interactive, counts: {famIndex: n}, groupCounts: {"f:g": n}, size }
                const cx = 160, cy = 160, r0 = 58, r1 = 150;
                const arc = (a0, a1) => {
                    const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
                    const large = a1 - a0 > Math.PI ? 1 : 0;
                    return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
                };
                const fam = opts.fam;
                const items = fam == null
                    ? NOTE_WHEEL.map((f, i) => ({ label: f.fam, color: f.color, count: (opts.counts || {})[i] || 0, act: `app.setWheel(${i}, null, event)` }))
                    : NOTE_WHEEL[fam].groups.map(([g], i) => ({ label: g, color: NOTE_WHEEL[fam].color, count: (opts.groupCounts || {})[`${fam}:${i}`] || 0, sel: opts.group === i, act: `app.setWheel(${fam}, ${opts.group === i ? 'null' : i}, event)` }));
                const n = items.length, start = -Math.PI / 2 - Math.PI / n;
                const lit = !opts.interactive && items.some(it => it.count);
                const parts = items.map((it, i) => {
                    const a0 = start + (i / n) * 2 * Math.PI, a1 = start + ((i + 1) / n) * 2 * Math.PI, mid = (a0 + a1) / 2, rm = (r0 + r1) / 2 + 8;
                    const dim = (fam != null && opts.group != null && !it.sel) || (lit && !it.count);
                    const words = it.label.split(' ');
                    const lines = words.length > 1 && it.label.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [it.label];
                    const tx = cx + rm * Math.cos(mid), ty = cy + rm * Math.sin(mid);
                    const text = lines.map((ln, j) => `<text x="${tx.toFixed(1)}" y="${(ty + (j - (lines.length - 1) / 2) * 13).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${this.esc(ln)}</text>`).join('');
                    const badge = it.count ? `<text class="w-count" x="${tx.toFixed(1)}" y="${(ty + lines.length * 7 + 9).toFixed(1)}" text-anchor="middle">${opts.interactive ? `${it.count} picked` : `×${it.count}`}</text>` : '';
                    const click = opts.interactive ? ` onclick="${it.act}" role="button" tabindex="0" aria-label="${this.esc(it.label)}"` : '';
                    return `<path d="${arc(a0, a1)}" fill="${it.color}" fill-opacity="${dim ? 0.22 : 1}"${click}></path>${text}${badge}`;
                }).join('');
                const center = fam == null
                    ? `<circle class="w-center" cx="${cx}" cy="${cy}" r="${r0 - 4}"></circle><text class="w-ctext" x="${cx}" y="${cy - 5}" text-anchor="middle">${opts.interactive ? 'Tap a' : 'Flavor'}</text><text class="w-ctext" x="${cx}" y="${cy + 12}" text-anchor="middle">${opts.interactive ? 'family' : 'wheel'}</text>`
                    : `<circle class="w-center" cx="${cx}" cy="${cy}" r="${r0 - 4}" onclick="app.setWheel(null, null, event)" role="button" tabindex="0" aria-label="All families"></circle><text class="w-ctext" x="${cx}" y="${cy - 5}" text-anchor="middle" style="font-size:${NOTE_WHEEL[fam].fam.length > 9 ? 11 : 13}px">${this.esc(NOTE_WHEEL[fam].fam)}</text><text class="w-csub" x="${cx}" y="${cy + 12}" text-anchor="middle">‹ All families</text>`;
                // v12.11: lit from above, raised center
                const uid = (this._wheelN = (this._wheelN || 0) + 1);
                const defs = `<defs><linearGradient id="wsh${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.26"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.05"/><stop offset="0.58" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient><radialGradient id="wcn${uid}" cx="0.5" cy="0.28" r="0.8"><stop offset="0" class="wc-hi"/><stop offset="1" class="wc-lo"/></radialGradient><filter id="wlf${uid}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.3"/></filter></defs>`;
                const ring = `<path class="w-sheen" d="M${cx - r1} ${cy} A${r1} ${r1} 0 1 0 ${cx + r1} ${cy} A${r1} ${r1} 0 1 0 ${cx - r1} ${cy} Z M${cx - r0} ${cy} A${r0} ${r0} 0 1 1 ${cx + r0} ${cy} A${r0} ${r0} 0 1 1 ${cx - r0} ${cy} Z" fill="url(#wsh${uid})" fill-rule="evenodd" pointer-events="none"></path>`;
                const wedges = (parts.match(/<path[^>]*><\/path>/g) || []).join(''), labels = parts.replace(/<path[^>]*><\/path>/g, '');
                const mid = center.replace(/<circle class="w-center"([^>]*)><\/circle>/, (m, a) => `<circle class="w-center" filter="url(#wlf${uid})"${a}></circle><circle class="w-csheen" cx="${cx}" cy="${cy}" r="${r0 - 4}" fill="url(#wcn${uid})" pointer-events="none"></circle>`);
                return `<svg class="wheel-svg${opts.interactive ? ' interactive' : ''}" viewBox="0 0 320 320" role="group" aria-label="Flavor wheel">${defs}${wedges}${ring}${labels}${mid}</svg>`;
            },

            renderNotePicker() {
                const wheel = document.getElementById('note-wheel');
                if (!wheel) return;
                const counts = {}, groupCounts = {};
                this.selFlavors.forEach(n => { const at = this.noteLocate(n); if (!at) return; counts[at.f] = (counts[at.f] || 0) + 1; if (at.g >= 0) groupCounts[`${at.f}:${at.g}`] = (groupCounts[`${at.f}:${at.g}`] || 0) + 1; });
                wheel.innerHTML = this.wheelSvg({ fam: this.wheelFam, group: this.wheelGroup, interactive: true, counts, groupCounts });
                const tray = document.getElementById('note-tray');
                if (tray) {
                    if (this.wheelFam == null) tray.innerHTML = '<p class="note-help">Start broad, then go specific. “Tastes off” notes help the coach most.</p>';
                    else {
                        const groups = this.wheelGroup == null ? NOTE_WHEEL[this.wheelFam].groups : [NOTE_WHEEL[this.wheelFam].groups[this.wheelGroup]];
                        tray.innerHTML = groups.map(([g, notes]) => `${this.wheelGroup == null ? `<div class="note-group">${this.esc(g)}</div>` : ''}<div class="note-chips">${notes.map(nm => `<button type="button" class="note-chip" aria-pressed="${this.selFlavors.includes(nm)}" onclick="app.pickNote('${app.escJs(nm)}', event)">${this.esc(nm)}</button>`).join('')}</div>`).join('');
                    }
                }
                const picked = document.getElementById('note-picked');
                if (picked) {
                    picked.innerHTML = this.selFlavors.length ? `<div class="note-group">Your notes</div><div class="note-picked">${this.selFlavors.map(nm => {
                        const lv = this.noteIntensity[nm] || 2;
                        const at = this.noteLocate(nm);
                        const color = at ? NOTE_WHEEL[at.f].color : 'var(--text-muted)';
                        return `<span class="pick fam-pick" style="--fc:${color};${this.famVars(/^#/.test(color) ? color : '#7D8984')}"><i class="pick-dot"></i>${this.esc(nm)}<button type="button" class="dots" onclick="app.cycleNote('${app.escJs(nm)}', event)" aria-label="${this.esc(nm)} strength ${lv} of 3">${[1, 2, 3].map(i => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</button><button type="button" class="x" onclick="app.pickNote('${app.escJs(nm)}', event)" aria-label="Remove ${this.esc(nm)}">×</button></span>`;
                    }).join('')}</div>` : '';
                }
                const hints = document.getElementById('note-hints');
                if (hints) {
                    const counts2 = new Map();
                    if (this.activeGroup) {
                        const key = this.beanGroupKey(this.activeGroup.meta);
                        Array.from(this.brews.values()).filter(b => this.groupKeyOfBrew(b) === key).forEach(b => this.extractFlavors(b).forEach(n => counts2.set(n, (counts2.get(n) || 0) + 1)));
                    }
                    const top = [...counts2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
                    hints.innerHTML = top.length ? `<div class="note-hints"><span>Others noted:</span>${top.map(nm => `<button type="button" class="note-chip hint" aria-pressed="${this.selFlavors.includes(nm)}" onclick="app.pickNote('${app.escJs(nm)}', event)">${this.esc(nm)}</button>`).join('')}</div>` : '';
                }
                this.renderCupWords();
            },

            renderCupWords() {
                const box = document.getElementById('note-words');
                if (!box) return;
                const text = this.describeCup(this.formTasteValues(), [...this.tasteTouched], [...this.selFlavors], this.noteIntensity);
                box.hidden = !text;
                box.innerHTML = text ? `<span class="k">Your cup in words</span><span class="t">${this.esc(text)}</span><button type="button" class="link-btn" onclick="app.useCupWords(event)">Use as observations</button>` : '';
            },

            useCupWords(event) {
                if (event) event.stopPropagation();
                const form = this.getBrewForm();
                const text = this.describeCup(this.formTasteValues(), [...this.tasteTouched], [...this.selFlavors], this.noteIntensity);
                if (!form || !text) return;
                form.notes.value = form.notes.value.trim() ? `${form.notes.value.trim()} ${text}` : text;
            },

            resetTasteForm(source) {
                this.wheelFam = null; this.wheelGroup = null;
                if (source) {
                    this.setTasteValues(source, this.tastedKeys(source));
                    this.noteIntensity = this.noteIntensities(source);
                } else {
                    this.setTasteValues({}, []);
                    this.noteIntensity = {};
                }
            },

