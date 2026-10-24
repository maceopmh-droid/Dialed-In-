            // ===================== v16.9: the Shot Logger in the app =====================
            // A GaggiMate kit on your Gaggia sends each shot to Dialed In as a draft (supabase/api.sql, "the Shot Logger").
            // Here: the "Taste and rate" popup when the app opens or comes back (board 8b of the machine-screen canvas), the
            // Log filled in from the shot, Drafts on your profile, and a Shot tab with the graph on your posted machine
            // shots. Drafts and graphs are yours alone. The contract with the machine side: claude/shot-logger-app-handoff.md.
            SHOT_ASK_HOURS: 12,   // the popup asks about shots from the last 12 hours (older ones wait in Drafts)

            shotsOn() { return Boolean(this.acctOn && this.acctOn() && typeof Supa !== 'undefined' && Supa.ready && Supa.ready() && this.user); },

            // after every sync (and when the app comes back to the front): look for new drafts, at most every 20 seconds
            checkShotDrafts() {
                if (!this.shotsOn()) return;
                if (!this._shotBound && typeof document !== 'undefined') {
                    this._shotBound = true;
                    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._shotBackAt = Date.now(); });
                }
                const back = (this._shotBackAt || 0) > (this._shotAt || 0);
                if (!back && Date.now() - (this._shotAt || 0) < 20000) { this.maybeAskShot(); return; }
                this.loadShotDrafts();
            },

            async loadShotDrafts() {
                if (!this.shotsOn() || this._shotLoading) return;
                this._shotLoading = true;
                const before = JSON.stringify((this.shotDrafts || []).map(d => d.id + (d.asked ? '+' : '')));
                try {
                    const r = await Supa.rpc('my_shots', { max_items: 30 });
                    this.shotDrafts = (r && Array.isArray(r.drafts)) ? r.drafts : [];
                    this.shotDraftCount = (r && r.count) || this.shotDrafts.length;
                    this._shotAt = Date.now();
                } catch (e) {
                    this._shotAt = Date.now();   // (a database without the Shot Logger yet: nothing to show)
                } finally { this._shotLoading = false; }
                if (JSON.stringify((this.shotDrafts || []).map(d => d.id + (d.asked ? '+' : ''))) !== before && this.tab === 'profile' && (!this.profileUser || this.profileUser === this.user)) this.render();
                this.maybeAskShot();
            },

            shotDraft(id) { return (this.shotDrafts || []).find(d => String(d.id) === String(id)) || null; },

            // only the newest draft (the rest are "N more in Drafts"), if it's from the last 12 hours and you haven't answered
            // it yet, once nothing else is on screen
            maybeAskShot() {
                if (!this.shotsOn() || typeof document === 'undefined' || document.hidden) return;
                this._shotAsked = this._shotAsked || new Set();
                const due = (this.shotDrafts || [])[0];
                if (!due || due.asked || this._shotAsked.has(String(due.id)) || !(Date.now() - this.toTime(due.brewedAt) < this.SHOT_ASK_HOURS * 3600e3)) return;
                const busy = document.getElementById('boot-screen') || document.getElementById('shot-ask') || this.tour || !this.updateIdle();   // (nothing open, no typing, no tour)
                if (busy) { clearTimeout(this._shotRetry); this._shotRetry = setTimeout(() => this.maybeAskShot(), 2500); return; }
                this.openShotAsk(due);
            },

            // "From your Gaggia": the machine's name without its owner ("Maceo's Gaggia" → "Gaggia")
            shotMachineWord(d) {
                const n = String((d && d.machine) || '').trim();
                return n.replace(/^.*?['’]s\s+/i, '') || n || 'machine';
            },
            shotAgo(t) {
                const ms = Date.now() - this.toTime(t);
                if (!(ms >= 0)) return '';
                const m = Math.floor(ms / 60000);
                if (m < 1) return 'just now';
                if (m < 60) return `${m} min ago`;
                const h = Math.floor(m / 60);
                if (h < 24) return `${h} hr ago`;
                return this.formatRelativeDate(t);
            },
            shotNum(v, unit) { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? '–' : `${n.toFixed(1)}${unit ? ' ' + unit : ''}`; },
            shotPeak(shot) {
                const p = Number(shot && shot.peak_bar);
                if (Number.isFinite(p) && p > 0) return p;
                const list = ((shot && shot.samples && shot.samples.pressure_bar) || []).map(Number).filter(Number.isFinite);
                return list.length ? Math.max(...list) : 0;
            },

            // ---- the shot graph: pressure (bar) and flow into the cup (g/s) on one 0-10 scale, gridlines at 3, 6 and 9, the
            // recipe's planned pressure dotted, dashed lines where phases change. The same rules as the machine's screen.
            shotGraphSvg(shot, o = {}) {
                const s = (shot && shot.samples) || {}, t = Array.isArray(s.t_s) ? s.t_s.map(Number) : [];
                const n = t.length;
                if (n < 2) return '';
                const axes = Boolean(o.axes), W = o.w || 302, H = o.h || 84;
                const L = axes ? 30 : 6, R = 8, T = 8, B = axes ? 26 : 6;
                const end = t[n - 1], xMax = Math.max(40, Math.ceil((end + 0.5) / 10) * 10);
                const X = v => +(L + (Math.max(0, Math.min(xMax, v)) / xMax) * (W - L - R)).toFixed(1);
                const Y = v => +((H - B) - (Math.max(0, Math.min(10, v)) / 10) * (H - B - T)).toFixed(1);
                const step = Math.max(1, Math.ceil(n / 320)), idx = [];
                for (let i = 0; i < n; i += step) idx.push(i);
                if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
                const lines = (arr, cls) => {   // a break wherever the list has no value (the plan has none during the fill)
                    if (!Array.isArray(arr) || arr.length !== n) return '';
                    const runs = []; let cur = [];
                    idx.forEach(i => { const v = arr[i]; if (v === null || v === undefined || !Number.isFinite(Number(v))) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(`${X(t[i])},${Y(Number(v))}`); });
                    if (cur.length > 1) runs.push(cur);
                    return runs.map(r => `<polyline class="${cls}" points="${r.join(' ')}"></polyline>`).join('');
                };
                const bare = Boolean(o.bare);   // (the tiny one in Drafts: just the two lines on a baseline)
                const grid = bare ? `<line class="sg-base" x1="${L}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}"></line>` : [3, 6, 9].map(v => `<line class="sg-grid${v === 9 ? ' top' : ''}" x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}"></line>`).join('') + `<line class="sg-base" x1="${L}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}"></line>`;
                const phases = !bare && Array.isArray(shot.phases) ? shot.phases : [];
                const cuts = phases.slice(1).map(p => Number(p.start_s)).concat(axes && phases.length ? [Number(phases[phases.length - 1].end_s)] : []).filter(v => Number.isFinite(v) && v > 0 && v < xMax);
                const phaseLines = [...new Set(cuts)].map(v => `<line class="sg-phase" x1="${X(v)}" y1="${T - 2}" x2="${X(v)}" y2="${Y(0)}"></line>`).join('');
                const labels = axes ? [3, 6, 9].map(v => `<text class="sg-ylab" x="${L - 8}" y="${Y(v) + 4}">${v}</text>`).join('')
                    + `<text class="sg-xlab" x="${L}" y="${H - 6}" text-anchor="middle">0</text><text class="sg-xlab" x="${X(xMax / 2)}" y="${H - 6}" text-anchor="middle">${xMax / 2}</text><text class="sg-xlab" x="${W - R}" y="${H - 6}" text-anchor="end">${xMax} s</text>` : '';
                const flows = (s.flow_gs || []).map(Number).filter(Number.isFinite);
                const label = `Shot curve: pressure peaked at ${this.shotPeak(shot).toFixed(1)} bar${flows.length ? `, flow into the cup up to ${Math.max(...flows).toFixed(1)} grams a second` : ''}, ${end.toFixed(1)} seconds`;
                return `<svg class="shot-graph${axes ? ' axes' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.esc(label)}">${grid}${phaseLines}${labels}${bare ? '' : lines(s.plan_bar, 'sg-plan')}${lines(s.pressure_bar, 'sg-p')}${lines(s.flow_gs, 'sg-f')}</svg>`;
            },
            shotKeyHtml(shot) {
                return `<div class="shot-key"><span><i class="sk-p"></i>Pressure, peak ${this.shotPeak(shot).toFixed(1)} bar</span><span><i class="sk-f"></i>Flow</span></div>`;
            },
            shotStatsHtml(d) {
                const s = d.shot || {};
                const cell = (v, l) => `<div class="ss-cell"><b>${this.esc(v)}</b><span>${l}</span></div>`;
                return `<div class="shot-stats">${cell(this.shotNum(s.dose_g, 'g'), 'In')}${cell(this.shotNum(s.yield_g, 'g'), 'Out')}${cell(this.shotNum(s.time_s, 's'), 'Time')}${cell(d.grind || s.grind || '–', 'Grind')}</div>`;
            },

            // ---- the popup (board 8b): taste and rate, post as is, or later
            openShotAsk(d) {
                if (!d || typeof document === 'undefined') return;
                this._shotAsked = this._shotAsked || new Set();
                this._shotAsked.add(String(d.id));
                this.closeShotAsk();
                const more = (this.shotDrafts || []).filter(x => String(x.id) !== String(d.id)).length;
                const id = this.escJs(String(d.id));
                const el = document.createElement('div');
                el.id = 'shot-ask';
                el.className = 'shot-ask';
                el.innerHTML = `<div class="sa-card" role="dialog" aria-modal="true" aria-labelledby="sa-title">
                    <div class="sa-top"><span class="sa-from"><svg class="icon" aria-hidden="true"><use href="#i-coffee"/></svg>From your ${this.esc(this.shotMachineWord(d))} · ${this.esc(this.shotAgo(d.brewedAt))}</span>
                        <button type="button" class="sa-x" aria-label="Close and save for later" onclick="app.shotLater('${id}')"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button></div>
                    <h2 id="sa-title" class="sa-title">Taste and rate your ${this.esc(d.coffee || 'espresso')} shot</h2>
                    <div class="sa-graph">${this.shotGraphSvg(d.shot)}</div>
                    ${this.shotStatsHtml(d)}
                    ${this.shotKeyHtml(d.shot)}
                    <button type="button" class="btn-primary sa-rate" onclick="app.tasteShot('${id}')">Taste and rate</button>
                    <div class="sa-row"><button type="button" class="sa-btn" onclick="app.postShotAsIs('${id}')">Post as is</button><button type="button" class="sa-btn" onclick="app.shotLater('${id}')">Later</button></div>
                    <p class="sa-help">Later saves it to Drafts on your profile.${more ? `<br>${more} more in Drafts.` : ''}</p>
                </div>`;
                el.addEventListener('click', e => { if (e.target === el) this.shotLater(String(d.id)); });   // (a tap outside it is Later, like the X)
                document.body.appendChild(el);
                requestAnimationFrame(() => el.classList.add('on'));
                if (this.haptic) this.haptic('tick');
            },
            closeShotAsk() {
                const el = typeof document !== 'undefined' ? document.getElementById('shot-ask') : null;
                if (el) el.remove();
            },

            // Later (or the X): it stays in Drafts and isn't asked about again
            shotLater(id) {
                this.closeShotAsk();
                const d = this.shotDraft(id);
                if (d) d.asked = true;
                if (this.shotsOn()) Supa.rpc('shot_later', { shot_id: String(id) }).catch(() => {});
            },

            // Post as is: a session with the machine's numbers only (no stars, no tasting)
            async postShotAsIs(id) {
                this.closeShotAsk();
                try {
                    await Supa.rpc('post_shot', { shot_id: String(id) });
                    this.shotDrafts = (this.shotDrafts || []).filter(d => String(d.id) !== String(id));
                    this.showToast('Posted to your sessions.');
                    this.sync({ silent: true });
                    if (this.tab === 'profile') this.render();
                } catch (e) {
                    this.showToast('Couldn\'t post it just now. It\'s still in Drafts.');
                }
            },

            // Taste and rate: the Log, filled in from the shot (coffee, Espresso, dose, yield, time, grind, and the stars and
            // sliders when it was rated on the machine); saving it posts the draft as this session
            tasteShot(id) {
                const d = this.shotDraft(id);
                if (!d) { this.showToast('That shot isn\'t in Drafts any more.'); return; }
                if (document.getElementById('shot-ask')) this.shotLater(id);   // (from the popup: answered, so it doesn't ask again; backing out of the Log leaves it in Drafts)
                const bean = this.beans.get(String(d.beanId || ''));
                if (!bean) { this.showToast('That shot\'s coffee isn\'t on your shelf. Add the coffee, then try again.'); return; }
                this.openFeedTarget(d.beanId, '', false);   // its coffee's page underneath, where the session lands
                this.activeId = String(d.beanId);
                const s = d.shot || {}, r = s.rating && typeof s.rating === 'object' ? s.rating : null, taste = (r && r.taste) || {};
                const prefill = { method: 'Espresso', grind: d.grind || '', dose: s.dose_g ?? '', yield: s.yield_g ?? '', time: s.time_s ?? '', notes: '', flavors: [] };
                TASTE_KEYS.forEach(k => { if (Number.isFinite(Number(taste[k]))) prefill[k] = Number(taste[k]); });
                if (Object.keys(taste).length) prefill.tasted = TASTE_KEYS.filter(k => Number.isFinite(Number(taste[k])));
                this.openBrewModal(prefill);
                const form = this.getBrewForm();
                if (!form) return;
                form.elements.id.value = 'shot_' + d.id;
                this.shotLogHead(d);
                if (r && Number(r.stars) > 0) { form.rating.value = this.normalizeRating(r.stars); this.updateRatingDisplay(form.rating.value); }
                const rec = s.recipe && typeof s.recipe === 'object' ? s.recipe : {};
                const temp = Number.isFinite(Number(s.temp_c)) ? Number(s.temp_c) : (Number.isFinite(Number(rec.temp_c)) ? Number(rec.temp_c) : null);
                this._shotForm = { id: 'shot_' + d.id, date: d.brewedAt, extras: Object.fromEntries(Object.entries({
                    shotId: String(d.id), temp, machineRecipe: rec.name || null, peakBar: Number.isFinite(Number(s.peak_bar)) ? Number(s.peak_bar) : null,
                    targetYield: Number.isFinite(Number(s.target_yield_g)) ? Number(s.target_yield_g) : null, machine: d.machine || null }).filter(([, v]) => v !== null && v !== '')) };
            },
            // the top of the Log for a machine shot: where it came from and its curve, in place of the timer (it's already timed)
            shotLogHead(d) {
                const modal = document.getElementById('brew-modal'), title = document.getElementById('brew-modal-title');
                if (!modal || !title) return;
                const s = d.shot || {}, rec = s.recipe && typeof s.recipe === 'object' ? s.recipe : {};
                const temp = Number.isFinite(Number(s.temp_c)) ? Number(s.temp_c) : Number(rec.temp_c);
                const when = new Date(this.toTime(d.brewedAt));
                const at = Number.isFinite(when.getTime()) ? when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
                const bits = [`From your ${this.esc(this.shotMachineWord(d))}`, rec.name ? this.esc(rec.name) : '', Number.isFinite(temp) ? `${Math.round(temp)}°C` : '', at ? `pulled ${this.esc(at)}` : ''].filter(Boolean).join(' · ');
                title.innerText = 'Taste and rate';
                modal.classList.add('from-shot');
                title.insertAdjacentHTML('afterend', `<div class="shot-log-head"><div class="slh-from">${bits}</div>${this.shotGraphSvg(s)}${this.shotKeyHtml(s)}</div>`);
            },
            clearShotLogHead() {
                if (typeof document === 'undefined') return;
                document.querySelectorAll('#brew-modal .shot-log-head').forEach(el => el.remove());
                const modal = document.getElementById('brew-modal');
                if (modal) modal.classList.remove('from-shot');
            },

            // (handleBrewSubmit) a new session from a machine shot keeps the shot's time and details, and leaves Drafts
            applyShotForm(payload, id, existing) {
                if (existing && existing.shotId && payload.temp === undefined && existing.temp !== undefined) payload.temp = existing.temp;   // (editing one later: the Log has no temperature for espresso)
                const f = this._shotForm;
                if (!f || existing || f.id !== id) return;
                payload.date = f.date || payload.date;
                Object.assign(payload, f.extras);
                this._shotForm = null;
                this.shotDrafts = (this.shotDrafts || []).filter(d => 'shot_' + d.id !== id);
            },

            // delete a draft (a late retry from the machine won't bring it back)
            async dismissShot(id, event) {
                if (event) event.stopPropagation();
                const keep = this.shotDrafts || [];
                this.shotDrafts = keep.filter(d => String(d.id) !== String(id));
                this.render();
                try { await Supa.rpc('dismiss_shot', { shot_id: String(id) }); this.showToast('Draft deleted.'); }
                catch (e) { this.shotDrafts = keep; this.render(); this.showToast('Couldn\'t delete it just now.'); }
            },

            // ---- Drafts, on your own profile (above your sessions): each with its coffee, when, the numbers and a tiny curve
            renderShotDraftsCard() {
                const list = this.shotsOn() ? (this.shotDrafts || []) : [];
                if (!list.length) return '';
                const rows = list.map(d => {
                    const s = d.shot || {}, id = this.escJs(String(d.id));
                    const num = v => Number.isFinite(Number(v)) && v !== null && v !== '' ? this.fmtNum(Number(v)) : '';
                    const bits = [this.shotAgo(d.brewedAt), num(s.dose_g) && num(s.yield_g) ? `${num(s.dose_g)} → ${num(s.yield_g)} g` : '', num(s.time_s) ? `${num(s.time_s)} s` : ''].filter(Boolean)
                        .map(t => `<span class="sd-bit">${this.esc(t)}</span>`).join(' · ');   // (each piece stays whole if the line wraps)
                    return `<div class="sd-row"><button type="button" class="sd-open" onclick="app.tasteShot('${id}')" aria-label="Taste and rate your ${this.esc(d.coffee || 'espresso')} shot">
                        <span class="sd-curve">${this.shotGraphSvg(s, { w: 56, h: 30, bare: true })}</span>
                        <span class="sd-main"><b>${this.esc(d.coffee || 'Espresso')}</b><span>${bits}</span></span></button>
                        <button type="button" class="sd-del" aria-label="Delete this draft" onclick="app.dismissShot('${id}', event)"><svg class="icon" aria-hidden="true"><use href="#i-trash-2"/></svg></button></div>`;
                }).join('');
                return `<div class="profile-card shot-drafts"><div class="label">Drafts <span class="sd-count">${Math.max(list.length, this.shotDraftCount || 0)}</span></div>${rows}</div>`;
            },

            // ---- the Shot tab on your posted machine shots: the graph, its key and how each phase went
            hasShotPane(brew) { return Boolean(brew && brew.shotId && this.shotsOn() && this.getBrewOwner(brew) === this.user); },
            renderShotPane(brew) {
                const active = this.cardTab(brew) === 'shot' ? ' active' : '';
                const id = String(brew.id), c = (this._shotCurves || {})[id];
                if (c === undefined) {
                    this.loadShotCurve(brew);
                    return `<div class="card-pane pane-block log-wide${active}" data-pane="shot">${this.loadingBlockHtml('shot-wait', 'Loading the shot…')}</div>`;
                }
                if (!c) return `<div class="card-pane pane-block log-wide${active}" data-pane="shot"><div class="vs-empty">This shot's graph isn't available.</div></div>`;
                const ph = Array.isArray(c.phases) ? c.phases : [];
                const table = ph.length ? `<div class="shot-phases">${ph.map(p => {
                    const dur = Number(p.end_s) - Number(p.start_s);
                    return `<div class="sp-row"><span>${this.esc(p.name || 'Phase')}</span><span>${Number.isFinite(dur) ? dur.toFixed(1) + ' s' : '–'}</span><span>${this.esc(p.ended_by || '')}</span></div>`;
                }).join('')}</div>` : '';
                const rec = c.recipe && c.recipe.name ? `<div class="shot-recipe">${this.esc(c.recipe.name)}${Number.isFinite(Number(c.temp_c || c.recipe.temp_c)) ? ` · ${Math.round(Number(c.temp_c || c.recipe.temp_c))}°C` : ''}</div>` : '';
                return `<div class="card-pane pane-block log-wide${active}" data-pane="shot"><div class="shot-pane">${rec}${this.shotGraphSvg(c, { axes: true, w: 330, h: 150 })}${this.shotKeyHtml(c)}${table}</div></div>`;
            },
            async loadShotCurve(brew) {
                const id = String(brew.id);
                this._shotCurves = this._shotCurves || {};
                if (this._shotCurveLoading && this._shotCurveLoading.has(id)) return;
                (this._shotCurveLoading = this._shotCurveLoading || new Set()).add(id);
                let shot = null;
                try { const r = await Supa.rpc('shot_for_session', { session_ref: id }); shot = r && r.shot ? r.shot : null; }
                catch (e) { shot = null; }
                this._shotCurveLoading.delete(id);
                this._shotCurves[id] = shot;
                if (typeof document === 'undefined') return;
                if (this.dirtyKeys) this.dirtyKeys(`session:${id}`, `log-${id}`);
                document.querySelectorAll(`[data-card-brew="${CSS.escape(id)}"] [data-pane="shot"]`).forEach(pane => { const el = this.htmlEl(this.renderShotPane(brew)); pane.replaceWith(el); });
            },
