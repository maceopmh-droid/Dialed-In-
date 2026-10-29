            // ===================== v19.0: Learn =====================
            // Pages about kinds of coffee (varieties, origins, processes) tied to what people on Dialed In actually taste.
            // The words live in learn/*.json beside index.html (fixes go out without a new app version); LearnEngine
            // (07-learn-engine.js) reads a bag's words and says what kind of coffee it is. Learn is the New look's, and
            // coffee's: the classic look and tea mode don't show it. Learn pages open over whatever opened them (#learn-view)
            // and keep their own back stack. Never anyone's grind.
            learnOn() { return typeof LearnEngine !== 'undefined' && this.newLook() && !this.teaMode(); },
            lxState() { return this._lxs || (this._lxs = { content: null, loading: null, failed: false, comm: new Map(), commBusy: new Map(), ov: null, ovAt: 0, ovBusy: null, stack: [], cont: '', fam: '', open: {} }); },

            // ---- the content files: loaded on first use and kept on the phone; the manifest is checked at most once a day.
            // The iPhone app opens with its own copy (www/learn) and takes a newer one from the website when there is one.
            LX_SITE: 'https://maceopmh-droid.github.io/Dialed-In-/learn/',
            lxNative() { return !!(typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); },
            learnContent() {
                const st = this.lxState();
                if (st.content) return st.content;
                try { const raw = safeGet('dialed_learn_content'); if (raw) { const j = JSON.parse(raw); if (j && j.files && j.version) st.content = this.lxIndex(j); } } catch (e) {}
                return st.content;
            },
            lxIndex(j) {
                const f = j.files || {}, pages = f['pages.json'] || {}, guides = f['guides.json'] || {};
                const entries = new Map(); (pages.entries || []).forEach(e => entries.set(`${e.kind}:${e.id}`, e));
                const gs = new Map(); (guides.guides || []).forEach(g => gs.set(g.id, g));
                return { version: j.version, updated: j.updated || '', entries, guides: gs, guideList: guides.guides || [], sources: (f['sources.json'] || {}).sources || {}, maps: (f['maps.json'] || {}).maps || {}, tree: pages.tree || null, pmap: pages.processMap || null, origins: pages.origins || {}, fresh: pages.fresh || null, raw: j };
            },
            async lxFetchJson(url) {
                const r = await fetch(url, { cache: 'no-cache' });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            },
            // load (or refresh) the files; resolves to the content, or null when there's none and no connection
            learnEnsure(force) {
                const st = this.lxState(), have = this.learnContent();
                const checked = Number(safeGet('dialed_learn_checked') || 0);
                if (have && !force && Date.now() - checked < 86400000) return Promise.resolve(have);
                if (st.loading) return st.loading;
                const bases = this.lxNative() ? ['learn/', this.LX_SITE] : ['learn/'];
                st.loading = (async () => {
                    let best = null;
                    for (const base of bases) {
                        try {
                            const man = await this.lxFetchJson(`${base}manifest.json?t=${Math.floor(Date.now() / 3600000)}`);
                            if (!man || !Number(man.version) || !Array.isArray(man.files)) continue;
                            if (best && Number(man.version) <= Number(best.man.version)) continue;
                            best = { base, man };
                        } catch (e) {}
                    }
                    if (best && (!have || Number(best.man.version) > Number(have.version) || best.man.updated !== have.updated || force)) {
                        try {
                            const files = {};
                            for (const name of best.man.files) files[name] = await this.lxFetchJson(`${best.base}${name}?v=${best.man.version}-${encodeURIComponent(best.man.updated || '')}`);
                            const j = { version: Number(best.man.version), updated: best.man.updated || '', files };
                            st.content = this.lxIndex(j);
                            try { safeSet('dialed_learn_content', JSON.stringify(j)); } catch (e) {}
                        } catch (e) { if (!have) st.failed = true; }
                    }
                    if (best) { safeSet('dialed_learn_checked', String(Date.now())); st.failed = false; }
                    else if (!have) st.failed = true;
                    st.loading = null;
                    return st.content;
                })();
                return st.loading;
            },
            lxEntry(kind, id) { const c = this.learnContent(); return c ? c.entries.get(`${kind}:${id}`) || null : null; },
            lxHasPage(kind, id) { return !!this.lxEntry(kind, id) || this.lxShortOk(kind, id); },
            // v19.1: a kind with no written page still opens a short one when there's something to show: the one sourced line
            // the recognizer has about it, coffees of that kind on Dialed In, or your own sessions. Nothing is a dead end.
            lxShortOk(kind, id) {
                if (!id || typeof LearnEngine === 'undefined' || !this.learnContent()) return false;
                if (kind === 'origin') { if (!LearnEngine.entry('origin', id)) return false; }
                else if (kind === 'variety' || kind === 'species' || kind === 'process') {
                    const x = LearnEngine.entry(kind, id); if (!x || x.kind !== kind) return false;
                    if ((kind === 'variety' && LearnEngine.SAY[id]) || (kind === 'process' && LearnEngine.PSAY[id])) return true;
                    if (kind === 'variety' && typeof LearnTree !== 'undefined' && LearnTree.has(id)) return true;   // v20.0: every variety has its family line
                } else return false;
                const ov = this.lxState().ov, n = ov && ov[`${kind}:${id}`];
                if (n && n[2] >= 1) return true;
                const M = this.lxMine(this.user);
                if (kind === 'origin') {   // (every country a coffee of yours names, blends too, like the passport)
                    if (!this._lxMyC || this._lxMyC.v !== M) this._lxMyC = { v: M, set: new Set([...M.coffees.values()].flatMap(c => (c.tags && c.tags.origin && c.tags.origin.countries) || [])) };
                    return this._lxMyC.set.has(id);
                }
                return M.kinds.has(`${kind}:${id}`);
            },
            lxSrc(id) { const c = this.learnContent(); return c && c.sources[id] ? c.sources[id] : null; },

            // ---- what the bag says, read once per wording (the recognizer is pure: the same words give the same tags)
            lxTags(bean) {
                if (!bean || typeof LearnEngine === 'undefined') return null;
                const k = [bean.kind || '', bean.teaType || '', bean.variety || '', bean.origin || '', bean.process || '', bean.roast || '', JSON.stringify(bean.learnKeep || null)].join('\u0001');
                const m = this._lxTagCache || (this._lxTagCache = new Map());
                if (!m.has(k)) { if (m.size > 600) m.clear(); m.set(k, LearnEngine.read(bean)); }
                return m.get(k);
            },
            lxKinds(bean) { const t = this.lxTags(bean); return t ? LearnEngine.kindsOf(t) : []; },
            // a kind's name: "Caturra", "Colombia", "Washed"
            lxName(kind, id) {
                const e = this.lxEntry(kind, id); if (e) return e.name;
                if (kind === 'origin') { const c = LearnEngine.entry('origin', id); return c ? c.name : id; }
                const x = LearnEngine.entry(kind, id); return x ? x.name : id;
            },
            lxKindWord(kind) { return { variety: 'Variety', species: 'Species', origin: 'Origin', process: 'Process' }[kind] || ''; },

            // ---- folding: every section folds; each kind of section remembers it on this phone ("History" folded on one
            // variety page is folded on all of them). Toggles in place.
            lxFoldMap() { if (!this._lxFold) { try { this._lxFold = JSON.parse(safeGet('dialed_learn_fold') || '{}') || {}; } catch (e) { this._lxFold = {}; } } return this._lxFold; },
            lxIsOpen(key, dflt) { const m = this.lxFoldMap(); return Object.prototype.hasOwnProperty.call(m, key) ? !!m[key] : !!dflt; },
            lxFold(el, ev) {
                if (ev) { if (ev.target && ev.target.closest && ev.target.closest('a, [data-lx-nofold]') && !ev.target.closest('.lx-fbtn')) return; ev.stopPropagation(); }
                const sec = el && el.closest ? el.closest('[data-lxf]') : null; if (!sec) return;
                const open = sec.getAttribute('data-open') !== '1', key = sec.getAttribute('data-lxf');
                sec.setAttribute('data-open', open ? '1' : '0');
                const btn = sec.querySelector('.lx-fbtn'); if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', `${open ? 'Fold' : 'Open'} ${sec.getAttribute('data-title') || 'section'}`); }
                const m = this.lxFoldMap(); m[key] = open ? 1 : 0;
                try { safeSet('dialed_learn_fold', JSON.stringify(m)); } catch (e) {}
                if (open && this.lxAfterOpen) this.lxAfterOpen(sec);
                if (this.haptic) this.haptic('tick');
            },
            lxIc(name, size) { return `<svg class="icon lx-ic"${size ? ` style="width:${size}px;height:${size}px"` : ''} aria-hidden="true"><use href="#${name}"/></svg>`; },
            // one section: o = { key, open (its default), title, meta, teaser, body, cls, kicker (a small title instead) }
            lxSecObj(o) { return { ...o, isOpen: this.lxIsOpen(o.key, o.open) }; },
            lxSecHtml(s) {
                const id = `lxb-${String(s.key).replace(/[^a-z0-9-]/gi, '-')}-${(this._lxSeq = (this._lxSeq || 0) + 1)}`;
                const title = this.esc(s.title);
                return `<section class="lx-f${s.cls ? ' ' + s.cls : ''}" data-lxf="${this.esc(s.key)}" data-open="${s.isOpen ? '1' : '0'}" data-title="${title}">`
                    + `<div class="lx-fh" onclick="app.lxFold(this, event)"><div class="lx-fmain"><h3 class="lx-h3">${s.icon ? this.lxIc(s.icon, 18) : ''}<span class="lx-ht">${title}${s.meta ? ` <span>· ${this.esc(s.meta)}</span>` : ''}</span></h3>${s.sub ? `<small class="lx-sub">${this.esc(s.sub)}</small>` : ''}${s.teaser && s.teaser !== s.sub ? `<small class="lx-teaser">${this.esc(s.teaser)}</small>` : ''}</div>`
                    + `<button type="button" class="lx-fbtn" aria-expanded="${s.isOpen}" aria-controls="${id}" aria-label="${s.isOpen ? 'Fold' : 'Open'} ${title}"><span>${this.lxIc('i-chevron-down')}</span></button></div>`
                    + `<div class="lx-fb" id="${id}">${s.body}</div></section>`;
            },
            // a run of sections: the ones folded right now that sit next to each other share one rounded group
            lxSecs(list) {
                const out = []; let run = [];
                const flush = () => { if (!run.length) return; out.push(`<div class="lx-folds">${run.map(s => this.lxSecHtml(s)).join('')}</div>`); run = []; };
                list.filter(Boolean).forEach(o => { const s = o.isOpen === undefined ? this.lxSecObj(o) : o; if (!s.isOpen || s.group) run.push(s); else { flush(); out.push(this.lxSecHtml(s)); } });
                flush();
                return out.join('');
            },

            // ---- small parts
            LX_LABELS: { proven: 'Proven', tendency: 'Strong tendency', trade: 'Trade description', anecdotal: 'Anecdotal', unproven: 'Unproven' },
            lxEv(label) { return label && this.LX_LABELS[label] ? `<span class="lx-ev">${this.LX_LABELS[label]}</span>` : ''; },
            lxNote(name) {
                const f = this.noteToneKey ? this.noteToneKey(name, 'coffee') : (this.noteFam(name, 'coffee') || 'off');
                return `<span class="nl-nt lx-nt" data-nf="${this.esc(f)}">${this.esc(name)}</span>`;
            },
            // a note's name as the wheel writes it ("stone fruit" → "Stone fruit")
            lxNoteName(n) {
                const t = String(n || '').trim(); if (!t) return '';
                const at = this.noteLocate ? this.noteLocate(t, 'coffee') : null;
                if (at && at.note) return at.note;
                return t.charAt(0).toUpperCase() + t.slice(1);
            },
            lxRow(o) {   // { title, sub, onclick, thumb, chev, cls }
                const inner = `${o.thumb ? `<span class="lx-thumb">${o.thumb}</span>` : ''}<span class="lx-rmain"><b>${o.titleHtml || this.esc(o.title)}</b>${o.sub ? `<small>${o.subHtml ? o.sub : this.esc(o.sub)}</small>` : ''}</span>${o.right || ''}${o.onclick ? `<span class="lx-chev">${this.lxIc('i-chev-right', 16)}</span>` : ''}`;
                return o.onclick ? `<button type="button" class="lx-row${o.cls ? ' ' + o.cls : ''}" onclick="${o.onclick}">${inner}</button>` : `<div class="lx-row lx-plain${o.cls ? ' ' + o.cls : ''}">${inner}</div>`;
            },
            lxGo(kind, id) { return `app.learnOpen('${app.escJs(kind)}', '${app.escJs(id)}')`; },
            lxLinkTag(kind, id, label) {
                return this.lxHasPage(kind, id) ? `<button type="button" class="lx-tag lx-link" onclick="${this.lxGo(kind, id)}">${this.esc(label)}${this.lxIc('i-chev-right', 14)}</button>` : `<span class="lx-tag">${this.esc(label)}</span>`;
            },
            lxPlural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; },
            lxMonthWord() { const d = new Date(Date.now()), day = d.getDate(), m = d.toLocaleDateString('en-US', { month: 'long' }); return `${day <= 10 ? 'Early' : day <= 20 ? 'Mid' : 'Late'} ${m}`; },

            // a crowd shape (the averages of the sliders that enough people set), with a dashed typical one
            lxShapeImg(vals, setKeys, ghost, fam, w, h, alt) {
                if (typeof FlavorShape === 'undefined' || !FlavorShape.snapshot) return '';
                const full = {}; TASTE_KEYS.forEach(k => { full[k] = setKeys.includes(k) ? Number(vals[k]) : 5; });
                let gh = null; if (ghost) { gh = {}; TASTE_KEYS.forEach(k => { gh[k] = Number(ghost[k]) || 5; }); }
                let url = '';
                const labels = w > 200;
                // v19.1: a labeled shape is framed the same way every time, at true scale inside the ring where every taste
                // would reach 10, seen a little from above so no label sits on another or on the shape, and none is cut off
                const frame = labels ? { zoom: 1.38, pitch: 0.95, yaw: -0.09, lookY: 0.6, ring: 'disc', labelR: 1.26, labelAlign: 'out', topAuto: true } : { zoom: 1, fit: true, fill: 0.92, cy: 0.5 };
                try { url = FlavorShape.snapshot(full, gh, { width: w, height: h, labels, lines: false, ...frame, isSet: k => setKeys.includes(k), setKey: `lx2|${setKeys.join(',')}|${fam}|${gh ? 'g' : ''}|${labels ? 'l' : ''}`, theme: this.nlShapeTheme(fam, 'box') }); } catch (e) { url = ''; }
                return url ? `<img class="lx-shape" src="${url}" width="${w}" height="${h}" alt="${this.esc(alt || '')}">` : '';
            },

            // ---- community numbers (learn_community / learn_overview): the sessions you may open, grouped by kind. Signed
            // in on the new backend only; kept for 10 minutes. Each block holds its space while it loads, and hides quietly
            // when it can't load.
            lxCommOk() { return !!(this.acctOn && this.acctOn() && typeof Supa !== 'undefined' && Supa.ready && Supa.ready()); },
            lxWantKey(w) { return ['variety', 'species', 'country', 'process'].filter(k => w[k]).map(k => `${k}=${w[k]}`).join('&'); },
            lxComm(want) {
                const st = this.lxState(), k = this.lxWantKey(want), hit = st.comm.get(k);
                if (hit && Date.now() - hit.at < 600000) return hit;
                return null;
            },
            lxCommFetch(wants) {
                const st = this.lxState();
                if (!this.lxCommOk()) return Promise.resolve(null);
                const need = wants.filter(w => { const k = this.lxWantKey(w), h = st.comm.get(k); return !(h && Date.now() - h.at < 600000) && !st.commBusy.has(k); });
                const keys = wants.map(w => this.lxWantKey(w));
                if (!need.length) return Promise.all(keys.map(k => st.commBusy.get(k))).then(() => keys.map(k => st.comm.get(k) || null));
                const p = Supa.rpc('learn_community', { wants: need }).then(list => {
                    (Array.isArray(list) ? list : []).forEach((r, i) => { const k = this.lxWantKey(need[i]); st.comm.set(k, { at: Date.now(), r: r || null, ok: true }); });
                    this.lxBrewRemember(need, list);
                }).catch(() => { need.forEach(w => st.comm.set(this.lxWantKey(w), { at: Date.now() - 540000, r: null, ok: false })); })
                    .finally(() => need.forEach(w => st.commBusy.delete(this.lxWantKey(w))));
                need.forEach(w => st.commBusy.set(this.lxWantKey(w), p));
                return p.then(() => keys.map(k => st.comm.get(k) || null));
            },
            lxOverview() {
                const st = this.lxState();
                if (st.ov && Date.now() - st.ovAt < 600000) return st.ov;
                // (at most one try a minute, so a backend that can't answer doesn't keep the screen drawing)
                if (!st.ovBusy && this.lxCommOk() && Date.now() - (st.ovTry || 0) > 60000) {
                    st.ovTry = Date.now();
                    st.ovBusy = Supa.rpc('learn_overview', {}).then(r => { st.ov = (r && r.kinds) || {}; st.ovAt = Date.now(); st.ovFailed = false; }).catch(() => { st.ovFailed = true; })
                        .finally(() => { st.ovBusy = null; this.lxRefresh('ov'); });
                }
                return st.ov;
            },
            // a block that waits on numbers draws again by itself when they come (only if it's still on screen)
            lxRefresh(what) {
                if (typeof document === 'undefined') return;
                if (this.learnActive()) { const top = this.lxTop(); if (top) this.learnRender(true); }
                if (this.tab === 'my' && this.coffeeScopeNow && this.coffeeScopeNow() === 'learn') { const g = document.getElementById('grid'); if (g && g.querySelector('.lx-home')) { const y = (document.getElementById('main-content') || {}).scrollTop; this.render(); const sc = document.getElementById('main-content'); if (sc && y) sc.scrollTop = y; } }
                if (what === 'comm' && this.isDetailActive && this.isDetailActive() && this.activeGroup && this.learnDecorateDetail) this.learnDecorateDetail(this.activeGroup, this.detailAllBrews || []);
            },
            // the first-shot line on the Log screen reads kinds' brewing numbers from here (filled whenever they load)
            lxBrewRemember(wants, list) {
                let m = {}; try { m = JSON.parse(safeGet('dialed_learn_brew') || '{}') || {}; } catch (e) { m = {}; }
                (Array.isArray(list) ? list : []).forEach((r, i) => {
                    const w = wants[i]; if (!w || !r) return;
                    const all = (r.views && r.views.all) || {};
                    m[this.lxWantKey(w)] = { at: Date.now(), people: all.people || 0, coffees: all.coffees || 0, brew: (r.brew || []).filter(b => (b.people || 0) >= 2) };
                });
                const keys = Object.keys(m); if (keys.length > 80) keys.sort((a, b) => m[a].at - m[b].at).slice(0, keys.length - 80).forEach(k => delete m[k]);
                try { safeSet('dialed_learn_brew', JSON.stringify(m)); } catch (e) {}
            },

            // ---- what you (or someone) logged, by kind: sessions, coffees, ratings. Coffee only.
            lxMine(user) {
                const who = user || this.user, stamp = `${who}|${this.brews.size}|${this.beans.size}|${this._nlDataGen || 0}`;
                if (this._lxMine && this._lxMine.stamp === stamp) return this._lxMine.v;
                const brews = (this.brewsOf ? this.brewsOf(who) : [...this.brews.values()].filter(b => this.getBrewOwner(b) === who)).filter(b => !this.isTeaBrew(b));
                const kinds = new Map(), coffees = new Map(); let rSum = 0, rN = 0, first = Infinity;
                brews.forEach(b => {
                    const bean = this.beans.get(String(b.beanId || '')); if (!bean || this.isTeaBean(bean)) return;
                    const key = this.beanGroupKey(bean), r = this.normalizeRating(b.rating);
                    if (r > 0) { rSum += r; rN++; }
                    const t = this.toTime(b.date); if (Number.isFinite(t) && t < first) first = t;
                    let c = coffees.get(key);
                    if (!c) { c = { key, bean, id: bean.id, n: 0, rs: 0, rn: 0, last: 0, tags: this.lxTags(bean) }; coffees.set(key, c); }
                    c.n++; if (r > 0) { c.rs += r; c.rn++; } c.last = Math.max(c.last, Number.isFinite(t) ? t : 0);
                });
                coffees.forEach(c => {
                    const t = c.tags; if (!t) return;
                    LearnEngine.kindsOf(t).forEach(k => { let x = kinds.get(k); if (!x) { x = { k, n: 0, coffees: [], rs: 0, rn: 0 }; kinds.set(k, x); } x.n += c.n; x.coffees.push(c); x.rs += c.rs; x.rn += c.rn; });
                });
                const v = { user: who, brews, kinds, coffees, avg: rN ? rSum / rN : 0, first };
                this._lxMine = { stamp, v };
                return v;
            },

            // ===================== the Learn tab (Coffees › Learn) =====================
            learnHomeHtml(q) {
                const c = this.learnContent();
                if (!c) {
                    const st = this.lxState();
                    if (!st.loading) this.learnEnsure().then(() => { if (this.tab === 'my' && this.coffeeScopeNow() === 'learn') this.render(); });
                    return `<div class="lx lx-home" data-fam="app">${st.failed ? `<div class="lx-empty"><b>Learn needs a connection the first time</b><span>After that it works offline.</span><button type="button" class="btn-outline lx-retry" onclick="app.lxRetry()">Try again</button></div>` : this.loadingBlockHtml('lx-loading', 'Loading Learn')}</div>`;
                }
                this.learnEnsure();   // (a quiet check for newer words, at most once a day)
                if (q) return `<div class="lx lx-home" data-fam="app">${this.lxSearchHtml(q)}</div>`;
                const ov = this.lxOverview();
                return `<div class="lx lx-home" data-fam="app">${this.lxSecs([this.lxShelfSec(), this.lxExploreSec()])}${this.lxPassRowHtml()}${this.lxSecs([this.lxMostSec(ov), this.lxStartSec()])}</div>`;
            },
            lxRetry() { this.lxState().failed = false; this.learnEnsure(true).then(() => { this.render(); if (this.learnActive()) this.learnRender(); }); this.render(); },

            // On your shelf: your coffees with a session in the last 30 days, newest first
            lxShelf() {
                const M = this.lxMine(this.user), since = Date.now() - 30 * 86400000;
                return [...M.coffees.values()].filter(c => c.last >= since).sort((a, b) => b.last - a.last);
            },
            lxShelfSec() {
                const list = this.lxShelf(); if (!list.length) return null;
                const cards = list.map(c => this.lxShelfCard(c));
                return { key: 'home.shelf', open: true, title: 'On your shelf', meta: String(list.length), teaser: list.slice(0, 3).map(c => c.bean.name || 'Coffee').join(', '), body: `<div class="lx-shelf">${this.moreHtml(cards, 3, '')}</div>` };
            },
            lxShelfCard(c) {
                const bean = c.bean, fam = this.famOfCoffee(bean), tags = this.lxTagChips(bean, false);
                const dec = LearnEngine.decode(bean);
                return `<button type="button" class="lx-card lx-shelfcard" data-fam="${this.esc(fam)}" onclick="app.openFeedTarget('${app.escJs(bean.id)}', '', false)"><span class="lx-roaster">${this.esc(bean.roaster || '')}</span><span class="lx-cname">${this.esc(bean.name || 'Coffee')}</span>${tags ? `<span class="lx-tags">${tags}</span>` : ''}${dec ? `<span class="lx-p lx-dec">${this.esc(dec)}</span>` : ''}</button>`;
            },
            // a coffee's tags as chips (one per tag); links when asked and the page exists
            lxTagChips(bean, links) {
                const t = this.lxTags(bean); if (!t) return '';
                const out = [];
                const chip = (kind, id, label) => out.push(links ? this.lxLinkTag(kind, id, label) : `<span class="lx-tag">${this.esc(label)}</span>`);
                (t.variety || []).forEach(id => chip('variety', id, this.lxName('variety', id)));
                if (t.species && t.species !== 'arabica') chip('species', t.species, this.lxName('species', t.species));
                const o = t.origin || {};
                if ((o.countries || []).length === 1) chip('origin', o.countries[0], o.placeName ? `${o.placeName}, ${this.lxName('origin', o.countries[0])}` : this.lxName('origin', o.countries[0]));
                else (o.countries || []).forEach(cc => chip('origin', cc, this.lxName('origin', cc)));
                const p = t.process || {};
                if (p.base) chip('process', p.base, LearnEngine.processName(p) || this.lxName('process', p.base));
                (p.layers || []).forEach(id => chip('process', id, this.lxName('process', id)));
                if (p.decaf) out.push(`<span class="lx-tag">${this.esc(p.decaf === 'decaf' ? 'Decaf' : 'Decaf · ' + this.lxName('decaf', p.decaf))}</span>`);
                return out.join('');
            },

            // Explore: three doors (counts are what each page lists)
            lxExploreSec() {
                const nC = LearnEngine.allCountries().length, nV = LearnEngine.allVarieties().filter(v => v.family !== 'species').length, nP = LearnEngine.allProcesses().length;
                const body = `<div class="lx-doors"><button type="button" class="lx-door lx-door-wide" data-fam="fruity" onclick="app.learnOpen('list', 'origins')"><span class="lx-dtop"><span class="lx-dn">Origins</span><span class="lx-dc">${nC} countries</span></span><span class="lx-dmap">${this.lxWorldSvg({ mini: true })}</span></button>`
                    + `<button type="button" class="lx-door" data-fam="sweet" onclick="app.learnOpen('list', 'varieties')"><span class="lx-dic">${this.lxIc('i-tree', 30)}</span><span class="lx-dn">Varieties</span><span class="lx-dc">${nV} · from Gesha to SL28</span></button>`
                    + `<button type="button" class="lx-door" data-fam="fermented" onclick="app.learnOpen('list', 'processes')"><span class="lx-dic">${this.lxIc('i-drop', 30)}</span><span class="lx-dn">Processes</span><span class="lx-dc">${nP} · washed to thermal shock</span></button></div>`;
                return { key: 'home.explore', open: true, title: 'Explore', teaser: 'Origins, varieties and processes', body };
            },
            lxPassRowHtml() {
                const P = this.lxPassport(this.user);
                const sub = P.total ? `${this.lxPlural(P.countries.size, 'country', 'countries')} · ${this.lxPlural(P.varieties.size, 'variety', 'varieties')} · ${this.lxPlural(P.processes.size, 'process', 'processes')}` : 'Log a coffee to get your first stamp.';
                return `<div class="lx-passrow"><div class="lx-group">${this.lxRow({ thumb: this.lxIc('i-globe', 22), title: 'Your passport', sub, onclick: 'app.lxOpenPassport()' })}</div></div>`;
            },
            lxOpenPassport() {
                this.profileUser = this.user; this.profileSection = 'taste';
                if (this.tab !== 'profile') { this._noRecapJump = true; this.setTab('profile'); this._noRecapJump = false; } else this.render();
                setTimeout(() => { const el = document.getElementById('lx-passport'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
            },
            // Most brewed on Dialed In: the top three kinds (that have a page) by sessions, from 2 people and 2 coffees
            lxMostSec(ov) {
                if (!this.lxCommOk()) return null;
                if (!ov) return this.lxState().ovFailed ? null : { key: 'home.most', open: true, title: 'Most brewed on Dialed In', body: this.loadingBlockHtml('lx-loading') };
                const rows = Object.entries(ov).map(([k, v]) => { const [kind, id] = k.split(':'); return { kind, id, s: v[0], p: v[1], c: v[2] }; })
                    .filter(x => x.p >= 2 && x.c >= 2 && this.lxHasPage(x.kind, x.id)).sort((a, b) => b.s - a.s || a.id.localeCompare(b.id)).slice(0, 3);
                if (!rows.length) return null;
                const body = `<div class="lx-group">${rows.map((x, i) => this.lxRow({ thumb: `<b class="lx-rank">${i + 1}</b>`, title: this.lxName(x.kind, x.id), sub: `${this.lxKindWord(x.kind)} · ${this.lxPlural(x.s, 'session')} · ${x.p} people`, onclick: this.lxGo(x.kind, x.id) })).join('')}</div>`;
                return { key: 'home.most', open: true, title: 'Most brewed on Dialed In', teaser: rows.map(x => this.lxName(x.kind, x.id)).join(', '), body };
            },
            lxStartSec() {
                const c = this.learnContent(); if (!c || !c.guideList.length) return null;
                const body = `<div class="lx-group">${c.guideList.map(g => this.lxRow({ thumb: this.lxIc(g.icon || 'i-book', 22), title: g.name, sub: g.teaser, onclick: `app.learnOpen('guide', '${app.escJs(g.id)}')` })).join('')}</div>`;
                return { key: 'home.start', open: true, title: 'Start here', teaser: c.guideList.map(g => g.name).join(', '), body };
            },

            // the header search, while Learn is on: varieties, places, processes and guides
            lxSearchHtml(q) {
                const s = LearnEngine.norm(q); if (!s) return '';
                const hit = (name, also) => [name].concat(also || []).some(n => LearnEngine.norm(n).includes(s));
                const rows = [];
                LearnEngine.allCountries().forEach(c => { if (hit(c.name, [c.adj])) rows.push({ kind: 'origin', id: c.code, title: c.name, sub: `Origin · ${c.continent}` }); });
                LearnEngine.allCountries().forEach(c => (LearnEngine.regionsOf(c.code) || []).forEach(r => { if (hit(r.name)) rows.push({ kind: 'origin', id: c.code, title: r.name, sub: `Region · ${c.name}` }); }));
                LearnEngine.allVarieties().forEach(v => { if (hit(v.name, v.also)) rows.push({ kind: v.family === 'species' ? 'species' : 'variety', id: v.id, title: v.name, sub: v.family === 'species' ? 'Species' : `Variety${v.family ? ' · ' + (LearnEngine.FAMILY[v.family] || '') : ''}` }); });
                LearnEngine.allProcesses().forEach(p => { if (hit(p.name)) rows.push({ kind: 'process', id: p.id, title: p.name, sub: 'Process' }); });
                const c = this.learnContent();
                (c ? c.guideList : []).forEach(g => { if (hit(g.name)) rows.push({ guide: g.id, title: g.name, sub: g.teaser }); });
                const rank = r => (r.guide || this.lxHasPage(r.kind, r.id) ? 0 : 1) + (LearnEngine.norm(r.title).startsWith(s) ? 0 : 0.5);
                rows.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
                const html = rows.slice(0, 40).map(r => this.lxRow({ title: r.title, sub: r.sub, onclick: r.guide ? `app.learnOpen('guide', '${app.escJs(r.guide)}')` : this.lxHasPage(r.kind, r.id) ? this.lxGo(r.kind, r.id) : '' })).join('');
                return `<div class="lx-sec"><h3 class="lx-h3">In Learn <span>· ${rows.length}</span></h3>${rows.length ? `<div class="lx-group">${html}</div>` : `<p class="lx-note">Nothing in Learn matches “${this.esc(q)}”.</p>`}</div>`;
            },

            // ===================== Learn's pages (#learn-view) =====================
            learnActive() { const v = typeof document !== 'undefined' ? document.getElementById('learn-view') : null; return !!(v && v.classList.contains('active')); },
            lxTop() { const s = this.lxState().stack; return s.length ? s[s.length - 1] : null; },
            // open a page: kind = variety | species | origin | process | guide | list (origins, varieties, processes)
            learnOpen(kind, id, opts = {}) {
                if (typeof document === 'undefined' || typeof LearnEngine === 'undefined') return;
                const st = this.lxState(), v = document.getElementById('learn-view'); if (!v) return;
                if (!this.learnActive()) {
                    st.stack = [];
                    const form = document.getElementById('bean-modal'), overForm = !!(form && form.classList.contains('active'));
                    st.base = overForm ? 'Back' : (this.isDetailActive && this.isDetailActive() && this.activeGroup) ? (this.activeGroup.meta.name || 'Back')
                        : (this.roasterViewActive && this.roasterViewActive() && this.roasterFind) ? ((this.roasterFind(this.roasterOpen, this.roasterOpenKind) || {}).name || 'Back')
                        : this.tab === 'profile' ? 'Profile' : this.tab === 'roasters' ? 'Roasters' : this.tab === 'feed' ? 'Feed' : 'Learn';
                    v.classList.toggle('lx-over', overForm);
                } else { const top = this.lxTop(); if (top) top.scroll = v.scrollTop; }
                st.stack.push({ kind, id, opts, scroll: 0 });
                v.classList.add('active'); v.setAttribute('aria-hidden', 'false');
                this.learnRender();
                v.scrollTop = 0;
                if (this.haptic) this.haptic('light');
            },
            learnBack() {
                const st = this.lxState(), v = document.getElementById('learn-view');
                st.stack.pop();
                if (!st.stack.length) { this.learnClose(); return; }
                this.learnRender();
                if (v) v.scrollTop = (this.lxTop() || {}).scroll || 0;
            },
            learnClose() {
                const st = this.lxState(), v = document.getElementById('learn-view');
                st.stack = [];
                if (v) { v.classList.remove('active', 'lx-over'); v.setAttribute('aria-hidden', 'true'); const p = document.getElementById('lx-page'); if (p) p.innerHTML = ''; v.removeAttribute('data-fam'); }
            },
            lxBackLabel() {
                const s = this.lxState().stack;
                if (s.length < 2) return this.lxState().base || 'Learn';
                return this.lxPageTitle(s[s.length - 2]);
            },
            lxPageTitle(p) {
                if (!p) return 'Learn';
                if (p.kind === 'list') return { origins: 'Origins', varieties: 'Varieties', processes: 'Processes' }[p.id] || 'Learn';
                if (p.kind === 'guide') { const c = this.learnContent(), g = c && c.guides.get(p.id); return g ? g.name : 'Guide'; }
                if (p.kind === 'tree') return 'Coffee tree';
                return this.lxName(p.kind, p.id);
            },
            // a Learn page leaves for a coffee: Back from the coffee comes back here (and to what was under it)
            learnSnap() {
                const v = document.getElementById('learn-view'), top = this.lxTop(); if (top && v) top.scroll = v.scrollTop;
                return { kind: 'learn', stack: this.lxState().stack.map(p => ({ ...p })), base: this.lxState().base, over: !!(v && v.classList.contains('lx-over')), under: this.snapPage ? this.snapPage() : null };
            },
            learnOpenCoffee(beanId) {
                if (!this.beans.has(String(beanId))) { this.showToast('That coffee is no longer here.'); return; }
                const snap = this.learnSnap();
                if (snap.over) { this.learnClose(); this.openFeedTarget(beanId, '', false); return; }   // (opened over a form: just go)
                this.navStack = this.navStack || []; this.navStack.push(snap);
                this.learnClose();
                if (this.hideRoasterView) this.hideRoasterView();
                this._navKeep = true;
                this.openFeedTarget(beanId, '', false);
                this._navKeep = false;
                const d = document.getElementById('detail-view'); if (d) d.scrollTop = 0;
            },
            // goBackPage() found a Learn page on the stack
            learnRestore(prev) {
                if (prev.under) { this.navStack = this.navStack || []; this.navStack.push(prev.under); this.goBackPage(); }
                else { if (this.hideRoasterView) this.hideRoasterView(); const d = document.getElementById('detail-view'); if (d) d.classList.remove('active'); this.openCommentId = null; this.render(); }
                const st = this.lxState(), v = document.getElementById('learn-view');
                st.stack = prev.stack || []; st.base = prev.base || 'Learn';
                if (!st.stack.length || !v) return;
                v.classList.add('active'); v.setAttribute('aria-hidden', 'false');
                this.learnRender();
                v.scrollTop = (this.lxTop() || {}).scroll || 0;
            },
            learnRender(keepScroll) {
                const v = document.getElementById('learn-view'), page = document.getElementById('lx-page'), p = this.lxTop();
                if (!v || !page || !p) return;
                const y = v.scrollTop;
                const c = this.learnContent();
                if (!c) {
                    const st = this.lxState();
                    page.innerHTML = `${this.lxTopBar()}<div class="lx">${st.failed ? `<div class="lx-empty"><b>Learn needs a connection the first time</b><span>After that it works offline.</span><button type="button" class="btn-outline lx-retry" onclick="app.lxRetry()">Try again</button></div>` : this.loadingBlockHtml('lx-loading', 'Loading Learn')}</div>`;
                    v.setAttribute('data-fam', 'app');
                    if (!st.loading && !st.failed) this.learnEnsure().then(() => { if (this.learnActive()) this.learnRender(); });
                    return;
                }
                const out = this.lxPageHtml(p);
                v.setAttribute('data-fam', out.fam || 'app');
                page.innerHTML = `${this.lxTopBar()}<div class="lx lx-pagebody">${out.html}</div>`;
                if (keepScroll) v.scrollTop = y;
                if (this.nlFitTiles) try { this.nlFitTiles(v); } catch (e) {}
                if (p.kind === 'tree' && this.lxTreeInit) this.lxTreeInit(p);   // v20.0: the tree sizes itself to the screen
            },
            lxTopBar() { return `<div class="lx-topbar"><button type="button" class="lx-back" onclick="app.learnBack()">${this.lxIc('i-arrow-left', 20)}<span>${this.esc(this.lxBackLabel())}</span></button></div>`; },
            lxPageHtml(p) {
                if (p.kind === 'list' && p.id === 'origins') return this.lxOriginsPage(p);
                if (p.kind === 'list' && p.id === 'varieties') return this.lxVarietiesPage(p);
                if (p.kind === 'list' && p.id === 'processes') return this.lxProcessesPage(p);
                if (p.kind === 'guide') return this.lxGuidePage(p);
                if (p.kind === 'tree') return this.lxTreePage(p);   // v20.0
                const e = this.lxEntry(p.kind, p.id);
                if (e) return this.lxEntryPage(e, p);
                if (this.lxShortOk(p.kind, p.id)) return this.lxShortPage(p.kind, p.id, p);
                return { fam: 'app', html: `<div class="lx-empty"><b>${this.esc(this.lxName(p.kind, p.id))}</b><span>No page for this one yet.</span></div>` };
            },
            lxHead(o) {   // { kicker, name, also, lede, facts, kickerApp }
                return `<header class="lx-head"><div class="lx-kick${o.kickerApp ? ' lx-kapp' : ''}">${this.esc(o.kicker)}</div><h1 class="lx-name${o.small ? ' lx-name-s' : ''}">${this.esc(o.name)}</h1>${o.lede ? `<p class="lx-lede">${this.esc(o.lede)}</p>` : ''}`
                    + `${(o.also || []).length ? `<div class="lx-tags lx-also">${o.also.map((a, i) => `<span class="lx-tag">${i === 0 ? 'Also: ' : ''}${this.esc(a)}</span>`).join('')}</div>` : ''}`
                    + `${(o.facts || []).length ? `<div class="lx-facts">${o.facts.map(f => `<div class="lx-tile"><div class="lx-sv">${this.esc(f.value)}</div><div class="lx-sl">${this.esc(f.label)}</div></div>`).join('')}</div>` : ''}</header>`;
            },

            // ---- the world: where coffee grows (the coffee map's drawing; nothing personal)
            lxWorldSvg(o = {}) {
                if (typeof WORLD_MAP === 'undefined') return '';
                const grow = new Set(LearnEngine.allCountries().map(c => c.code)), hot = o.hot || null, pages = o.pages || null;
                const paths = Object.entries(WORLD_MAP.c).map(([c, d]) => { const on = grow.has(c); const cls = on ? (hot && hot.has(c) ? 'on2' : 'on') : ''; return `<path${cls ? ` class="${cls}"` : ''} d="${d}"${on && pages && pages.has(c) ? ` data-lxc="${c}"` : ''}/>`; }).join('');
                const belt = (WORLD_MAP.belt || []).map(y => `<line class="lx-tropic" x1="0" x2="${WORLD_MAP.w}" y1="${y}" y2="${y}"/>`).join('');
                const hi = WORLD_MAP.dots && WORLD_MAP.dots.HI;
                const dot = hi ? `<circle class="${hot && hot.has('HI') ? 'on2' : 'on'}" cx="${hi[0]}" cy="${hi[1]}" r="5"/>` : '';
                return `<svg class="lx-world${o.mini ? ' lx-mini' : ''}" viewBox="0 ${o.mini ? 70 : 40} ${WORLD_MAP.w} ${WORLD_MAP.h - (o.mini ? 150 : 90)}" role="img" aria-label="Map of the countries that grow coffee"${pages ? ' onclick="app.lxWorldTap(event)"' : ''}>${paths}${dot}${belt}</svg>`;
            },
            lxWorldTap(ev) { const t = ev && ev.target && ev.target.closest ? ev.target.closest('[data-lxc]') : null; if (t) this.learnOpen('origin', t.getAttribute('data-lxc')); },

            // ---- L2 Origins
            lxOriginsPage() {
                const c = this.learnContent(), ov = this.lxOverview() || {}, st = this.lxState(), cont = st.cont || '';
                const all = LearnEngine.allCountries();
                const pages = new Set(all.map(x => x.code).filter(code => this.lxHasPage('origin', code)));   // (written pages and short ones)
                const sel = cont ? new Set(all.filter(x => x.continent === cont).map(x => x.code)) : null;
                const mapBody = `<div class="lx-mapbox" data-fam="fruity">${this.lxWorldSvg({ hot: sel, pages })}<div class="lx-legend"><span><i class="lx-lg-on"></i>Grows coffee</span><span><i class="lx-lg-tropic"></i>Tropics</span></div></div>`;
                const chips = `<div class="lx-chips" role="tablist" aria-label="Continents">${[['', 'All'], ...LearnEngine.CONTINENTS.map(k => [k, k])].map(([k, l]) => `<button type="button" class="lx-chip${k === cont ? ' on' : ''}" aria-pressed="${k === cont}" onclick="app.lxSetCont('${app.escJs(k)}')">${this.esc(l)}</button>`).join('')}</div>`;
                const fresh = this.lxFreshNow();
                const freshBody = fresh.length ? `<div class="lx-box"><p class="lx-p lx-small">${this.esc(this.lxMonthWord())}: an estimate from harvest months, plus the few months a crop takes to reach roasters. Look for new-crop bags from these:</p><div class="lx-tags">${fresh.map(f => this.lxLinkTag('origin', f.code, f.allYear ? `${this.lxName('origin', f.code)}, most of the year` : this.lxName('origin', f.code))).join('')}</div></div>` : '';
                const n = code => { const x = ov[`origin:${code}`]; return x ? x[2] : 0; };
                const list = all.filter(x => !sel || sel.has(x.code)).map(x => ({ x, n: n(x.code), s: (ov[`origin:${x.code}`] || [0])[0], page: pages.has(x.code) }))
                    .sort((a, b) => b.s - a.s || (b.page - a.page) || a.x.name.localeCompare(b.x.name));
                const rows = list.map(r => { const e = r.page ? this.lxEntry('origin', r.x.code) : null; const sub = [e ? e.summary : r.x.continent, r.n ? this.lxPlural(r.n, 'coffee') + ' here' : ''].filter(Boolean).join(' · '); return this.lxRow({ title: r.x.name, sub, onclick: r.page ? this.lxGo('origin', r.x.code) : '' }); });
                const secs = [
                    { key: 'origins.map', open: true, title: 'Where coffee grows', teaser: `${all.length} countries, in a band around the tropics`, body: mapBody, cls: 'lx-mapsec' },
                    { raw: chips },
                    fresh.length ? { key: 'origins.fresh', open: true, title: 'Fresh at roasters now', teaser: fresh.map(f => this.lxName('origin', f.code)).join(', '), body: freshBody } : null,
                    { key: 'origins.list', open: true, title: 'Countries', meta: Object.keys(ov).length ? 'most brewed here first' : '', teaser: list.slice(0, 4).map(r => r.x.name).join(', '), body: `<div class="lx-group">${this.moreHtml(rows, 4, '')}</div>${Object.keys(ov).length ? `<p class="lx-note">${this.esc(c.origins.note || '')}</p>` : ''}` }
                ];
                const html = this.lxHead({ kicker: 'Learn', kickerApp: true, name: 'Origins', lede: c.origins.lede || '' }) + secs.map(s => s && s.raw ? s.raw : s ? this.lxSecs([s]) : '').join('');
                return { fam: 'app', html };
            },
            lxSetCont(k) { this.lxState().cont = k; this.learnRender(true); },
            // countries whose new crop is reaching roasters this month: harvest months + 3 to 5 months at sea and resting
            lxFreshNow() {
                const c = this.learnContent(), f = c && c.fresh; if (!f) return [];
                const m = new Date(Date.now()).getMonth() + 1, out = [];
                (f.countries || []).forEach(x => {
                    if (x.allYear) { out.push({ code: x.code, allYear: true }); return; }
                    if (x.arrive) { if (x.arrive.includes(m)) out.push({ code: x.code }); return; }
                    const h = x.harvest || []; if (!h.length) return;
                    // the harvest as a run of months (it may wrap the new year): its first and last month
                    let start = h[0], end = h[h.length - 1]; if (end < start) end += 12;
                    const lo = start + 3, hi = end + 5;
                    if ([m, m + 12, m + 24].some(v => v >= lo && v <= hi)) out.push({ code: x.code });
                });
                return out.sort((a, b) => (a.allYear ? 1 : 0) - (b.allYear ? 1 : 0));
            },

            // ---- L3 Varieties: the family tree, built from the recognizer's families; ✓ = you've logged it
            lxVarietiesPage() {
                const c = this.learnContent(), tree = c.tree || { stages: [] }, M = this.lxMine(this.user), st = this.lxState();
                const had = id => M.kinds.has(`variety:${id}`) || M.kinds.has(`species:${id}`);
                const all = LearnEngine.allVarieties(), disguise = new Set(((tree.stages || []).find(s => s.members) || {}).members || []);
                const chip = (v, fam) => { const page = this.lxHasPage(v.family === 'species' ? 'species' : 'variety', v.id), mine = had(v.id); const label = `${mine ? this.lxIc('i-check', 13) : ''}${this.esc(v.name)}${v.q ? '?' : ''}`; return page ? `<button type="button" class="nl-nt lx-vchip lx-link${mine ? ' lx-mine' : ''}" data-nf="${fam}" onclick="${this.lxGo('variety', v.id)}" aria-label="${this.esc(v.name)}${mine ? ', you have had it' : ''}">${label}${this.lxIc('i-chev-right', 12)}</button>` : `<span class="nl-nt lx-vchip${mine ? ' lx-mine' : ''}" data-nf="${fam}"${mine ? ` aria-label="${this.esc(v.name)}, you have had it"` : ''}>${label}</span>`; };
                const famNote = { landrace: 'floral', yemen: 'earthy', typica: 'nutty', bourbon: 'sweet', cross: 'spice', introgressed: 'herbal', f1: 'vegetal' };
                const stageHtml = s => {
                    const members = s.members ? s.members.map(id => all.find(v => v.id === id)).filter(Boolean) : all.filter(v => v.family === s.family && !disguise.has(v.id));
                    const nf = s.members ? 'fermented' : (famNote[s.family] || 'off');
                    return `<div class="lx-stage${s.tint ? ' lx-tinted' : ''}"${s.tint ? ` data-fam="${s.tint}"` : ''}><div class="lx-kick">${this.esc(s.kicker)}</div><div class="lx-stitle">${this.esc(s.title)}</div><p class="lx-p lx-small2">${this.esc(s.text)}</p><div class="lx-vchips">${members.map(v => chip(v, nf)).join('')}</div></div>`;
                };
                const stages = tree.stages || [];
                let body = '<div class="lx-tree">';
                for (let i = 0; i < stages.length; i++) {
                    const s = stages[i], last = i === stages.length - 1;
                    if (s.pair) { const b = stages.find(x => x.id === s.pair); body += `<div class="lx-tnode"><span class="lx-tdot"></span><div class="lx-pair">${stageHtml(s)}${b ? stageHtml(b) : ''}</div></div>`; continue; }
                    if (stages.some(x => x.pair === s.id)) continue;
                    body += `<div class="lx-tnode${last ? ' lx-tlast' : ''}"><span class="lx-tdot${i === 0 ? ' lx-tfirst' : ''}${last ? ' lx-tspark' : ''}">${last ? this.lxIc('i-spark', 16) : ''}</span>${stageHtml(s)}</div>`;
                }
                body += '</div>';
                const fams = Object.entries(LearnEngine.FAMILY).filter(([k]) => k !== 'species');
                const ff = st.fam || '';
                const az = all.filter(v => v.family !== 'species' && (!ff || v.family === ff)).sort((a, b) => a.name.localeCompare(b.name));
                const azBody = `<div class="lx-chips lx-chips-in">${[['', 'All'], ...fams].map(([k, l]) => `<button type="button" class="lx-chip${k === ff ? ' on' : ''}" aria-pressed="${k === ff}" onclick="app.lxSetFam('${app.escJs(k)}')">${this.esc(l)}</button>`).join('')}</div><div class="lx-group">${this.moreHtml(az.map(v => this.lxRow({ title: `${v.name}${v.q ? '?' : ''}`, sub: [v.family ? (disguise.has(v.id) && v.q ? 'Ethiopian roots?' : LearnEngine.FAMILY[v.family]) : 'Family not known', had(v.id) ? 'you’ve had it' : ''].filter(Boolean).join(' · '), onclick: this.lxHasPage('variety', v.id) ? this.lxGo('variety', v.id) : '' })), 12, '')}</div>`;
                const sp = all.filter(v => v.family === 'species');
                const spBody = `${tree.species ? `<p class="lx-p lx-small">${this.esc(tree.species.text)}</p>` : ''}<div class="lx-group">${sp.map(v => this.lxRow({ title: v.name, sub: had(v.id) ? 'you’ve had it' : '', onclick: this.lxHasPage('species', v.id) ? this.lxGo('species', v.id) : '' })).join('')}</div>`;
                const secs = [
                    // v20.0: the family tree has its own screen; this is the way in
                    { key: 'varieties.tree', open: true, title: 'Coffee’s family tree', teaser: 'From wild Ethiopia to the F1 hybrids', body: typeof LearnTree !== 'undefined' ? (this.lxTreeDefs(), `<button type="button" class="lx-tdoor" onclick="app.lxTreeOpen('')">${LearnTree.sprig()}<span style="flex:1;min-width:0"><b>The coffee tree</b><small>Every variety grows from the one it came from. Tap a name to light up its line back to wild Ethiopia.</small></span>${this.lxIc('i-chev-right', 18)}</button>`) : body },
                    { key: 'varieties.az', open: false, title: 'All varieties, A to Z', meta: String(all.filter(v => v.family !== 'species').length), teaser: 'Every variety, with a family filter', body: azBody },
                    { key: 'varieties.species', open: false, title: 'Other species', teaser: sp.map(v => v.name).join(', '), body: spBody }
                ];
                const html = this.lxHead({ kicker: 'Learn', kickerApp: true, name: 'Varieties', lede: tree.lede || '' }) + this.lxSecs([...secs, this.lxSourcesObj(tree.sources || [], 'varieties.sources')]);
                return { fam: 'app', html };
            },
            lxSetFam(k) { this.lxState().fam = k; this.learnRender(true); },

            // ---- L4 Processes: the process map, the base methods and the changes on top
            lxProcessesPage(p) {
                const c = this.learnContent(), pm = c.pmap || { dots: [] }, ov = this.lxOverview() || {}, hl = (p.opts && p.opts.hl) || '';
                const n = id => { const x = ov[`process:${id}`]; return x ? x[2] : 0; };
                const here = id => Object.keys(ov).length ? (n(id) ? ` · ${this.lxPlural(n(id), 'coffee')} here` : ' · none here yet') : '';
                const mapBody = `<div class="lx-pmapbox">${this.lxProcessMapSvg(pm, hl)}<p class="lx-note">Tap a highlighted dot to open it.${pm.note ? ' ' + this.esc(pm.note) : ''}</p></div>`;
                const bases = ['washed', 'natural', 'honey', 'wet-hulled'];
                const sumOf = id => { const e = this.lxEntry('process', id); if (e) return e.summary; const s = LearnEngine.PSAY[id]; return s ? s[0].replace(/^[A-Z][a-z-]+ means /, '').replace(/^\w/, x => x.toUpperCase()) : ''; };
                const baseBody = `<div class="lx-group">${bases.map(id => this.lxRow({ title: this.lxName('process', id), sub: `${sumOf(id)}${here(id)}`, onclick: this.lxHasPage('process', id) ? this.lxGo('process', id) : '' })).join('')}</div>`;
                const groups = [['fermentation', 'Fermentation'], ['microbes', 'Added microbes'], ['ingredients', 'Added ingredients'], ['after', 'After-treatments'], ['drying', 'Drying']];
                const procs = LearnEngine.allProcesses();
                const gsecs = groups.map(([layer, title]) => {
                    const list = procs.filter(x => x.layer === layer);
                    if (!list.length) return null;
                    return { key: `processes.g.${layer}`, open: false, group: true, title, teaser: list.map(x => x.name).join(', '), body: `<div class="lx-group lx-inner">${list.map(x => this.lxRow({ title: x.name, sub: `${sumOf(x.id)}${here(x.id)}`, onclick: this.lxHasPage('process', x.id) ? this.lxGo('process', x.id) : '' })).join('')}</div>` };
                }).filter(Boolean);
                const decafs = (LearnEngine.knownIds().decaf || []).filter(id => id !== 'decaf');
                gsecs.push({ key: 'processes.g.decaf', open: false, group: true, title: 'Decaf', teaser: 'Not a process: how the caffeine comes out', body: `<div class="lx-group lx-inner">${decafs.map(id => this.lxRow({ title: this.lxName('decaf', id), sub: LearnEngine.PSAY[id] ? LearnEngine.PSAY[id][0] : 'A way to take the caffeine out' })).join('')}</div>` });
                const changes = `<div class="lx-folds">${gsecs.map(s => this.lxSecHtml(this.lxSecObj(s))).join('')}</div>`;
                const secs = [
                    { key: 'processes.map', open: true, title: 'The process map', teaser: 'How much fruit stays on, and how hands-on the ferment is', body: mapBody },
                    { key: 'processes.base', open: true, title: 'Base methods', teaser: 'Washed, natural, honey and wet-hulled', body: baseBody },
                    { key: 'processes.changes', open: true, title: 'Changes on top', teaser: groups.map(g => g[1]).join(', ') + ', decaf', body: changes }
                ];
                const html = this.lxHead({ kicker: 'Learn', name: 'Processes', lede: pm.lede || '' }) + this.lxSecs([...secs, this.lxSourcesObj(pm.sources || [], 'processes.sources')]);
                return { fam: 'fermented', html };
            },
            lxProcessMapSvg(pm, hl) {
                const dots = pm.dots || [];
                const lab = (x, y, t, a, cls) => `<text x="${x}" y="${y}"${a ? ` text-anchor="${a}"` : ' text-anchor="middle"'}${cls ? ` class="${cls}"` : ''}>${this.esc(t)}</text>`;
                let g = '';
                dots.forEach(d => {
                    const page = this.lxHasPage('process', d.id), on = hl && d.id === hl, tap = page ? ` data-lxp="${this.esc(d.id)}" role="link" tabindex="0" aria-label="${this.esc(d.label)}"` : '';
                    if (d.band) { g += `<g class="lx-pdot${page ? ' lx-pon' : ''}${on ? ' lx-phl' : ''}"${tap}><rect x="${d.x}" y="${d.y}" width="${d.w}" height="24" rx="12" class="lx-pband"/>${lab(d.x + d.w / 2, d.y + 16, d.label)}</g>`; return; }
                    const r = d.base ? 7 : 5;
                    const circles = (d.spread || [d.x]).map(x => `<circle cx="${x}" cy="${d.y}" r="${d.spread ? 5 : r}" class="${d.base && !d.spread ? 'lx-pbase' : 'lx-psoft'}"/>`).join('');
                    const big = page ? `<circle cx="${d.x}" cy="${d.y}" r="20" class="lx-phit"/>` : '';
                    g += `<g class="lx-pdot${page ? ' lx-pon' : ''}${on ? ' lx-phl' : ''}${d.base ? ' lx-pb' : ''}"${tap}>${big}${on ? `<circle cx="${d.x}" cy="${d.y}" r="12" class="lx-pring"/>` : ''}${circles}${lab(d.lx ?? d.x, d.ly ?? (d.y - 12), d.label, d.anchor, d.base ? 'lx-pbl' : '')}</g>`;
                });
                return `<svg class="lx-pmap" viewBox="0 0 340 250" role="img" aria-label="Process map. Left to right: how much fruit stays on while drying, from washed through the honeys to natural. Bottom to top: how hands-on the fermentation is, from open air to sealed tanks, added microbes and added ingredients." onclick="app.lxPmapTap(event)">`
                    + `<g class="lx-pgrid"><line x1="70" y1="195" x2="334" y2="195"/><line x1="70" y1="140" x2="334" y2="140" stroke-dasharray="3 4"/><line x1="70" y1="85" x2="334" y2="85" stroke-dasharray="3 4"/><line x1="70" y1="30" x2="334" y2="30" stroke-dasharray="3 4"/></g>`
                    + `<g class="lx-paxis"><text x="0" y="199">Open air</text><text x="0" y="137">Sealed</text><text x="0" y="149">tanks</text><text x="0" y="82">Added</text><text x="0" y="94">microbes</text><text x="0" y="27">Added</text><text x="0" y="39">fruit, spice</text><text x="70" y="224">None</text><text x="197" y="224" text-anchor="middle">Some</text><text x="334" y="224" text-anchor="end">All of it</text><text x="202" y="245" text-anchor="middle" class="lx-pbl">How much fruit stays on while it dries →</text></g>`
                    + `<g class="lx-pdots">${g}</g></svg>`;
            },
            lxPmapTap(ev) { const t = ev && ev.target && ev.target.closest ? ev.target.closest('[data-lxp]') : null; if (t) this.learnOpen('process', t.getAttribute('data-lxp')); },

            // a page's sources, folded at the bottom (with the rest of its folded group)
            lxSourcesObj(ids, key) {
                const c = this.learnContent(); const list = (ids || []).filter(id => c.sources[id]);
                if (!list.length) return null;
                return { key, open: false, title: 'Sources', meta: String(list.length), teaser: this.lxSrcTeaser(list), body: this.lxSrcList(list) };
            },
