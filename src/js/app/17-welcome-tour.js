            // ===================== v14.0: welcome + new-person setup =====================
            wlGearKinds() {
                return [
                    { key: 'machine', label: 'Espresso machine', type: 'Machine', icon: 'i-method-espresso', ask: 'Which machine?', eg: 'Gaggia Classic Pro' },
                    { key: 'grinder', label: 'Grinder', type: 'Grinder', icon: 'i-wl-grinder', ask: 'Which grinder?', eg: 'Niche Zero' },
                    { key: 'pourover', label: 'Pour-over', type: 'Brewer', icon: 'i-method-pour-over', ask: 'Which dripper?', eg: 'Hario V60' },
                    { key: 'aeropress', label: 'AeroPress', type: 'Brewer', icon: 'i-method-aeropress', ask: 'Which AeroPress?', eg: 'AeroPress Original' },
                    { key: 'french', label: 'French press', type: 'Brewer', icon: 'i-method-french-press', ask: 'Which press?', eg: 'Bodum Chambord' },
                    { key: 'moka', label: 'Moka pot', type: 'Brewer', icon: 'i-method-moka-pot', ask: 'Which moka pot?', eg: 'Bialetti Moka Express' },
                    { key: 'kettle', label: 'Kettle', type: 'Kettle', icon: 'i-wl-kettle', ask: 'Which kettle?', eg: 'Fellow Stagg EKG' },
                    { key: 'scale', label: 'Scale', type: 'Scale', icon: 'i-wl-scale', ask: 'Which scale?', eg: 'Timemore Black Mirror' }
                ];
            },

            wlPalette() { return ['#586A58', '#4F7699', '#9C6A4F', '#7A5D8F', '#4D8B75', '#A15B71', '#6E7D4E', '#8A6B46', '#B5713A', '#3F7E8C']; },

            openWelcome(step = 'intro') {
                const view = document.getElementById('welcome-view');
                if (!view) return;
                this.wl = { step, name: '', color: '', gear: [], gearOpen: '', pick: '', bean: { roaster: '', name: '', origin: '', roast: 'Light', process: '' } };
                this.welcomeOpen = true;
                view.classList.add('active'); view.setAttribute('aria-hidden', 'false');
                document.body.classList.add('wl-open');
                this.renderWelcome();
            },

            closeWelcome() {
                const view = document.getElementById('welcome-view');
                this.welcomeOpen = false;
                if (this.wlHeroView && this.wlHeroView.stop) this.wlHeroView.stop();
                if (view) { view.classList.remove('active'); view.setAttribute('aria-hidden', 'true'); }
                document.body.classList.remove('wl-open');
            },

            // the group, for the welcome: people (most active first), sessions, and the best cup to show off
            wlGroup() {
                const people = this.knownPeople().filter(n => this.validPersonName(n));
                const count = n => { let c = 0, last = 0; this.brews.forEach(b => { if (this.getBrewOwner(b) === n) { c++; last = Math.max(last, this.toTime(b.date) || 0); } }); return { c, last }; };
                const rows = people.map(n => ({ name: n, ...count(n) })).sort((a, b) => b.c - a.c || b.last - a.last || a.name.localeCompare(b.name));
                const rated = [...this.brews.values()].filter(b => this.normalizeRating(b.rating) >= 4 && this.tastedKeys && this.tastedKeys(b).length >= 3);
                rated.sort((a, b) => this.normalizeRating(b.rating) - this.normalizeRating(a.rating) || this.toTime(b.date) - this.toTime(a.date));
                const best = rated[0] || null;
                return { rows, sessions: this.brews.size, coffees: this.beans.size, best };
            },

            wlFaces(rows, max = 5) {
                return `<span class="wl-faces">${rows.slice(0, max).map(r => `<i data-face="${this.esc(r.name)}" style="background:${this.esc(this.getUserColor(r.name))}">${this.esc(this.feedInitial(r.name))}</i>`).join('')}</span>`;
            },

            wlNames(rows) {
                const n = rows.map(r => r.name);
                if (!n.length) return '';
                if (n.length === 1) return n[0];
                if (n.length <= 4) return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
                return `${n.slice(0, 3).join(', ')} and ${n.length - 3} others`;
            },

            wlTop(n, back) {
                return `<div class="wl-top"><button type="button" class="wl-back" data-go="${back}" onclick="app.wlGo(this.getAttribute('data-go'))"><svg class="icon"><use href="#i-arrow-left"/></svg>Back</button>
                    <div class="wl-prog" aria-label="Step ${n} of 3">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div><span class="wl-count">${n} of 3</span></div>`;
            },

            renderWelcome() {
                const wrap = document.getElementById('wl-wrap');
                if (!wrap || !this.wl) return;
                const s = this.wl, esc = v => this.esc(v), G = this.wlGroup();
                let html = '';
                if (s.step === 'intro') {
                    const best = G.best, bean = best ? this.beans.get(String(best.beanId)) : null;
                    html = `<div class="wl-step wl-intro">
                        <div class="wl-mark">Dialed In</div>
                        <div class="wl-hero"><div class="wl-glow"></div><div class="wl-shape" id="wl-shape"></div></div>
                        <h1 class="wl-h1">Dial in every cup.</h1>
                        <p class="wl-lead">Log your brews, see what your friends are pulling, and get a coach that tells you exactly what to change next.</p>
                        ${G.rows.length && !(this.acctOn() && !G.sessions) ? `<div class="wl-proof">${this.wlFaces(G.rows)}<span>${esc(this.wlNames(G.rows))} · ${esc(G.sessions.toLocaleString())} sessions logged</span></div>` : ''}
                        <div class="wl-actions">
                            <button type="button" class="btn-primary wl-main" onclick="${this.acctOn() ? "app.wlStart('new')" : "app.wlGo('name')"}">I'm new to Dialed In</button>
                            <button type="button" class="btn-outline wl-second" onclick="${this.acctOn() ? "app.wlStart('back')" : "app.wlGo('returning')"}">I've been here before</button>
                        </div>
                    </div>`;
                } else if (s.step === 'returning') {
                    const rows = G.rows;
                    html = `<div class="wl-step">
                        <div class="wl-top"><button type="button" class="wl-back" onclick="app.wlGo('intro')"><svg class="icon"><use href="#i-arrow-left"/></svg>Back</button></div>
                        <h2 class="wl-h2">Welcome back.</h2>
                        <p class="wl-sub">Who's brewing?</p>
                        <div class="wl-people">${rows.length ? rows.map(r => `<button type="button" class="wl-person" data-person="${esc(r.name)}" onclick="app.wlPick(this.getAttribute('data-person'))">
                            <i data-face="${esc(r.name)}" style="background:${esc(this.getUserColor(r.name))}">${esc(this.feedInitial(r.name))}</i>
                            <span class="wl-pn"><b>${esc(r.name)}</b><small>${r.c ? `${r.c} session${r.c === 1 ? '' : 's'} · last brewed ${esc(this.formatRelativeDate(new Date(r.last).toISOString()).toLowerCase())}` : 'No sessions yet'}</small></span>
                            <svg class="icon wl-chev"><use href="#i-chevron-down"/></svg></button>`).join('') : '<div class="wl-empty">Loading…</div>'}</div>
                        <button type="button" class="wl-link" onclick="app.wlGo('name')">Not on the list? Set up a new profile</button>
                    </div>`;
                } else if (s.step === 'name') {
                    const pal = this.wlPalette(), color = s.color || this.wlFreeColor();
                    s.color = color;
                    const custom = !pal.some(c => c.toLowerCase() === color.toLowerCase());
                    html = `<div class="wl-step">
                        ${this.wlTop(1, 'intro')}
                        <h2 class="wl-h2">What should we call you?</h2>
                        <p class="wl-sub">This is how your friends will see you in the feed.</p>
                        <input class="wl-input" id="wl-name" maxlength="24" placeholder="Your first name" value="${esc(s.name)}" autocomplete="given-name" autocapitalize="words" spellcheck="false" oninput="app.wlName(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();app.wlGo('gear')}">
                        <div class="wl-taken" id="wl-taken" hidden></div>
                        <div class="wl-label">Your color</div>
                        <div class="wl-swatches">${pal.map(c => `<button type="button" class="wl-sw" style="--c:${c}" aria-label="Color ${c}" aria-pressed="${c === color}" data-c="${c}" onclick="app.wlColor(this.getAttribute('data-c'))"></button>`).join('')}<label class="wl-sw wl-any${custom ? ' on' : ''}" style="--c:${esc(color)}" title="Any color"><input type="color" id="wl-any" aria-label="Pick any color" value="${esc(color)}" oninput="app.wlColor(this.value)" onchange="app.wlColor(this.value)"></label></div>
                        <div class="wl-label">How you'll show up</div>
                        <div class="wl-preview" id="wl-preview"></div>
                        <div class="wl-actions"><button type="button" class="btn-primary wl-main" id="wl-next" onclick="app.wlGo('gear')">Continue</button></div>
                        ${this.acctOn() && this.legalLinksHtml ? `<p class="wl-terms">By continuing you agree to the ${this.legalLinksHtml()}.</p>` : ''}
                    </div>`;
                } else if (s.step === 'gear') {
                    const kinds = this.wlGearKinds(), open = kinds.find(k => k.key === s.gearOpen);
                    const sugg = open ? this.wlGearSuggestions(open) : [];
                    html = `<div class="wl-step">
                        ${this.wlTop(2, 'name')}
                        <h2 class="wl-h2">What do you brew with?</h2>
                        <p class="wl-sub">Add your machine, grinder and anything else. Logging gets faster, and friends see it on your profile.</p>
                        <div class="wl-tiles">${kinds.map(k => { const n = s.gear.filter(g => g.kind === k.key).length; return `<button type="button" class="wl-tile${n ? ' has' : ''}${s.gearOpen === k.key ? ' open' : ''}" data-k="${k.key}" onclick="app.wlGearOpen(this.getAttribute('data-k'))"><svg class="icon"><use href="#${k.icon}"/></svg><span>${esc(k.label)}</span>${n ? `<b>${n}</b>` : ''}</button>`; }).join('')}</div>
                        ${open ? `<div class="wl-add">
                            <label for="wl-gear-name">${esc(open.ask)}</label>
                            <div class="wl-row"><input class="wl-input" id="wl-gear-name" list="wl-gear-sugg" maxlength="40" placeholder="e.g. ${esc(open.eg)}" onkeydown="if(event.key==='Enter'){event.preventDefault();app.wlGearAdd()}"><button type="button" class="btn-primary wl-addbtn" onclick="app.wlGearAdd()">Add</button></div>
                            <datalist id="wl-gear-sugg">${sugg.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
                            ${sugg.length ? `<div class="wl-sugg">${sugg.slice(0, 4).map(x => `<button type="button" class="wl-pill" data-v="${esc(x)}" onclick="app.wlGearAdd(this.getAttribute('data-v'))">${esc(x)}</button>`).join('')}<span>your friends use these</span></div>` : ''}
                        </div>` : ''}
                        ${s.gear.length ? `<div class="wl-chips">${s.gear.map((g, i) => { const k = kinds.find(x => x.key === g.kind) || kinds[0]; return `<span class="wl-chip"><svg class="icon"><use href="#${k.icon}"/></svg>${esc(g.name)}<button type="button" aria-label="Remove ${esc(g.name)}" onclick="app.wlGearDel(${i})"><svg class="icon"><use href="#i-x"/></svg></button></span>`; }).join('')}</div>` : ''}
                        <div class="wl-actions">
                            <button type="button" class="btn-primary wl-main" onclick="app.wlGo('coffee')">Continue</button>
                            ${s.gear.length ? '' : `<button type="button" class="wl-link" onclick="app.wlGo('coffee')">Skip for now</button>`}
                        </div>
                    </div>`;
                    if (open) setTimeout(() => { const i = document.getElementById('wl-gear-name'); if (i) i.focus(); }, 60);
                } else if (s.step === 'coffee') {
                    const pop = this.wlPopularCoffees(), b = s.bean;
                    const chips = (field, opts) => opts.map(o => `<button type="button" class="wl-pill${b[field] === o ? ' on' : ''}" data-f="${field}" data-v="${o}" onclick="app.wlBeanChip(this.getAttribute('data-f'), this.getAttribute('data-v'))">${o}</button>`).join('');
                    const roasters = (() => { try { return this.roasterData().roasters.map(r => r.name); } catch (e) { return []; } })();
                    html = `<div class="wl-step">
                        ${this.wlTop(3, 'gear')}
                        <h2 class="wl-h2">What's in your hopper?</h2>
                        <p class="wl-sub">Pick a coffee people are brewing, or add the bag you've got.</p>
                        ${pop.length ? `<div class="wl-label">Popular right now</div>
                        <div class="wl-beans">${pop.map(c => `<button type="button" class="wl-bean${s.pick === c.id ? ' on' : ''}" data-id="${esc(c.id)}" onclick="app.wlPickBean(this.getAttribute('data-id'))">
                            <b>${esc(c.name)}</b><span>${esc(c.roaster)}</span>
                            <em>${c.avg ? `<span class="star-meter" style="--fill:${this.starFill(c.avg)}%;--whole:${this.starWhole(c.avg)};--frac:${this.starFrac(c.avg)}"></span> ${esc(this.fmtNum(c.avg))}` : ''}<small>${c.n} session${c.n === 1 ? '' : 's'}</small></em>
                            ${this.wlFaces(c.people.map(n => ({ name: n })), 4)}
                        </button>`).join('')}</div>
                        <div class="wl-or"><span>or add your own</span></div>` : ''}
                        <div class="wl-form">
                            <input class="wl-input" id="wl-b-roaster" list="wl-roasters" maxlength="60" placeholder="Roaster" value="${esc(b.roaster)}" oninput="app.wlBean('roaster', this.value)">
                            <datalist id="wl-roasters">${roasters.map(r => `<option value="${esc(r)}"></option>`).join('')}</datalist>
                            <input class="wl-input" id="wl-b-name" maxlength="60" placeholder="Coffee name" value="${esc(b.name)}" oninput="app.wlBean('name', this.value)">
                            <input class="wl-input" id="wl-b-origin" maxlength="60" placeholder="Origin (optional)" value="${esc(b.origin)}" oninput="app.wlBean('origin', this.value)">
                            <div class="wl-pills"><span>Roast</span>${chips('roast', ['Light', 'Medium', 'Dark'])}</div>
                            <div class="wl-pills"><span>Process</span>${chips('process', ['Washed', 'Natural', 'Honey', 'Anaerobic'])}</div>
                        </div>
                        <div class="wl-actions">
                            <button type="button" class="btn-primary wl-main" id="wl-finish" onclick="app.wlFinish()">Finish setup</button>
                            <button type="button" class="wl-link" onclick="app.wlFinish(true)">Skip for now</button>
                        </div>
                    </div>`;
                }
                if (s.step === 'email' || s.step === 'code' || s.step === 'claim' || s.step === 'password') html = this.acctStepHtml(s);   // v14.2: signing in (new backend only)
                if (this.wlHeroView && this.wlHeroView.stop) this.wlHeroView.stop();
                wrap.innerHTML = html;
                const view = document.getElementById('welcome-view'); if (view) view.scrollTop = 0;
                if (s.step === 'intro') this.mountWelcomeShape(G.best);
                if (s.step === 'name') this.wlName(s.name, true);
            },

            mountWelcomeShape(best) {
                const host = document.getElementById('wl-shape');
                if (!host || typeof FlavorShape === 'undefined') return;
                const vals = best ? this.shapeValues(best) : { acidity: 7, sweetness: 8, body: 6, finish: 7, bitterness: 3, balance: 8 };
                const size = Math.min(340, Math.max(240, host.clientWidth || 300));
                try {
                    this.wlHeroView = FlavorShape.createView({ values: () => vals, labels: false, bare: true, controls: false, interactive: false, spin: true, width: size, height: 260, zoom: 1.7, lookY: 0.5, yaw: -0.9, pitch: 0.32 });
                    if (typeof host.replaceChildren === 'function') host.replaceChildren(this.wlHeroView.el);
                    this.wlHeroView.start();
                } catch (e) { /* no 3D here: the page still works */ }
            },

            refreshWelcome() {
                if (!this.welcomeOpen || !this.wl) return;
                if (this.wl.step === 'intro' || this.wl.step === 'returning') this.renderWelcome();
            },

            wlGo(step) {
                const s = this.wl; if (!s) return;
                if (step === 'gear' && s.step === 'name') {
                    const n = String(s.name || '').trim().replace(/\s+/g, ' ');
                    if (!this.validPersonName(n)) { this.wlShake('wl-name'); return; }
                    if (this.wlTaken(n) && !this.acctOn()) { this.wlName(n); this.wlShake('wl-name'); return; }
                    s.name = n;
                    if (this.acctOn() && !(Supa.session() || {}).profile) { this.acctCreate(); return; }   // v14.2: the name becomes your profile (the server checks it's free)
                }
                s.step = step;
                this.renderWelcome();
            },

            wlShake(id) { const el = document.getElementById(id); if (!el) return; el.classList.remove('wl-shake'); void el.offsetWidth; el.classList.add('wl-shake'); el.focus(); },

            wlTaken(n) { const k = String(n || '').trim().toLowerCase(); return k ? this.knownPeople().find(x => x.toLowerCase() === k) || '' : ''; },

            wlFreeColor() {
                const used = new Set(this.knownPeople().map(n => String(this.getUserColor(n)).toLowerCase()));
                return this.wlPalette().find(c => !used.has(c.toLowerCase())) || this.wlPalette()[0];
            },

            wlName(v, quiet) {
                const s = this.wl; if (!s) return;
                s.name = String(v || '');
                const n = s.name.trim(), taken = this.wlTaken(n), box = document.getElementById('wl-taken'), next = document.getElementById('wl-next');
                if (box) {
                    box.hidden = !taken;
                    box.innerHTML = taken ? (this.acctOn() ? `<span>There's already a <b>${this.esc(taken)}</b> here. Try another name.</span>` : `<span>There's already a <b>${this.esc(taken)}</b> here.</span><button type="button" class="wl-pill on" data-person="${this.esc(taken)}" onclick="app.wlPick(this.getAttribute('data-person'))">That's me</button>`) : '';
                }
                if (next) next.disabled = !this.validPersonName(n) || Boolean(taken) || (this.acctOn() && n.length < 2);
                const prev = document.getElementById('wl-preview');
                if (prev) {
                    const name = n || 'You', c = s.color;
                    const best = this.wlGroup().best, bean = best ? this.beans.get(String(best.beanId)) : null;
                    prev.innerHTML = `<div class="wl-pv-head"><i data-face="${this.esc(name)}" style="background:${this.esc(c)}">${this.esc(this.feedInitial(name))}</i><span><b style="color:${this.esc(c)}">${this.esc(name)}</b><small>Just now</small></span><em>Espresso</em></div>
                        <div class="wl-pv-title">${this.esc(bean ? (bean.name || 'Your first coffee') : 'Your first coffee')}</div>
                        <div class="wl-pv-strip"><span><b>18</b>g<small>Dose</small></span><span><b>40</b>g<small>Pull · 1:2.2</small></span><span><b>29</b>s<small>Time</small></span></div>`;
                }
            },

            wlColor(c) {
                const s = this.wl; if (!s) return;
                c = this.normalizeHexColor(c) || s.color;
                s.color = c;
                let preset = false;
                document.querySelectorAll('.wl-sw[data-c]').forEach(b => { const on = b.getAttribute('data-c').toLowerCase() === c.toLowerCase(); preset = preset || on; b.setAttribute('aria-pressed', String(on)); });
                const any = document.querySelector('.wl-any');
                if (any) { any.classList.toggle('on', !preset); any.style.setProperty('--c', c); const inp = any.querySelector('input'); if (inp && inp.value.toLowerCase() !== c.toLowerCase()) inp.value = c; }
                this.wlName(s.name);
            },

            // gear people in the group already use, for this kind (most common first)
            wlGearSuggestions(kind) {
                const seen = new Map();
                const words = { machine: /espresso|gaggia|breville|lelit|rancilio|decent|bambino|linea|profitec|ecm|rocket|flair|casa/i, pourover: /v60|chemex|kalita|origami|dripper|orea|april|hario|pour/i, aeropress: /aeropress/i, french: /french|press|bodum|espro/i, moka: /moka|bialetti/i };
                this.gearByUser.forEach(g => (g && Array.isArray(g.items) ? g.items : []).forEach(it => {
                    const name = String(it.name || '').trim(); if (!name) return;
                    const ok = it.type === kind.type && (kind.type !== 'Brewer' || (words[kind.key] && words[kind.key].test(name)));
                    if (!ok && !(kind.key === 'machine' && it.type === 'Machine')) return;
                    if (kind.key === 'machine' && it.type !== 'Machine') return;
                    seen.set(name, (seen.get(name) || 0) + 1);
                }));
                return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]).slice(0, 8);
            },

            wlGearOpen(key) { const s = this.wl; if (!s) return; s.gearOpen = s.gearOpen === key ? '' : key; this.renderWelcome(); },

            wlGearAdd(value) {
                const s = this.wl; if (!s || !s.gearOpen) return;
                const input = document.getElementById('wl-gear-name');
                const name = String(value !== undefined ? value : (input ? input.value : '')).trim().replace(/\s+/g, ' ');
                if (!name) { this.wlShake('wl-gear-name'); return; }
                const kind = this.wlGearKinds().find(k => k.key === s.gearOpen);
                if (!s.gear.some(g => g.name.toLowerCase() === name.toLowerCase())) s.gear.push({ kind: kind.key, type: kind.type, name });
                s.gearOpen = '';
                this.renderWelcome();
            },

            wlGearDel(i) { const s = this.wl; if (!s) return; s.gear.splice(i, 1); this.renderWelcome(); },

            wlPopularCoffees() {
                const now = Date.now(), byBean = new Map();
                this.brews.forEach(b => {
                    const id = String(b.beanId || ''); if (!this.beans.has(id)) return;
                    const t = this.toTime(b.date) || 0, x = byBean.get(id) || { n: 0, recent: 0, ratings: [], people: new Set() };
                    x.n++; if (now - t < 45 * 864e5) x.recent++; const r = this.normalizeRating(b.rating); if (r) x.ratings.push(r); x.people.add(this.getBrewOwner(b));
                    byBean.set(id, x);
                });
                return [...byBean.entries()].map(([id, x]) => { const bean = this.beans.get(id); return { id, name: bean.name || 'Coffee', roaster: bean.roaster || '', n: x.n, recent: x.recent, avg: x.ratings.length ? Math.round(x.ratings.reduce((s, v) => s + v, 0) / x.ratings.length * 2) / 2 : 0, people: [...x.people] }; })
                    .sort((a, b) => b.recent - a.recent || b.n - a.n).slice(0, 6);
            },

            wlPickBean(id) {
                const s = this.wl; if (!s) return;
                s.pick = s.pick === id ? '' : id;
                if (s.pick) s.bean = { roaster: '', name: '', origin: '', roast: 'Light', process: '' };
                this.renderWelcome();
            },

            wlBean(field, value) {
                const s = this.wl; if (!s) return;
                s.bean[field] = String(value || '');
                if (s.pick && String(value || '').trim()) { s.pick = ''; document.querySelectorAll('.wl-bean.on').forEach(b => b.classList.remove('on')); }
            },

            wlBeanChip(field, value) {
                const s = this.wl; if (!s) return;
                s.bean[field] = s.bean[field] === value && field !== 'roast' ? '' : value;
                if (s.pick) s.pick = '';
                this.renderWelcome();
            },

            wlPick(name) {
                const n = String(name || '').trim(); if (!n) return;
                if (!this.users.some(u => u.toLowerCase() === n.toLowerCase())) { this.users.push(n); safeSet('dialed_users', JSON.stringify(this.users)); }
                this.user = this.users.find(u => u.toLowerCase() === n.toLowerCase()) || n;
                safeSet('dialed_user', this.user);
                this.applyGearFromCloud();
                this.closeWelcome();
                this.setTab('feed');
                this.render();
                this.sync({ silent: true });
                this.showToast(`Welcome back, ${this.user}.`);
            },

            wlFinish(skipCoffee = false) {
                const s = this.wl; if (!s) return;
                const acct = this.acctOn() && (Supa.session() || {}).profile;   // v14.2: on the new backend you already are your profile
                const name = acct ? String(acct.name) : String(s.name || '').trim(); if (!acct && (!this.validPersonName(name) || this.wlTaken(name))) { s.step = 'name'; this.renderWelcome(); return; }
                const b = s.bean;
                if (!skipCoffee && !s.pick && (b.roaster.trim() || b.name.trim()) && !(b.roaster.trim() && b.name.trim())) { this.wlShake(b.roaster.trim() ? 'wl-b-name' : 'wl-b-roaster'); this.showToast('Add both the roaster and the coffee name, or skip for now.'); return; }
                const now = new Date().toISOString(), color = s.color || this.wlFreeColor();
                // you
                if (acct) { this.user = name; this.setUserColor(name, color, true); }
                else {
                    this.users.push(name); safeSet('dialed_users', JSON.stringify(this.users));
                    this.setUserColor(name, color, true);
                    this.user = name; safeSet('dialed_user', name);
                    this.registerPerson(name, { joinedAt: now, color });
                }
                // your gear
                this.equipment = s.gear.map((g, i) => ({ id: `${Date.now() + i}`, name: g.name, type: g.type }));
                this.lastEquipment = {};
                safeSet('dialed_equipment', JSON.stringify(this.equipment)); safeSet('dialed_last_equipment', '{}');
                if (this.equipment.length) this.pushGear();
                // your first coffee
                let firstBean = skipCoffee ? '' : s.pick;
                if (!skipCoffee && !firstBean && b.roaster.trim() && b.name.trim()) {
                    const id = `${Date.now() + 50}`, bdate = new Date(Date.now() - 1000).toISOString();   // a moment before you joined, so the join post is on top
                    const payload = this.buildBeanPayload({ id, user: name, owner: name, date: bdate, roaster: '', name: '', variety: '', origin: '', process: '', roast: 'Light', likes: [], comments: [] }, { id, date: bdate, roaster: b.roaster.trim(), name: b.name.trim(), variety: '', origin: b.origin.trim(), process: b.process, roast: b.roast || 'Light', roastDate: '' });
                    if (payload) { this.push(payload); firstBean = id; }
                }
                this.wlFirstBean = firstBean;
                this.closeWelcome();
                this.setTab('feed');
                this.render();
                setTimeout(() => this.startTour(), 350);
            },

            // ---- the tour: a spotlight on each place, over the real app
            tourSteps() {
                const desk = window.matchMedia && window.matchMedia('(min-width: 769px)').matches;
                const nav = tab => desk ? `#sidebar .nav-btn[data-tab="${tab}"]` : `#mobile-nav .mob-item[data-tab="${tab}"]`;
                return [
                    { sel: nav('feed'), tab: 'feed', title: 'Feed', text: 'Sessions from the people you follow show up here. Like them, comment, and brew toward your community\'s weekly goal. Your welcome post is already up.' },
                    { sel: nav('my'), tab: 'my', title: 'Coffees', text: 'Yours under Mine, everyone\'s under All. Open one to log a session, see your dial-in curve, and get the next-shot coach.' },
                    { sel: nav('roasters'), tab: 'roasters', title: 'Roasters', text: 'Every roaster you and your people have brewed, with their coffees, ratings and how their espresso runs.' },
                    { sel: desk ? '#sidebar .nav-btn:not([data-tab]):not(.settings-nav-btn)' : '#mobile-nav .mob-fab', tab: 'my', title: 'Add a coffee', text: 'New bag? Add it here, then log sessions on it.' },
                    { sel: nav('profile'), tab: 'profile', title: 'Profile', text: 'Your stats, favorites, gear and achievements. Anyone else’s is a tap away.' },
                    { sel: desk ? '#sidebar .settings-nav-btn' : '#mobile-controls-btn', tab: 'feed', title: 'Settings', text: desk ? 'Light or dark, your profile picture, notifications and privacy.' : 'Filters and Settings live here: light or dark, your profile picture, notifications and privacy.' }
                ];
            },

            startTour() {
                const el = document.getElementById('wl-tour'); if (!el) return;
                this.tour = { i: 0, steps: this.tourSteps() };
                el.classList.add('active'); el.setAttribute('aria-hidden', 'false');
                if (!this._tourResize) { this._tourResize = () => { if (this.tour) this.renderTour(); }; window.addEventListener('resize', this._tourResize); }
                this.renderTour();
            },

            tourNext() { if (!this.tour) return; this.tour.i++; this.renderTour(); },

            endTour() {
                const el = document.getElementById('wl-tour');
                this.tour = null;
                if (el) { el.classList.remove('active'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = ''; }
            },

            tourFirstSession() {
                const id = this.wlFirstBean;
                this.endTour();
                if (id && this.beans.has(String(id))) { this.openFeedTarget(id, '', false); setTimeout(() => this.openBrewModal(), 250); }
                else { this.coffeeScope = 'all'; this.setTab('my'); this.showToast('Open any coffee and tap Log a session.'); }
            },

            renderTour() {
                const el = document.getElementById('wl-tour'), t = this.tour; if (!el || !t) return;
                const n = t.steps.length;
                if (t.i >= n) {
                    const bean = this.wlFirstBean ? this.beans.get(String(this.wlFirstBean)) : null;
                    el.innerHTML = `<div class="wl-dim"></div><div class="wl-bubble wl-final" role="dialog" aria-label="All set">
                        <div class="wl-final-face" data-face="${this.esc(this.user || '')}" style="background:${this.esc(this.getUserColor(this.user))}">${this.esc(this.feedInitial(this.user))}</div>
                        <h4>You're dialed in, ${this.esc(this.user)}.</h4>
                        <p>${bean ? `Your first coffee is ready: <b>${this.esc(bean.name || 'Coffee')}</b>. Log a session and the coach starts learning your taste.` : 'Pick any coffee, log a session, and the coach starts learning your taste.'}</p>
                        <div class="wl-final-actions"><button type="button" class="btn-primary" onclick="app.tourFirstSession()">Log your first session</button><button type="button" class="wl-link" onclick="app.endTour()">Look around first</button></div>
                    </div>`;
                    const fb = el.querySelector('.wl-bubble');
                    if (fb) { fb.style.left = `${Math.max(16, (window.innerWidth - fb.offsetWidth) / 2)}px`; fb.style.top = `${Math.max(16, (window.innerHeight - fb.offsetHeight) / 2)}px`; }
                    return;
                }
                const st = t.steps[t.i];
                if (st.tab && this.tab !== st.tab) this.setTab(st.tab);
                const target = document.querySelector(st.sel);
                const r = target ? target.getBoundingClientRect() : null;
                const pad = 6;
                el.innerHTML = `${r && r.width ? `<div class="wl-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '<div class="wl-dim"></div>'}
                    <div class="wl-bubble" role="dialog" aria-label="${this.esc(st.title)}">
                        <div class="wl-bub-count">${t.i + 1} of ${n}</div>
                        <h4>${this.esc(st.title)}</h4>
                        <p>${this.esc(st.text)}</p>
                        <div class="wl-bub-foot"><button type="button" class="wl-link" onclick="app.endTour()">Skip tour</button><button type="button" class="btn-primary" onclick="app.tourNext()">${t.i === n - 1 ? 'Finish' : 'Next'}</button></div>
                    </div>`;
                const bub = el.querySelector('.wl-bubble');
                if (!bub) return;
                const W = window.innerWidth, H = window.innerHeight, bw = bub.offsetWidth, bh = bub.offsetHeight;
                let left, top;
                if (!r || !r.width) { left = (W - bw) / 2; top = (H - bh) / 2; }
                else if (r.right < W * 0.35 && r.height < 90) { left = r.right + 18; top = r.top + r.height / 2 - bh / 2; }   // the sidebar: to its right
                else if (r.top > H / 2) { left = r.left + r.width / 2 - bw / 2; top = r.top - pad - 14 - bh; }                 // the bottom bar: above
                else { left = r.left + r.width / 2 - bw / 2; top = r.bottom + pad + 14; }                                       // the top: below
                bub.style.left = `${Math.max(16, Math.min(W - bw - 16, left))}px`;
                bub.style.top = `${Math.max(16, Math.min(H - bh - 16, top))}px`;
            },

