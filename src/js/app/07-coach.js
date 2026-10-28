            // ===================== Barista coach (v11.5) =====================
            // Reads what you wrote, weighs the recipe against your best shot on this coffee, learns your grinder,
            // and gives one change at a time, with the why, the next recipe, and the context behind it.
            coachRead(text, ctx) {
                const out = { under: 0, over: 0, weak: 0, strong: 0, good: 0, quotes: [] };
                const s = String(text || '').toLowerCase().replace(/[‘’]/g, "'");
                if (!s.trim()) return out;
                // v11.6: "I cooked" / "we cooked" is praise on a 4★+ shot or next to praise words
                const praised = (ctx && Number(ctx.rating) >= 4) || s.split(/[.!?;\n]+/).some(sent => {
                    const re = /\b(sweet|balanced|smooth|juicy|perfect|delicious|amazing|yummy|fuego|great|tasty|so good|really good|love)\b/g;
                    let m;
                    while ((m = re.exec(sent))) { const lead = sent.slice(Math.max(0, m.index - 20), m.index); if (!/\b(not|no|never|without)\b[^,]*$|n't\s+(\w+\s+)?$/.test(lead)) return true; }
                    return false;
                });
                const rules = [
                    [/\bsour(ness)?\b/g, 'under', 1.5], [/\btart\b/g, 'under', 0.7], [/\bsharp\b/g, 'under', 0.8], [/\bsalty\b/g, 'under', 1.1],
                    [/\bgrassy\b|\bvegetal\b/g, 'under', 0.8], [/\bunder[- ]?extract\w*/g, 'under', 1.2], [/\btoo (acidic|bright)\b/g, 'under', 0.9],
                    [/\bbitter(ness)?\b/g, 'over', 1.3], [/\bharsh\b/g, 'over', 1.1], [/\bastringen\w*/g, 'over', 1.2], [/\bashy\b|\bburnt\b|\bacrid\b|\bchalky\b/g, 'over', 1.1],
                    [/\bover[- ]?(extract\w*|cook\w*|pull\w*)/g, 'over', 1.1], [/\bcooked\b/g, 'over', 1.0], [/\bdry(ing)?\b(?![- ]?process)/g, 'over', 0.4],
                    [/\bweak\b|\bwatery\b|\bthin\b|\blacking body\b/g, 'weak', 1], [/\btoo (strong|intense|heavy)\b|\boverpowering\b/g, 'strong', 1],
                    [/\b(sweet|balanced|smooth|juicy|perfect|delicious|amazing|yummy|fuego|great)\b/g, 'good', 0.6]
                ];
                s.split(/[.!?;\n]+/).forEach(sent => {
                    const deliberate = /\b(to see|to try|on purpose|intentionally|experiment\w*|to make it)\b/.test(sent);
                    const hedged = /\b(at times|sometimes|usually|normally|typically|can be)\b/.test(sent);
                    rules.forEach(([re, side, w]) => {
                        re.lastIndex = 0;
                        let m;
                        while ((m = re.exec(sent))) {
                            const before = sent.slice(Math.max(0, m.index - 30), m.index);
                            const lead = before.trim().split(/\s+/).slice(-3).join(' ');
                            if (/\b(not|no|never|without|barely|hardly|zero|any|free of)\b|n't\b|\bno longer\b|\binstead of\b/.test(lead) || /\binstead of\s*$/.test(before)) continue;
                            // v13.4: flavor names, not defects ("sour cherry", "sour patch", "bitter-sweet", "bitter chocolate")
                            const after = sent.slice(m.index + m[0].length, m.index + m[0].length + 14);
                            if (/^sour$/.test(m[0]) && /^[\s-]*(cherr|patch|plum|apple|candy|dough|cream|orange|grape|berr)/.test(after)) continue;
                            if (/^bitter$/.test(m[0]) && /^[\s-]*(sweet|chocolate|cocoa|orange|almond|melon)/.test(after)) continue;
                            if (/^\s*-?\s*free\b/.test(after)) continue;   // "bitter-free", "sour free"
                            let k = w;
                            if (/\bless\b/.test(lead)) k *= -0.3;
                            if (/\b(really|very|super|so|too|way|still|extremely|crazy)\b/.test(lead)) k *= 1.4;
                            if (hedged && side !== 'good') k *= 0.5;
                            const cookWord = side === 'over' && /cook/.test(m[0]), bareCook = cookWord && /^cook/.test(m[0]);
                            if (bareCook && /\bover[- ]?$/.test(before)) continue;   // "over cooked" counts once, via the over- rule
                            const objIt = /^\s+(it|again)\b/.test(sent.slice(m.index + m[0].length));
                            const firstPerson = /\b(i|we)\s+(just\s+|really\s+|totally\s+|so\s+)?$/.test(before);
                            if (bareCook && !objIt && firstPerson && praised && !deliberate) { out.good += 0.6; continue; }   // "I COOKED!" = nailed it
                            if (side === 'over' && /^over/.test(m[0]) && !cookWord && (deliberate || /\b(i|we)\s+$/.test(before))) k *= deliberate ? 0.2 : 0.6;
                            else if (cookWord && deliberate) k *= 0.2;
                            else if (bareCook && !objIt && firstPerson) k *= 0.6;   // bare "I cooked" on a so-so shot: ambiguous, keep it mild
                            out[side] += k;
                            if (k > 0.5 && !hedged && side !== 'good' && out.quotes.length < 3) {
                                const lead2 = before.trim().split(/\s+/).slice(-2); while (lead2.length && /^(be|is|was|it|its|it's|that|the|a|and|but|so|to|of)$/.test(lead2[0])) lead2.shift();
                                const q = `${lead2.join(' ')} ${m[0]}`.trim();
                                if (!out.quotes.some(x => x.q === q)) out.quotes.push({ side, q });
                            }
                        }
                    });
                });
                return out;
            },

            coachFromBrew(brew) {
                return { id: String(brew.id), owner: this.getBrewOwner(brew), beanKey: this.groupKeyOfBrew(brew), beanId: String(brew.beanId || ''), method: brew.method || '', date: brew.date,
                    grind: brew.grind, dose: this.num(brew.dose), yield: this.num(brew.yield), time: this.num(brew.time), rating: this.normalizeRating(brew.rating),
                    text: this.getBrewNotes(brew), flavors: this.extractFlavors(brew), values: this.shapeValues(brew), tasted: this.tastedKeys(brew), tastedExplicit: Array.isArray(brew.tasted) && brew.tasted.length > 0,   /* v16.2: an empty list is no list (see tasteValue) */ verdict: String(brew.verdict || ''), grinder: this.grinderFor(brew) };
            },

            coachFromForm() {
                const form = this.getBrewForm();
                const editing = form && form.elements && form.elements.id ? String(form.elements.id.value || '') : '';
                const existing = editing ? this.brews.get(editing) : null;
                const r = this.readFormRecipe();
                return { id: editing, owner: this.user, beanKey: this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) : '', beanId: String(this.activeId || ''), method: r.method,
                    date: existing ? existing.date : new Date().toISOString(), grind: form && form.grind ? form.grind.value : '', dose: this.num(r.dose), yield: this.num(r.yield), time: this.num(r.time),
                    rating: form && form.rating ? this.normalizeRating(form.rating.value) : 0, text: form && form.notes ? form.notes.value : '', flavors: [...this.selFlavors],
                    values: this.formTasteValues(), tasted: [...this.tasteTouched], tastedExplicit: true, grinder: this.formGrinder(r.method) };
            },

            // shots on this coffee by this person and method, up to this one (older cards never see the future)
            coachPast(c) {
                const t = this.localTime(c.date);
                return Array.from(this.brews.values()).filter(b => String(b.id) !== c.id && this.getBrewOwner(b) === c.owner && (b.method || '') === c.method
                    && this.groupKeyOfBrew(b) === c.beanKey && (!Number.isFinite(t) || !(this.localTime(b.date) > t)) && !(this.learnPotatoBrew && this.learnPotatoBrew(b)))   // (v19.0: a potato-defect cup isn't a best shot)
                    .sort((a, b) => this.localTime(a.date) - this.localTime(b.date));
            },

            // letter settings sort by number, then letter: 6E < 8A < 8e
            grindOrd(v) {
                const n = this.grindNum(v);
                if (n !== null) return n;
                const m = /^(\d+(?:[.,]\d+)?)\s*([a-z])$/i.exec(String(v === null || v === undefined ? '' : v).trim());
                return m ? Number(m[1].replace(',', '.')) + (m[2].toLowerCase().charCodeAt(0) - 96) / 100 : null;
            },

            // v11.6: which way is finer, and the usual step, from this person's own shots up to this one.
            // Whole steps vs decimals and step size: this coffee first, then the last 30 days, then all-time.
            // v15.7: only shots on the same grinder as this one (each grinder has its own memory)
            grindModel(owner, method, c) {
                const t = c ? this.localTime(c.date) : NaN;
                const gr = c ? c.grinder || null : null;
                const mine = this.brewsOf(owner).filter(b => (b.method || '') === method && this.grindOrd(b.grind) !== null && this.num(b.time) > 0 && (!Number.isFinite(t) || !(this.localTime(b.date) > t)));
                const all = mine.filter(b => this.sameGrinder(this.grinderFor(b), gr))
                    .sort((a, b) => this.localTime(a.date) - this.localTime(b.date));
                const otherGrinder = !!gr && mine.some(b => !this.sameGrinder(this.grinderFor(b), gr));
                const key = c ? c.beanKey : null;
                // direction: consecutive shots on the same coffee, written the same way (numbers vs letters); changes under 4 s are noise
                const dirOf = list => {
                    let s = 0; const pairs = [];
                    for (let i = 1; i < list.length; i++) {
                        const a = list[i - 1], b = list[i];
                        if (this.groupKeyOfBrew(a) !== this.groupKeyOfBrew(b) || (this.grindNum(a.grind) === null) !== (this.grindNum(b.grind) === null)) continue;
                        const dg = this.grindOrd(b.grind) - this.grindOrd(a.grind), dt = this.num(b.time) - this.num(a.time);
                        if (Math.abs(dg) < 1e-9 || Math.abs(dt) < 4) continue;
                        const w = Math.sign(dg) * Math.sign(dt) * Math.min(1, Math.abs(dt) / 5);
                        s += w; pairs.push({ from: a, to: b, dt, w });
                    }
                    const ev = pairs.filter(x => Math.sign(x.w) === Math.sign(s)).sort((x, y) => Math.abs(y.dt) - Math.abs(x.dt))[0] || null;   // an example that agrees
                    return { s, ev, pairs };
                };
                // v11.7: a grinder's direction doesn't change with the coffee, so use every shot so far written the same way as this one
                const curLetter = !!c && this.grindNum(c.grind) === null && this.grindOrd(c.grind) !== null;
                const dir = dirOf(all.filter(b => (this.grindNum(b.grind) === null) === curLetter));
                const s = dir.s;
                const dirEv = (key && dir.pairs.filter(x => Math.sign(x.w) === Math.sign(s) && this.groupKeyOfBrew(x.to) === key).sort((x, y) => Math.abs(y.dt) - Math.abs(x.dt))[0]) || dir.ev;
                const numeric = all.filter(b => this.grindNum(b.grind) !== null);
                const tiers = [['this coffee', numeric.filter(b => key && this.groupKeyOfBrew(b) === key)],
                    ['last 30 days', numeric.filter(b => Number.isFinite(t) && t - this.localTime(b.date) <= 30 * 864e5)],
                    ['all-time', numeric]];
                const stepsOf = list => { const out = []; for (let i = 1; i < list.length; i++) { if (this.groupKeyOfBrew(list[i]) !== this.groupKeyOfBrew(list[i - 1])) continue; const d = Math.round(Math.abs(this.grindNum(list[i].grind) - this.grindNum(list[i - 1].grind)) * 100) / 100; if (d > 0) out.push(d); } return out; };
                const wholeTier = tiers.find(([, l]) => l.length >= 2);
                const ints = wholeTier ? wholeTier[1].every(b => Number.isInteger(this.grindNum(b.grind))) : !(c && /[.,]\d*[1-9]/.test(String(c.grind || '')));
                let stepFrom = '', steps = [];
                for (const [name, l] of tiers) { const st = stepsOf(l); if (st.length >= 2) { stepFrom = name; steps = st; break; } }   // v11.7: 2+ changes before a tier counts
                if (!steps.length) for (const [name, l] of tiers) { const st = stepsOf(l); if (st.length) { stepFrom = name; steps = st; break; } }
                // the usual step = the most common one (ties go to the smaller, gentler move)
                const freq = new Map(); steps.forEach(d => freq.set(d, (freq.get(d) || 0) + 1));
                let step = steps.length ? [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : (ints ? 1 : 0.1);
                const curDecimal = !!c && /^\s*\d+[.,]\d*[1-9]/.test(String(c.grind === null || c.grind === undefined ? '' : c.grind));
                step = Math.min(step, curDecimal ? 0.3 : 2);
                return { lowerFiner: s <= 0, step, learned: steps.length >= 2, ints, stepFrom, dirSure: Math.abs(s) >= 0.8, dirEv, grinder: gr, fresh: otherGrinder && steps.length < 2 };
            },

            nextGrind(g, dir, gm) {
                const n = this.grindNum(g);
                const txt = this.grindText(g);
                if (n === null) return txt ? `one step ${dir} than ${txt}` : `one step ${dir}`;
                const v = n + ((dir === 'finer') === gm.lowerFiner ? -gm.step : gm.step);
                if (v <= 0) return txt ? `one step ${dir} than ${txt}` : `one step ${dir}`;   // v13.4: no zero or negative settings
                return `grind ${this.fmtNum(Math.round(v * 100) / 100, 2)}`;
            },

            // same grind, shots getting faster day by day = the coffee is aging and wants a finer grind
            coachDrift(c, past) {
                if (c.method !== 'Espresso' || !(c.time > 0) || !this.grindText(c.grind)) return null;
                const same = past.filter(b => this.sameGrind(b.grind, c.grind) && this.num(b.time) > 0);
                if (same.length < 2) return null;
                const first = same[0], recent = [...same.slice(-1), { time: c.time }].map(b => this.num(b.time));
                const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
                return avg <= this.num(first.time) - 4 ? { first, from: this.num(first.time), lo: Math.min(...recent), hi: Math.max(...recent) } : null;
            },

            coachPalate(owner, method, excludeId) {
                const rows = this.brewsOf(owner).filter(b => (b.method || '') === method && String(b.id) !== excludeId && this.normalizeRating(b.rating) >= 4 && this.ratioOf(b) > 0 && this.num(b.time) > 0);
                if (rows.length < 3) return null;
                const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))]; };
                const ratios = rows.map(b => this.ratioOf(b)), times = rows.map(b => this.num(b.time));
                return { n: rows.length, r0: q(ratios, 0.25), r1: q(ratios, 0.75), t0: q(times, 0.25), t1: q(times, 0.75), tm: q(times, 0.5) };
            },

            // v11.6: median time of this person's other 4★+ shots on this coffee (null under 2 shots)
            coachCoffeeTimes(c) {
                const ts = this.brewsOf(c.owner).filter(b => (b.method || '') === c.method && String(b.id) !== c.id && this.groupKeyOfBrew(b) === c.beanKey && this.normalizeRating(b.rating) >= 4 && this.num(b.time) > 0)
                    .map(b => this.num(b.time)).sort((x, y) => x - y);
                if (ts.length < 2) return null;
                const h = ts.length / 2;
                return { n: ts.length, tm: ts.length % 2 ? ts[Math.floor(h)] : (ts[h - 1] + ts[h]) / 2 };
            },

            coachBean(c) {
                const bean = this.beans.get(c.beanId) || Array.from(this.beans.values()).find(b => this.beanGroupKey(b) === c.beanKey) || {};
                const counts = new Map();
                Array.from(this.brews.values()).filter(b => this.groupKeyOfBrew(b) === c.beanKey && this.normalizeRating(b.rating) >= 4).forEach(b => this.extractFlavors(b).forEach(n => {
                    const k = n.toLowerCase(); if (['sour', 'sharp', 'salty', 'grassy', 'thin', 'bitter', 'harsh', 'ashy', 'drying', 'burnt', 'astringent', 'dry'].includes(k)) return;
                    counts.set(k, { n, c: ((counts.get(k) || {}).c || 0) + this.normalizeRating(b.rating) });
                }));
                const notes = [...counts.values()].sort((a, b) => b.c - a.c).slice(0, 3).map(x => x.n.toLowerCase());
                const facts = [bean.origin, bean.process, bean.roast ? `${String(bean.roast).toLowerCase()} roast` : ''].filter(Boolean).map(x => String(x).toLowerCase().replace(/^\w/, ch => ch.toUpperCase()));
                return { name: bean.name || 'This coffee', facts, notes, light: /light/i.test(bean.roast || ''), dark: /dark/i.test(bean.roast || '') };
            },

            coach(c) {
                const esp = c.method === 'Espresso';
                const past = this.coachPast(c);
                const rate = b => this.normalizeRating(b.rating);
                let ref = null;
                past.forEach(b => { const r = rate(b); if (r <= 0) return; const br = ref ? rate(ref) : -1; if (r > br || (r === br && this.localTime(b.date) >= this.localTime(ref.date))) ref = b; });
                const refR = ref ? rate(ref) : 0;
                const read = this.coachRead(c.text, { rating: c.rating });
                const tags = (c.flavors || []).map(f => String(f).toLowerCase());
                const tagU = tags.filter(t => ['sour', 'sharp', 'salty', 'grassy', 'thin'].includes(t)).length, tagO = tags.filter(t => ['bitter', 'harsh', 'ashy', 'drying', 'burnt', 'astringent'].includes(t)).length;
                let U = read.under + Math.min(2, tagU) * 1.1 + (c.verdict === 'sour' ? 1.6 : 0), O = read.over + Math.min(2, tagO) * 1.0 + (c.verdict === 'bitter' ? 1.6 : 0);
                const sliderOnly = !read.quotes.length && !tagU && !tagO && !c.verdict;
                const v = k => (c.tasted || []).includes(k) ? Number(c.values[k]) : null;
                const absO = v('bitterness') !== null ? (v('bitterness') >= 9 ? 1.0 : v('bitterness') >= 7 ? 0.6 : 0) : 0;
                const absU = v('acidity') !== null && v('acidity') >= 8 && (v('sweetness') === null || v('sweetness') <= 5) ? 0.6 : 0;
                // v11.7: slider moves against your best shot of this coffee (2+ points): more acidity = sour side, more bitterness = bitter side,
                // and less sweetness strengthens whichever side it goes with
                let sU = 0, sO = 0, sSweet = false;
                if (ref && c.tastedExplicit) {   // only shots logged with "move only what felt different" (older rows rated each slider on its own)
                    const rv = this.shapeValues(ref);
                    const d = k => v(k) !== null ? v(k) - Number(rv[k]) : null;
                    const da = d('acidity'), db = d('bitterness'), ds = d('sweetness');
                    if (da !== null && da >= 2) sU = Math.min(1.2, 0.6 + 0.2 * (da - 2));
                    if (db !== null && db >= 2) sO = Math.min(1.2, 0.6 + 0.2 * (db - 2));
                    if (ds !== null && ds <= -2) { const k = Math.min(0.8, 0.4 + 0.2 * (-ds - 2)); if (sU > 0 && sU >= sO) { sU += k; sSweet = true; } else if (sO > 0) { sO += k; sSweet = true; } }
                }
                U += Math.max(absU, sU); O += Math.max(absO, sO);
                const weak = read.weak + (v('body') !== null && v('body') <= 3 && U < 1 && O < 1 ? 0.6 : 0), strong = read.strong;
                const ratio = c.dose > 0 && c.yield > 0 ? c.yield / c.dose : 0;
                const refRatio = ref ? this.ratioOf(ref) : 0, refT = ref ? this.num(ref.time) : 0;
                const dR = ratio && refRatio ? ratio - refRatio : 0;
                let dT = c.time > 0 && refT > 0 ? c.time - refT : null;
                const gm = this.grindModel(c.owner, c.method, c);
                const drift = this.coachDrift(c, past.filter(b => this.sameGrinder(this.grinderFor(b), c.grinder)));   // v15.7: same grind on the same grinder
                const refG = ref ? this.grinderFor(ref) : null, refSameG = this.sameGrinder(refG, c.grinder);
                const pal = this.coachPalate(c.owner, c.method, c.id);
                const bean = this.coachBean(c);
                // v11.6: time baseline = your best shot's time, unless it's an outlier; then your usual on this coffee, then your usual overall
                const cof = this.coachCoffeeTimes(c);
                const usual = cof ? { t: cof.tm, label: 'your usual on this coffee' } : pal ? { t: pal.tm, label: 'your usual' } : null;
                const refOut = !!(refT > 0 && usual && Math.abs(refT - usual.t) > 8);
                if (refOut && c.time > 0) dT = c.time - usual.t;
                const tLabel = refOut ? usual.label : 'your best', tLabelShot = refOut ? usual.label : 'your best shot';
                const ev = [], why = [];
                // no best shot yet: read time against what espresso normally takes
                let tU = 0, tO = 0;
                if (esp && !ref && c.time > 0) {
                    if (c.time > 34) { tO += c.time > 40 ? 1.2 : 0.8; ev.push({ side: 'over', text: `Ran slow (${this.fmtNum(c.time)} s)` }); }
                    else if (c.time < 22) { tU += c.time < 18 ? 1.2 : 0.8; ev.push({ side: 'under', text: `Ran fast (${this.fmtNum(c.time)} s)` }); }
                }
                if (esp && ref && dT !== null) { if (dT <= -4) tU += dT <= -7 ? 1.2 : 0.8; else if (dT >= 6) tO += dT >= 9 ? 1.2 : 0.8; }
                if (esp && c.time > 0 && c.time < 20) tU = Math.max(tU, 1.6);   // v11.7: under 20 s is fast, whatever the best shot did
                // time supports the taste; it only adds weight when the notes don't strongly say the opposite
                const U0 = U, O0 = O;
                if (O0 < 1.2) U += tU;
                if (U0 < 1.2) O += tO;
                const quote = side => read.quotes.filter(q => q.side === side).map(q => `\u201c${q.q}\u201d`);
                quote('under').forEach(q => ev.push({ side: 'under', text: q }));
                quote('over').forEach(q => ev.push({ side: 'over', text: q }));
                if (c.verdict === 'sour' || c.verdict === 'bitter') ev.push({ side: c.verdict === 'sour' ? 'under' : 'over', text: `Marked ${c.verdict}` });
                if (tagU) ev.push({ side: 'under', text: 'Tagged sour/sharp' });
                if (tagO) ev.push({ side: 'over', text: 'Tagged bitter/harsh' });
                if (sU >= 1.2 && sU >= sO) ev.push({ side: 'under', text: `Sliders: more acidic${sSweet ? ', less sweet' : ''} than your best` });
                else if (sO >= 1.2) ev.push({ side: 'over', text: `Sliders: more bitter${sSweet ? ', less sweet' : ''} than your best` });
                if (esp && dR >= 0.3) ev.push({ side: 'over', text: `Ran long: 1:${this.fmtNum(ratio, 1)} vs 1:${this.fmtNum(refRatio, 1)}` });
                if (esp && dT !== null && dT <= -4) ev.push({ side: 'under', text: `Ran ${this.fmtNum(-dT)} s faster than ${tLabel}` });
                if (esp && dT !== null && dT >= 6) ev.push({ side: 'over', text: `Ran ${this.fmtNum(dT)} s slower than ${tLabel}` });
                if (drift) ev.push({ side: 'under', text: `Same grind running faster (${this.fmtNum(drift.from)} s \u2192 ${this.fmtNum(drift.lo)}\u2013${this.fmtNum(drift.hi)} s)` });
                // the recipe we steer toward
                const dose = ref && Math.abs(this.num(ref.dose) - c.dose) >= 0.5 ? this.num(ref.dose) : (c.dose || this.num(ref && ref.dose));
                const tRatio = refRatio || (pal ? (pal.r0 + pal.r1) / 2 : (esp ? (bean.light ? 2.4 : bean.dark ? 2 : 2.2) : 0));
                let aimBase = refOut ? usual.t : (refT || (cof ? cof.tm : pal ? (pal.t0 + pal.t1) / 2 : 30));
                if (!usual) aimBase = Math.min(Math.max(aimBase, 24), 45);
                let aim = esp ? [Math.round(aimBase), Math.round(aimBase + (drift ? 6 : 4))] : null;
                const recipe = (grindStr, d, y) => [grindStr, d > 0 && y > 0 ? `${this.fmtNum(d, 1)} g \u2192 ${this.fmtNum(y, 1)} g (1:${this.fmtNum(y / d, 1)})` : '', aim ? `aim ${aim[0]}\u2013${aim[1]} s` : ''].filter(Boolean).join(' \u00b7 ');
                const keepG = this.grindText(c.grind) ? `grind ${this.grindText(c.grind)}` : '';
                const backYield = dose > 0 && tRatio ? Math.round(dose * tRatio) : c.yield;
                const finer = this.nextGrind(c.grind, 'finer', gm), coarser = this.nextGrind(c.grind, 'coarser', gm);
                const goDir = (dir, g) => g.startsWith('grind ') ? `grind ${dir}, to ${g.slice(6)}` : `grind ${dir} (${g})`;
                const strongest = Math.max(U, O);
                const saidU = read.quotes.some(q => q.side === 'under') || tagU > 0 || c.verdict === 'sour', saidO = read.quotes.some(q => q.side === 'over') || tagO > 0 || c.verdict === 'bitter';
                const plainG = g => g.startsWith('grind ') ? g.slice(6) : g;
                const confOf = sc => sc >= 3 ? 'strong read' : sc >= 1.8 ? 'likely' : 'possible';
                let mode = 'fix', head = '', next = '', conf = '';
                const words = side => quote(side).length ? `Your notes say ${quote(side).slice(0, 2).join(' and ')}.` : '';
                const blank = !(c.dose > 0) && !(c.yield > 0) && !(c.time > 0) && !c.text && !(c.tasted || []).length && !tags.length && !c.verdict && !(c.rating > 0);
                if (blank) {   // v11.7: nothing entered yet (the log form): ask, don't compare blanks
                    mode = 'ask'; conf = '';
                    head = 'Tell me how it tasted and I\'ll tell you what to change.';
                    why.push('A word or two in Observations is enough: sour, bitter, thin, sweet, harsh.');
                } else if (c.rating >= 4 && (ref ? (c.rating > refR || (c.rating === refR && Math.max(U0, O0) < 1.5)) : Math.max(U0, O0) < 1.5)) {   // v11.6: 'best yet' needs 4★+
                    mode = 'refine';
                    if (esp && c.time > 0) aim = [Math.round(c.time - 2), Math.round(c.time + 2)];
                    const best = ref ? (c.rating > refR ? `It beats your ${this.fmtNum(refR)}\u2605 from ${this.shortDate(ref.date)}.` : `It matches your ${this.fmtNum(refR)}\u2605 from ${this.shortDate(ref.date)}, your best so far.`) : 'Your first rated shot of this coffee.';   // v14.7: a tie isn't a win
                    if (c.rating >= 5 && U0 < 1 && O0 < 1) { head = 'Perfect score. Lock this recipe in.'; next = recipe(keepG, c.dose, c.yield); why.push(best, 'Repeat it exactly, and pin it as your master recipe.'); }
                    else if (saidU && U0 >= 1.2 && U0 > O0) { head = esp ? `Your best yet. Next time, let it run to ${this.fmtNum(c.yield + 2, 1)} g instead of ${this.fmtNum(c.yield, 1)} g.` : `Your best yet. Next time, grind one step finer (${plainG(finer)}).`; next = esp ? recipe(keepG, c.dose, c.yield + 2) : recipe(finer, c.dose, c.yield); why.push(best, words('under'), esp ? 'Letting a little more coffee through brings out more sweetness and softens that sourness, without touching the grind that got you here.' : 'A slightly finer grind extracts a little more sweetness to balance it.'); }
                    else if (saidO && O0 >= 1.2 && O0 > U0) { head = esp ? `Your best yet. Next time, stop it at ${this.fmtNum(Math.max(c.dose, c.yield - 2), 1)} g instead of ${this.fmtNum(c.yield, 1)} g.` : `Your best yet. Next time, grind one step coarser (${plainG(coarser)}).`; next = esp ? recipe(keepG, c.dose, Math.max(c.dose, c.yield - 2)) : recipe(coarser, c.dose, c.yield); why.push(best, words('over'), esp ? 'Stopping a little earlier leaves the harsher end of the shot behind and keeps the sweetness.' : 'A slightly coarser grind takes the edge off.'); }
                    else { head = 'Your best yet. Repeat it exactly.'; next = recipe(keepG, c.dose, c.yield); why.push(best, 'Change nothing next time; if it repeats, pin it as your master recipe.'); }
                    conf = '';
                } else if (U >= 1.2 && O >= 1.2) {
                    conf = confOf(Math.min(U, O) + 1);
                    if (esp && dR >= 0.3) {
                        head = `Grind finer, to ${plainG(finer)}, and stop at ${backYield} g again.`;
                        next = recipe(finer, dose, backYield);
                        why.push(words('under') || 'It read sour underneath.', `Running it long to 1:${this.fmtNum(ratio, 1)} added bitterness on top without fixing the sourness, which comes from a grind that's too coarse.`);
                        if (drift) why.push(`At ${keepG || 'this grind'} your shots ran ${this.fmtNum(drift.from)} s on ${this.shortDate(drift.first.date)} and ${this.fmtNum(drift.lo)}\u2013${this.fmtNum(drift.hi)} s lately: the coffee is aging, so it needs a finer grind to hold the same time.`);
                    } else {
                        mode = 'puck'; head = 'Sour and bitter at once: fix the puck before touching grind.';
                        next = recipe(keepG, c.dose, c.yield);
                        why.push('That mix usually means channeling: water rushing through part of the bed while the rest barely extracts.', 'Break up clumps (WDT), level the bed and tamp flat, then pull the same recipe.');
                    }
                } else if (U >= 1.2 && U >= O * 1.3) {
                    conf = confOf(U + (drift ? 0.8 : 0) + (dT !== null && dT <= -4 ? 0.8 : 0) + (dR >= 0.3 ? 0.5 : 0));
                    if (esp && dR >= 0.3) {
                        head = `Grind finer, to ${plainG(finer)}, and stop at ${backYield} g again.`;
                        next = recipe(finer, dose, backYield);
                        why.push(words('under') || 'It read sour.', `Stretching to 1:${this.fmtNum(ratio, 1)} can't fix sourness; it just adds bitterness and thins the body. The grind is the fix.`);
                    } else if (esp && c.time > Math.max(40, refT + 6)) {
                        mode = 'ratio'; head = `Already slow, so keep the grind and let it run to ${Math.round(c.yield + 3)} g.`;
                        next = recipe(keepG, c.dose, c.yield + 3);
                        why.push(words('under') || 'It read sour.', `At ${this.fmtNum(c.time)} s a finer grind would choke it; letting a bit more coffee through (or brewing a few degrees hotter) extracts more instead.`);
                    } else {
                        head = esp ? `Under-extracted: ${goDir('finer', finer)}.` : `Under-extracted: ${goDir('finer', finer)}, or brew a little longer.`;
                        next = recipe(finer, dose, esp ? backYield : c.yield);
                        why.push(words('under') || 'It read sour.');
                    }
                    if (drift) why.push(`At ${keepG || 'this grind'} your shots ran ${this.fmtNum(drift.from)} s on ${this.shortDate(drift.first.date)} and ${this.fmtNum(drift.lo)}\u2013${this.fmtNum(drift.hi)} s lately: the coffee is aging, so it needs a finer grind to hit the same time.`);
                    else if (dT !== null && dT <= -4) why.push(`It ran ${this.fmtNum(-dT)} s faster than ${tLabelShot}.`);
                } else if (O >= 1.2 && O >= U * 1.3) {
                    conf = confOf(O + (dR >= 0.3 ? 0.8 : 0) + (dT !== null && dT >= 6 ? 0.8 : 0));
                    if (esp && dR >= 0.3) {
                        mode = 'ratio'; head = `Stop earlier: back to ${backYield} g, keep the grind.`;
                        next = recipe(keepG, dose, backYield);
                        why.push(words('over') || 'It read bitter.', `The bitterness comes from the long ratio (1:${this.fmtNum(ratio, 1)} vs 1:${this.fmtNum(refRatio, 1)} on your best), not the grind.`);
                    } else if (esp && ((dT !== null && dT <= -4) || (c.time > 0 && c.time < 22))) {
                        mode = 'puck';
                        if (drift) { head = `Fast and bitter: that's channeling. Go finer (${finer.replace(/^grind /, '')}) and prep the puck.`; next = recipe(finer, dose, backYield); }
                        else { head = 'Fast and bitter: that\'s channeling, so don\'t go coarser.'; next = recipe(keepG, c.dose, c.yield); }
                        why.push(words('over') || 'It read bitter.', `It ran ${this.fmtNum(c.time)} s, which is fast; bitterness at that speed means water found a channel. Prep the puck (WDT, level, even tamp).`);
                        if (drift) why.push(`At ${keepG || 'this grind'} your shots ran ${this.fmtNum(drift.from)} s on ${this.shortDate(drift.first.date)} and ${this.fmtNum(drift.lo)}\u2013${this.fmtNum(drift.hi)} s lately: the coffee is aging, so it needs a finer grind to hold the same time.`);
                    } else {
                        head = esp ? `Over-extracted: ${goDir('coarser', coarser)}.` : `Over-extracted: ${goDir('coarser', coarser)}, or brew a little shorter.`;
                        next = recipe(coarser, dose, esp ? backYield : c.yield);
                        why.push(words('over') || 'It read bitter.');
                        if (dT !== null && dT >= 6) why.push(`It ran ${this.fmtNum(dT)} s slower than ${tLabelShot}.`);
                    }
                } else if (weak >= 1 || strong >= 1) {
                    mode = 'ratio'; conf = 'likely';
                    if (weak >= 1) { head = esp ? (c.yield > 6 ? `A bit weak: keep the grind, stop earlier at ${Math.round(c.yield - 3)} g.` : 'A bit weak: keep the grind and stop the shot a little earlier.') : 'A bit weak: same grind, a little more coffee.'; next = recipe(keepG, c.dose, esp && c.yield > 6 ? c.yield - 3 : c.yield); why.push('Thin without sour or bitter points to strength (ratio), not extraction.'); }
                    else { head = esp ? (c.yield > 0 ? `A bit strong: keep the grind and let it run to ${Math.round(c.yield + 3)} g.` : 'A bit strong: keep the grind and let the shot run a little longer.') : 'A bit strong: same grind, a little more water.'; next = recipe(keepG, c.dose, esp && c.yield > 0 ? c.yield + 3 : c.yield); why.push('Heavy without bitterness points to strength, not extraction.'); }
                } else if (ref && c.rating > 0 && c.rating >= refR) {
                    // v11.7: under 4★ but level with or better than the best so far: don't send them back to a worse recipe
                    mode = 'hold'; conf = 'possible';
                    head = c.rating > refR ? `Better than your ${this.fmtNum(refR)}\u2605 best, but not there yet.` : `Level with your ${this.fmtNum(refR)}\u2605 best, but not there yet.`;
                    next = recipe(keepG, c.dose, c.yield);
                    why.push(`Repeat it and add a word on what tasted off (sour, bitter, thin); the next tip will say which way to go.`);
                } else if (ref) {
                    mode = 'toward'; conf = 'likely';
                    if (esp && refT > 0) aim = [Math.round(refT), Math.round(refT + 4)];   // v11.7: going back to that recipe means its time too
                    const dTr = c.time > 0 && refT > 0 ? c.time - refT : null;
                    const diffs = [];
                    if (esp && Math.abs(dR) >= 0.15) diffs.push([Math.abs(dR) * 10, `ratio (1:${this.fmtNum(ratio, 1)} vs 1:${this.fmtNum(refRatio, 1)})`]);
                    if (c.dose > 0 && Math.abs(this.num(ref.dose) - c.dose) >= 0.5) diffs.push([Math.abs(this.num(ref.dose) - c.dose) * 3, `dose (${this.fmtNum(c.dose, 1)} g vs ${this.fmtNum(this.num(ref.dose), 1)} g)`]);
                    if (esp && dTr !== null && Math.abs(dTr) >= 4) diffs.push([Math.abs(dTr) / 2, `time (${this.fmtNum(c.time)} s vs ${this.fmtNum(refT)} s)`]);
                    diffs.sort((a, b) => b[0] - a[0]);
                    head = diffs.length ? `${!(c.rating > 0) || refR - c.rating <= 1 ? 'Close. ' : ''}Head back to your ${this.fmtNum(refR)}\u2605 recipe.` : 'Same recipe as your best. Repeat it and focus on prep.';
                    next = recipe(keepG, this.num(ref.dose), this.num(ref.yield));
                    const prev = past[past.length - 1];
                    if (prev && this.sameGrinder(this.grinderFor(prev), c.grinder) && this.grindText(prev.grind) && !this.sameGrind(prev.grind, c.grind) && c.rating > rate(prev) && rate(prev) > 0) why.push(`Your move from grind ${this.grindText(prev.grind)} to ${this.grindText(c.grind)} worked (${this.fmtNum(rate(prev))}\u2605 \u2192 ${this.fmtNum(c.rating)}\u2605): keep it.`);
                    else if (keepG && refSameG && this.grindText(ref.grind) && !this.sameGrind(ref.grind, c.grind)) why.push(`Stay at ${keepG}: grind follows the coffee as it ages, so steer with dose and ratio.`);
                    why.unshift(diffs.length ? `The biggest difference from your ${this.shortDate(ref.date)} shot is the ${diffs[0][1]}.` : 'Nothing in your notes points to a change, so consistency is the lever: same dose, same prep, same timing.');
                } else if (!c.text && !(c.tasted || []).length && !tags.length && !c.verdict) {
                    mode = 'ask'; conf = '';
                    head = 'Tell me how it tasted and I\'ll tell you what to change.';
                    why.push('A word or two in Observations is enough: sour, bitter, thin, sweet, harsh.');
                } else {
                    mode = 'hold'; conf = 'possible';
                    head = 'Nothing points to a change yet. Repeat it once.';
                    next = recipe(keepG, c.dose, c.yield);
                    why.push('One shot can be noise; if it tastes the same twice, the notes will tell us which way to go.');
                }
                if (next && finer !== coarser && this.grindNum(c.grind) === null && this.grindOrd(c.grind) !== null && gm.dirSure && gm.dirEv && (next.startsWith(finer) || next.startsWith(coarser)))
                    why.push(`On your ${gm.grinder ? gm.grinder.name : 'grinder'}, ${gm.lowerFiner ? 'higher' : 'lower'} settings are coarser: going from ${this.grindText(gm.dirEv.from.grind)} to ${this.grindText(gm.dirEv.to.grind)} took your shot from ${this.fmtNum(this.num(gm.dirEv.from.time))} s to ${this.fmtNum(this.num(gm.dirEv.to.time))} s.`);
                if (gm.fresh && next && finer !== coarser && (next.startsWith(finer) || next.startsWith(coarser)))
                    why.push(`Your ${gm.grinder.name} has its own memory, so that step is a starting guess until you've changed its grind a couple of times.`);
                if (mode === 'refine') for (let i = ev.length - 1; i >= 0; i--) if (!/^\u201c/.test(ev[i].text)) ev.splice(i, 1);
                const ctx = [];
                if (ref) ctx.push([mode === 'refine' ? 'Your previous best' : 'Your best on this coffee', `${this.shortDate(ref.date)} \u00b7 ${this.fmtNum(refR)}\u2605 \u00b7 ${this.recipeLine(ref, refSameG)}${refSameG ? '' : ` \u00b7 on your ${refG.name}`}`]);
                if (bean.notes.length || bean.facts.length) ctx.push(['This coffee', `${[bean.name, ...bean.facts].join(' \u00b7 ')}${bean.notes.length ? `. At its best: ${bean.notes.join(', ')}` : ''}`]);
                if (pal) { const rr = this.fmtNum(pal.r0, 1) === this.fmtNum(pal.r1, 1) ? `1:${this.fmtNum(pal.r0, 1)}` : `1:${this.fmtNum(pal.r0, 1)}\u20131:${this.fmtNum(pal.r1, 1)}`; const tt = Math.round(pal.t0) === Math.round(pal.t1) ? `${Math.round(pal.t0)} s` : `${Math.round(pal.t0)}\u2013${Math.round(pal.t1)} s`; ctx.push(['Your palate', `your 4\u2605+ ${esp ? 'espressos' : 'brews'} sit around ${rr}${esp ? ` in ${tt}` : ''} (${pal.n} shots)`]); }
                if (!ref) {
                    // first shot: how others did on this coffee (ratio and time only; their grinders aren't yours)
                    const others = Array.from(this.brews.values()).filter(b => this.groupKeyOfBrew(b) === c.beanKey && this.getBrewOwner(b) !== c.owner && (b.method || '') === c.method && rate(b) > 0 && this.ratioOf(b) > 0);
                    const top = others.sort((a, b) => rate(b) - rate(a))[0];
                    if (top) ctx.push(['Others on this coffee', `${this.getBrewOwner(top)}'s best: ${this.fmtNum(rate(top))}\u2605 at 1:${this.fmtNum(this.ratioOf(top), 1)}${this.num(top.time) > 0 ? ` in ${this.fmtNum(this.num(top.time))} s` : ''}`]);
                    if (mode !== 'ask') conf = [conf, 'first shot of this coffee'].filter(Boolean).join(' \u00b7 ');
                }
                const from = c.verdict ? 'verdict' : (read.quotes.length || tagU || tagO) ? 'notes' : (sliderOnly && (U > 0 || O > 0)) ? 'sliders' : 'recipe';
                // v15.1: "shot" is espresso's word; other methods read "brew"
                const potato = this.learnPotato ? this.learnPotato(c) : '';   // v19.0: the potato defect (a bean, not the recipe; the advice stays)
                return this.methodWorded({ mode, head, next, why: why.filter(Boolean), conf, ev, ctx, ref, U, O, gm, from, potato }, c.method);
            },

            coachHtml(k, title) {
                return `<div class="next-card coach ${k.mode}"><div class="next-title">${this.esc(title)}${k.conf ? ` \u00b7 ${this.esc(k.conf)}` : ''}</div><div class="next-headline">${this.esc(k.head)}</div>${k.potato ? `<div class="coach-potato">${this.esc(k.potato)}</div>` : ''}${k.next ? `<div class="coach-next"><span>Next</span>${this.esc(k.next).split(' \u00b7 ').map(x => `<i class="cn">${x}</i>`).join(' \u00b7 ')}</div>` : ''}${k.why.length ? `<div class="next-detail">${this.esc(k.why.join(' '))}</div>` : ''}${k.ev.length ? `<div class="ev">${k.ev.map(e => `<span class="evc ${e.side}">${this.esc(e.text)}</span>`).join('')}</div>` : ''}${k.ctx.length ? `<div class="coach-ctx">${k.ctx.map(([a, b]) => `<div><b>${this.esc(a)}</b>${this.esc(b)}</div>`).join('')}</div>` : ''}</div>`;
            },

