            // ===================== v13.4: audit fixes =====================
            // a value going inside a quoted JS string in a tap handler: escape for JS first, then for the page
            escJs(v) {
                return this.esc(String(v === null || v === undefined ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));
            },

            // a URL going inside url('...') in a style attribute
            cssUrl(u) { return String(u || '').replace(/['"()\\\s]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')); },

            // the roaster for a key, even after a merge changed which key it goes by
            roasterFind(key) {
                const D = this.roasterData();
                return D.byKey.get(key) || D.byKey.get(D.clusterOf(key)) || null;
            },

            // ---- log form: is there anything in it worth keeping?
            brewFormSnap() {
                const form = this.getBrewForm();
                if (!form) return '';
                // (the method isn't counted: picking one fills in its own defaults, and losing just that costs nothing)
                const vals = [...form.elements].filter(el => el.name && el.name !== 'method' && el.type !== 'hidden' && el.type !== 'file').map(el => `${el.name}=${el.type === 'checkbox' ? el.checked : el.value}`);
                return JSON.stringify([vals, [...(this.selFlavors || [])], [...(this.tasteTouched || [])], this.draftPhoto ? 1 : 0, document.getElementById('isMasterInput') ? document.getElementById('isMasterInput').checked : false]);
            },

            brewFormDirty() {
                if (!document.getElementById('brew-modal').classList.contains('active')) return false;
                const timed = this.timer && (this.timer.on || this.timerSeconds() >= 1);
                return Boolean(timed || (this._brewSnap !== undefined && this.brewFormSnap() !== this._brewSnap));
            },

            closeBrewModal() {
                if (this.brewFormDirty() && !confirm('Discard this session? What you entered will be lost.')) return;
                this.closeModals();
            },

            brewFormKey(e) {
                if (!e || e.key !== 'Enter' || e.isComposing || e.defaultPrevented) return;
                const t = e.target;
                if (!t || t.tagName !== 'INPUT' || ['submit', 'button', 'checkbox', 'radio', 'range'].includes(t.type)) return;
                e.preventDefault();   // Return / Go in a field shouldn't save the whole session
                if (t.id === 'recipe-name') { this.saveRecipe(); return; }
                t.blur();
            },


            // ===================== v14.0: people everyone can see =====================

            // v14.1: names removed from the shared list (and not added again since), lower case.
            // Someone who logs a new coffee or session after being removed is back (they're clearly still using it).
            removedPeople() {
                const { active, removed } = this.peopleState();
                const out = new Set();
                removed.forEach((at, k) => { if (!active.has(k)) out.add(k); });
                if (!out.size) return out;
                const back = (who, when) => { const k = String(who || '').toLowerCase(); if (out.has(k) && this.toTime(when) > removed.get(k)) out.delete(k); };
                this.brews.forEach(b => back(this.getBrewOwner(b), b.date));
                this.beans.forEach(b => back(b.owner || b.user, b.date));
                return out;
            },

            validPersonName(n) {
                n = String(n || '').trim();
                return Boolean(n) && n.length <= 24 && !n.startsWith('__') && !/^(unknown|undefined|null|everyone)$/i.test(n);
            },

            // who's in the shared list right now: active (added after any removal) and removed, by lower-case name
            peopleState() {
                const reg = this.peopleReg || {};
                const removed = new Map();
                (Array.isArray(reg.removed) ? reg.removed : []).forEach(r => {
                    const k = String((r && r.name) || '').trim().toLowerCase(); if (!k) return;
                    const at = this.toTime(r.at); if (!removed.has(k) || at > removed.get(k)) removed.set(k, at);
                });
                const active = new Map();
                (Array.isArray(reg.people) ? reg.people : []).forEach(p => {
                    const name = String((p && p.name) || '').trim(), k = name.toLowerCase();
                    if (!this.validPersonName(name)) return;
                    const at = this.toTime(p.addedAt);
                    if (removed.has(k) && removed.get(k) >= at) return;
                    const cur = active.get(k);
                    if (!cur || at > this.toTime(cur.addedAt)) active.set(k, { ...p, name });
                });
                return { active, removed };
            },

            savePeople(change) {
                const reg = this.peopleReg || {};
                const next = { people: (Array.isArray(reg.people) ? reg.people : []).map(p => ({ ...p })), removed: (Array.isArray(reg.removed) ? reg.removed : []).map(r => ({ ...r })) };
                change(next);
                this.push({ type: 'gear', id: 'gear-__people__', user: '__people__', owner: '__people__', items: [], lastByMethod: {}, people: next.people, removed: next.removed });
            },

            registerPerson(name, extra = {}) {
                const now = new Date().toISOString(), k = String(name).toLowerCase();
                this.savePeople(n => {
                    n.people = n.people.filter(p => String(p.name || '').toLowerCase() !== k);
                    n.people.push({ name, addedAt: now, addedBy: this.user || name, color: this.getUserColor(name), ...extra });
                });
            },

            unregisterPerson(name) {
                const now = new Date().toISOString(), k = String(name).toLowerCase();
                this.savePeople(n => {
                    n.removed = n.removed.filter(r => String(r.name || '').toLowerCase() !== k);
                    n.removed.push({ name, at: now, by: this.user || '' });
                });
            },

            // two people adding / removing at once: keep every name, the latest time for each
            mergePeopleLists(theirs, mine, key) {
                const stamp = key === 'removed' ? 'at' : 'addedAt';
                const out = new Map();
                [...(Array.isArray(theirs) ? theirs : []), ...(Array.isArray(mine) ? mine : [])].forEach(x => {
                    const k = String((x && x.name) || '').trim().toLowerCase(); if (!k) return;
                    const cur = out.get(k);
                    if (!cur || this.toTime(x[stamp]) > this.toTime(cur[stamp])) out.set(k, x);
                });
                return [...out.values()];
            },

            // names this device added before the list was shared: share them once, so they show up everywhere
            sharePeopleOnce(active, removed) {
                if (!this.lastCloudAt || !this.user) return;   // only once the real list has come in
                let done = [];
                try { done = JSON.parse(safeGet('dialed_people_shared') || '[]'); } catch (e) { done = []; }
                const inLog = this.loggedNames();   // anyone with a coffee, a session or a gear record is in the log already
                const local = this.users.filter(u => this.validPersonName(u) && !active.has(u.toLowerCase()) && !removed.has(u.toLowerCase()) && !done.includes(u.toLowerCase()) && !inLog.has(u.toLowerCase()));
                if (!local.length) return;
                const now = new Date().toISOString();
                this.savePeople(n => { local.forEach(name => { if (!n.people.some(p => String(p.name || '').toLowerCase() === name.toLowerCase())) n.people.push({ name, addedAt: now, addedBy: this.user, color: this.getUserColor(name) }); }); });
                safeSet('dialed_people_shared', JSON.stringify([...done, ...local.map(u => u.toLowerCase())]));
            },

            loggedNames() {
                const out = new Set();
                this.beans.forEach(b => out.add(String(b.owner || b.user || '').toLowerCase()));
                this.brews.forEach(b => out.add(String(this.getBrewOwner(b)).toLowerCase()));
                this.gearByUser.forEach((g, owner) => out.add(String(owner).toLowerCase()));
                return out;
            },

            // ---- join posts
            joinFeedItems() {
                const out = [];
                this.peopleState().active.forEach(p => {
                    if (!p.joinedAt) return;
                    out.push({ id: `join-${p.name.toLowerCase()}`, kind: 'join', kindLabel: 'Joined', actor: p.name, actorColor: this.getUserColor(p.name, p.color || ''), date: p.joinedAt, text: `${p.name} joined Dialed In` });
                });
                return out;
            },

            renderJoinCard(e) {
                const name = e.actor, color = this.getUserColor(name, e.actorColor || '');
                const gear = this.gearByUser.get(name), items = gear && gear.items ? this.gearItemsFor(gear.items) : [];
                const beans = [...this.beans.values()].filter(b => String(b.user || b.owner || '') === name).sort((a, b) => this.toTime(a.date) - this.toTime(b.date));
                const first = beans[0];
                const bits = [
                    items.length ? `<div class="join-line"><svg class="icon"><use href="#i-settings"/></svg><span>Brews with ${this.esc(items.slice(0, 3).map(x => x.name).join(', '))}${items.length > 3 ? ` +${items.length - 3}` : ''}</span></div>` : '',
                    first ? `<div class="join-line"><svg class="icon"><use href="#i-coffee"/></svg><span>First coffee: ${this.esc(first.name || 'Coffee')}${first.roaster ? ` · ${this.esc(first.roaster)}` : ''}</span></div>` : ''
                ].join('');
                return `
                    <article class="feed-card join-card" style="--jc:${this.esc(color)}">
                        <div class="feed-card-body">
                            <div class="join-row">
                                <div class="feed-avatar join-avatar" style="background:${this.esc(color)};" data-profile="${this.esc(name)}">${this.esc(this.feedInitial(name))}</div>
                                <div class="join-text">
                                    <div class="join-title"><b style="color:${this.esc(color)}" data-profile="${this.esc(name)}">${this.esc(name)}</b> joined Dialed In</div>
                                    <div class="feed-time" data-time="${this.esc(String(e.date || ''))}">${this.esc(this.formatRelativeDate(e.date))}</div>
                                </div>
                                <div class="feed-type">New here</div>
                            </div>
                            ${bits ? `<div class="join-bits">${bits}</div>` : ''}
                            <div class="join-actions"><button type="button" class="btn-outline join-view" data-person="${this.esc(name)}" onclick="app.openPersonProfile(this.getAttribute('data-person'))">See ${this.esc(name)}'s profile</button></div>
                        </div>
                    </article>`;
            },

            openPersonProfile(name) {
                if (this.isDetailActive && this.isDetailActive()) this.closeDetail();
                this.profileSection = 'overview';
                this.setTab('profile');
                this.setProfileUser(name);
                window.scrollTo(0, 0);
            },

            // ===================== v14.0: apps update themselves =====================
            runningVersion() {
                const m = document.querySelector('meta[name="dialed-in-version"]');
                return m ? String(m.getAttribute('content') || '') : '';
            },

            newerVersion(a, b) {   // is a newer than b? (two-part versions: 13.10 > 13.9)
                const pa = String(a || '').split('.').map(Number), pb = String(b || '').split('.').map(Number);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
                return false;
            },

            async checkForUpdate() {
                if (typeof location === 'undefined' || !location.pathname || typeof fetch !== 'function') return;
                const mine = this.runningVersion(); if (!mine) return;
                this._updCheckedAt = Date.now();
                try {
                    const res = await fetch(`${location.pathname}?update=${Date.now()}`, { cache: 'no-store' });
                    if (!res || !res.ok) return;
                    const text = await res.text();
                    const m = text.match(/<meta name="dialed-in-version" content="([\d.]+)">/);
                    if (!m || !this.newerVersion(m[1], mine)) return;
                    let tried = ''; try { tried = sessionStorage.getItem('dialed_reload_for') || ''; } catch (e) {}
                    if (tried === m[1]) return;   // already reloaded once for it this visit (the old copy was still cached)
                    this.pendingUpdate = m[1];
                    this.applyUpdateWhenIdle();
                } catch (e) { /* offline: try again later */ }
            },

            updateIdle() {
                if (document.querySelector('.modal.active') || document.getElementById('welcome-view')?.classList.contains('active') || (this.isDetailActive && this.isEditingOnScreen && this.isEditingOnScreen())) return false;
                const a = document.activeElement;
                return !(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'));
            },

            applyUpdateWhenIdle() {
                clearTimeout(this._updT);
                if (!this.pendingUpdate) return;
                if (!this.updateIdle()) { this._updT = setTimeout(() => this.applyUpdateWhenIdle(), 5000); return; }
                try { sessionStorage.setItem('dialed_reload_for', this.pendingUpdate); } catch (e) {}
                location.reload();
            },


