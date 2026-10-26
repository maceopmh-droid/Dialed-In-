            // ---- v15.1: the loading animation, the Dialed In logo turning, wherever something has to load (the words stay
            // for screen readers)
            // v16.5: the logo now changes shape as it turns (the blob draws itself once the spinner is on the page)
            loaderHtml(label = '') {
                const blob = typeof window !== 'undefined' && window.DIBlob && window.DIBlob.on();
                if (blob) window.DIBlob.kick();
                return `<span class="di-loader" role="status"><i class="dl-logo${blob ? ' di-morph' : ''}" aria-hidden="true">${blob ? '<canvas class="di-blob"></canvas>' : ''}</i><span class="dl-label">${this.esc(label || 'Loading…')}</span></span>`;
            },
            loadingBlockHtml(cls = 'pp-empty', label = '') { return `<div class="${cls} di-loading">${this.loaderHtml(label)}</div>`; },

            // ---- v15.1: the start-up screen (in the page itself, so it shows from the first moment): the bar fills as the
            // app starts, and it fades once your coffees are on screen
            bootStep(pct) { const b = document.getElementById('boot-bar'); if (b) b.style.width = Math.max(parseFloat(b.style.width) || 0, pct) + '%'; },
            hideBoot() {
                const s = document.getElementById('boot-screen');
                if (!s || s.classList.contains('gone')) return;
                // at least about two thirds of a second in all, so it never just flickers past
                const up = typeof performance !== 'undefined' && performance.now ? performance.now() : 1000;
                if (up < 650 && !this._bootWait) { this._bootWait = true; setTimeout(() => { this._bootWait = false; this.hideBoot(); }, 650 - up); return; }
                this.bootStep(100);
                setTimeout(() => { s.classList.add('gone'); setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 320); }, 180);
            },

            // ---- v15.1: where a coffee comes from. Origins are free text ("Huila, Colombia", "Sumatra"): the country (and
            // its continent) is found by name, by its coffee regions, or by the usual spellings
            coffeeGeo() {
                if (this._coffeeGeo) return this._coffeeGeo;
                const T = {   // country: its names and coffee regions, as phrases ("|" between them)
                    ETH: 'ethiopia|ethiopian|yirgacheffe|yirgachefe|sidama|sidamo|guji|harrar|harar|limu|jimma|kaffa|gedeo|gedeb|wush wush|bensa',
                    KEN: 'kenya|kenyan|nyeri|kirinyaga|embu|kiambu|muranga', RWA: 'rwanda|rwandan', BDI: 'burundi|kayanza|ngozi', UGA: 'uganda|mt elgon|mount elgon',
                    TZA: 'tanzania|kilimanjaro', COD: 'congo|drc|dr congo|kivu', MWI: 'malawi', ZMB: 'zambia', ZWE: 'zimbabwe', CMR: 'cameroon',
                    CIV: "ivory coast|cote d'ivoire", MDG: 'madagascar', SLE: 'sierra leone', SDS: 'south sudan',
                    YEM: 'yemen|yemeni|mocha|mokha', IND: 'india|indian|malabar|karnataka|chikmagalur|darjeeling|assam|nilgiri', NPL: 'nepal|ilam',
                    IDN: 'indonesia|indonesian|sumatra|sumatran|java|sulawesi|toraja|bali|flores|aceh|gayo|mandheling|lintong',
                    VNM: 'vietnam|viet nam', LAO: 'laos', THA: 'thailand', MMR: 'myanmar|burma', CHN: 'china|yunnan|fujian|zhejiang|anhui|hunan|guangdong|sichuan|wuyi|anxi|hangzhou', PHL: 'philippines',
                    TLS: 'timor|east timor|timor-leste', TWN: 'taiwan|taiwanese|nantou|alishan|lishan', LKA: 'sri lanka|ceylon|nuwara eliya', SAU: 'saudi arabia',
                    JPN: 'japan|japanese|shizuoka|uji|kagoshima', KOR: 'korea|south korea|jeju|boseong', GEO: 'georgia|georgian', TUR: 'turkey|turkiye|rize', IRN: 'iran',   // v17.0: where tea grows too
                    PNG: 'papua new guinea|png', AUS: 'australia', HI: 'hawaii|hawaiian|kona|maui|kauai',
                    BRA: 'brazil|brazilian|brasil|cerrado|mogiana|sul de minas', COL: 'colombia|colombian|huila|narino|cauca|tolima|antioquia|quindio',
                    PER: 'peru|peruvian|cajamarca', ECU: 'ecuador|loja', BOL: 'bolivia|caranavi', VEN: 'venezuela',
                    GTM: 'guatemala|huehuetenango|atitlan|antigua', HND: 'honduras|marcala', SLV: 'el salvador',
                    NIC: 'nicaragua|jinotega|nueva segovia', CRI: 'costa rica|tarrazu|west valley', PAN: 'panama|boquete|chiriqui',
                    MEX: 'mexico|chiapas|oaxaca|veracruz', JAM: 'jamaica|blue mountain', DOM: 'dominican republic', HTI: 'haiti', CUB: 'cuba', PRI: 'puerto rico', ARG: 'argentina|misiones'
                };
                const C = { Africa: 'ETH KEN RWA BDI UGA TZA COD MWI ZMB ZWE CMR CIV MDG SLE SDS', Asia: 'YEM IND NPL IDN VNM LAO THA MMR CHN PHL TLS TWN LKA SAU JPN KOR GEO TUR IRN',
                    Oceania: 'PNG AUS HI', 'South America': 'BRA COL PER ECU BOL VEN ARG', 'North & Central America': 'GTM HND SLV NIC CRI PAN MEX JAM DOM HTI CUB PRI' };
                const names = { HI: 'Hawaii', COD: 'DR Congo', DOM: 'Dominican Republic', CIV: 'Côte d\'Ivoire', SDS: 'South Sudan' };
                const alias = [];
                Object.entries(T).forEach(([code, words]) => words.split('|').forEach(w => alias.push([w, code])));
                alias.sort((a, b) => b[0].length - a[0].length);
                const continent = {}; Object.entries(C).forEach(([k, v]) => v.split(' ').forEach(c => { continent[c] = k; }));
                return (this._coffeeGeo = { alias, continent, continents: Object.keys(C), names });
            },
            coffeeCountry(origin) {
                const t = ' ' + String(origin || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z' -]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
                if (t.trim().length < 2) return '';
                const hit = this.coffeeGeo().alias.find(([w]) => t.includes(' ' + w + ' '));
                return hit ? hit[1] : '';
            },
            coffeeContinent(origin) { const c = this.coffeeCountry(origin); return c ? this.coffeeGeo().continent[c] || '' : ''; },
            coffeeCountryName(code) { return this.coffeeGeo().names[code] || (typeof WORLD_MAP !== 'undefined' && WORLD_MAP.names[code]) || code; },

            // ---- v15.1: someone's coffee map: the countries their coffees came from, shaded by how many, and the coffee
            // continents they've covered. Tap a country (or its name under the map) for those coffees.
            coffeeMapData(user, kind) {
                const byBean = new Map(), tea = (kind || this.drinkNow()) === 'tea';   // v17.0: a tea map in tea mode
                this.brews.forEach(b => {
                    if (this.getBrewOwner(b) !== user || this.isTeaBrew(b) !== tea) return;
                    const bean = this.beans.get(String(b.beanId || '')); if (!bean) return;
                    const r = this.normalizeRating(b.rating) || 0, cur = byBean.get(bean.id);
                    byBean.set(bean.id, { bean, best: Math.max(cur ? cur.best : 0, r), n: (cur ? cur.n : 0) + 1 });
                });
                const by = new Map(), continents = new Set();
                byBean.forEach(x => {
                    const codes = [...new Set(this.originList(x.bean.origin).map(o => this.coffeeCountry(o)).filter(Boolean))];
                    codes.forEach(c => {
                        if (!by.has(c)) by.set(c, []);
                        by.get(c).push(x);
                        const k = this.coffeeGeo().continent[c]; if (k) continents.add(k);
                    });
                });
                by.forEach(list => list.sort((a, b) => b.best - a.best || b.n - a.n));
                return { by, continents, tea, coffees: [...by.values()].reduce((s, l) => s + l.length, 0) };
            },
            renderCoffeeMapCard(user) {
                if (typeof WORLD_MAP === 'undefined' || !user) return '';
                const D = this.coffeeMapData(user), esc = s => this.esc(s);
                if (!D.by.size) return '';
                const sel = (this._mapSel || {})[user] && D.by.has(this._mapSel[user]) ? this._mapSel[user] : '';
                const geo = this.coffeeGeo();
                const level = n => n >= 4 ? 3 : n >= 2 ? 2 : 1;
                const paths = Object.entries(WORLD_MAP.c).map(([c, d]) => {
                    const list = D.by.get(c);
                    const cls = `cm-land${list ? ` cm-on cm-l${level(list.length)}` : ''}`;   // (a country you haven't had a coffee from stays dark)
                    return `<path class="${cls}" d="${d}"${list ? ` data-c="${c}"` : ''}/>`;
                }).join('');
                // the picked country's outline goes on top of everything (drawn with its neighbors, they covered parts of it)
                const selLine = sel && WORLD_MAP.c[sel] ? `<path class="cm-selo" d="${WORLD_MAP.c[sel]}"/>` : '';
                // the coffee belt, dashed: between the tropics, where coffee grows
                const belt = D.tea ? '' : (WORLD_MAP.belt || []).map(y => `<line class="cm-tropic" x1="0" x2="${WORLD_MAP.w}" y1="${y}" y2="${y}"/>`).join('');   // (the coffee belt is coffee's)
                const wd = this.drinkWords(D.tea ? 'tea' : 'coffee');
                const hi = WORLD_MAP.dots.HI, hl = D.by.get('HI');
                const dot = `<circle class="cm-dot${hl ? ` cm-on cm-l${level(hl.length)}` : ''}${sel === 'HI' ? ' cm-sel' : ''}" cx="${hi[0]}" cy="${hi[1]}" r="5"${hl ? ' data-c="HI"' : ''}/>`;
                const order = [...D.by.entries()].sort((a, b) => b[1].length - a[1].length || this.coffeeCountryName(a[0]).localeCompare(this.coffeeCountryName(b[0])));
                const chips = order.map(([c, l]) => `<button type="button" class="cm-chip${c === sel ? ' on' : ''}" data-c="${c}">${esc(this.coffeeCountryName(c))} <b>${l.length}</b></button>`).join('');
                const conts = geo.continents.map(k => `<span class="cm-cont${D.continents.has(k) ? ' on' : ''}">${esc(k)}</span>`).join('');
                const list = sel ? `<div class="cm-list"><div class="cm-list-h">${esc(this.coffeeCountryName(sel))} · ${D.by.get(sel).length} ${D.by.get(sel).length === 1 ? wd.item : wd.items}</div>${D.by.get(sel).map(x => `<button type="button" class="cm-row" data-bean="${esc(x.bean.id)}"><span><b>${esc(x.bean.name || 'Coffee')}</b><small>${esc(x.bean.roaster || '')}</small></span>${x.best ? `<em>${this.formatRating(x.best)}★</em>` : ''}</button>`).join('')}</div>`
                    : `<p class="cm-hint">Tap a country to see ${user === this.user ? 'your' : 'their'} ${wd.items} from there.</p>`;
                const own = user === this.user;
                return `<section class="profile-card cmap" data-cmap="${esc(user)}" onclick="app.coffeeMapTap(event)"><h4 class="section-label">${own ? `Your ${wd.item} map` : `${esc(user)}'s ${wd.item} map`}</h4>`
                    + `<div class="cm-sum">${D.coffees} ${D.coffees === 1 ? wd.item : wd.items} from ${D.by.size} countr${D.by.size === 1 ? 'y' : 'ies'}${D.tea ? '' : ` · ${D.continents.size} of ${geo.continents.length} coffee continents`}</div>`
                    + `<svg class="cm-svg" viewBox="0 34 ${WORLD_MAP.w} ${WORLD_MAP.h - 70}" role="img" aria-label="Map of the countries ${own ? 'your' : 'their'} ${wd.items} came from">${paths}${dot}${belt}${selLine}</svg>${D.tea ? '' : '<div class="cm-legend"><i></i>The coffee belt, where coffee grows</div>'}`
                    + `<div class="cm-chips">${chips}</div>${D.tea ? '' : `<div class="cm-conts">${conts}</div>`}${list}</section>`;
            },
            coffeeMapTap(event) {
                const t = event && event.target && event.target.closest ? event.target : null; if (!t) return;
                const card = t.closest('[data-cmap]'); if (!card) return;
                const row = t.closest('[data-bean]');
                if (row) { this.openFeedTarget(row.getAttribute('data-bean'), '', false); return; }
                const hit = t.closest('[data-c]'); if (!hit) return;
                const user = card.getAttribute('data-cmap'), c = hit.getAttribute('data-c');
                this._mapSel = this._mapSel || {};
                this._mapSel[user] = this._mapSel[user] === c ? '' : c;
                const html = this.renderCoffeeMapCard(user);
                if (html) { const w = document.createElement('div'); w.innerHTML = html; card.replaceWith(w.firstElementChild); }
            },

            // ---- v15.1: the shared coffee list. Typing a new coffee's name or roaster suggests coffees people have logged
            // (yours and the ones you can see right away, everyone's public ones from the server); picking one fills in
            // the rest of the form
            bindCoffeeSuggest() {
                const form = this.getBeanForm(); if (!form || form._suggestBound) return;
                form._suggestBound = true;
                const row = form.elements.name.closest('div[style*="grid"]') || form.elements.name.parentElement;
                let box = form.querySelector('.cs-list');
                if (!box) { box = document.createElement('div'); box.className = 'cs-list'; box.hidden = true; row.after(box); }
                let timer = 0, seq = 0;
                const run = (q) => {
                    const my = ++seq;
                    const local = this.localCoffeeMatches(q);
                    this.paintCoffeeSuggest(box, local, q);
                    if (!(this.acctOn && this.acctOn()) || !Supa.ready() || q.length < 2) return;
                    this._catCache = this._catCache || new Map();
                    const hit = this._catCache.get(q.toLowerCase());
                    const want = this.beanFormKind ? this.beanFormKind() : 'coffee';   // v17.0: teas suggest teas, coffees coffees
                    const use = list => { if (my !== seq) return; this.paintCoffeeSuggest(box, this.mergeCoffeeMatches(local, (list || []).filter(x => (x.kind === 'tea' ? 'tea' : 'coffee') === want)), q); };
                    if (hit) { use(hit); return; }
                    Supa.rpc('coffee_catalog', { q, max_items: 8 }).then(list => { const l = Array.isArray(list) ? list : []; this._catCache.set(q.toLowerCase(), l); use(l); }).catch(() => {});
                };
                const onInput = e => {
                    if (form.elements.id.value) { box.hidden = true; return; }   // (editing a coffee: no suggestions)
                    const q = String(e.target.value || '').trim();
                    clearTimeout(timer);
                    if (q.length < 2) { box.hidden = true; return; }
                    timer = setTimeout(() => run(q), 180);
                };
                ['name', 'roaster'].forEach(k => {
                    form.elements[k].addEventListener('input', onInput);
                    form.elements[k].addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 220));
                });
                box.addEventListener('mousedown', e => e.preventDefault());   // (a tap on a suggestion doesn't blur the field first)
                box.addEventListener('click', e => {
                    const b = e.target.closest('[data-i]'); if (!b) return;
                    const x = (box._items || [])[Number(b.getAttribute('data-i'))]; if (!x) return;
                    const set = (k, v) => { if (v && form.elements[k]) form.elements[k].value = v; };
                    set('name', x.name); set('roaster', x.roaster); set('origin', x.origin); set('process', x.process); set('variety', x.variety);
                    if (x.roast && [...form.elements.roast.options].some(o => o.value === x.roast)) form.elements.roast.value = x.roast;
                    if (x.teaType && form.elements.teaType && TEA_TYPES.includes(x.teaType)) form.elements.teaType.value = x.teaType;   // v17.0
                    box.hidden = true;
                    if (this.haptic) this.haptic('light');
                });
            },
            localCoffeeMatches(q) {
                const s = q.toLowerCase(), seen = new Map(), want = this.beanFormKind ? this.beanFormKind() : 'coffee';
                this.beans.forEach(b => {
                    if (this.kindOfBean(b) !== want) return;   // v17.0
                    if (b.blend) return;   // v17.1: someone's own blend isn't a tea to pick from a list
                    const name = String(b.name || '').trim(), roaster = String(b.roaster || '').trim();
                    if (!name || !(name.toLowerCase().includes(s) || roaster.toLowerCase().includes(s))) return;
                    const k = (name + '|' + roaster).toLowerCase();
                    const cur = seen.get(k) || { name, roaster, origin: b.origin || '', process: b.process || '', variety: b.variety || '', roast: b.roast || '', teaType: b.teaType || '', who: new Set() };
                    cur.who.add(String(b.user || b.owner || ''));
                    seen.set(k, cur);
                });
                return [...seen.values()].map(x => ({ ...x, people: x.who.size })).sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)).slice(0, 6);
            },
            mergeCoffeeMatches(local, remote) {
                const out = new Map();
                [...(remote || []), ...local].forEach(x => {
                    const k = (String(x.name || '') + '|' + String(x.roaster || '')).toLowerCase();
                    const cur = out.get(k);
                    if (!cur) out.set(k, x); else out.set(k, { ...x, ...cur, people: Math.max(Number(cur.people) || 0, Number(x.people) || 0) });
                });
                return [...out.values()].sort((a, b) => (Number(b.people) || 0) - (Number(a.people) || 0) || String(a.name).localeCompare(String(b.name))).slice(0, 6);
            },
            paintCoffeeSuggest(box, items, q) {
                box._items = items;
                if (!items.length) { box.hidden = true; return; }
                const bits = x => [x.roaster, x.teaType, x.origin, x.process].map(v => String(v || '').trim()).filter(Boolean).map(v => this.esc(v)).join(' · ');
                box.innerHTML = `<div class="cs-head">${this.beanFormKind && this.beanFormKind() === 'tea' ? 'Teas' : 'Coffees'} people have logged</div>` + items.map((x, i) => `<button type="button" class="cs-row" data-i="${i}"><span><b>${this.esc(x.name)}</b><small>${bits(x)}</small></span>${Number(x.people) > 1 ? `<em>${Number(x.people)} people</em>` : ''}</button>`).join('');
                box.hidden = false;
            },

            // ---- v15.1: profile pictures. Yours is set in Settings (a square photo, made small on the phone before it goes
            // up); everyone's shows wherever their initial does, looked up by name and drawn by a style rule, so a redraw
            // of the screen never loses it
            faceStore() {
                if (!this._faces) {
                    let saved = {}; try { saved = JSON.parse(safeGet('dialed_faces') || '{}') || {}; } catch (e) { saved = {}; }
                    this._faces = new Map(Object.entries(saved));
                }
                return this._faces;
            },
            faceUrl(path) { return path ? `${Supa.base()}/storage/v1/object/public/avatars/${String(path).split('/').map(encodeURIComponent).join('/')}` : ''; },
            noteFaces(root) {
                if (!(this.acctOn && this.acctOn()) || !Supa.ready()) return;
                const scope = root && root.querySelectorAll ? root : document;
                const els = [...scope.querySelectorAll('[data-face], .feed-avatar[data-profile], .cmt-avatar[data-profile]')];
                if (root && root.matches && root.matches('[data-face], [data-profile]')) els.push(root);
                const store = this.faceStore(), now = Date.now();
                const want = this._faceWant || (this._faceWant = new Set());
                els.forEach(el => {
                    const n = String(el.getAttribute('data-face') || el.getAttribute('data-profile') || '').trim();
                    const k = n.toLowerCase(), have = store.get(k);
                    if (n && (!have || now - have[1] > 6 * 3600000)) want.add(n);
                });
                if (!want.size || this._faceTimer) return;
                this._faceTimer = setTimeout(() => this.loadFaces(), 350);
            },
            async loadFaces() {
                this._faceTimer = 0;
                const names = [...(this._faceWant || [])].slice(0, 200); if (!names.length) return;
                names.forEach(n => this._faceWant.delete(n));
                let list = [];
                try { list = await Supa.rpc('faces', { names }); } catch (e) { return; }
                const store = this.faceStore(), now = Date.now(), got = new Map((Array.isArray(list) ? list : []).map(x => [String(x.name || '').toLowerCase(), x]));
                names.forEach(n => { const x = got.get(n.toLowerCase()); store.set(n.toLowerCase(), [(x && x.avatar) || '', now, x && typeof x.crema === 'number' ? x.crema : null]); });   // v15.1: and their crema
                this.saveFaces();
                this.paintFaceRules();
            },
            saveFaces() { try { safeSet('dialed_faces', JSON.stringify(Object.fromEntries([...this.faceStore().entries()].slice(-400)))); } catch (e) { /* full */ } },
            paintFaceRules() {
                if (typeof document === 'undefined' || !Supa.on()) return;
                let st = document.getElementById('face-rules');
                if (!st) { st = document.createElement('style'); st.id = 'face-rules'; document.head.appendChild(st); }
                const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                const rules = [];
                const names = new Map();
                document.querySelectorAll('[data-face], [data-profile]').forEach(el => { const n = String(el.getAttribute('data-face') || el.getAttribute('data-profile') || '').trim(); if (n) names.set(n.toLowerCase(), n); });
                if (this.user) names.set(String(this.user).toLowerCase(), this.user);
                this.faceStore().forEach((v, k) => {
                    if (!v || !v[0]) return;
                    const n = names.get(k); if (!n) return;
                    const sel = `[data-face=${q(n)}], .feed-avatar[data-profile=${q(n)}], .cmt-avatar[data-profile=${q(n)}]`;
                    rules.push(`${sel} { background-image: url(${q(this.faceUrl(v[0]))}) !important; background-size: cover !important; background-position: center !important; color: transparent !important; }`);
                    rules.push(`${sel.split(', ').map(s => s + ' .ini').join(', ')} { opacity: 0; }`);
                });
                const css = rules.join('\n');
                if (st.textContent !== css) st.textContent = css;
                if (this.paintLevelRules) this.paintLevelRules();   // v15.1: the level marks too
            },
            myFacePath() { const v = this.faceStore().get(String(this.user || '').toLowerCase()); return v ? v[0] : ''; },
            paintAvatarSetting() {
                const row = document.getElementById('set-avatar-row'), rm = document.getElementById('set-avatar-remove');
                const on = Boolean(this.acctOn && this.acctOn() && Supa.ready());
                if (row) row.hidden = !on;
                if (!on) { if (rm) rm.hidden = true; return; }
                const face = document.getElementById('set-avatar-face'), path = this.myFacePath();
                if (face) { face.setAttribute('data-face', this.user || ''); face.style.background = this.getUserColor(this.user); face.textContent = this.feedInitial(this.user || '?'); }
                if (rm) rm.hidden = !path;
                const note = document.getElementById('set-avatar-note'); if (note) note.textContent = path ? 'Tap to change it' : 'Shows wherever your initial does';
                if (!this.faceStore().has(String(this.user || '').toLowerCase())) { (this._faceWant || (this._faceWant = new Set())).add(this.user); this.loadFaces(); }
                this.paintFaceRules();
            },
            // a picked photo: the middle square, 320 px, as a JPEG, into your folder; then the old one goes
            async pickAvatar(input) {
                const file = input && input.files && input.files[0];
                if (input) input.value = '';
                if (!file) return;
                const s = Supa.session();
                if (!s || !s.user) { this.showToast('Sign in first.'); return; }
                const note = document.getElementById('set-avatar-note'); if (note) note.textContent = 'Uploading…';
                try {
                    const img = await new Promise((ok, no) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('not a picture')); }; i.src = u; });
                    const side = Math.min(img.naturalWidth, img.naturalHeight), N = 320;
                    const c = document.createElement('canvas'); c.width = N; c.height = N;
                    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, N, N);
                    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.86));
                    if (!blob) throw new Error('no picture');
                    const rand = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('');
                    const path = `${s.user.id}/${rand}.jpg`, old = this.myFacePath();
                    await Supa.call('/storage/v1/object/avatars/' + path, blob, { headers: { 'Content-Type': 'image/jpeg' } });
                    await Supa.rpc('set_avatar', { path });
                    if (old && old !== path) Supa.call('/storage/v1/object/avatars', { prefixes: [old] }, { method: 'DELETE' }).catch(() => {});
                    this.faceStore().set(String(this.user).toLowerCase(), [path, Date.now()]); this.saveFaces();
                    this.paintAvatarSetting();
                    this.showToast('Profile picture saved.');
                } catch (e) {
                    this.paintAvatarSetting();
                    this.showToast(/not a picture|no picture/.test(String(e && e.message)) ? 'That file isn\'t a picture.' : 'Couldn\'t save the picture. Check your connection.');
                }
            },
            async removeAvatar() {
                const old = this.myFacePath(); if (!old) return;
                try {
                    await Supa.rpc('set_avatar', { path: null });
                    Supa.call('/storage/v1/object/avatars', { prefixes: [old] }, { method: 'DELETE' }).catch(() => {});
                    this.faceStore().set(String(this.user).toLowerCase(), ['', Date.now()]); this.saveFaces();
                    this.paintAvatarSetting();
                    this.showToast('Profile picture removed.');
                } catch (e) { this.showToast('Couldn\'t remove it. Check your connection.'); }
            },

            // ---- v15.1: whose awards and recap you see on your Activity tab. A circle is one of your private communities
            // (two or more people), your friends, or Everyone (last month's highlights from what people shared with
            // Everyone). Communities come first; it opens on the one picked in Community, else your friends.
            circleOptions() {
                if (!(this.acctOn && this.acctOn())) return [];
                const out = this.crewGroups().filter(g => g.members.length >= 2).map(g => ({ id: 'g:' + g.id, name: String(g.name || 'Community'), scope: g }));
                const fr = this.friendsCrew ? this.friendsCrew() : null;
                if (fr) out.push({ id: 'friends', name: 'Friends', scope: fr });
                out.push({ id: 'everyone', name: 'Everyone', scope: null });
                return out;
            },
            activeCircle() {
                const list = this.circleOptions();
                if (!list.length) return null;
                const want = this._circle || safeGet('dialed_circle') || '';
                const g = this.activeCrewGroup();
                return list.find(o => o.id === want) || (g && list.find(o => o.id === 'g:' + g.id)) || list.find(o => o.id === 'friends') || list[0];
            },
            setCircle(id) { this._circle = String(id || ''); safeSet('dialed_circle', this._circle); this.render(); },
            circlePickerHtml() {
                const list = this.circleOptions();
                if (list.length < 2) return '';
                const c = this.activeCircle();
                return `<div class="circle-pick"><div class="cp-lead">Awards and recaps with</div><div class="comm-filters" role="tablist" aria-label="Awards and recaps with">${list.map(o => `<button type="button" class="comm-chip${o.id === c.id ? ' on' : ''}" role="tab" aria-selected="${o.id === c.id}" data-c="${this.esc(o.id)}" onclick="app.setCircle(this.getAttribute('data-c'))">${this.esc(o.name)}</button>`).join('')}</div></div>`;
            },

            // the awards card folds to who won (it was the biggest thing on the tab); it remembers open or folded
            awardsOpen() { if (this._awOpen == null) this._awOpen = safeGet('dialed_awards_open') === '1'; return !!this._awOpen; },
            toggleAwards() { this._awOpen = !this.awardsOpen(); safeSet('dialed_awards_open', this._awOpen ? '1' : '0'); this.render(); },

            // Everyone: last month's highlights (the same ones Discover shows the first week), folded like the awards
            renderEveryoneAwardsCard() {
                const st = this.hlState();
                if (!st.loading && !st.at) setTimeout(() => this.loadHighlights(), 0);
                const open = this.awardsOpen(), items = st.items || [];
                if (this._awInRow) return !st.at ? this.loadingBlockHtml('panel-empty') : items.length ? `<div class="profile-card crew-awards ev-awards" id="crew-awards"><div class="hl-card ev-rows">${this.hlRowsHtml()}</div></div>` : '<div class="panel-empty">No highlights for last month yet.</div>';   // inside More's row
                const tog = items.length ? `<button type="button" class="aw-toggle${open ? ' open' : ''}" aria-expanded="${open}" aria-label="${open ? 'Show less' : 'Show the highlights'}" onclick="app.toggleAwards()"><svg class="icon"><use href="#i-chevron-down"/></svg></button>` : '';
                const sub = !st.at ? 'Loading…' : items.length ? `${items.length} ${items.length === 1 ? 'person' : 'people'} spotlighted` : 'None yet for last month';
                const head = `<div class="aw-head"><div class="aw-head-t"${items.length ? ' onclick="app.toggleAwards()"' : ''}><div class="label">${this.esc(this.hlMonthLabel())} highlights</div><div class="aw-sub">Everyone · ${this.esc(sub)}</div></div>${tog}</div>`;
                return `<div class="profile-card crew-awards ev-awards${open && items.length ? '' : ' folded'}" id="crew-awards">${head}${open && items.length ? `<div class="hl-card ev-rows">${this.hlRowsHtml()}</div>` : ''}</div>`;
            },

            // ---- v15.1: the Coffees tab holds yours (Mine) and everyone's you can see (All); it remembers which
            coffeeScopeNow() { if (!this.coffeeScope) this.coffeeScope = safeGet('dialed_coffee_scope') === 'all' ? 'all' : 'mine'; return this.coffeeScope; },
            setCoffeeScope(v) { this.coffeeScope = v === 'all' ? 'all' : 'mine'; safeSet('dialed_coffee_scope', this.coffeeScope); this.render(); window.scrollTo(0, 0); },
            coffeeScopeHtml() {
                const m = this.coffeeScopeNow();
                return `<div class="seg-control lib-switch" role="tablist" aria-label="Whose ${this.drinkWords(this.drinkNow()).items}">${[['mine', 'Mine'], ['all', 'All']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === m}" aria-pressed="${k === m}" onclick="app.setCoffeeScope('${app.escJs(k)}')">${l}</button>`).join('')}</div>`;
            },

            // ---- v15.1: "shot" is espresso's word; every other method gets "brew" (a pour over isn't a shot)
            shotWord(method) { return this.isTeaMethod && this.isTeaMethod(method) ? 'cup' : !method || /espresso/i.test(String(method)) ? 'shot' : 'brew'; },   // (v17.0: a tea is a cup)
            methodWorded(o, method) {
                if (!o || this.shotWord(method) === 'shot') return o;
                const w = this.shotWord(method), W = w.charAt(0).toUpperCase() + w.slice(1);
                const t = v => typeof v === 'string' ? v.replace(/\b([Ss])hot(s?)\b/g, (m, s, pl) => (s === 'S' ? W : w) + pl) : Array.isArray(v) ? v.map(t) : (v && typeof v === 'object' && typeof v.text === 'string' ? { ...v, text: t(v.text) } : v);
                const out = { ...o };
                ['head', 'headline', 'detail', 'note', 'conf', 'why', 'ctx', 'evidence', 'ev'].forEach(k => { if (k in out) out[k] = t(out[k]); });
                return out;
            },

            // ---- v15.1: the recap's second card: the circle picked above the awards (a community, your friends). None for
            // Everyone, or on someone else's recap (it would be your circle's numbers).
            recapCircle(user, period) {
                const acct = this.acctOn && this.acctOn();
                if (acct && user !== this.user) return null;
                const circle = acct && this.activeCircle ? this.activeCircle() : null;
                if (circle && circle.id === 'everyone') return null;
                const c = circle ? this.withCrewScope(circle.scope, () => this.monthCrewStats(period)) : this.monthCrewStats(period);
                if (!c || c.people.length < 2) return null;
                return { c, circle, name: circle ? circle.name : 'Together', friends: !!circle && circle.id === 'friends' };
            },

            // ---- v15.1: whose take on a coffee, on its page: You, each of your communities, Friends, Everyone. Everyone is
            // all of it: yours, your friends' and communities', and what anyone else on Dialed In shared with Everyone. The
            // rating, flavor shape, notes, sessions, dial-in and sweet spot all follow it. Opens on You when you've brewed
            // it, else the first circle with sessions on it. A circle shows only when someone besides you in it has logged
            // this coffee; All (everything in your circle's sync) only when some of those sessions belong to none of them.
            lensOptions(all) {
                if (!(this.acctOn && this.acctOn())) return [];
                const owner = b => this.getBrewOwner(b), out = [], covered = new Set([this.user]);
                const mine = all.filter(b => owner(b) === this.user).length;
                if (mine) out.push({ id: 'me', name: 'You', n: mine, names: new Set([this.user]) });
                this.circleOptions().forEach(o => {
                    if (o.id === 'everyone') return;
                    const names = new Set(o.scope.members.map(m => m.name));
                    names.forEach(x => covered.add(x));
                    const n = all.filter(b => names.has(owner(b))).length, others = all.filter(b => names.has(owner(b)) && owner(b) !== this.user).length;
                    if (others) out.push({ id: o.id, name: o.name, n, names });
                });
                const circleSync = all.filter(b => !this.isCommunity('brew', b.id));   // strangers' public sessions are Everyone's
                if (circleSync.some(b => !covered.has(owner(b)))) out.push({ id: 'all', name: 'All', n: circleSync.length, names: new Set(circleSync.map(owner)) });
                const st = this.coffeeCommState ? this.coffeeCommState() : null, loaded = st && st.at && !st.loading;
                out.push({ id: 'everyone', name: 'Everyone', n: loaded ? this.everyoneBrews(all).length : 0 });
                return out;
            },
            // everything on this coffee: what's here already plus what people shared with Everyone (loaded with the page's
            // Everyone; matched by roaster and name however it's written)
            everyoneBrews(all) {
                const st = this.coffeeCommState ? this.coffeeCommState() : null, seen = new Set(all.map(b => String(b.id)));
                const extra = st ? st.events.filter(e => e && e.type === 'brew' && !this.reported(e.id) && !seen.has(String(e.id)) && seen.add(String(e.id))).map(e => this.brews.get(String(e.id)) || e) : [];
                return [...all.filter(b => !this.reported(b.id) && b.audience !== 'only_me' || this.getBrewOwner(b) === this.user), ...extra];
            },
            activeLens(all = this.detailAllBrews || []) {
                const list = this.lensOptions(all);
                if (!list.length) return null;
                if (this._lensWant) {   // opened at someone's session: a view with it in
                    const w = this._lensWant; this._lensWant = '';
                    const cur = list.find(o => o.id === this._lens) || list[0];
                    if (!(cur.names && cur.names.has(w)) && cur.id !== 'everyone') { const hit = list.find(o => o.names && o.names.has(w)); this._lens = hit ? hit.id : 'everyone'; }
                }
                return list.find(o => o.id === this._lens) || list[0];
            },
            lensBrews(all) {
                if (this.detailTab === 'everyone') this.detailTab = 'timeline';   // (the old Everyone tab)
                const L = this.activeLens(all);
                if (!L) return all;
                if (L.id === 'everyone') {
                    setTimeout(() => { const st = this.coffeeCommState ? this.coffeeCommState() : null; if (st && st.key && !st.loading && !(st.failedAt && Date.now() - st.failedAt < 30000) && (!st.at || Date.now() - st.at > 5 * 60000)) this.loadCoffeeCommunity(false); }, 0);   // (after a failed try: not again for 30 s)
                    return this.everyoneBrews(all);
                }
                return all.filter(b => L.names.has(this.getBrewOwner(b)));
            },
            lensLabel() { const L = this.activeLens(); return L ? L.name : 'All'; },
            setLens(id) {
                const v = document.getElementById('detail-view'), top = v ? v.scrollTop : 0;
                this._lens = String(id || '');
                this._navKeep = true;
                try { this.openDetail(this.activeGroup, this.detailAllBrews || []); } finally { this._navKeep = false; }
                if (v) v.scrollTop = top;
            },
            paintLens() {
                const box = document.getElementById('d-lens');
                if (!box) return;
                const list = this.lensOptions(this.detailAllBrews || []), L = list.length ? this.activeLens() : null;
                if (list.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
                box.hidden = false;
                const chips = `<div class="cp-lead">Sessions from</div><div class="comm-filters" role="tablist" aria-label="Sessions from">${list.map(o => `<button type="button" class="comm-chip${o.id === L.id ? ' on' : ''}" role="tab" aria-selected="${o.id === L.id}" data-l="${this.esc(o.id)}" onclick="app.setLens(this.getAttribute('data-l'))">${this.esc(o.name)}${o.n ? `<span class="lens-n">${o.n}</span>` : ''}</button>`).join('')}</div>`;
                box.innerHTML = chips + (L.id === 'everyone' ? this.everyoneSumHtml() : '');
            },
            // Everyone: how many people, and how it's usually brewed (the middle ratio, time and dose per method; never grind)
            everyoneSumHtml() {
                const st = this.coffeeCommState ? this.coffeeCommState() : null;
                if (st && st.loading && !st.at) return `<div class="lens-sum">${this.loaderHtml('Loading everyone’s sessions…')}</div>`;
                const pool = this.detailBrews || [];
                if (!pool.length) return `<div class="lens-sum"><p class="lens-line">${this.esc(st && st.error ? st.error : 'Nobody has shared a session on this coffee yet.')}</p></div>`;
                const people = new Set(pool.map(b => this.getBrewOwner(b))).size;
                const med = a => { const v = a.filter(x => x > 0).sort((p, q) => p - q); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; };
                const by = new Map();
                pool.forEach(b => { const m = String(b.method || '').trim(); if (!m) return; if (!by.has(m)) by.set(m, []); by.get(m).push(b); });
                const methods = [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([method, list]) => ({ method, n: list.length, ratio: med(list.map(b => this.ratioOf(b))), time: med(list.map(b => this.num(b.time))), dose: med(list.map(b => this.num(b.dose))) }));
                const more = st && st.next ? `<button type="button" class="btn-outline cc-more" onclick="app.loadCoffeeCommunity(true)"${st.loading ? ' disabled' : ''}>${st.loading ? 'Loading…' : 'Load more from everyone'}</button>` : '';
                return `<div class="lens-sum"><p class="lens-line">${people} ${people === 1 ? 'person' : 'people'} · ${pool.length} session${pool.length === 1 ? '' : 's'}</p>${this.coffeeCommMethodsHtml(methods)}${more}</div>`;
            },
            // Everyone's public sessions came in: draw the page again with them
            lensEveryoneLoaded() {
                const L = this.isDetailActive() ? this.activeLens() : null;
                if (L && L.id === 'everyone') this.setLens('everyone');
                else if (this.isDetailActive()) this.paintLens();
            },

            // ---- v15.1: lists that grow with the app (friends' palates, a roaster's coffees and drinkers, master recipes, a
            // coffee's sessions, long comment threads) show their first few and "Show all N"; they start short again each
            // time they're drawn. Never hides just one.
            moreHtml(rows, limit = 3, noun = '') {
                if (rows.length <= limit + 1) return rows.join('');
                return `${rows.slice(0, limit).join('')}<div class="more-rest" hidden>${rows.slice(limit).join('')}</div><button type="button" class="more-toggle" aria-expanded="false" data-n="${rows.length}" data-noun="${this.esc(noun)}" onclick="app.toggleMoreRest(this, event)"><span>Show all ${rows.length}${noun ? ` ${this.esc(noun)}` : ''}</span><svg class="icon"><use href="#i-chevron-down"/></svg></button>`;
            },
            toggleMoreRest(btn, ev) {
                if (ev) { ev.stopPropagation(); ev.preventDefault(); }
                const rest = btn && btn.previousElementSibling;
                if (!rest || !rest.classList.contains('more-rest')) return;
                const open = rest.hidden;
                rest.hidden = !open;
                btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('open', open);
                const t = btn.querySelector('span'); if (t) t.textContent = open ? 'Show less' : `Show all ${btn.dataset.n}${btn.dataset.noun ? ` ${btn.dataset.noun}` : ''}`;
                if (!open && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest' });
            },
            // the same for a list drawn element by element
            moreDom(box, limit, noun = '') {
                if (!box || box.children.length <= limit + 1) return;
                const rest = document.createElement('div'); rest.className = 'more-rest'; rest.hidden = true;
                const n = box.children.length;
                [...box.children].slice(limit).forEach(el => rest.appendChild(el));
                box.appendChild(rest);
                box.insertAdjacentHTML('beforeend', `<button type="button" class="more-toggle" aria-expanded="false" data-n="${n}" data-noun="${this.esc(noun)}" onclick="app.toggleMoreRest(this, event)"><span>Show all ${n}${noun ? ` ${this.esc(noun)}` : ''}</span><svg class="icon"><use href="#i-chevron-down"/></svg></button>`);
            },
            // a coffee's session history: the latest five (and the session you came to see, however old); it stays open for
            // that coffee once you open it (until the app restarts)
            cutLogs(box) {
                if (!box) return;
                const key = this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) + '|' + (this._lens || '') : '';
                this._logsOpen = this._logsOpen || new Set();
                const target = this._logTarget || this.openCommentId || ''; this._logTarget = '';
                const rows = [...box.children].filter(el => el.classList && el.classList.contains('log-row'));
                const ti = target ? rows.findIndex(el => el.getAttribute('data-card-brew') === target) : -1;
                if (ti >= 5) this._logsOpen.add(key);
                const open = this._logsOpen.has(key), LIMIT = 5, cut = rows.length > LIMIT + 1 && !open;
                rows.forEach((el, i) => el.classList.toggle('more-cut', cut && i >= LIMIT));
                let btn = document.getElementById('d-logs-more');
                if (rows.length <= LIMIT + 1) { if (btn) btn.remove(); return; }
                if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.id = 'd-logs-more'; btn.className = 'more-toggle logs-more'; box.parentNode.insertBefore(btn, box.nextSibling); }
                btn.setAttribute('aria-expanded', String(!cut)); btn.classList.toggle('open', !cut);
                btn.innerHTML = `<span>${cut ? `Show all ${rows.length} sessions` : 'Show fewer'}</span><svg class="icon"><use href="#i-chevron-down"/></svg>`;
                btn.onclick = ev => { ev.stopPropagation(); if (this._logsOpen.has(key)) this._logsOpen.delete(key); else this._logsOpen.add(key); this.cutLogs(box); if (this._logsOpen.has(key) === false) btn.scrollIntoView({ block: 'nearest' }); };
            },

            // ---- v15.1: the profile's More (was Activity), laid out like Strava's: a list of rows, each with what's in it.
            // Achievements opens the locker; Monthly awards and Recaps open in place (they start closed; a fresh recap or an
            // awards notification opens its row).
            moreHubHtml(who) {
                const own = who === this.user, esc = v => this.esc(v);
                const chev = '<svg class="icon more-chev"><use href="#i-chevron-down"/></svg>';
                const row = (key, icon, title, sub, onclick, open, expands) => `<button type="button" class="more-row${expands ? ' expands' : ''}${open ? ' open' : ''}" data-row="${key}" aria-expanded="${expands ? String(!!open) : 'false'}" onclick="${onclick}"><span class="more-ic"><svg class="icon"><use href="#${icon}"/></svg></span><span class="more-t"><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${chev}</button>`;
                const parts = [];
                // achievements: the locker
                const levels = this.achievementLevelsByUser[who] || {}, catalog = this.achievementCatalogFor(who);
                const earned = catalog.reduce((s, d) => s + Number(levels[d.key] || 0), 0), total = catalog.reduce((s, d) => s + d.thresholds.length, 0);
                parts.push(row('ach', 'i-medal', 'Achievements', `${earned} of ${total} levels`, `app.openAchievementLocker('${app.escJs(who)}')`, false, false));
                // monthly awards (yours: the circle picked above)
                if (own) {
                    const open = this.awardsOpen();
                    parts.push(row('awards', 'i-trophy', 'Monthly awards', esc(this.awardsLine()), 'app.toggleAwards()', open, true));
                    if (open) { this._awInRow = true; try { parts.push(`<div class="more-panel">${this.renderCrewAwardsCard() || '<div class="panel-empty">No awards yet. They need a community or friends who brew.</div>'}</div>`); } finally { this._awInRow = false; } }
                }
                // recaps
                const periods = this.recapPeriods(who);
                if (periods.length) {
                    const fresh = own ? this.freshRecap(who) : null;
                    const unlocked = periods.filter(p => !this.periodLocked(p));
                    const p = this.recapPeriod && periods.includes(this.recapPeriod) ? this.recapPeriod : (unlocked.find(x => x.startsWith('m:')) || periods[0]);
                    const sub = `${fresh ? '<span class="recap-new">New</span> ' : ''}${esc(this.periodLabel(fresh || p))}${!fresh && this.periodLocked(p) ? ' · opens when it ends' : ''}`;
                    const open = !!this._recapOpen;
                    parts.push(row('recap', 'i-trend', 'Recaps', sub, 'app.toggleRecapRow()', open, true));
                    if (open) parts.push(`<div class="more-panel">${this.renderRecapCard(who)}</div>`);
                }
                return `<section class="profile-card more-hub">${parts.join('')}</section>`;
            },
            toggleRecapRow() { this._recapOpen = !this._recapOpen; this.render(); },
            // v15.1: tapping the tab you're already on goes back to its top, like Instagram: a coffee or roaster page open over it
            // closes first (on a Mac the sidebar stays reachable), and Profile comes back to yours
            tabTap(tab) {
                if (tab !== this.tab) { this.setTab(tab); return; }
                if (this.roasterViewActive && this.roasterViewActive()) { this.navStack = []; this.hideRoasterView(); }
                if (this.isDetailActive && this.isDetailActive()) { this.navStack = []; this.closeDetail(); }
                if (tab === 'profile' && this.profileUser && this.profileUser !== this.user) this.setProfileUser(this.user);
                if (this.setBarsTucked) this.setBarsTucked(false);
                let calm = false; try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* older browsers */ }
                const sc = document.getElementById('main-content'), to = { top: 0, behavior: calm ? 'auto' : 'smooth' };   // (the page scrolls inside main-content)
                try { if (sc) sc.scrollTo(to); window.scrollTo(to); } catch (e) { if (sc) sc.scrollTop = 0; window.scrollTo(0, 0); }
            },
            // the awards row's line: whose, which month, and where it stands
            awardsLine() {
                const c = this.activeCircle ? this.activeCircle() : null;
                if (c && c.id === 'everyone') return `Everyone · ${this.hlMonthLabel()} highlights`;
                const scope = c ? c.scope : null;
                const run = () => {
                    const months = this.awardMonths();
                    if (!months.length || !this.brews.size) return 'None yet';
                    const key = months.includes(this.awardsMonth) ? this.awardsMonth : (months.find(k => !this.monthLocked(k)) || months[0]);
                    const name = this.monthName(key, false), [y, m] = key.split('-').map(Number);
                    if (this.monthLocked(key)) return `${name} in progress`;
                    const awards = this.crewAwardsMemo(y, m - 1);
                    if (!awards.length) return `${name}: not enough sessions`;
                    if (this.awardsNeedReveal(key, awards)) return `${name}: ready to reveal`;
                    const st = this.awardStandings(awards), top = st.length ? st[0][1] : 0, champs = st.filter(r => r[1] === top).map(r => r[0]);
                    return champs.length ? `${name}: ${champs.join(' & ')} ${champs.length === 1 ? 'took it' : 'shared it'}` : name;
                };
                const line = scope ? this.withCrewScope(scope, run) : run();
                return c ? `${c.name} · ${line}` : line;
            },
