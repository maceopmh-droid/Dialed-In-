            // ---- the recipe card holds the recipe: coffee, water, ratio, temp, brewer (v11.1)
            parkRecipeFields() {
                const grid = document.getElementById('recipe-fields'), time = document.getElementById('fld-time');
                const dose = document.getElementById('fld-dose'), yld = document.getElementById('fld-yield'), extras = document.getElementById('method-extras');
                if (grid && time && dose && dose.parentNode !== grid) grid.insertBefore(dose, time);
                if (grid && time && yld && yld.parentNode !== grid) grid.insertBefore(yld, time);
                if (grid && extras && extras.previousElementSibling !== grid) grid.after(extras);
                if (grid) grid.classList.remove('solo');
            },

            placeRecipeFields() {
                const sDose = document.getElementById('rc-slot-dose'), sYield = document.getElementById('rc-slot-yield'), sExtras = document.getElementById('rc-slot-extras');
                const dose = document.getElementById('fld-dose'), yld = document.getElementById('fld-yield'), extras = document.getElementById('method-extras');
                if (sDose && dose) sDose.replaceWith(dose);
                if (sYield && yld) sYield.replaceWith(yld);
                if (sExtras && extras) sExtras.replaceWith(extras);
                const grid = document.getElementById('recipe-fields');
                if (grid) grid.classList.add('solo');
            },

            onMethodChange(method) {
                // v13.4: a form with nothing entered stays "nothing entered" after picking a method (its defaults don't count)
                if (this._brewSnap !== undefined && this.brewFormSnap() === this._brewSnap) setTimeout(() => { if (this._brewSnap !== undefined) this._brewSnap = this.brewFormSnap(); }, 0);
                const form = this.getBrewForm();
                // numbers a recipe filled in belong to that recipe's method: don't carry cold-brew 100/800 into a pour-over
                if (form && this.recipeId) { form.dose.value = ''; form.yield.value = ''; }
                if (this.activeMethod && this.activeMethod !== method) this.methodExtras = {};
                this.recipeId = ''; this.recipeName = ''; this.recipeSteps = null;
                this.loadEquipmentForMethod(method);
                this.applyMethodProfile(method);
                this.updateNextShotHint();
            },

            // ===================== per-method logging, recipes, Brew along (v11) =====================
            methodProfile(method) { return METHOD_PROFILES[method] || METHOD_PROFILES.Espresso; },

            extrasFrom(brew) {
                const b = brew || {};
                return { temp: b.temp || '', brewer: b.brewer || '', inverted: !!b.inverted, heat: b.heat || '', preheated: !!b.preheated };
            },

            applyMethodProfile(method) {
                const p = this.methodProfile(method);
                const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
                set('lbl-dose', p.dose); set('lbl-yield', p.yld); set('lbl-time', p.time);
                const form = this.getBrewForm();
                if (form && form.time) form.time.step = 'any';
                this.renderMethodExtras(method);
                this.renderRecipeCard(method);
                this.activeMethod = method;
            },

            renderMethodExtras(method) {
                const box = document.getElementById('method-extras');
                if (!box) return;
                const p = this.methodProfile(method), x = this.methodExtras || {};
                const field = {
                    brewer: `<div><label>Brewer</label><select name="brewer" onchange="app.methodExtras.brewer = this.value">${['', 'V60', 'Kalita Wave', 'Chemex', 'Origami', 'April', 'Orea', 'Other'].map(v => `<option value="${v}"${v === x.brewer ? ' selected' : ''}>${v || 'Choose…'}</option>`).join('')}</select></div>`,
                    temp: `<div><label>Water temp (°C)</label><input type="number" name="temp" min="0" max="212" step="any" inputmode="numeric" placeholder="94" value="${this.esc(x.temp)}" oninput="app.methodExtras.temp = this.value"></div>`,
                    heat: `<div><label>Heat</label><select name="heat" onchange="app.methodExtras.heat = this.value">${['', 'Low', 'Medium', 'High'].map(v => `<option value="${v}"${v === x.heat ? ' selected' : ''}>${v || 'Choose…'}</option>`).join('')}</select></div>`,
                    inverted: `<label class="method-check"><input type="checkbox" name="inverted"${x.inverted ? ' checked' : ''} onchange="app.methodExtras.inverted = this.checked"> Inverted</label>`,
                    preheated: `<label class="method-check"><input type="checkbox" name="preheated"${x.preheated ? ' checked' : ''} onchange="app.methodExtras.preheated = this.checked"> Hot water in the base</label>`
                };
                box.innerHTML = p.extras.map(k => field[k]).join('');
                box.hidden = !p.extras.length;
            },

            collectMethodExtras(method) {
                const p = this.methodProfile(method), x = this.methodExtras || {}, out = {};
                p.extras.forEach(k => {
                    if (k === 'temp') { const t = Number(x.temp); if (t >= 40 && t <= 100) out.temp = t; }
                    else if (k === 'inverted' || k === 'preheated') out[k] = !!x[k];
                    else if (x[k]) out[k] = String(x[k]).slice(0, 30);
                });
                if (p.recipes && this.recipeName) out.recipeName = String(this.recipeName).slice(0, 60);
                if (p.hours) out.timeUnit = 'h';
                return out;
            },

            // ---- recipes: built-in + yours (synced with your gear record)
            myRecipes(user = this.user) {
                const rec = this.gearByUser.get(String(user || ''));
                return rec && Array.isArray(rec.recipes) ? rec.recipes.filter(r => r && r.id && r.name) : [];
            },

            recipesFor(method) {
                return [...BUILTIN_RECIPES.filter(r => r.method === method), ...this.myRecipes().filter(r => r.method === method).map(r => ({ ...r, mine: true }))];
            },

            recipeById(id) { return [...BUILTIN_RECIPES, ...this.myRecipes()].find(r => String(r.id) === String(id)) || null; },

            stepPlan(steps, water) {
                let t = 0;
                return (steps || []).map(st => {
                    const start = t; t += Math.max(1, Number(st.d) || 1);
                    return { ...st, start, end: t, to: st.k === 'pour' && st.s !== undefined ? Math.round((Number(st.s) || 0) * water) : null };
                });
            },

            recipeSummary(steps, water) {
                const plan = this.stepPlan(steps, water);
                if (!plan.length) return '';
                const pours = plan.filter(s => s.k === 'pour').length;
                return `${pours} pour${pours === 1 ? '' : 's'} · done by ${this.clock(plan[plan.length - 1].end)}`;
            },

            clock(sec) { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },

            renderRecipeCard(method) {
                const card = document.getElementById('recipe-card');
                if (!card) return;
                const p = this.methodProfile(method);
                this.parkRecipeFields();
                if (!p.recipes) { card.hidden = true; card.innerHTML = ''; return; }
                const form = this.getBrewForm();
                const coffee = form ? Number(form.dose.value) : 0, water = form ? Number(form.yield.value) : 0;
                const ratio = coffee > 0 && water > 0 ? water / coffee : p.ratio;
                this.recipeRatioExact = ratio;
                if (!this.recipeSteps || this.recipeStepsFor !== method) { const first = this.recipesFor(method).find(r => r.id === this.recipeId); this.recipeSteps = first ? JSON.parse(JSON.stringify(first.steps || [])) : []; this.recipeStepsFor = method; }
                const list = this.recipesFor(method);
                const chips = list.map(r => `<button type="button" class="chip-btn" aria-pressed="${r.id === this.recipeId}" onclick="app.useRecipe('${app.escJs(r.id)}')">${this.esc(r.name)}</button>`).join('');
                const lock = this.recipeLock || 'ratio';
                const steps = this.recipeSteps || [];
                const plan = this.stepPlan(steps, water || 0);
                const stepRows = plan.map((st, i) => `<div class="rs-row"><i style="background:${(STEP_KINDS[st.k] || STEP_KINDS.wait).color}"></i><select aria-label="Step ${i + 1} kind" onchange="app.editStep(${i}, 'k', this.value)">${Object.keys(STEP_KINDS).map(k => `<option value="${k}"${k === st.k ? ' selected' : ''}>${STEP_KINDS[k].label}</option>`).join('')}</select>${st.k === 'pour' ? `<span class="rs-to"><input type="number" inputmode="numeric" min="1" value="${st.to || ''}" aria-label="Pour to grams" onchange="app.editStep(${i}, 'to', this.value)">g</span>` : '<span class="rs-to"></span>'}<span class="rs-d"><input type="number" inputmode="numeric" min="1" value="${Number(st.d) || 1}" aria-label="Seconds" onchange="app.editStep(${i}, 'd', this.value)">s</span><span class="rs-at">${this.clock(st.end)}</span><button type="button" class="rs-x" aria-label="Remove step" onclick="app.editStep(${i}, 'remove')">×</button></div>`).join('');
                const active = list.find(r => r.id === this.recipeId);
                card.hidden = false;
                card.innerHTML = `
                    <div class="rc-head"><h3>Recipe</h3>${active && active.credit ? `<span>${this.esc(active.credit)}</span>` : ''}</div>
                    ${chips ? `<div class="rc-chips">${chips}</div>` : ''}
                    <div class="rc-nums"><div id="rc-slot-dose"></div><div id="rc-slot-yield"></div><div class="rc-ratio-field"><label>Ratio</label><div class="rc-ratio-in"><span>1:</span><input type="number" id="recipe-ratio" step="0.1" min="1" inputmode="decimal" value="${this.fmtNum(ratio, 1)}" oninput="app.onRecipeInput('ratio')"></div></div></div>
                    <div id="rc-slot-extras"></div>
                    <div class="rc-lock"><span>When one changes, keep</span><div class="seg-control" role="group" aria-label="Keep fixed">${[['ratio', 'Ratio'], ['water', 'Water'], ['coffee', 'Coffee']].map(([k, l]) => `<button type="button" aria-pressed="${lock === k}" onclick="app.setRecipeLock('${app.escJs(k)}')">${l}</button>`).join('')}</div></div>
                    ${steps.length || method === 'Pour Over' ? `<details class="rc-steps"${this.stepsOpen ? ' open' : ''} ontoggle="app.stepsOpen = this.open"><summary><b>Steps</b><span>${this.esc(this.recipeSummary(steps, water || 0) || 'None yet')}</span></summary><div class="rs-list">${stepRows}</div><button type="button" class="link-btn" onclick="app.editStep(-1, 'add')">+ Add step</button></details>` : ''}
                    <div class="rc-actions">
                        ${plan.length ? '<button type="button" class="btn-primary rc-brew" onclick="app.openGuide()">Brew along</button>' : ''}
                        <button type="button" class="btn-outline rc-save" onclick="app.toggleRecipeSave(true)">Save as recipe</button>
                        ${active && active.mine ? `<button type="button" class="link-btn rc-del" onclick="app.deleteRecipe('${app.escJs(active.id)}')">Delete this recipe</button>` : ''}
                    </div>
                    <div class="rc-saveform" id="recipe-saveform" hidden><input type="text" id="recipe-name" maxlength="40" placeholder="Name this recipe"><button type="button" class="btn-primary" onclick="app.saveRecipe()">Save</button><button type="button" class="btn-outline" onclick="app.toggleRecipeSave(false)">Cancel</button></div>`;
                this.placeRecipeFields();
            },

            useRecipe(id) {
                const r = this.recipeById(id);
                const form = this.getBrewForm();
                if (!r || !form) return;
                this.recipeId = r.id; this.recipeName = r.name;
                this.recipeTyped = new Set();   // a recipe's numbers are a starting point, not measurements
                this.recipeSteps = JSON.parse(JSON.stringify(r.steps || []));
                this.recipeStepsFor = r.method;
                if (r.lock) this.recipeLock = r.lock;
                form.dose.value = this.fmtNum(r.dose, 1); form.yield.value = Math.round(r.water);
                this.methodExtras = { ...(this.methodExtras || {}), ...(r.brewer ? { brewer: r.brewer } : {}), ...(r.temp ? { temp: r.temp } : {}) };
                this.applyMethodProfile(r.method);
                this.renderTasteTip();
            },

            setRecipeLock(k) { this.recipeLock = k; this.renderRecipeCard(this.activeMethod); },

            // the locked number never changes on its own; editing it keeps the ratio
            lockMath(field, coffee, water, ratio, lock) {
                let c = coffee, w = water, r = ratio;
                if (field === 'dose') { if (lock === 'water') r = w / c; else w = c * r; }
                else if (field === 'yield') { if (lock === 'coffee') r = w / c; else c = w / r; }
                else if (field === 'ratio') { if (lock === 'water') c = w / r; else w = c * r; }
                return { c, w, r };
            },

            onRecipeInput(field) {
                const form = this.getBrewForm();
                const rIn = document.getElementById('recipe-ratio');
                if (!form || !rIn || !this.methodProfile(this.activeMethod).recipes) return;
                const c = Number(form.dose.value), w = Number(form.yield.value);
                const typed = Number(rIn.value);
                const r = field === 'ratio' ? typed : (this.recipeRatioExact > 0 && Math.abs(this.recipeRatioExact - typed) < 0.051 ? this.recipeRatioExact : typed);
                // v13.4: coffee and water you typed are measurements: typing one never rewrites the other (the ratio follows)
                if (!this.recipeTyped) this.recipeTyped = new Set();
                if (field === 'dose' || field === 'yield') this.recipeTyped.add(field);
                const other = field === 'dose' ? 'yield' : (field === 'yield' ? 'dose' : '');
                const keepOther = other && this.recipeTyped.has(other) && Number(form[other].value) > 0;
                const out = keepOther ? { c, w, r: c > 0 ? w / c : 0 } : this.lockMath(field, c, w, r, this.recipeLock || 'ratio');
                if (!(out.c > 0) || !(out.w > 0) || !(out.r > 0) || !Number.isFinite(out.c + out.w + out.r)) return;
                if (field !== 'dose' && Math.abs(out.c - c) > 1e-9) { form.dose.value = this.fmtNum(out.c, 1); this.recipeTyped.delete('dose'); }
                if (field !== 'yield' && Math.abs(out.w - w) > 1e-9) { form.yield.value = Math.round(out.w); this.recipeTyped.delete('yield'); }
                if (field !== 'ratio') rIn.value = this.fmtNum(out.r, 1);
                // keep the exact ratio implied by what's on screen, so repeated edits never drift
                const shownC = Number(form.dose.value), shownW = Number(form.yield.value);
                this.recipeRatioExact = (this.recipeLock || 'ratio') === 'ratio' && field !== 'ratio' ? out.r : (shownC > 0 && shownW > 0 ? shownW / shownC : out.r);
                this.recipeId = this.recipeId && this.recipeById(this.recipeId) ? this.recipeId : '';
                const summary = document.querySelector('#recipe-card .rc-steps summary span');
                if (summary) summary.textContent = this.recipeSummary(this.recipeSteps, Number(form.yield.value) || 0) || 'None yet';
                document.querySelectorAll('#recipe-card .rs-row').forEach((row, i) => { const st = this.stepPlan(this.recipeSteps, Number(form.yield.value) || 0)[i]; const inp = row.querySelector('.rs-to input'); if (inp && st && st.to !== null) inp.value = st.to; });
            },

            editStep(i, what, value) {
                const form = this.getBrewForm();
                const water = form ? Number(form.yield.value) || 0 : 0;
                const steps = this.recipeSteps || (this.recipeSteps = []);
                if (what === 'add') {
                    const lastPour = [...steps].reverse().find(s => s.k === 'pour');
                    steps.push({ k: 'pour', d: 10, s: lastPour ? Math.min(1, (Number(lastPour.s) || 0) + 0.2) : 0.2 });
                } else if (what === 'remove') steps.splice(i, 1);
                else if (steps[i]) {
                    if (what === 'k') { steps[i].k = value; if (value === 'pour' && steps[i].s === undefined) steps[i].s = 1; if (value !== 'pour') delete steps[i].s; }
                    if (what === 'd') steps[i].d = Math.max(1, Math.min(3600, Math.round(Number(value) || 1)));
                    if (what === 'to' && water > 0) steps[i].s = Math.max(0, Math.min(2, (Number(value) || 0) / water));
                }
                this.recipeId = '';
                this.stepsOpen = true;
                this.renderRecipeCard(this.activeMethod);
            },

            toggleRecipeSave(open) {
                const f = document.getElementById('recipe-saveform');
                if (!f) return;
                f.hidden = !open;
                if (open) { const n = document.getElementById('recipe-name'); if (n) { n.value = ''; n.focus(); } }
            },

            pushGearWith(extra) {
                if (!this.user) return;
                const mine = this.gearByUser.get(this.user);
                this.gearShownFor = this.user;
                this.push({
                    ...this.gearKeep(),
                    type: 'gear', id: `gear-${this.user}`, user: this.user, owner: this.user,
                    items: this.gearItemsFor(mine ? mine.items : this.equipment),
                    lastByMethod: (mine && mine.lastByMethod && typeof mine.lastByMethod === 'object') ? mine.lastByMethod : (this.lastEquipment || {}),
                    recipes: this.myRecipes(),
                    ...this.roasterCarry(),
                    ...extra
                });
            },

            saveRecipe() {
                const form = this.getBrewForm();
                const nameEl = document.getElementById('recipe-name');
                const name = nameEl ? nameEl.value.trim().slice(0, 40) : '';
                if (!form || !name) { if (nameEl) nameEl.focus(); return; }
                const method = this.activeMethod;
                const coffee = Number(form.dose.value), water = Number(form.yield.value);
                if (!(coffee > 0) || !(water > 0)) { this.showToast('Set the coffee and water first.'); return; }
                const x = this.methodExtras || {};
                const recipe = { id: `r-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name, method, dose: Math.round(coffee * 10) / 10, water: Math.round(water), lock: this.recipeLock || 'ratio', steps: JSON.parse(JSON.stringify(this.recipeSteps || [])), ...(x.brewer ? { brewer: x.brewer } : {}), ...(Number(x.temp) ? { temp: Number(x.temp) } : {}) };
                const list = this.myRecipes().filter(r => r.name.toLowerCase() !== name.toLowerCase() || r.method !== method);
                this.pushGearWith({ recipes: [...list, recipe].slice(-30) });
                this.recipeId = recipe.id; this.recipeName = name;
                this.toggleRecipeSave(false);
                this.renderRecipeCard(method);
                this.showToast(`Saved "${name}"`);
            },

            deleteRecipe(id) {
                if (!confirm('Delete this recipe? Sessions you logged with it stay.')) return;
                this.pushGearWith({ recipes: this.myRecipes().filter(r => String(r.id) !== String(id)) });
                this.recipeId = ''; this.recipeName = '';
                this.renderRecipeCard(this.activeMethod);
            },

            // ---- Brew along: one clock (the same timer), one instruction, the next step underneath
            guideStepAt(plan, t) {
                let i = plan.findIndex(s => t < s.end);
                if (i < 0) i = plan.length;
                return Math.max(i, Math.min(this.guideManual || 0, plan.length));
            },

            openGuide() {
                const form = this.getBrewForm();
                const water = form ? Number(form.yield.value) || 0 : 0;
                const plan = this.stepPlan(this.recipeSteps, water);
                if (!plan.length) return;
                this.guidePlan = plan;
                this.guideManual = 0;
                this.guideLastStep = -1;
                const r = this.recipeById(this.recipeId);
                document.getElementById('guide-title').textContent = r ? r.name : 'Your recipe';
                document.getElementById('guide-sub').textContent = `${this.fmtNum(Number(form.dose.value) || 0, 1)} g coffee · ${Math.round(water)} g water${this.methodExtras && this.methodExtras.brewer ? ` · ${this.methodExtras.brewer}` : ''}`;
                document.getElementById('guide-bar').innerHTML = plan.map(s => `<i style="flex:${s.end - s.start};--sc:${(STEP_KINDS[s.k] || STEP_KINDS.wait).color}"></i>`).join('');
                this.openModal('guide-modal');
                document.getElementById('guide-modal').classList.add('guide-open');
                clearInterval(this.guideTick);
                this.paintGuide();
                this.startGuideLoop();
            },

            // v15.0: the clock and the bars are painted every frame (they were every 100 ms, which stuttered on iPhone)
            startGuideLoop() {
                const token = this._guideLoop = (this._guideLoop || 0) + 1;
                const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f => setTimeout(f, 33));
                const step = () => {
                    if (token !== this._guideLoop) return;
                    const m = document.getElementById('guide-modal');
                    if (!m || !m.classList.contains('active')) return;
                    this.paintGuide();
                    raf(step);
                };
                raf(step);
            },

            paintGuide() {
                const plan = this.guidePlan || [];
                const modal = document.getElementById('guide-modal');
                if (!modal || !modal.classList.contains('active')) { clearInterval(this.guideTick); this._guideLoop = (this._guideLoop || 0) + 1; return; }
                const t = this.timerSeconds();
                const i = this.guideStepAt(plan, t);
                const done = i >= plan.length;
                const st = done ? null : plan[i], next = done ? null : plan[i + 1];
                const kind = done ? { label: 'Done', color: '#3E8F62' } : (STEP_KINDS[st.k] || STEP_KINDS.wait);
                modal.style.setProperty('--gc', kind.color);
                const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
                set('guide-clock', this.clock(Math.floor(t + 1e-6)));   // v15.0: whole seconds gone, like the log's timer and the countdown (it used to round up half a second early)
                set('guide-kind', done ? 'Done' : kind.label.toUpperCase());
                set('guide-main', done ? 'Finish & log it' : (st.k === 'pour' && st.to !== null ? `Pour to ${st.to} g` : kind.label));
                const prevTo = done ? 0 : ([...plan.slice(0, i)].reverse().find(s => s.k === 'pour' && s.to !== null) || { to: 0 }).to;
                set('guide-detail', done ? 'Stop the clock when the last drip falls.' : [st.n || '', st.k === 'pour' && st.to !== null ? `+${Math.max(0, st.to - prevTo)} g this pour` : ''].filter(Boolean).join(' · '));
                const untilEl = document.getElementById('guide-until');
                if (untilEl) {
                    const html = done ? '' : `until ${this.clock(st.end)}<small>${Math.max(0, Math.ceil(st.end - t))} s left</small>`;
                    if (untilEl.innerHTML !== html) untilEl.innerHTML = html;
                }
                set('guide-next', next ? `Next: ${next.k === 'pour' && next.to !== null ? `pour to ${next.to} g` : (STEP_KINDS[next.k] || STEP_KINDS.wait).label.toLowerCase()} at ${this.clock(next.start)}` : (done ? '' : 'Last step'));
                const fill = document.getElementById('guide-fill');
                if (fill) fill.style.transform = `scaleX(${done ? 1 : Math.max(0, Math.min(1, (t - st.start) / (st.end - st.start))).toFixed(4)})`;
                const total = plan.length ? plan[plan.length - 1].end : 1;
                const cursor = document.getElementById('guide-cursor');
                if (cursor) cursor.style.left = `${Math.min(100, (t / total) * 100).toFixed(3)}%`;
                set('guide-start', this.timer.on ? 'Pause' : (t > 0 ? 'Resume' : 'Start'));
                const left = st ? st.end - t : 99;
                modal.classList.toggle('guide-soon', !!st && this.timer.on && left <= 3 && left > 0);
                if (i !== this.guideLastStep) {
                    if (this.guideLastStep >= 0 && this.timer.on) this.guideCue(done);
                    this.guideLastStep = i;
                }
            },

            guideCue(done) {
                this.haptic(done ? 'finish' : 'cue');
                if (!this.guideSound) return;
                try {
                    const ctx = this.audioCtx || (this.audioCtx = new (window.AudioContext || window.webkitAudioContext)());
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.frequency.value = done ? 660 : 880; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
                    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3);
                } catch (e) {}
            },

            guideStartPause() {
                if (!this.timer.on && this.guideSound && !this.audioCtx) { try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
                this.toggleTimer();
                if (this.timer.on && navigator.wakeLock && (!this.wakeLock || this.wakeLock.released)) navigator.wakeLock.request('screen').then(l => { this.wakeLock = l; }).catch(() => {});
                this.paintGuide();
            },

            guideNext() {
                const i = this.guideStepAt(this.guidePlan || [], this.timerSeconds());
                this.guideManual = Math.min((this.guidePlan || []).length, i + 1);
                this.paintGuide();
            },

            toggleGuideSound(btn) {
                this.guideSound = !this.guideSound;
                if (btn) btn.setAttribute('aria-pressed', String(this.guideSound));
            },

            finishGuide() {
                if (this.timer.on) this.toggleTimer();
                const input = document.getElementById('time-input');
                if (input && this.timerSeconds() > 0) input.value = Math.round(this.timerSeconds());
                this.closeGuide();
                this.renderTasteTip();
            },

            closeGuide() {
                clearInterval(this.guideTick);
                this._guideLoop = (this._guideLoop || 0) + 1;
                if (this.wakeLock) { try { this.wakeLock.release(); } catch (e) {} this.wakeLock = null; }
                const modal = document.getElementById('guide-modal');
                if (modal) modal.classList.remove('active', 'guide-open', 'guide-soon');
            },

            // recipe line on cards, worded for the method
            metricLine(b) {
                const dose = this.num(b.dose), yld = this.num(b.yield), time = this.num(b.time);
                const grind = this.grindText(b.grind);
                if (!b.method || b.method === 'Espresso') return `${this.fmtNum(dose, 1) || 0}g / ${this.fmtNum(yld, 1) || 0}g / ${this.fmtNum(time) || 0}s / Gr ${grind || '-'}`;
                const parts = [];
                if (dose > 0 && yld > 0) parts.push(`${this.fmtNum(dose, 1)} g → ${this.fmtNum(yld, 1)} g (1:${this.fmtNum(yld / dose, 1)})`);
                if (time > 0) parts.push(b.timeUnit === 'h' || b.method === 'Cold Brew' ? `${this.fmtNum(time, 1)} h` : this.clock(time));
                if (b.brewer) parts.push(b.brewer);
                if (b.temp) parts.push(`${this.fmtNum(b.temp)}°C`);
                if (b.heat) parts.push(`${b.heat} heat`);
                if (b.inverted) parts.push('inverted');
                if (grind) parts.push(`Gr ${grind}`);
                return parts.join(' · ');
            },

