            // ---- v14.6: Everyone on this coffee (the coffee page's Everyone tab). Sessions other people shared with Everyone on
            // the same coffee (same roaster and name, however it's written), newest first, with how each method is usually
            // brewed (the middle ratio, time and dose) and the notes people taste most. Never grind settings: they only make
            // sense on the same grinder. They're shown here only; they never join your library, goals or awards.
            coffeeCommState() { return this._coffeeComm || (this._coffeeComm = { key: '', roaster: '', name: '', events: [], summary: null, next: null, loading: false, error: '', at: 0 }); },

            coffeeCommKey(roaster, name) { return `${String(roaster || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}|${String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}`; },

            // the coffee page opened (or redrawn): the tab is there with an account; a different coffee starts fresh
            coffeeCommOnOpen(group) {
                const tab = document.querySelector('[data-detail-tab="everyone"]');
                const on = this.acctOn() && Boolean(group && group.meta && String(group.meta.name || '').trim());
                if (tab) tab.hidden = !on;
                if (!on) { if (this.detailTab === 'everyone') this.detailTab = 'timeline'; return; }
                const meta = group.meta, key = this.coffeeCommKey(meta.roaster, meta.name), st = this.coffeeCommState();
                if (st.key !== key) Object.assign(st, { key, roaster: meta.roaster || '', name: meta.name || '', events: [], summary: null, next: null, error: '', at: 0, loading: false });
            },

            async loadCoffeeCommunity(more) {
                const st = this.coffeeCommState();
                if (st.loading || !st.key || !this.acctOn() || !Supa.ready()) return;
                if (more && !st.next) return;
                const key = st.key;
                st.loading = true; st.error = '';
                this.renderCoffeeCommunity();
                try {
                    const out = await Supa.rpc('coffee_community', { coffee_roaster: st.roaster, coffee_name: st.name, before: more ? st.next : null, max_items: more ? 10 : 30 });   // v15.1: enough for a flavor shape
                    if (st.key !== key) return;   // they moved on to another coffee
                    const events = Array.isArray(out && out.events) ? out.events : [];
                    st.events = more ? st.events.concat(events) : events;
                    if (!more) st.summary = out && out.summary ? out.summary : null;
                    st.next = out && out.next ? out.next : null;
                    st.at = Date.now();
                } catch (e) {
                    if (st.key === key) st.error = /fetch|network|load failed/i.test(String(e && e.message)) ? 'Couldn\'t load. Check your connection.' : 'Couldn\'t load this. Try again in a moment.';
                } finally {
                    if (st.key === key) st.loading = false;
                    // v15.1: they join the app beside your circle's (likes and comments work; never your library or goals)
                    if (st.key === key && st.at) { try { this.process(this.cloud.events); } catch (e) { /* drawn from the list then */ } }
                    this.renderCoffeeCommunity();
                    if (st.key === key && this.lensEveryoneLoaded) this.lensEveryoneLoaded(st);
                }
            },

            // the tab: loads the first time (and again after a few minutes)
            showCoffeeCommunity() {
                const st = this.coffeeCommState();
                if (!st.loading && (!st.at || Date.now() - st.at > 5 * 60000)) this.loadCoffeeCommunity(false);
                else this.renderCoffeeCommunity();
            },

            coffeeCommTime(method, t) {
                const n = this.num(t);
                if (!(n > 0)) return '';
                if (method === 'Cold Brew') return `${this.fmtNum(n, 1)} h`;
                return method === 'Espresso' || !method ? `${Math.round(n)} s` : this.clock(n);
            },

            // how it's usually brewed: one line per method (the middle ratio, time and dose of everyone's sessions)
            coffeeCommMethodsHtml(methods) {
                if (!methods.length) return '';
                const nb = t => t.replace(/ (g|s|h)$/, '\u00a0$1');
                return `<div class="cc-methods"><div class="cc-cap">How it's usually brewed</div>${methods.slice(0, 4).map(m => {
                    const nums = [m.ratio ? `1:${this.fmtNum(m.ratio, 1)}` : '', nb(this.coffeeCommTime(m.method, m.time)), m.dose ? nb(`${this.fmtNum(m.dose, 1)} g`) : ''].filter(Boolean);
                    return `<div class="cc-m"><span class="cc-m-name"><b>${this.esc(m.method)}</b><small>${m.n} session${m.n === 1 ? '' : 's'}</small></span><span class="cc-m-nums">${this.esc(nums.join(' · '))}</span></div>`;
                }).join('')}</div>`;
            },

            coffeeCommRowHtml(b) {
                const who = String(b.user || b.owner || ''), color = b.actorColor || this.getUserColor(who);
                const dose = this.num(b.dose), yld = this.num(b.yield);
                const nums = [b.method || '', dose > 0 && yld > 0 ? `${this.fmtNum(dose, 1)} → ${this.fmtNum(yld, 1)} g` : '', this.coffeeCommTime(b.method, b.time)].filter(Boolean).join(' · ');
                const r = this.normalizeRating(b.rating);
                const note = String(b.notes || '').replace(/\s+/g, ' ').trim();
                return `<button type="button" class="cc-row" data-profile="${this.esc(who)}">${this.personDotHtml(who, color)}<span class="cc-row-main"><span class="cc-row-top"><b>${this.esc(who)}</b><small>${this.esc(this.formatRelativeDate(b.date))}</small></span><span class="cc-row-nums">${this.esc(nums)}${r > 0 ? ` <span class="cc-star">★ ${this.esc(this.fmtNum(r, 1))}</span>` : ''}</span>${note ? `<span class="cc-row-note">${this.esc(note.length > 140 ? note.slice(0, 137).replace(/\s+\S*$/, '') + '…' : note)}</span>` : ''}</span></button>`;
            },

            renderCoffeeCommunity() {
                const pane = document.getElementById('d-everyone-pane');
                if (!pane || this.detailTab !== 'everyone') return;
                const st = this.coffeeCommState(), s = st.summary;
                const brews = st.events.filter(e => e && e.type === 'brew' && !this.reported(e.id));
                let body;
                if (st.error && !brews.length) body = `<p class="pp-empty">${this.esc(st.error)}</p>`;
                else if (!st.at && st.loading) body = this.loadingBlockHtml();
                else if (!brews.length) body = '<p class="pp-empty">Nobody else has shared a session on this coffee yet.</p>';
                else {
                    const notes = s && Array.isArray(s.notes) ? s.notes.map(n => String(n).replace(/^./, c => c.toUpperCase())) : [];
                    body = `${s ? this.coffeeCommMethodsHtml(Array.isArray(s.methods) ? s.methods : []) : ''}
                        ${notes.length ? `<p class="cc-notes"><span>Tasted most</span>${this.esc(notes.join(' · '))}</p>` : ''}
                        <div class="cc-list">${brews.map(b => this.coffeeCommRowHtml(b)).join('')}</div>
                        ${st.next ? `<button type="button" class="btn-outline cc-more" onclick="app.loadCoffeeCommunity(true)"${st.loading ? ' disabled' : ''}>${st.loading ? 'Loading…' : 'More'}</button>` : ''}`;
                }
                const line = s && s.sessions ? [`${s.people} ${s.people === 1 ? 'person' : 'people'}`, `${s.sessions} session${s.sessions === 1 ? '' : 's'}`, s.rating ? `★ ${this.fmtNum(s.rating, 1)} average` : ''].filter(Boolean).join(' · ') : 'Sessions other people shared with Everyone.';
                pane.innerHTML = `<div class="sweet-card cc-wrap"><div class="sw-head"><h3>Everyone on this coffee</h3><p>${this.esc(line)}</p></div>${body}</div>`;
            },
