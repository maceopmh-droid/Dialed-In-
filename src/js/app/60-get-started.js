            // ===================== v21.0: Get started =====================
            // Maceo (Nov 3): "think of a way to help new users see all of the features like creating a community, learning etc".
            // A card at the top of Coffees › Mine for someone new (fewer than 5 sessions of their own): what Dialed In can do,
            // one tap each, ticked off as they do it (worked out from what's already on the phone, so it's right on every
            // phone). Hide it with ×; Settings, Help, Get started brings it back for anyone.
            GS_FEW: 5,
            gsItems() {
                const me = this.user, mine = b => this.getBrewOwner(b) === me;
                const myBeans = (this.buildBeanGroups ? this.buildBeanGroups() : []).filter(it => it.group && it.group.users && it.group.users.has(me));   // (what Coffees › Mine lists)
                const pd = this.ppState ? this.ppState().data : null, gl = this.grState ? this.grState().list : null;
                const flag = k => safeGet(`dialed_gs_${k}`) === '1';
                const gw = this.goalWords ? this.goalWords() : { many: 'coffees' };   // (v21.7: coffee or tea, below too)
                return [
                    { k: 'coffee', t: `Add your first ${this.drinkNow() === 'tea' ? 'tea or coffee' : 'coffee or tea'}`, s: 'The bag or tin you\'re brewing now', done: myBeans.length > 0 || [...this.brews.values()].some(mine), go: 'app.gsGo(\'coffee\')' },
                    { k: 'log', t: 'Log a session', s: 'Dose, time and how it tasted; the coach suggests your next one', done: [...this.brews.values()].some(mine), go: 'app.gsGo(\'log\')' },
                    { k: 'people', t: 'Follow people', s: 'See everyone on Dialed In and follow a few', done: !!(pd && (pd.following || []).length), go: 'app.gsGo(\'people\')', acct: true },
                    { k: 'community', t: 'Join or start a community', s: 'Friends, a café or a city, with its own weekly goal', done: !!(gl && gl.length), go: 'app.gsGo(\'community\')', acct: true },
                    { k: 'learn', t: 'Explore Learn', s: 'Varieties, processes and every coffee country', done: flag('learn'), go: 'app.gsGo(\'learn\')', coffee: true },
                    { k: 'goal', t: 'Set a goal', s: `Sessions a week, new ${gw.many}, or a rating to beat`, done: !!(this.myGoals && this.myGoals().length), go: 'app.gsGo(\'goal\')' },
                    { k: 'level', t: 'See your level', s: 'Earn crema as you brew, taste and share', done: flag('level'), go: 'app.gsGo(\'level\')' },
                ].filter(it => (!it.acct || (this.acctOn && this.acctOn())) && (!it.coffee || (this.learnOn && this.learnOn())));
            },
            gsVisible() {
                if (!this.user || this.tab !== 'my' || this.coffeeScopeNow() !== 'mine') return false;
                if (safeGet('dialed_gs_show') === '1') return true;   // brought back from Settings
                if (safeGet('dialed_gs_hide') === '1') return false;
                const mineN = [...this.brews.values()].filter(b => this.getBrewOwner(b) === this.user).length;
                if (mineN >= this.GS_FEW) return false;
                const items = this.gsItems();
                return items.some(it => !it.done);
            },
            gsCardHtml() {
                if (!this.newLook() || !this.gsVisible()) return '';
                // what the card needs to know that isn't on the phone yet (who you follow, your communities)
                if (this.acctOn && this.acctOn() && typeof Supa !== 'undefined' && Supa.ready && Supa.ready()) {
                    if (this.ppState && !this.ppState().data && !this._gsPpLoad) { this._gsPpLoad = true; this.loadPeople().then(() => this.tab === 'my' && this.render()).catch(() => {}); }
                    if (this.grState && !this.grState().list && !this._gsGrLoad) { this._gsGrLoad = true; this.loadGroups().then(() => this.tab === 'my' && this.render()).catch(() => {}); }
                }
                const items = this.gsItems(), done = items.filter(it => it.done).length, pct = Math.round(done / Math.max(1, items.length) * 100);
                const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                const rows = items.map(it => `<button type="button" class="gs-row${it.done ? ' is-done' : ''}" onclick="${it.go}"><span class="gs-dot">${it.done ? check : ''}</span><span class="gs-txt"><b>${this.esc(it.t)}</b><small>${this.esc(it.s)}</small></span><svg class="icon gs-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>`).join('');
                return `<section class="gs-card nl-box" data-fam="app" aria-label="Get started"><div class="gs-head"><div><h3>Get started</h3><p>${done} of ${items.length} done</p></div><button type="button" class="gs-x" aria-label="Hide Get started" onclick="app.gsHide()"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button></div><div class="gs-bar" role="progressbar" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${items.length}"><i style="width:${pct}%"></i></div><div class="gs-list">${rows}</div></section>`;
            },
            gsHide() { safeSet('dialed_gs_hide', '1'); safeSet('dialed_gs_show', ''); if (this.haptic) this.haptic('tick'); this.render(); this.showToast('Hidden. Settings, Help, Get started brings it back.'); },
            gsShow() {   // Settings, Help, Get started
                safeSet('dialed_gs_show', '1'); safeSet('dialed_gs_hide', '');
                this.closeModals();
                this.coffeeScope = 'mine'; this.setTab('my');
                const sc = document.getElementById('main-content'); if (sc) sc.scrollTop = 0; window.scrollTo(0, 0);
            },
            gsMark(k) { if (safeGet(`dialed_gs_${k}`) !== '1') safeSet(`dialed_gs_${k}`, '1'); },
            gsGo(k) {
                if (this.haptic) this.haptic('tick');
                const firstMine = () => { const b = [...this.brews.values()].filter(x => this.getBrewOwner(x) === this.user && this.beans.has(String(x.beanId))).sort((a, c) => String(c.date).localeCompare(String(a.date)))[0]; return b ? String(b.beanId) : ([...this.beans.keys()][0] || ''); };
                if (k === 'coffee') { this.openBeanModal(); return; }
                if (k === 'log') {
                    const id = firstMine();
                    if (!id) { this.showToast(`Add a ${this.drinkWords(this.drinkNow()).item} first, then log a session on it.`); this.openBeanModal(); return; }
                    this.openFeedTarget(id, '', false); setTimeout(() => { if (this.activeId) this.openBrewModal(); }, 350); return;
                }
                if (k === 'people') { this.openPeople(); if (this.openEveryone) this.openEveryone(); return; }
                if (k === 'community') { this.openPeople('groups'); return; }
                if (k === 'learn') { this.gsMark('learn'); this.setCoffeeScope('learn'); return; }
                if (k === 'goal') { if (this.openGoalEditor) this.openGoalEditor(); return; }
                if (k === 'level') { this.gsMark('level'); if (this.openLevel) this.openLevel(this.user); }
            },
