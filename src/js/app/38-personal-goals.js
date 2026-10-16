            // ---- v14.6: your own goals (Overview, your profile). Up to three, one of each kind: sessions a week, new coffees
            // a month, a rating to beat on one coffee. Only you see them; they ride in your gear record (goals) like favorites.
            myGoals() {
                const rec = this.gearByUser.get(String(this.user || ''));
                const list = rec && Array.isArray(rec.goals) ? rec.goals : [];
                const seen = new Set();
                return list.filter(g => g && ['week', 'coffees', 'beat'].includes(g.type) && Number(g.target) > 0 && !seen.has(g.type) && seen.add(g.type)).slice(0, 3);
            },

            saveGoals(list) {
                if (!this.user || !this.pushGearWith) return;
                this.pushGearWith({ goals: list.slice(0, 3) });
                if (this.tab === 'profile') this.render();
            },

            monthStartOf(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime(); },

            // what you usually brew in a week, over the last four (a starting target that's a stretch, not a chore)
            goalWeekGuess(now = Date.now()) {
                const W = 7 * 864e5, start = this.weekStartOf(now);
                const mine = this.brewsOf(this.user).map(b => this.localTime(b.date)).filter(Number.isFinite);
                const weeks = [1, 2, 3, 4].map(i => mine.filter(t => t >= start - i * W && t < start - (i - 1) * W).length);
                const avg = weeks.reduce((a, b) => a + b, 0) / 4;
                return Math.max(2, Math.min(14, Math.ceil(avg) + 1));
            },

            // your coffees, most brewed first (for "a rating to beat")
            goalCoffees() {
                const by = new Map();
                this.brewsOf(this.user).forEach(b => {
                    const key = this.groupKeyOfBrew(b), bean = this.beans.get(String(b.beanId || ''));
                    if (!bean) return;
                    const cur = by.get(key) || { key, name: bean.name || this.beanLabel(bean), label: this.beanLabel(bean), n: 0, best: 0 };
                    cur.n += 1; cur.best = Math.max(cur.best, this.normalizeRating(b.rating));
                    by.set(key, cur);
                });
                return [...by.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
            },

            goalProgress(g, now = Date.now()) {
                const mine = this.brewsOf(this.user);
                if (g.type === 'week') {
                    const a = this.weekStartOf(now), n = mine.filter(b => { const t = this.localTime(b.date); return t >= a && t < a + 7 * 864e5; }).length;
                    return { have: n, target: Number(g.target), done: n >= Number(g.target), title: `${g.target} session${Number(g.target) === 1 ? '' : 's'} a week`, sub: `${Math.min(n, g.target)} of ${g.target} this week` };
                }
                if (g.type === 'coffees') {
                    const a = this.monthStartOf(now), first = new Map();
                    mine.forEach(b => { const k = this.groupKeyOfBrew(b), t = this.localTime(b.date); if (Number.isFinite(t) && (!first.has(k) || t < first.get(k))) first.set(k, t); });
                    const n = [...first.values()].filter(t => t >= a && t <= now + 864e5).length;
                    return { have: n, target: Number(g.target), done: n >= Number(g.target), title: `${g.target} new coffee${Number(g.target) === 1 ? '' : 's'} a month`, sub: `${Math.min(n, g.target)} of ${g.target} this month` };
                }
                // a rating to beat on one coffee, since the goal was set
                const since = Date.parse(g.since || '') || 0;
                const best = mine.filter(b => this.groupKeyOfBrew(b) === g.key && this.localTime(b.date) >= since).reduce((m, b) => Math.max(m, this.normalizeRating(b.rating)), 0);
                const t = Number(g.target);
                return { have: best, target: t, done: best >= t, title: `${this.fmtNum(t, 1)} ★ on ${g.name || 'one coffee'}`, sub: best ? `Best since you set it: ${this.fmtNum(best, 1)} ★` : 'Not brewed since you set it' };
            },

            renderGoalsCard() {
                if (!this.user) return '';
                const goals = this.myGoals();
                if (!goals.length) {
                    return `<div class="profile-card pg-card"><div class="label">Your goals</div><div class="fab-sub">Set one of your own: sessions a week, new coffees a month, or a rating to beat on one coffee. Only you see them.</div><button type="button" class="btn-outline pp-act pg-add" onclick="app.openGoalEditor()">Add a goal</button></div>`;
                }
                const rows = goals.map(g => {
                    const p = this.goalProgress(g), pct = Math.max(0, Math.min(100, p.target ? (p.have / p.target) * 100 : 0));
                    return `<button type="button" class="pg-row${p.done ? ' is-done' : ''}" data-type="${this.esc(g.type)}" onclick="app.openGoalEditor(this.getAttribute('data-type'))"><span class="pg-top"><b>${this.esc(p.title)}</b>${p.done ? '<span class="pg-done">Done</span>' : ''}</span><span class="pg-bar"><i style="width:${pct.toFixed(1)}%"></i></span><small>${this.esc(p.sub)}</small></button>`;
                }).join('');
                return `<div class="profile-card pg-card"><div class="label">Your goals</div><div class="pg-list">${rows}</div>${goals.length < 3 ? '<button type="button" class="btn-outline pp-act pg-add" onclick="app.openGoalEditor()">Add a goal</button>' : ''}</div>`;
            },

            // the editor (one sheet): pick the kind, the number (and the coffee), save or remove
            openGoalEditor(type) {
                const m = document.getElementById('review-modal'); if (!m) return;
                const goals = this.myGoals(), have = new Set(goals.map(g => g.type));
                const kind = ['week', 'coffees', 'beat'].includes(type) ? type : ['week', 'coffees', 'beat'].find(k => !have.has(k)) || 'week';
                const cur = goals.find(g => g.type === kind);
                const coffees = this.goalCoffees();
                const pick = cur && cur.key ? coffees.find(c => c.key === cur.key) || null : coffees[0] || null;
                this._goalEdit = { type: kind, editing: Boolean(cur), key: pick ? pick.key : '', target: cur ? Number(cur.target) : kind === 'week' ? this.goalWeekGuess() : kind === 'coffees' ? 2 : Math.min(5, ((pick && pick.best) || 3) + 0.5) };
                m.querySelector('h2').textContent = 'Your goal';
                m.classList.add('active');
                this.renderGoalEditor();
            },

            renderGoalEditor() {
                const body = document.getElementById('review-body'), e = this._goalEdit; if (!body || !e) return;
                const have = new Set(this.myGoals().map(g => g.type));
                const kinds = [['week', 'Sessions a week'], ['coffees', 'New coffees a month'], ['beat', 'A rating to beat']];
                const open = kinds.filter(([k]) => !have.has(k) || k === e.type);
                const seg = e.editing || open.length < 2 ? `<p class="pg-kind">${(kinds.find(([k]) => k === e.type) || ['', ''])[1]}</p>` : `<div class="seg-control pg-kinds" role="tablist">${open.map(([k, l]) => `<button type="button" aria-pressed="${k === e.type}" onclick="app.setGoalKind('${k}')">${l}</button>`).join('')}</div>`;
                const coffees = this.goalCoffees();
                const step = e.type === 'beat' ? 0.5 : 1, min = e.type === 'beat' ? 0.5 : 1, max = e.type === 'beat' ? 5 : e.type === 'week' ? 21 : 10;
                const num = `<div class="pg-step"><button type="button" aria-label="Less" onclick="app.stepGoal(${-step}, ${min}, ${max})"${e.target <= min ? ' disabled' : ''}>−</button><b>${this.esc(e.type === 'beat' ? `${this.fmtNum(e.target, 1)} ★` : String(e.target))}</b><button type="button" aria-label="More" onclick="app.stepGoal(${step}, ${min}, ${max})"${e.target >= max ? ' disabled' : ''}>+</button></div>`;
                const sel = e.type === 'beat'
                    ? (coffees.length ? `<label class="pg-field"><span>Coffee</span><select aria-label="Coffee"  onchange="app.setGoalCoffee(this.value)">${coffees.map(c => `<option value="${this.esc(c.key)}"${c.key === e.key ? ' selected' : ''}>${this.esc(c.label)}${c.best ? ` (best ${this.fmtNum(c.best, 1)} ★)` : ''}</option>`).join('')}</select></label>` : '<p class="pp-empty">Log a session first, then pick its coffee here.</p>')
                    : '';
                const say = e.type === 'week' ? 'Sessions you log Monday to Sunday.' : e.type === 'coffees' ? 'Coffees you brew for the first time this month.' : 'Your best rating on this coffee from now on.';
                const can = e.type !== 'beat' || (coffees.length && e.key);
                body.innerHTML = `${seg}${sel}<div class="pg-field"><span>${e.type === 'beat' ? 'Rating to reach' : e.type === 'week' ? 'Sessions' : 'New coffees'}</span>${num}</div><p class="pg-say">${this.esc(say)}</p>
                    <div class="pg-actions">${e.editing ? '<button type="button" class="btn-outline pp-act acct-delete" onclick="app.removeGoal()">Remove</button>' : ''}<button type="button" class="btn-primary pp-act" onclick="app.saveGoal()"${can ? '' : ' disabled'}>${e.editing ? 'Save' : 'Set goal'}</button></div>`;
            },

            setGoalKind(k) {
                const e = this._goalEdit; if (!e) return;
                const pick = this.goalCoffees().find(c => c.key === e.key) || this.goalCoffees()[0];
                Object.assign(e, { type: k, target: k === 'week' ? this.goalWeekGuess() : k === 'coffees' ? 2 : Math.min(5, ((pick && pick.best) || 3) + 0.5) });
                this.renderGoalEditor();
            },
            setGoalCoffee(key) {
                const e = this._goalEdit; if (!e) return;
                const c = this.goalCoffees().find(x => x.key === key);
                e.key = key; if (c && !e.editing) e.target = Math.min(5, (c.best || 3) + 0.5);
                this.renderGoalEditor();
            },
            stepGoal(d, min, max) { const e = this._goalEdit; if (!e) return; e.target = Math.max(min, Math.min(max, Math.round((e.target + d) * 2) / 2)); this.renderGoalEditor(); },

            saveGoal() {
                const e = this._goalEdit; if (!e) return;
                const coffee = e.type === 'beat' ? this.goalCoffees().find(c => c.key === e.key) : null;
                if (e.type === 'beat' && !coffee) return;
                const old = this.myGoals().find(g => g.type === e.type);
                const keepSince = old && old.type === 'beat' && old.key === e.key ? old.since : '';
                const g = { type: e.type, target: e.target, ...(coffee ? { key: coffee.key, name: coffee.name, since: keepSince || new Date().toISOString() } : {}) };
                this.saveGoals([...this.myGoals().filter(x => x.type !== e.type), g].sort((a, b) => ['week', 'coffees', 'beat'].indexOf(a.type) - ['week', 'coffees', 'beat'].indexOf(b.type)));
                this.closeReview();
                this.showToast(e.editing ? 'Goal saved.' : 'Goal set.');
            },

            removeGoal() {
                const e = this._goalEdit; if (!e) return;
                this.saveGoals(this.myGoals().filter(x => x.type !== e.type));
                this.closeReview();
                this.showToast('Goal removed.');
            },
