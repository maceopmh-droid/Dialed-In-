            // ---- v15.1: the loading animation, the Dialed In logo turning, wherever something has to load (the words stay
            // for screen readers)
            loaderHtml(label = '') {
                return `<span class="di-loader" role="status"><i class="dl-logo" aria-hidden="true"></i><span class="dl-label">${this.esc(label || 'Loading…')}</span></span>`;
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
                    YEM: 'yemen|yemeni|mocha|mokha', IND: 'india|indian|malabar|karnataka|chikmagalur', NPL: 'nepal',
                    IDN: 'indonesia|indonesian|sumatra|sumatran|java|sulawesi|toraja|bali|flores|aceh|gayo|mandheling|lintong',
                    VNM: 'vietnam|viet nam', LAO: 'laos', THA: 'thailand', MMR: 'myanmar|burma', CHN: 'china|yunnan', PHL: 'philippines',
                    TLS: 'timor|east timor|timor-leste', TWN: 'taiwan', LKA: 'sri lanka', SAU: 'saudi arabia',
                    PNG: 'papua new guinea|png', AUS: 'australia', HI: 'hawaii|hawaiian|kona|maui|kauai',
                    BRA: 'brazil|brazilian|brasil|cerrado|mogiana|sul de minas', COL: 'colombia|colombian|huila|narino|cauca|tolima|antioquia|quindio',
                    PER: 'peru|peruvian|cajamarca', ECU: 'ecuador|loja', BOL: 'bolivia|caranavi', VEN: 'venezuela',
                    GTM: 'guatemala|huehuetenango|atitlan|antigua', HND: 'honduras|marcala', SLV: 'el salvador',
                    NIC: 'nicaragua|jinotega|nueva segovia', CRI: 'costa rica|tarrazu|west valley', PAN: 'panama|boquete|chiriqui',
                    MEX: 'mexico|chiapas|oaxaca|veracruz', JAM: 'jamaica|blue mountain', DOM: 'dominican republic', HTI: 'haiti', CUB: 'cuba', PRI: 'puerto rico'
                };
                const C = { Africa: 'ETH KEN RWA BDI UGA TZA COD MWI ZMB ZWE CMR CIV MDG SLE SDS', Asia: 'YEM IND NPL IDN VNM LAO THA MMR CHN PHL TLS TWN LKA SAU',
                    Oceania: 'PNG AUS HI', 'South America': 'BRA COL PER ECU BOL VEN', 'North & Central America': 'GTM HND SLV NIC CRI PAN MEX JAM DOM HTI CUB PRI' };
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
            coffeeMapData(user) {
                const byBean = new Map();
                this.brews.forEach(b => {
                    if (this.getBrewOwner(b) !== user) return;
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
                return { by, continents, coffees: [...by.values()].reduce((s, l) => s + l.length, 0) };
            },
            renderCoffeeMapCard(user) {
                if (typeof WORLD_MAP === 'undefined' || !user) return '';
                const D = this.coffeeMapData(user), esc = s => this.esc(s);
                if (!D.by.size) return '';
                const sel = (this._mapSel || {})[user] && D.by.has(this._mapSel[user]) ? this._mapSel[user] : '';
                const geo = this.coffeeGeo(), belt = new Set(Object.keys(geo.continent));
                const level = n => n >= 4 ? 3 : n >= 2 ? 2 : 1;
                const paths = Object.entries(WORLD_MAP.c).map(([c, d]) => {
                    const list = D.by.get(c);
                    const cls = `cm-land${belt.has(c) ? ' cm-belt' : ''}${list ? ` cm-on cm-l${level(list.length)}` : ''}`;
                    return `<path class="${cls}" d="${d}"${list ? ` data-c="${c}"` : ''}/>`;
                }).join('');
                // the picked country's outline goes on top of everything (drawn with its neighbors, they covered parts of it)
                const selLine = sel && WORLD_MAP.c[sel] ? `<path class="cm-selo" d="${WORLD_MAP.c[sel]}"/>` : '';
                const hi = WORLD_MAP.dots.HI, hl = D.by.get('HI');
                const dot = `<circle class="cm-dot${hl ? ` cm-on cm-l${level(hl.length)}` : ''}${sel === 'HI' ? ' cm-sel' : ''}" cx="${hi[0]}" cy="${hi[1]}" r="5"${hl ? ' data-c="HI"' : ''}/>`;
                const order = [...D.by.entries()].sort((a, b) => b[1].length - a[1].length || this.coffeeCountryName(a[0]).localeCompare(this.coffeeCountryName(b[0])));
                const chips = order.map(([c, l]) => `<button type="button" class="cm-chip${c === sel ? ' on' : ''}" data-c="${c}">${esc(this.coffeeCountryName(c))} <b>${l.length}</b></button>`).join('');
                const conts = geo.continents.map(k => `<span class="cm-cont${D.continents.has(k) ? ' on' : ''}">${esc(k)}</span>`).join('');
                const list = sel ? `<div class="cm-list"><div class="cm-list-h">${esc(this.coffeeCountryName(sel))} · ${D.by.get(sel).length} coffee${D.by.get(sel).length === 1 ? '' : 's'}</div>${D.by.get(sel).map(x => `<button type="button" class="cm-row" data-bean="${esc(x.bean.id)}"><span><b>${esc(x.bean.name || 'Coffee')}</b><small>${esc(x.bean.roaster || '')}</small></span>${x.best ? `<em>${this.formatRating(x.best)}★</em>` : ''}</button>`).join('')}</div>`
                    : `<p class="cm-hint">Tap a country to see ${user === this.user ? 'your' : 'their'} coffees from there.</p>`;
                const own = user === this.user;
                return `<section class="profile-card cmap" data-cmap="${esc(user)}" onclick="app.coffeeMapTap(event)"><h4 class="section-label">${own ? 'Your coffee map' : `${esc(user)}'s coffee map`}</h4>`
                    + `<div class="cm-sum">${D.coffees} coffee${D.coffees === 1 ? '' : 's'} from ${D.by.size} countr${D.by.size === 1 ? 'y' : 'ies'} · ${D.continents.size} of ${geo.continents.length} coffee continents</div>`
                    + `<svg class="cm-svg" viewBox="0 34 ${WORLD_MAP.w} ${WORLD_MAP.h - 70}" role="img" aria-label="Map of the countries ${own ? 'your' : 'their'} coffees came from">${paths}${dot}${selLine}</svg>`
                    + `<div class="cm-chips">${chips}</div><div class="cm-conts">${conts}</div>${list}</section>`;
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
                    const use = list => { if (my !== seq) return; this.paintCoffeeSuggest(box, this.mergeCoffeeMatches(local, list), q); };
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
                    box.hidden = true;
                    if (this.haptic) this.haptic('light');
                });
            },
            localCoffeeMatches(q) {
                const s = q.toLowerCase(), seen = new Map();
                this.beans.forEach(b => {
                    const name = String(b.name || '').trim(), roaster = String(b.roaster || '').trim();
                    if (!name || !(name.toLowerCase().includes(s) || roaster.toLowerCase().includes(s))) return;
                    const k = (name + '|' + roaster).toLowerCase();
                    const cur = seen.get(k) || { name, roaster, origin: b.origin || '', process: b.process || '', variety: b.variety || '', roast: b.roast || '', who: new Set() };
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
                const bits = x => [x.roaster, x.origin, x.process].map(v => String(v || '').trim()).filter(Boolean).map(v => this.esc(v)).join(' · ');
                box.innerHTML = `<div class="cs-head">Coffees people have logged</div>` + items.map((x, i) => `<button type="button" class="cs-row" data-i="${i}"><span><b>${this.esc(x.name)}</b><small>${bits(x)}</small></span>${Number(x.people) > 1 ? `<em>${Number(x.people)} people</em>` : ''}</button>`).join('');
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
                const store = this.faceStore(), now = Date.now(), got = new Map((Array.isArray(list) ? list : []).map(x => [String(x.name || '').toLowerCase(), x.avatar || '']));
                names.forEach(n => store.set(n.toLowerCase(), [got.get(n.toLowerCase()) || '', now]));
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

