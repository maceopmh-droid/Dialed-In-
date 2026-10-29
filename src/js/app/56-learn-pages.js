            // ===================== v19.0: Learn, the entry pages (a variety, a process, an origin) and the guides =====================
            // Section order and what starts folded follow the brief (Oct 28): the head never folds; open sections first, the
            // folded group last. A section with no source yet isn't drawn at all.
            lxEntryPage(e, p) {
                const k = e.kind, fam = k === 'region' ? this.lxRegionTint(e) : (e.tint || 'app'), secs = [], rx = e.rx || null, has = typeof this.lxCupSec === 'function';
                const kindName = this.lxKindName(e);
                const head = this.lxHead({ kicker: e.kicker, kickerLink: k === 'region' && this.lxHasPage('origin', e.country) ? { label: this.lxName('origin', e.country), onclick: this.lxGo('origin', e.country), rest: 'Region' } : null, name: e.name, lede: e.lede, also: e.also, facts: e.facts });
                const want = k === 'origin' ? { country: e.country } : k === 'species' ? { species: e.id } : k === 'region' ? null : { [k]: e.id };
                const comm = want ? this.lxCommData(want) : { off: true };
                const add = s => { if (s) secs.push(s); };
                if (k === 'variety' && this.lxFamilySec) add(this.lxFamilySec(e.id));   // v20.0: its family line, first
                if (k === 'origin' || k === 'region') {
                    if (k === 'origin') {
                        const m = this.lxMapHtml(e); if (m) add({ key: 'origin.where', open: true, title: 'Where it grows', teaser: (e.regions || []).slice(0, 4).map(r => r.name).join(', '), body: m });
                        if ((e.regions || []).length) add({ key: 'origin.regions', open: true, title: 'Regions', meta: String(e.regions.length), sub: this.lxRegionsOf(e.country).length ? 'Each one with its own page opens' : '', teaser: e.regions.map(r => r.name).join(', '), body: this.lxRegionsHtml(e) });
                    } else { const m = this.lxRegionMapHtml(e); if (m) add({ key: 'region.where', open: true, title: 'Where it is', teaser: this.lxName('origin', e.country), body: m }); }
                    // v20.1: the cup in depth (with body and acidity); a page without research keeps its body-and-acidity part
                    if (has && (e.taste || (rx && rx.cup))) add(this.lxCupSec(e));
                    else if (e.feel && this.lxFeelHtml) add({ key: `${k}.feel`, open: true, title: 'Body and acidity', teaser: [e.feel.body, e.feel.acidity].filter(Boolean).join(' · '), body: `<div class="lx-box">${this.lxFeelHtml(e.feel)}</div>` });
                    if ((e.harvest || []).length) add({ key: `${k}.harvest`, open: true, title: 'When it’s picked', teaser: this.lxHarvestTeaser(e), body: this.lxHarvestHtml(e) });
                    const g = this.lxGrowsHtml(e); if (g) add({ key: `${k}.grows`, open: true, title: 'What grows here', teaser: [...((e.grows || {}).varieties || []), ...((e.grows || {}).processes || [])].slice(0, 5).map(id => this.lxName(LearnEngine.entry('variety', id) ? 'variety' : 'process', id)).join(', '), body: g });
                    if (k === 'region' && has) add(this.lxPlacesSec(e));
                    if (k === 'origin') add(this.lxCommCompact(e, comm));
                } else {
                    if (has && (e.taste || (rx && rx.cup))) add(this.lxCupSec(e));
                    else if (e.taste) add({ key: `${k}.taste`, open: true, title: k === 'process' ? 'What it usually does to the cup' : 'What it’s said to taste like', teaser: (e.taste.notes || []).join(', ') || e.taste.text, body: this.lxTasteHtml(e) });
                    else if (e.feel && this.lxFeelHtml) add({ key: `${k}.feel`, open: true, title: 'Body and acidity', teaser: [e.feel.body, e.feel.acidity].filter(Boolean).join(' · '), body: `<div class="lx-box">${this.lxFeelHtml(e.feel)}</div>` });
                    if (this.lxNearestSec) add(this.lxNearestSec(e));   // v20.3: little written about it: its closest relative with a full page
                    if (k === 'process') {
                        // v20.1: a base method draws the cut cherry (tap another method to compare); the research's steps follow
                        const base0 = has && this.LX_METH[e.id] && typeof LearnTree !== 'undefined';
                        const steps = has ? this.lxRxStepsHtml(e) : '';
                        if (base0 || steps) add({ key: 'process.steps', open: true, title: 'How it’s done', sub: base0 ? 'What stays on the seed while it dries' : '', teaser: ((rx && rx.steps) || []).map(s => s.title).join(' · '), body: `${base0 ? this.lxMethHtml(e.id) : ''}${steps}` });
                        else if ((e.steps || []).length) add({ key: 'process.steps', open: true, title: 'How it’s done', teaser: e.steps.map(s => s.text).join(' · '), body: this.lxStepsHtml(e) });
                        const onMap = ((this.learnContent() || {}).pmap || { dots: [] }).dots.some(d => d.id === e.id);   // (v19.1: only when it has a dot to light up)
                        if (onMap) add({ raw: `<div class="lx-sec lx-tight"><div class="lx-group">${this.lxRow({ title: 'See it on the process map', sub: this.lxMapHint(e), onclick: `app.learnOpen('list', 'processes', { hl: '${app.escJs(e.id)}' })` })}</div></div>` });
                    }
                    add(this.lxCommFull(e, p, comm));
                    add(this.lxBrewSec(e, p, comm));
                }
                add(this.lxYouSec(e));
                const base = k === 'process' && (LearnEngine.entry('process', e.id) || {}).layer === 'base';
                if (k === 'process' && (e.kinds || []).length) add({ key: 'process.kinds', open: true, title: e.kindsTitle || (base ? `Kinds of ${e.name.toLowerCase()}` : 'Styles you’ll see'), teaser: e.kinds.map(x => x.name).join(', '), body: `<div class="lx-group">${e.kinds.map(x => { const id = LearnEngine.entry('process', x.id) ? x.id : ''; const n = this.lxCountHere(comm, x.id); return this.lxRow({ title: x.name, sub: `${x.text}${n}`, onclick: id && this.lxHasPage('process', id) ? this.lxGo('process', id) : '' }); }).join('')}</div>` });
                if ((e.myths || []).length) add({ key: `${k}.myth`, open: true, title: 'Myth check', teaser: e.myths.map(m => m.claim).join(' '), body: e.myths.map(m => `<div class="lx-box lx-myth"><b>${this.esc(m.claim)}</b><p class="lx-p">${this.esc(m.text)}</p>${this.lxEv(m.label)}</div>`).join('') });
                if (has && rx) { add(this.lxPlantSec(e)); add(this.lxGrownSec(e)); add(this.lxStorySec(e)); add(this.lxRelatedSec(e)); }
                // the folded group
                const folded = [];
                const list = this.lxCoffeesSec(e, comm, kindName); if (list) folded.push(list);
                (e.sections || []).forEach(s => folded.push({ key: `${k}.${s.key}`, open: false, title: s.title, teaser: s.teaser, meta: s.dated || '', body: `${s.key === 'family' && e.family && !(this.lxFamilySec && k === 'variety' && typeof LearnTree !== 'undefined' && LearnTree.has(e.id)) ? this.lxBranchHtml(e) : ''}${(s.body || []).map(t => `<p class="lx-p">${this.esc(t)}</p>`).join('')}` }));   // (v20.0: the family line above shows parents and children)
                // a written page with research: the research's own extra sections join the folded group
                if (rx && !e.fromRx && this.lxSlug) (rx.sections || []).forEach(s => { if (!(e.sections || []).some(x => x.title === s.title)) folded.push({ key: `${k}.s-${this.lxSlug(s.title)}`, open: false, title: s.title, teaser: this.lxOne((s.body || [])[0] || ''), meta: s.dated || '', body: (s.body || []).map(t => `<p class="lx-p">${this.esc(t)}</p>`).join('') }); });
                const srcs = rx && this.lxRxSrc ? [...new Set([...(e.sources || []), ...this.lxRxSrc(rx)])] : (e.sources || []);
                const html = head + secs.map(s => s.raw ? s.raw : this.lxSecs([s])).join('') + this.lxSecs(folded.concat([{ key: `${k}.sources`, open: false, title: 'Sources', meta: String(srcs.filter(id => this.lxSrc(id)).length), teaser: this.lxSrcTeaser(srcs), body: this.lxSrcList(srcs) }])) + this.lxSpotHtml(`${k}:${e.id}`, e.updated);
                return { fam, html };
            },
            // ---- v19.1: a short page, for a kind with no written page yet: its family or layer, the one sourced line the
            // recognizer has about it, and what people on Dialed In (and you) logged. It claims nothing else.
            LX_FAMNF: { landrace: 'floral', yemen: 'earthy', typica: 'nutty', bourbon: 'sweet', cross: 'spice', introgressed: 'herbal', f1: 'vegetal', species: 'earthy' },
            LX_LAYER: { base: ['a base method', 'app'], variant: ['a base method', 'app'], fermentation: ['fermentation', 'fermented'], microbes: ['added microbes', 'fermented'], ingredients: ['added ingredients', 'fruity'], after: ['after-treatment', 'herbal'], drying: ['drying', 'sweet'] },
            lxShortPage(kind, id, p) {
                const x = LearnEngine.entry(kind, id) || {}, name = this.lxName(kind, id);
                let kicker = '', fam = 'app', lede = '', src = '';
                if (kind === 'origin') kicker = `Origin · ${x.continent || ''}`;
                else if (kind === 'species') { kicker = 'Species'; fam = 'earthy'; }
                else if (kind === 'variety') {
                    kicker = typeof LearnTree !== 'undefined' && LearnTree.unsure(id) && !(x.q && x.family === 'landrace') ? 'Variety · family not settled' : x.family ? `Variety · ${x.q && x.family === 'landrace' ? 'Ethiopian roots?' : LearnEngine.FAMILY[x.family]}` : 'Variety';   // (v20.0: as its family line says)
                    fam = this.LX_FAMNF[x.family] || 'app';
                    const s = LearnEngine.SAY[id]; if (s) { lede = `${name} ${s[0]}.`; src = s[1]; }
                } else if (kind === 'process') {
                    const L = this.LX_LAYER[x.layer] || ['process', 'app']; kicker = `Process · ${L[0]}`; fam = L[1];
                    const s = LearnEngine.PSAY[id]; if (s) { lede = s[0]; src = s[1]; }
                }
                const e = { kind, id, name, country: kind === 'origin' ? id : undefined, tint: fam };
                const head = this.lxHead({ kicker, name, lede, also: (x.also || []).slice(0, 4) });
                const comm = this.lxCommData(kind === 'origin' ? { country: id } : kind === 'species' ? { species: id } : { [kind]: id });
                const secs = [];
                if (kind === 'variety' && this.lxFamilySec) { const fl = this.lxFamilySec(id); if (fl) secs.push(fl); }   // v20.0
                if (kind === 'process' && ((this.learnContent() || {}).pmap || { dots: [] }).dots.some(d => d.id === id)) secs.push({ raw: `<div class="lx-sec lx-tight"><div class="lx-group">${this.lxRow({ title: 'See it on the process map', sub: this.lxMapHint(e), onclick: `app.learnOpen('list', 'processes', { hl: '${app.escJs(id)}' })` })}</div></div>` });
                if (kind === 'origin') { const cb = this.lxCommCompact(e, comm); if (cb) secs.push(cb); }
                else { const cb = this.lxCommFull(e, p, comm); if (cb) secs.push(cb); const bb = this.lxBrewSec(e, p, comm); if (bb) secs.push(bb); }
                const you = this.lxYouSec(e); if (you) secs.push(you);
                const folded = [], list = this.lxCoffeesSec(e, comm, this.lxKindName(e)); if (list) folded.push(list);
                const so = src ? this.lxSrcFor(src) : null;
                if (so) folded.push({ key: `${kind}.sources`, open: false, title: 'Sources', meta: '1', teaser: so.publisher || so.title, body: `<ol class="lx-srcs"><li><a href="${this.esc(so.url)}" target="_blank" rel="noopener">${this.esc(so.title)}</a>${so.publisher ? `<small>${this.esc(so.publisher)}</small>` : ''}</li></ol>` });
                const html = head + secs.map(s => s.raw ? s.raw : this.lxSecs([s])).join('') + this.lxSecs(folded) + this.lxSpotHtml(`${kind}:${id}`, '');
                return { fam, html };
            },
            // a recognizer line's source, as the content files name it (or at least its website)
            lxSrcFor(id) {
                const c = this.learnContent() || { sources: {} }, own = c.sources[id]; if (own) return own;
                const url = LearnEngine.SRC[id]; if (!url) return null;
                const same = Object.values(c.sources).find(s => s.url === url); if (same) return same;
                let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (err) {}
                return { title: host, publisher: '', url };
            },
            // "Caturras", "Naturals", "Colombian coffees": what a list of this kind's coffees is called
            lxKindName(e) {
                if (e.kind === 'origin') { const c = LearnEngine.entry('origin', e.country); return c ? `${c.name}` : e.name; }
                if (e.kind === 'process') return `${e.name} coffees`;
                return e.name;
            },
            lxSrcTeaser(ids) { const c = this.learnContent(); return [...new Set((ids || []).map(id => c.sources[id]).filter(Boolean).map(s => String(s.publisher || '').split(',')[0]))].slice(0, 4).join(', '); },
            lxSrcList(ids) { const c = this.learnContent(); return `<ol class="lx-srcs">${(ids || []).map(id => c.sources[id]).filter(Boolean).map(s => `<li><a href="${this.esc(s.url)}" target="_blank" rel="noopener">${this.esc(s.title)}</a><small>${this.esc(s.publisher || '')}${s.accessed ? ` · read ${this.esc(s.accessed)}` : ''}</small></li>`).join('')}</ol>`; },
            lxSpotHtml(id, updated) { return `<p class="lx-spot">${updated ? `<span>Updated ${this.esc(this.shortDate ? this.shortDate(updated) : updated)}</span> · ` : ''}<button type="button" onclick="app.lxSpot('${app.escJs(id)}')">Spot a mistake?</button></p>`; },
            lxSpot(id) {
                this._bugExtra = { learn: id };
                if (this.openBugReport) this.openBugReport();
                const t = document.getElementById('bug-text'); if (t) t.placeholder = `What looks wrong on this page? For example: a date, a name or a number.`;
            },

            // ---- the taste a kind is said to have: wheel notes, the text, its honesty label
            lxTasteHtml(e) {
                const t = e.taste;
                return `<div class="lx-box">${(t.notes || []).length ? `<div class="lx-notes">${t.notes.map(n => this.lxNote(n)).join('')}</div>` : ''}<p class="lx-p">${this.esc(t.text)}</p>${e.feel && this.lxFeelHtml ? this.lxFeelHtml(e.feel) : ''}${t.label ? `<div class="lx-evrow">${this.lxEv(t.label)}${t.evidence ? `<span class="lx-small">${this.esc(t.evidence)}</span>` : ''}</div>` : ''}</div>`;
            },
            lxStepsHtml(e) {
                const steps = e.steps || [];
                return `<div class="lx-box lx-steps"><div class="lx-stepgrid" style="grid-template-columns:repeat(${steps.length}, minmax(0, 1fr))">${steps.map((s, i) => `<div class="lx-step"><span class="lx-stepic${i === 1 ? ' lx-on' : ''}">${this.lxIc(s.icon || 'i-coffee', 22)}</span><span>${this.esc(s.text)}</span></div>`).join('')}</div>${e.stepsText ? `<p class="lx-p lx-small2">${this.esc(e.stepsText.text)}</p>` : ''}</div>`;
            },
            lxMapHint(e) {
                const pm = (this.learnContent() || {}).pmap, d = pm && (pm.dots || []).find(x => x.id === e.id);
                if (e.id === 'washed') return 'None of the fruit stays on; anaerobic washed sits just above';
                if (e.id === 'natural') return 'All the fruit stays on; anaerobic natural sits just above';
                if (e.id === 'honey') return 'Some of the fruit stays on, between washed and natural';
                const H = { anaerobic: 'Two dots in the sealed-tank row: washed and natural', carbonic: 'The sealed-tank row, filled with CO2', lactic: 'The added-microbes row, with yeast, koji and mossto', yeast: 'The added-microbes row', koji: 'The added-microbes row', mossto: 'The added-microbes row', 'co-ferment': 'The top row: something added to the ferment' };
                return H[e.id] || (d ? d.label : 'Where it sits among the others');
            },

            // ---- community numbers for one kind
            lxCommData(want) {
                if (!this.lxCommOk()) return { off: true };
                const hit = this.lxComm(want);
                if (hit) return hit.ok ? { r: hit.r } : { failed: true, want };
                this.lxCommFetch([want]).then(() => this.lxRefresh('comm'));
                return { loading: true };
            },
            lxCountHere(comm, id) { return ''; },
            lxEnough(r) { const A = r && r.views && r.views.all; return !!(A && A.people >= 2 && A.coffees >= 2); },
            lxNotEnough(r) { const A = (r && r.views && r.views.all) || {}; return `<div class="lx-box lx-few"><b>Not enough yet</b><span>${this.lxPlural(A.people || 0, 'person', 'people')} · ${this.lxPlural(A.coffees || 0, 'coffee')} so far. Numbers show from 2 people and 2 coffees.</span></div>`; },
            lxCommRetry() { return `<div class="lx-box lx-few"><span>Couldn’t load the numbers.</span><button type="button" class="lx-textbtn" onclick="app.lxCommRetryNow()">Try again</button></div>`; },
            lxCommRetryNow() { this.lxState().comm.clear(); this.learnRender(true); },
            // the averages of the sliders that at least 2 people really set
            lxCrowdVals(V) {
                const vals = {}, set = [], hidden = [];
                TASTE_KEYS.forEach(k => { const x = V && V.taste && V.taste[k]; if (x && x.people >= 2) { vals[k] = Number(x.v); set.push(k); } else hidden.push(k); });
                return { vals, set, hidden };
            },
            // a sentence from the numbers: the two or three sliders furthest from the middle
            lxTasteSentence(cv) {
                const P = { acidity: ['low acidity', 'gentle acidity', 'bright acidity'], sweetness: ['little sweetness', 'some sweetness', 'lots of sweetness'], body: ['a light body', 'a medium body', 'a full body'], finish: ['a short finish', 'a clean finish', 'a long finish'], bitterness: ['little bitterness', 'some bitterness', 'noticeable bitterness'], balance: ['a simple profile', 'some depth', 'a layered profile'] };
                const lvl = v => v < 4 ? 0 : v <= 6.5 ? 1 : 2;
                const picks = cv.set.map(k => ({ k, v: cv.vals[k], d: Math.abs(cv.vals[k] - 5.25) })).sort((a, b) => b.d - a.d).slice(0, 3).map(x => P[x.k][lvl(x.v)]);
                if (!picks.length) return '';
                const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
                return `${cap(picks.length === 1 ? picks[0] : `${picks.slice(0, -1).join(', ')} and ${picks[picks.length - 1]}`)}.`;
            },
            lxHiddenNote(cv) {
                const names = cv.hidden.map(k => (TASTE_META.find(m => m[0] === k) || [k, k])[1]);
                if (!names.length) return '';
                const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
                return ` ${list} ${names.length === 1 ? 'isn’t' : 'aren’t'} shown: too few people rated ${names.length === 1 ? 'it' : 'them'}.`;
            },
            lxNoteBars(V, n) {
                const notes = (V.notes || []).map(([name, c]) => [this.lxNoteName(name), c]).filter(([name]) => this.noteFam(name, 'coffee') !== 'off');
                const seen = new Set(), list = notes.filter(([name]) => { const k = name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n || 5);
                const units = V.units || 1;
                return list.map(([name, c]) => { const tone = this.noteToneKey ? this.noteToneKey(name, 'coffee') : 'app'; return `<div class="lx-mbar"><span>${this.esc(name)}</span><span class="lx-bar"><i data-fam="${this.esc(tone)}" style="width:${Math.max(4, Math.round(100 * c / units))}%"></i></span><span class="lx-num">${c} of ${units}</span></div>`; }).join('');
            },
            lxTopNotes(V, n) {
                return (V.notes || []).map(([name]) => this.lxNoteName(name)).filter(name => this.noteFam(name, 'coffee') !== 'off').filter((x, i, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).slice(0, n);
            },
            lxWhoNote(r) {
                const A = r.views.all, names = (r.names || []).slice().sort((a, b) => b.n - a.n), top = names[0];
                if (!top || !A.sessions || top.n / A.sessions <= 0.5) return '';
                return ` ${top.me ? 'You' : this.esc(top.name)} logged ${top.n} of the ${A.sessions}; each person counts the same.`;
            },
            lxCommFull(e, p, comm) {
                const k = e.kind, key = `${k}.comm`, title = 'On Dialed In';
                if (comm.off) return null;
                if (comm.loading) return { key, open: true, title, body: this.loadingBlockHtml('lx-loading lx-commload') };
                if (comm.failed) return { key, open: true, title, body: this.lxCommRetry() };
                const r = comm.r; if (!r || !r.views) return null;
                const A = r.views.all || {};
                if (!A.coffees) return null;   // (v19.1: nobody here has logged one yet: say nothing)
                if (!this.lxEnough(r)) return { key, open: true, title, meta: `${this.lxPlural(A.people || 0, 'person', 'people')} · ${this.lxPlural(A.coffees || 0, 'coffee')}`, teaser: 'Not enough yet', body: this.lxNotEnough(r) };
                const view = (p.opts && p.opts.view) === 'all' ? 'all' : 'dialed', V = r.views[view] || A, D = r.views.dialed || A;
                const cv = this.lxCrowdVals(V), ghost = e.taste && e.taste.typicalShape;
                const fam = e.tint || 'app';
                const img = this.lxShapeImg(cv.vals, cv.set, ghost || null, fam, 300, 250, `Flavor shape of ${e.name} on Dialed In${ghost ? ', with the typical profile dashed' : ''}`);
                const seg = `<div class="lx-seg" role="tablist"><button type="button" class="${view === 'dialed' ? 'on' : ''}" aria-pressed="${view === 'dialed'}" onclick="app.lxSetView('dialed')">When dialed in</button><button type="button" class="${view === 'all' ? 'on' : ''}" aria-pressed="${view === 'all'}" onclick="app.lxSetView('all')">Every session</button></div>`;
                const legend = `<div class="lx-legend lx-center"><span><i class="lx-lg-on"></i>Dialed In people</span>${ghost ? `<button type="button" class="lx-lgbtn" onclick="app.lxTypical(this)" aria-expanded="false"><i class="lx-lg-dash"></i>Typical</button>` : ''}</div>${ghost ? '<p class="lx-note lx-typnote" hidden>Our reading of how the sources describe it, not measured.</p>' : ''}`;
                const sentence = this.lxTasteSentence(cv);
                const bars = this.lxNoteBars(V, 5);
                const rating = A.rating && A.rating.v ? `<div class="lx-rate"><b>${this.fmtNum(D.rating && D.rating.v ? D.rating.v : A.rating.v, 1)}</b> <span class="lx-star">★</span> <span class="lx-muted">${D.rating && D.rating.v ? `when dialed in · ${this.fmtNum(A.rating.v, 1)} overall` : 'overall'}</span></div>` : '';
                const body = `${seg}<div class="lx-box">${img}${legend}${sentence || cv.hidden.length ? `<p class="lx-p">${this.esc(sentence)}${this.esc(this.lxHiddenNote(cv))}</p>` : ''}`
                    + `${bars ? `<div class="lx-hr"></div><div class="lx-flabel">What people taste</div>${bars}<p class="lx-note">Counted once per person per coffee (${V.units} in all), so one big bag can’t drown out the rest.</p>` : ''}`
                    + `${rating ? `<div class="lx-hr"></div>${rating}<p class="lx-note">Dialed in: ${D.sessions} of ${A.sessions} sessions, each person’s better half on each coffee.${this.lxWhoNote(r)}</p>` : ''}</div>`;
                return { key, open: true, title, meta: `${A.people} people · ${this.lxPlural(A.coffees, 'coffee')}`, teaser: sentence || `${A.sessions} sessions`, body };
            },
            lxSetView(v) { const p = this.lxTop(); if (!p) return; p.opts = { ...(p.opts || {}), view: v }; this.learnRender(true); },
            lxTypical(btn) { const box = btn.closest('.lx-box'), n = box && box.querySelector('.lx-typnote'); if (!n) return; n.hidden = !n.hidden; btn.setAttribute('aria-expanded', String(!n.hidden)); },
            LX_METHOD: { espresso: 'Espresso', 'pour over': 'Pour Over', 'french press': 'French Press', aeropress: 'Aeropress', 'moka pot': 'Moka Pot', 'cold brew': 'Cold Brew' },
            lxBrewTiles(b, method) {
                const hours = method === 'cold brew';
                const t = Number(b.time) || 0;
                const time = !t ? '' : hours ? `${this.fmtNum(t, 0)}<small> h</small>` : t >= 90 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${this.fmtNum(t, 0)}<small> s</small>`;
                return `<div class="lx-tiles">${b.ratio ? `<div class="lx-tile"><div class="lx-sv">1:${this.esc(this.fmtNum(b.ratio, 1))}</div><div class="lx-sl">ratio</div></div>` : ''}${time ? `<div class="lx-tile"><div class="lx-sv">${time}</div><div class="lx-sl">time</div></div>` : ''}${b.dose ? `<div class="lx-tile"><div class="lx-sv">${this.esc(this.fmtNum(b.dose, 1))}<small> g</small></div><div class="lx-sl">dose</div></div>` : ''}</div>`;
            },
            lxBrewSec(e, p, comm) {
                const key = `${e.kind}.brew`, title = 'How people brew it';
                const tips = (e.tips || []).map(t => `<div class="lx-callout">${this.lxIc('i-info', 18)}<span>${this.esc(t.text)} ${this.lxEv(t.label)}</span></div>`).join('');
                if (comm.off || comm.loading || comm.failed || !comm.r || !this.lxEnough(comm.r)) return tips ? { key, open: true, title, teaser: 'A habit some baristas have', body: tips } : null;
                const list = (comm.r.brew || []).filter(b => (b.people || 0) >= 2 && b.n >= 2);
                if (!list.length) return tips ? { key, open: true, title, teaser: 'A habit some baristas have', body: tips } : null;
                const m = (p.opts && p.opts.method && list.find(b => b.method === p.opts.method)) ? p.opts.method : list[0].method, b = list.find(x => x.method === m);
                const label = this.methodLabel(this.LX_METHOD[m] || m) || m, esp = m === 'espresso';
                const chips = list.length > 1 ? `<div class="lx-chips lx-chips-in">${list.map(x => `<button type="button" class="lx-chip${x.method === m ? ' on' : ''}" aria-pressed="${x.method === m}" onclick="app.lxSetMethod('${app.escJs(x.method)}')">${this.esc(this.methodLabel(this.LX_METHOD[x.method] || x.method))}</button>`).join('')}</div>` : '';
                const body = `${chips}${this.lxBrewTiles(b, m)}<p class="lx-note">Middle of ${b.n} ${esp ? 'espresso shots' : `${label.toLowerCase()} brews`} rated 4 ★ or more, from ${b.people} people. Grind settings stay out: every grinder is different.</p>${tips}`;
                return { key, open: true, title, teaser: `${label}: 1:${this.fmtNum(b.ratio, 1)}`, body };
            },
            lxSetMethod(m) { const p = this.lxTop(); if (!p) return; p.opts = { ...(p.opts || {}), method: m }; this.learnRender(true); },
            // an origin's compact version: the dialed-in view only
            lxCommCompact(e, comm) {
                const key = 'origin.comm', title = 'On Dialed In';
                if (comm.off) return null;
                if (comm.loading) return { key, open: true, title, body: this.loadingBlockHtml('lx-loading lx-commload') };
                if (comm.failed) return { key, open: true, title, body: this.lxCommRetry() };
                const r = comm.r; if (!r || !r.views) return null;
                const A = r.views.all || {};
                if (!A.coffees) return null;
                if (!this.lxEnough(r)) return { key, open: true, title, meta: `${this.lxPlural(A.people || 0, 'person', 'people')} · ${this.lxPlural(A.coffees || 0, 'coffee')}`, teaser: 'Not enough yet', body: this.lxNotEnough(r) };
                const D = r.views.dialed || A, cv = this.lxCrowdVals(D), sentence = this.lxTasteSentence(cv);
                const img = this.lxShapeImg(cv.vals, cv.set, null, e.tint || 'app', 200, 160, `Flavor shape of coffees from ${e.name} on Dialed In`);
                const top = this.lxTopNotes(D, 3);
                const b = (r.brew || []).filter(x => (x.people || 0) >= 2 && x.n >= 2)[0];
                const right = b ? `<span><b>1:${this.esc(this.fmtNum(b.ratio, 1))}</b> <span class="lx-muted">${b.method === 'cold brew' ? `· ${this.fmtNum(b.time, 0)} h cold brew` : `· ${b.time >= 90 ? `${Math.floor(b.time / 60)}:${String(Math.round(b.time % 60)).padStart(2, '0')}` : `${this.fmtNum(b.time, 0)} s`} ${this.esc((this.methodLabel(this.LX_METHOD[b.method] || b.method) || '').toLowerCase())}`}</span></span>` : '';
                const body = `<div class="lx-box"><div class="lx-compact">${img}<div class="lx-cmain">${sentence ? `<p class="lx-p">${this.esc(sentence)} <span class="lx-muted">When dialed in.</span></p>` : ''}${top.length ? `<div class="lx-notes">${top.map(n => this.lxNote(n)).join('')}</div>` : ''}</div></div><div class="lx-hr"></div><div class="lx-rate lx-split">${D.rating && D.rating.v ? `<span><b>${this.fmtNum(D.rating.v, 1)}</b> <span class="lx-star">★</span> <span class="lx-muted">dialed in</span></span>` : '<span></span>'}${right}</div><p class="lx-note">${D.sessions} of ${A.sessions} sessions, from ${A.people} people. Single-origin coffees only: blends with other countries are left out.</p></div>`;
                return { key, open: true, title, meta: `${A.people} people · ${this.lxPlural(A.coffees, 'coffee')}`, teaser: sentence || `${A.sessions} sessions`, body };
            },
            // X on Dialed In: the coffees of this kind people logged (folded)
            lxCoffeesSec(e, comm, kindName) {
                if (comm.off || !comm.r || !this.lxEnough(comm.r)) return null;
                const list = comm.r.coffees || []; if (!list.length) return null;
                const rows = list.map(c => this.lxRow({ title: c.name || 'Coffee', sub: [c.roaster, this.lxPlural(c.n, 'session'), c.avg ? `${this.fmtNum(c.avg, 1)} ★` : ''].filter(Boolean).join(' · '), onclick: c.id && this.beans.has(String(c.id)) ? `app.learnOpenCoffee('${app.escJs(String(c.id))}')` : '' }));
                const names = list.slice(0, 4).map(c => c.name).filter(Boolean);
                const more = (comm.r.views.all.coffees || list.length) - names.length;
                return { key: `${e.kind}.coffees`, open: false, title: `${kindName} on Dialed In`, meta: String(comm.r.views.all.coffees || list.length), teaser: `${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`, body: `<div class="lx-group">${this.moreHtml(rows, 6, '')}</div>${e.kind === 'origin' ? '<p class="lx-note">Single-origin coffees only.</p>' : ''}` };
            },

            // ---- You and X: only when you've logged it. A summary, not a list (the passport has the list)
            lxYouSec(e) {
                const kindKey = e.kind === 'origin' ? `origin:${e.country}` : `${e.kind}:${e.id}`;
                const M = this.lxMine(this.user), type = kindKey.split(':')[0];
                // a country counts every coffee that names it, blends too, the same as the passport's stamp
                const P = type === 'origin' ? this.lxPassport(this.user) : null;
                const pick = y => ({ k: y.k, n: y.n, coffees: y.coffees, rs: y.coffees.reduce((s, c) => s + c.rs, 0), rn: y.coffees.reduce((s, c) => s + c.rn, 0) });
                const x = P ? (P.countries.has(e.country) ? pick({ ...P.countries.get(e.country), k: kindKey }) : null) : M.kinds.get(kindKey);
                if (!x || !x.n) return null;
                const same = P ? [...P.countries.values()].map(y => ({ k: `origin:${y.k}`, n: y.n })).sort((a, b) => b.n - a.n) : [...M.kinds.values()].filter(y => y.k.split(':')[0] === type).sort((a, b) => b.n - a.n);
                const rank = same.findIndex(y => y.k === kindKey);
                const word = { variety: 'variety', species: 'species', origin: 'country', process: 'process', region: 'region' }[type];
                const stamp = rank === 0 && same.length > 1 ? 'Your most brewed' : rank === 0 ? `Your ${word}` : rank < 5 ? `Your #${rank + 1} ${word}` : `${x.n} sessions`;
                const avg = x.rn ? x.rs / x.rn : 0, usual = M.avg, d = avg - usual;
                const cmp = !avg || !usual ? '' : Math.abs(d) < 0.05 ? ', right at your usual' : d > 0 ? `, ${d < 0.3 ? 'a touch ' : ''}above your usual ${this.fmtNum(usual, 1)}` : `, ${d > -0.3 ? 'a touch ' : ''}below your usual ${this.fmtNum(usual, 1)}`;
                const blends = e.kind === 'origin' ? x.coffees.filter(c => c.tags && c.tags.origin && c.tags.origin.blend).length : 0;
                const best = x.coffees.filter(c => c.rn).sort((a, b) => b.rs / b.rn - a.rs / a.rn || b.n - a.n)[0];
                const bestSingle = e.kind === 'origin' && blends ? x.coffees.filter(c => c.rn && !(c.tags.origin || {}).blend).sort((a, b) => b.rs / b.rn - a.rs / a.rn)[0] : null;
                const them = x.coffees.length === 1 ? 'it' : 'them';
                const text = `${this.lxPlural(x.n, 'session')} on ${this.lxPlural(x.coffees.length, 'coffee')}${blends ? `, ${blends === 1 ? 'one of them a blend' : `${blends} of them blends`}` : ''}.${avg ? ` You rate ${them} <b>${this.esc(this.fmtNum(avg, 1))} ★</b>${this.esc(cmp)}.` : ''}`;
                const bestLine = best ? `Best: ${this.esc(best.bean.name || 'Coffee')}, ${this.fmtNum(best.rs / best.rn, 1)} ★${best.n > 1 ? ` over ${best.n} sessions` : ''}.${bestSingle && bestSingle !== best ? ` Best single-origin: ${this.esc(bestSingle.bean.name || 'Coffee')}, ${this.fmtNum(bestSingle.rs / bestSingle.rn, 1)} ★.` : ''}` : '';
                return { key: `${e.kind}.you`, open: true, title: `You and ${e.name}`, teaser: `${this.lxPlural(x.n, 'session')} on ${this.lxPlural(x.coffees.length, 'coffee')}`, body: `<div class="lx-box lx-you"><div class="lx-stamp">${this.esc(stamp)}</div><div class="lx-ymain"><div class="lx-p">${text}</div>${bestLine ? `<p class="lx-note">${bestLine}</p>` : ''}</div></div>` };
            },

            // a variety's own branch: its parent, it, its children
            lxBranchHtml(e) {
                const f = e.family || {}, node = id => { const v = LearnEngine.entry('variety', id); return v ? this.lxLinkTag('variety', id, v.name) : ''; };
                const from = (f.parents || []).length ? f.parents : f.parent ? [f.parent] : [];   // (v19.1: a cross has more than one)
                return `<div class="lx-branch">${from.length ? `<div class="lx-brow"><span class="lx-flabel">From</span><div class="lx-tags">${from.map(node).join('')}</div></div>` : ''}<div class="lx-brow"><span class="lx-flabel">This</span><div class="lx-tags"><span class="lx-tag lx-solid">${this.esc(e.name)}</span></div></div>${(f.children || []).length ? `<div class="lx-brow"><span class="lx-flabel">Parent of</span><div class="lx-tags">${f.children.map(node).join('')}</div></div>` : ''}</div>`;
            },

            // ---- an origin's map: its coffee departments (or a town in each coffee area), never anyone's coffees
            lxMapHtml(e) {
                const c = this.learnContent(), m = c.maps[e.map || e.country]; if (!m) return '';
                const tiers = e.mapTiers || {}, tierOf = id => (tiers.l3 || []).includes(id) ? 'on l3' : (tiers.l2 || []).includes(id) ? 'on l2' : (tiers.l1 || []).includes(id) ? 'on' : '';
                const links = this.lxMapLinks ? this.lxMapLinks(e.country) : new Map();   // v20.1: a region with a page opens from the map
                const regions = Object.entries(m.regions || {}).map(([id, d]) => `<path class="lx-rg ${tierOf(id) || (links.has(id) ? 'on' : '')}" d="${d}"${links.has(id) ? ` data-lxr="${this.esc(links.get(id))}"` : ''}/>`).join('');   // (v20.3: a region outlined from its official areas is lit too)
                const dots = this.lxDotLabels(m).map(d => `<g class="lx-mdot"${links.has(d.id) ? ` data-lxr="${this.esc(links.get(d.id))}"` : ''}><circle cx="${d.x}" cy="${d.y}" r="${(3.2 * this.lxMapZ(m)).toFixed(2)}"/><text x="${d.tx}" y="${d.ty}"${d.left ? ' text-anchor="end"' : ''}>${this.esc(d.label)}</text></g>`).join('');
                const svg = `<svg class="lx-cmap" viewBox="${m.zoom ? m.zoom.join(' ') : `0 0 ${m.w} ${m.h}`}" style="--mz:${this.lxMapZ(m)}" role="img" aria-label="Map of ${this.esc(e.name)}${(m.dots || []).length ? ' with a town in each coffee area' : ', its coffee departments shaded'}"${links.size ? ' onclick="app.lxMapTap(event)"' : ''}><path class="lx-rest" d="${m.rest || ''}"/>${regions}<path class="lx-outline" d="${m.outline}"/>${dots}</svg>`;
                const outlined = Object.keys(m.regions || {}).some(id => links.has(id) && !tierOf(id));
                const legend = (e.mapLegend || []).map(([k, l]) => `<span><i class="lx-lg-${k}"></i>${this.esc(l)}</span>`).join('') + (outlined ? `<span><i class="lx-lg-l1"></i>Each region below, outlined: tap one</span>` : '');
                return `<div class="lx-box lx-mapwrap${(m.dots || []).length || m.w / m.h > 1.5 ? ' lx-dotmap' : ''}"><div class="lx-cmapbox">${svg}</div><div class="lx-legend lx-vlegend">${legend}</div></div>`;
            },
            // each town's name beside its dot, on whichever side (or a step up or down) keeps it clear of the others
            // (v20.3: a map zoomed onto its coffee area keeps its names and dots the same size on screen)
            lxMapZ(m) { return m && m.zoom ? m.zoom[2] / m.w : 1; },
            lxDotLabels(m) {
                const z = this.lxMapZ(m), X0 = m.zoom ? m.zoom[0] : 0, X1 = m.zoom ? m.zoom[0] + m.zoom[2] : m.w;
                const fs = 7.2 * z, cw = fs * 0.56, placed = [], dots = (m.dots || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
                const hit = r => placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0) || dots.some(d => d.x > r.x0 - 3 * z && d.x < r.x1 + 3 * z && d.y > r.y0 - 3 * z && d.y < r.y1 + 3 * z);
                return dots.map(d => {
                    const w = String(d.label).length * cw;
                    const tries = [[1, 0], [-1, 0], [1, -8], [1, 8], [-1, -8], [-1, 8], [1, -15], [1, 15]];
                    let best = null;
                    for (const [side, dy0] of tries) {
                        const dy = dy0 * z, tx = side > 0 ? d.x + 5.5 * z : d.x - 5.5 * z, ty = d.y + 2.6 * z + dy;
                        const r = { x0: side > 0 ? tx : tx - w, x1: side > 0 ? tx + w : tx, y0: ty - fs * 0.8, y1: ty + fs * 0.2 };
                        if (r.x0 < X0 || r.x1 > X1) continue;
                        if (!hit(r)) { best = { tx, ty, left: side < 0, r }; break; }
                        if (!best) best = { tx, ty, left: side < 0, r };
                    }
                    placed.push(best.r);
                    return { ...d, tx: best.tx, ty: best.ty, left: best.left };
                });
            },
            lxRegionsHtml(e) {
                const rows = (e.regions || []).map(r => { const rid = `${e.country}:${r.id}`, page = this.lxEntry('region', rid); return this.lxRow({ title: r.name, sub: [r.teaser, r.alt].filter(Boolean).join(' · '), onclick: page ? this.lxGo('region', rid) : '' }); });   // (v20.1: a region with a page opens it)
                return `<div class="lx-group">${this.moreHtml(rows, 5, '')}</div>${e.regionsNote ? `<p class="lx-note">${this.esc(e.regionsNote)}</p>` : ''}`;
            },
            lxHarvestTeaser(e) { const h = (e.harvest || [])[0]; if (!h) return ''; const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], span = a => a && a.length ? `${M[a[0] - 1]}–${M[a[a.length - 1] - 1]}` : ''; return `${h.area}: main crop ${span(h.main)}${h.second ? `, second ${span(h.second)}` : ''}${h.peak ? `, peak ${span(h.peak)}` : ''}`; },
            lxHarvestHtml(e) {
                const rows = (e.harvest || []).map(h => {
                    const cells = Array.from({ length: 12 }, (_, i) => { const m = i + 1; const cls = h.peak ? ((h.peak || []).includes(m) ? 'mn' : (h.main || []).includes(m) ? 'ms' : '') : (h.main || []).includes(m) ? 'mn' : (h.second || []).includes(m) ? 'ms' : ''; return `<i${cls ? ` class="${cls}"` : ''}></i>`; }).join('');
                    return `<span class="lx-calarea">${this.esc(h.area)}</span><div class="lx-cal12">${cells}</div><span></span><div class="lx-mons">${'JFMAMJJASOND'.split('').map(x => `<span>${x}</span>`).join('')}</div>`;
                }).join('');
                const anyPeak = (e.harvest || []).some(h => h.peak), anySecond = (e.harvest || []).some(h => h.second);
                const legend = anyPeak ? '<span><i class="lx-lg-ms"></i>Harvest</span><span><i class="lx-lg-mn"></i>Peak</span>' : `<span><i class="lx-lg-mn"></i>Main harvest</span>${anySecond ? `<span><i class="lx-lg-ms"></i>${this.esc(e.secondName || 'Second crop')}</span>` : ''}`;
                return `<div class="lx-box"><div class="lx-calgrid">${rows}</div><div class="lx-legend">${legend}</div>${e.harvestText ? `<p class="lx-p lx-small2">${this.esc(e.harvestText.text)}</p>` : ''}</div>`;
            },
            lxGrowsHtml(e) {
                const g = e.grows || {}; if (!(g.varieties || []).length && !(g.processes || []).length && !g.text) return '';
                return `${g.text || g.species ? `<p class="lx-p lx-gtext">${this.esc([g.text, g.species && !String(g.text || '').toLowerCase().includes(String(g.species).toLowerCase()) ? this.lxCap(g.species) + '.' : ''].filter(Boolean).join(' ').replace(/\.\./g, '.'))}</p>` : ''}${(g.varieties || []).length ? `<div class="lx-flabel">Varieties</div><div class="lx-tags">${g.varieties.map(id => this.lxGrowTag('variety', id)).join('')}</div>` : ''}${(g.processes || []).length ? `<div class="lx-flabel lx-gap">Processes</div><div class="lx-tags">${g.processes.map(id => this.lxGrowTag('process', id)).join('')}</div>` : ''}`;
            },
            // v20.3: a name in a "grows" list opens its page (a species, like Robusta, too); one with no page shows as a plain tag
            lxGrowTag(kind, id) {
                if (kind === 'variety' && !this.lxHasPage('variety', id) && this.lxHasPage('species', id)) kind = 'species';
                if (this.lxHasPage(kind, id) || LearnEngine.entry(kind, id)) return this.lxLinkTag(kind, id, this.lxName(kind, id));
                const t = String(id); return `<span class="lx-tag">${this.esc(/^[a-z0-9-]+$/.test(t) ? this.lxCap(t.replace(/-/g, ' ')) : t)}</span>`;
            },

            // ===================== L8: guides =====================
            lxGuidePage(p) {
                const c = this.learnContent(), g = c.guides.get(p.id);
                if (!g) return { fam: 'app', html: '<div class="lx-empty"><b>That guide is gone</b></div>' };
                const head = this.lxHead({ kicker: g.kicker, name: g.name, lede: g.lede, small: true });
                let body = '';
                if (g.bag) {
                    const b = g.bag;
                    body += `<div class="lx-sec"><div class="lx-bag"><div class="lx-bagro">${this.esc(b.roaster)}</div><div class="lx-bagname">${this.esc(b.name)}</div>${b.stamp ? `<div class="lx-bagstamp">${this.esc(b.stamp)}</div>` : ''}<div class="lx-baglines">${b.lines.map(([k, v], i) => `<button type="button" class="lx-pin" onclick="app.lxGuideOpen(${i})" aria-label="Open ${this.esc(k)}"><span class="lx-pinno">${i + 1}</span></button><span><b>${this.esc(k)}</b> · ${this.esc(v)}</span>`).join('')}</div></div>${b.note ? `<p class="lx-note">${this.esc(b.note)}</p>` : ''}</div>`;
                    body += `<div class="lx-sec"><div class="lx-group lx-acc">${(g.rows || []).map((r, i) => `<div class="lx-accrow" data-i="${i}" data-open="0"><button type="button" class="lx-acch" aria-expanded="false" aria-controls="lxacc-${i}" onclick="app.lxGuideOpen(${i})"><span class="lx-pinno lx-pinno-d">${i + 1}</span><span class="lx-rmain"><b>${this.esc(r.title)}</b></span><span class="lx-fbtn lx-fbtn-s"><span>${this.lxIc('i-chevron-down')}</span></span></button><div class="lx-accb" id="lxacc-${i}"><p class="lx-p">${this.esc(r.text)} ${this.lxEv(r.label)}</p>${r.link && this.lxHasPage(r.link.kind, r.link.id) ? `<button type="button" class="lx-textbtn" onclick="${this.lxGo(r.link.kind, r.link.id)}">About ${this.esc(this.lxName(r.link.kind, r.link.id))} ›</button>` : ''}</div></div>`).join('')}</div></div>`;
                }
                if (g.steps) body += `<div class="lx-sec"><div class="lx-group lx-gsteps">${g.steps.map((s, i) => `<div class="lx-gstep"><span class="lx-pinno lx-pinno-d">${i + 1}</span><div class="lx-rmain"><b>${this.esc(s.title)}</b><p class="lx-p lx-small2">${this.esc(s.text)} ${this.lxEv(s.label)}</p>${s.link && this.lxHasPage(s.link.kind, s.link.id) ? `<button type="button" class="lx-textbtn" onclick="${this.lxGo(s.link.kind, s.link.id)}">About ${this.esc(this.lxName(s.link.kind, s.link.id))} ›</button>` : ''}</div></div>`).join('')}</div></div>`;
                if (g.callout) body += `<div class="lx-sec"><div class="lx-callout">${this.lxIc('i-spark', 20)}<span>${this.esc(g.callout)}</span></div><button type="button" class="btn-primary lx-addbtn" onclick="app.lxAddCoffee()">${this.lxIc('i-plus', 20)}Add a coffee</button></div>`;
                const html = head + body + this.lxSecs([{ key: 'guide.sources', open: false, title: 'Sources', meta: String((g.sources || []).length), teaser: this.lxSrcTeaser(g.sources), body: this.lxSrcList(g.sources) }]) + this.lxSpotHtml(`guide:${g.id}`, g.updated);
                return { fam: g.tint || 'app', html };
            },
            // one row open at a time; a pin on the bag opens its row
            lxGuideOpen(i) {
                const rows = [...document.querySelectorAll('#lx-page .lx-accrow')];
                rows.forEach(r => { const on = Number(r.getAttribute('data-i')) === i && r.getAttribute('data-open') !== '1'; r.setAttribute('data-open', on ? '1' : '0'); const b = r.querySelector('.lx-acch'); if (b) b.setAttribute('aria-expanded', String(on)); if (on && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
                if (this.haptic) this.haptic('tick');
            },
            lxAddCoffee() { this.learnClose(); if (this.isDetailActive && this.isDetailActive()) this.closeDetail(); if (this.openBeanModal) this.openBeanModal('coffee'); },
