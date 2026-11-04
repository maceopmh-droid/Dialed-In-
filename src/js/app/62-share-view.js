            // ===================== v21.3: share links anyone can open =====================
            // Maceo (Nov 3): "create the shareable links that can be seen and played with for non users to let them interact
            // and see sessions and coffees". A link to a session (?s=) or a coffee (?c=) opens a read-only page for anyone,
            // signed in or not: the server (shared_session, shared_coffee) gives only what its owner shows Everyone. The page
            // is the Session screen without its bar, coach, comparison, likes and comments, with a spinning taste shape; a
            // coffee shows its flavor profile and its shared sessions. Signed out, a Join button and a "Join free" card lead
            // to the welcome; the link is remembered, so it opens again once they're in. Signed in, it's how you see a shared
            // session that isn't in your own sync.
            // While the page is open its session and coffee sit in the app's lists (marked _shared, never saved or synced)
            // so the Session screen's drawing works as it is; closing takes them out again.
            shvGuest() { return !(this.user && this.acctOn && this.acctOn() && typeof Supa !== 'undefined' && Supa.ready && Supa.ready()); },
            shvEl() {
                let v = document.getElementById('share-view');
                if (!v) {
                    v = document.createElement('div'); v.id = 'share-view'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Shared from Dialed In');
                    v.innerHTML = '<div class="nls-page shv-page" id="shv-page"></div><div id="shv-chrome"></div>';
                    // names and roasters lead to pages that need an account: here they do nothing
                    v.addEventListener('click', e => { const t = e.target && e.target.closest ? e.target.closest('[data-profile], [data-roaster]') : null; if (t && v.contains(t)) { e.stopPropagation(); e.preventDefault(); } }, true);
                    document.body.appendChild(v);
                }
                return v;
            },
            // p: { s: a session's id } or { c: a coffee's id }; o.onMissing: what to do when the server has nothing to show
            async openSharedLink(p, o = {}) {
                if (!p || (!p.s && !p.c) || typeof Supa === 'undefined' || !Supa.on || !Supa.on()) { if (o.onMissing) o.onMissing(); return false; }
                this.shvEject();
                this._shv = { stack: [], brews: new Set(), beans: new Set(), colors: [], onMissing: o.onMissing || null };
                const v = this.shvEl();
                v.hidden = false; v.classList.add('active'); v.setAttribute('aria-hidden', 'false');
                document.body.classList.add('shv-open');
                return this.shvGo(p.s ? 's' : 'c', p.s || p.c);
            },
            async shvGo(kind, ref, data = null) {
                const st = this._shv; if (!st) return false;
                const page = document.getElementById('shv-page'), v = this.shvEl();
                if (!data) {
                    page.removeAttribute('data-fam'); page.setAttribute('data-fam', 'app');
                    page.innerHTML = `<div class="shv-wait">${this.loaderHtml ? this.loaderHtml('Opening…') : 'Opening…'}</div>`;
                    this.shvChrome(null);
                    try { data = await Supa.rpc(kind === 's' ? 'shared_session' : 'shared_coffee', { ref: String(ref) }, { auth: false }); }
                    catch (e) { data = undefined; console.error('Share link:', e); }
                    if (this._shv !== st) return false;   // (closed, or another link, while it loaded)
                    if (data) await this.shvSignPhotos(kind === 's' ? [data.session] : (data.sessions || []));
                    if (this._shv !== st) return false;
                }
                if (!data || (kind === 's' && !data.session) || (kind === 'c' && !data.coffee)) {
                    if (!st.stack.length && st.onMissing) { const f = st.onMissing; this.closeShareView(); f(); return false; }
                    this.shvMissing(data === undefined);
                    return false;
                }
                st.stack.push({ kind, ref: String(ref), data });
                this.shvRender();
                v.scrollTop = 0;
                return true;
            },
            // a shared photo in the private folder: the link only says there is one; the share-photo function gives a two-hour
            // address for it (the folder itself stays closed, and its path names the account). None: the page goes without.
            async shvSignPhotos(list) {
                const stored = (list || []).filter(b => b && b.photo && b.photo.stored);
                await Promise.all(stored.slice(0, 24).map(async b => {
                    let url = '';
                    try {
                        const c = Supa.cfg(), r = await fetch(`${Supa.base()}/functions/v1/share-photo?s=${encodeURIComponent(String(b.id))}`, { headers: { apikey: c.anonKey } });
                        const j = r.ok ? await r.json() : null; url = j && typeof j.url === 'string' ? j.url : '';
                    } catch (e) { url = ''; }
                    if (url) b.photo = { url }; else delete b.photo;
                }));
                (list || []).forEach(b => { if (b && b.photo && b.photo.stored) delete b.photo; });
            },
            // its session and coffee in the app's lists while the page is open (the Session screen's drawing reads them there)
            shvInject(bean, brews, owner) {
                const st = this._shv; if (!st) return;
                if (owner && owner.name && owner.color && !this.normalizeHexColor(this.userColors[owner.name])) { this.userColors[owner.name] = owner.color; st.colors.push(owner.name); }
                if (bean && bean.id && !this.beans.has(String(bean.id))) { this.beans.set(String(bean.id), { ...bean, _shared: true }); st.beans.add(String(bean.id)); }
                (brews || []).forEach(b => { if (b && b.id && !this.brews.has(String(b.id))) { this.brews.set(String(b.id), { ...b, _shared: true }); st.brews.add(String(b.id)); } });
            },
            shvEject() {
                const st = this._shv; if (!st) return;
                st.brews.forEach(id => { const b = this.brews.get(id); if (b && b._shared) this.brews.delete(id); });
                st.beans.forEach(id => { const b = this.beans.get(id); if (b && b._shared) this.beans.delete(id); });
                st.colors.forEach(n => { delete this.userColors[n]; });
                st.brews.clear(); st.beans.clear(); st.colors = [];
            },
            shvClean(html) { return String(html).replace(/ data-(profile|face|roaster)="[^"]*"/g, ''); },
            shvRender() {
                const st = this._shv, top = st && st.stack[st.stack.length - 1]; if (!top) return;
                const page = document.getElementById('shv-page'), d = top.data, owner = (d.owner && d.owner.name) || '';
                if (top.kind === 's') {
                    const brew = { ...d.session, user: d.session.user || owner, owner: d.session.owner || owner };
                    this.shvInject(d.coffee, [brew], d.owner);
                    const b = this.brews.get(String(brew.id)) || brew, bean = d.coffee;
                    const n = Number(d.more) || 0;
                    const more = bean ? `<section class="nls-sec"><button type="button" class="shv-more" onclick="app.shareOpenCoffee()"><span><b>More on ${this.esc(bean.name || 'this coffee')}</b><small>${n > 1 ? `${n} sessions · its flavor profile` : 'Its details and flavor profile'}</small></span><svg class="icon" aria-hidden="true"><use href="#i-chev-right"/></svg></button></section>` : '';
                    page.setAttribute('data-fam', this.famOfBrew(b));
                    page.innerHTML = this.shvClean(this.sessionHtml(b, { shared: true })) + more;
                    const wrap = page.querySelector('.nls-wrap'); if (wrap && more) wrap.appendChild(page.lastElementChild);
                    this.shvChrome(top.kind, owner);
                } else {
                    const bean = { ...d.coffee }, list = (d.sessions || []).map(s => ({ ...s, user: s.user || owner, owner: s.owner || owner }));
                    this.shvInject(bean, list, d.owner);
                    page.setAttribute('data-fam', this.famOfCoffee(this.beans.get(String(bean.id)) || bean));
                    page.innerHTML = this.shvClean(this.shvCoffeeHtml(bean, list, owner));
                    this.shvChrome(top.kind, owner);
                    const pool = list.filter(b => this.tastedKeys(b).length);
                    if (pool.length && this.nlSpinMount) {
                        const vals = {}, set = [];
                        TASTE_KEYS.forEach(k => { const xs = pool.map(b => this.tasteValue(b, k)).filter(x => x !== null); vals[k] = xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 5; if (xs.length) set.push(k); });
                        this.nlSpinMount(document.getElementById('shv-shape'), { id: `share|${bean.id}`, values: () => vals, isSet: k => set.includes(k), names: this.isTeaBean(bean) ? 'tea' : null });
                    }
                }
                this.nlFillShapes(page);
                this.nlFillSpins(page);
                if (this.nlFitNames) this.nlFitNames(page);
                if (this.nlFitTiles) this.nlFitTiles(page);
                if (this.fillShapeImages) setTimeout(() => this.fillShapeImages(page), 0);
            },
            // a coffee: its name and details, what it tastes like across its shared sessions, and the sessions
            shvCoffeeHtml(bean, list, owner) {
                const tea = this.isTeaBean(bean), name = String(bean.name || '').trim() || (tea ? 'Tea' : 'Coffee');
                const rated = list.map(b => this.normalizeRating(b.rating)).filter(r => r > 0), avg = rated.length ? rated.reduce((a, r) => a + r, 0) / rated.length : 0;
                const specs = [bean.origin, bean.variety, bean.process, bean.roast ? `${bean.roast} roast` : ''].map(x => String(x || '').trim()).filter(Boolean);
                const notes = this.lookTopNotes(list, 3);
                const kind = tea ? 'tea' : 'coffee', fc = this.flavorCounts(list, kind);
                const vals = {}, set = [];
                TASTE_KEYS.forEach(k => { const xs = list.map(b => this.tasteValue(b, k)).filter(x => x !== null); vals[k] = xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 5; if (xs.length) set.push(k); });
                const words = set.length ? this.describeCup(vals, set, fc.notes.slice(0, 4).map(x => x.n), Object.fromEntries(fc.notes.map(x => [x.n, x.strength])), kind) : '';
                const profile = set.length || fc.notes.length ? `<section class="nls-sec"><h3 class="nl-h3">Flavor profile</h3><div class="nl-box shv-flavor"><p class="shv-sub">${list.length} session${list.length === 1 ? '' : 's'} · ${this.esc(owner)}</p>${set.length ? '<div id="shv-shape"></div>' : ''}${fc.notes.length ? `<div class="bf-wheel">${this.wheelSvgStatic(fc, kind)}<div class="flv-notes">${this.noteChipsHtml(fc.notes.slice(0, 12), true)}</div></div>` : ''}${words ? `<p class="nls-desc">${this.esc(words)}</p>` : ''}</div></section>` : '';
                const rows = list.map(b => this.nlLogRow(b).replace(/app\.openSession\(/g, 'app.shareOpenSession(')).join('');
                return `<div class="nls-wrap shv-coffee">
                    <div class="nls-hero is-flat shv-chero"><div class="nls-id">
                        ${this.nlCoverHtml(bean, 'nl-cover shv-cover')}
                        ${this.nlRoasterHtml(bean, tea, 'nl-roast nls-roast')}
                        <h1 class="nl-name nls-name" data-nl-fit="60,40,3" style="font-size:${this.nlNameSize(name, 354, 60, 40, 3)}px">${this.esc(name)}</h1>
                        ${avg > 0 ? `<div class="nls-rate">${this.nlStarsHtml(avg, 20)}<b>${this.esc(this.formatRating(avg))}</b></div>` : ''}
                    </div></div>
                    <section class="nls-sec nls-first">${this.nlSpecRowsHtml ? this.nlSpecRowsHtml(bean, { links: false }) : specs.length ? `<div class="nls-badges">${specs.map(t => `<span class="nl-badge lg">${this.esc(t)}</span>`).join('')}</div>` : ''}${notes.length ? `<div class="shv-notes">${notes.map(([n, s, k]) => this.nlNote(n, s, k, 'lg')).join('')}</div>` : ''}</section>
                    ${profile}
                    <section class="nls-sec"><h3 class="nl-h3">${list.length ? `Sessions <span>· ${list.length}</span>` : 'Sessions'}</h3>${list.length ? `<div class="nl-proflogs">${rows}</div>` : `<p class="shv-sub">${this.esc(owner)} hasn't shared a session on it with everyone yet.</p>`}</section>
                </div>`;
            },
            // the bar on top (Dialed In and Join; Back once you've gone further in; signed in: close) and, signed out, the Join card
            shvChrome(kind, owner = '') {
                const host = document.getElementById('shv-chrome'); if (!host) return;
                const st = this._shv, deep = !!(st && st.stack.length > 1), guest = this.shvGuest();
                const left = deep ? `<button type="button" class="nl-glass" onclick="app.shareBack()" aria-label="Back"><svg class="nl-ic"><use href="#i-arrow-left"/></svg></button>`
                    : `<span class="shv-brand"><img src="icon.png" alt="" width="28" height="28">Dialed In</span>`;
                const right = guest ? `<button type="button" class="shv-join" onclick="app.shareJoin()">Join</button>`
                    : `<button type="button" class="nl-glass" onclick="app.closeShareView()" aria-label="Close"><svg class="nl-ic"><use href="#i-x"/></svg></button>`;
                const cta = guest && kind ? `<div class="shv-cta"><div><b>${kind === 's' ? `Log your coffee like ${this.esc(owner || 'this')}` : 'Brewing this coffee too?'}</b><small>${kind === 's' ? 'Dial in, track every bag, see what your friends brew' : `Log it on Dialed In and compare with ${this.esc(owner || 'them')}`}</small></div><button type="button" onclick="app.shareJoin()">Join free</button></div>` : '';
                const pg = document.getElementById('shv-page'); host.setAttribute('data-fam', (kind && pg && pg.getAttribute('data-fam')) || 'app');   // (the bar's buttons in the page's colors)
                host.innerHTML = `<div class="shv-bar">${left}${right}</div>${cta}`;
                document.getElementById('share-view').classList.toggle('shv-guest', guest && !!kind);
            },
            shvMissing(failed) {
                const page = document.getElementById('shv-page'), guest = this.shvGuest();
                page.setAttribute('data-fam', 'app');
                page.innerHTML = `<div class="shv-none"><h2>${failed ? 'Couldn\'t open this link' : 'This isn\'t shared with everyone'}</h2><p>${failed ? 'Check your connection and try again.' : 'Its owner may keep it for friends, or it\'s no longer there.'}</p>${guest ? '<button type="button" class="btn-primary" onclick="app.shareJoin()">Join Dialed In</button>' : '<button type="button" class="btn-outline" onclick="app.closeShareView()">Close</button>'}</div>`;
                this.shvChrome(null);
            },
            shareOpenCoffee() {
                const st = this._shv, top = st && st.stack[st.stack.length - 1]; if (!top || top.kind !== 's') return;
                const c = top.data.coffee; if (!c || !c.id) return;
                if (this.haptic) this.haptic('tick');
                this.shvGo('c', c.id);
            },
            shareOpenSession(id) {
                const st = this._shv, top = st && st.stack[st.stack.length - 1]; if (!top || top.kind !== 'c') return;
                const s = (top.data.sessions || []).find(x => String(x.id) === String(id)); if (!s) return;
                if (this.haptic) this.haptic('tick');
                this.shvGo('s', id, { session: s, coffee: top.data.coffee, owner: top.data.owner, more: (top.data.sessions || []).length });
            },
            shareBack() {
                const st = this._shv; if (!st || st.stack.length < 2) return;
                st.stack.pop();
                this.shvRender();
                this.shvEl().scrollTop = 0;
            },
            closeShareView() {
                this.shvEject();
                this._shv = null;
                const v = document.getElementById('share-view');
                if (v) { v.classList.remove('active', 'shv-guest'); v.hidden = true; v.setAttribute('aria-hidden', 'true'); const pg = document.getElementById('shv-page'); if (pg) pg.innerHTML = ''; }
                document.body.classList.remove('shv-open');
                if (this.user && this.render) this.render();
            },
            // Join: the welcome (it's right behind); the link is remembered, so it opens again once they're signed in
            shareJoin() {
                const top = this._shv && this._shv.stack[this._shv.stack.length - 1];
                if (top) safeSet('dialed_pending_share', JSON.stringify({ s: top.kind === 's' ? top.ref : '', c: top.kind === 'c' ? top.ref : '', r: '', u: (top.data.owner && top.data.owner.name) || '' }));
                this.closeShareView();
                if (!this.user && this.openWelcome) this.openWelcome();
            },
