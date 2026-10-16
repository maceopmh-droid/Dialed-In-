            // ---- grind settings can be numbers or letters ("10.4", "3B", "Click 18")
            grindText(v) {
                if (v === null || v === undefined) return '';
                const t = String(v).trim();
                if (!t) return '';
                const n = this.grindNum(t);
                if (n !== null) return n === 0 ? '' : this.fmtNum(n, 2);
                return t.slice(0, 24);
            },

            grindNum(v) {
                const t = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
                return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
            },

            normalizeGrindInput(v) {
                return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 24);
            },

            sameGrind(a, b) {
                const na = this.grindNum(a), nb = this.grindNum(b);
                if (na !== null && nb !== null) return Math.abs(na - nb) < 0.05;
                return this.grindText(a).toLowerCase() === this.grindText(b).toLowerCase();
            },

            // ---- sliders: one tap sets a value, sideways drags slide, vertical swipes still scroll the sheet
            // ---- v12.9: the star rating slides like the taste sliders: one tap sets it, sideways drags slide it
            bindRatingSlider() {
                if (this._ratingBound) return;
                this._ratingBound = true;
                let drag = null;
                const valueAt = (track, x) => {
                    const input = track.querySelector('input');
                    const r = input.getBoundingClientRect();
                    const pos = Math.min(1, Math.max(0, (x - r.left - 13) / Math.max(1, r.width - 26)));
                    return Math.round(pos * 10) / 2;
                };
                const setFrom = (track, x) => {
                    const input = track.querySelector('input');
                    if (!input) return;
                    const v = valueAt(track, x);
                    if (Number(input.value) === v) return;
                    input.value = v;
                    this.updateRatingDisplay(v);
                    this.haptic('tick');
                };
                document.addEventListener('pointerdown', e => {
                    const track = e.target && e.target.closest ? e.target.closest('.rt-track') : null;
                    if (!track) return;
                    drag = { track, x: e.clientX, y: e.clientY, moved: false, horiz: false, id: e.pointerId, via: !!(e.target && e.target.classList && e.target.classList.contains('hx')) };
                }, true);
                document.addEventListener('pointermove', e => {
                    if (!drag || e.pointerId !== drag.id) return;
                    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; drag.horiz = Math.abs(dx) >= Math.abs(dy); }
                    if (drag.horiz) setFrom(drag.track, e.clientX);
                }, true);
                const end = e => {
                    if (!drag || e.pointerId !== drag.id) return;
                    if (!drag.moved && e.type === 'pointerup') {
                        if (this._hxOn && drag.via) {
                            // v12.10 (iPhone): move once the tap has landed; changing the page mid-tap can cancel the tap and its tick
                            const p = this._tapSet = { track: drag.track, x: e.clientX, set: setFrom };
                            setTimeout(() => { if (this._tapSet === p) { this._tapSet = null; p.set(p.track, p.x); } }, 450);
                        } else setFrom(drag.track, e.clientX);
                    }
                    drag = null;
                };
                document.addEventListener('pointerup', end, true);
                document.addEventListener('pointercancel', end, true);
            },

            bindTasteSliders() {
                if (this.slidersBound) return;
                this.slidersBound = true;
                let drag = null;
                const valueAt = (track, x) => {
                    const input = track.querySelector('input');
                    const r = input.getBoundingClientRect();
                    const pos = Math.min(1, Math.max(0, (x - r.left - 13) / Math.max(1, r.width - 26)));
                    return Math.round(1 + pos * 9);
                };
                const setFrom = (track, x) => {
                    const input = track.querySelector('input');
                    if (!input) return;
                    const v = valueAt(track, x);
                    if (String(input.value) !== String(v) || !this.tasteTouched.has(input.name)) { input.value = v; this.onTasteInput(input.name, v); }
                };
                document.addEventListener('pointerdown', e => {
                    const track = e.target && e.target.closest ? e.target.closest('#brew-modal .ns-track') : null;
                    if (!track) return;
                    drag = { track, x: e.clientX, y: e.clientY, moved: false, horiz: false, id: e.pointerId, via: !!(e.target && e.target.classList && e.target.classList.contains('hx')) };
                }, true);
                document.addEventListener('pointermove', e => {
                    if (!drag || e.pointerId !== drag.id) return;
                    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; drag.horiz = Math.abs(dx) >= Math.abs(dy); }
                    if (drag.horiz) setFrom(drag.track, e.clientX);
                }, true);
                const end = e => {
                    if (!drag || e.pointerId !== drag.id) return;
                    if (!drag.moved && e.type === 'pointerup') {
                        if (this._hxOn && drag.via) {
                            // v12.10 (iPhone): move once the tap has landed; changing the page mid-tap can cancel the tap and its tick
                            const p = this._tapSet = { track: drag.track, x: e.clientX, set: setFrom };
                            setTimeout(() => { if (this._tapSet === p) { this._tapSet = null; p.set(p.track, p.x); } }, 450);
                        } else setFrom(drag.track, e.clientX);
                    }
                    drag = null;
                };
                document.addEventListener('pointerup', end, true);
                document.addEventListener('pointercancel', end, true);
                document.addEventListener('click', e => {
                    const tick = e.target && e.target.closest ? e.target.closest('#brew-modal .ns-ticks span') : null;
                    if (!tick) return;
                    const row = tick.closest('.ns'), input = row && row.querySelector('input');
                    if (!input) return;
                    const v = [...tick.parentNode.children].indexOf(tick) + 1;
                    input.value = v;
                    this.onTasteInput(input.name, v);
                }, true);
            },

            // ---- first shot of a coffee: no best shot to compare against yet
            firstShotContext(beanGroupKey, owner, method, excludeId) {
                const all = Array.from(this.brews.values()).filter(b => String(b.id) !== String(excludeId || ''));
                const inGroup = all.filter(b => this.groupKeyOfBrew(b) === beanGroupKey);
                let friend = null;
                inGroup.filter(b => this.getBrewOwner(b) !== owner && this.normalizeRating(b.rating) >= 3.5 && (!method || b.method === method)).forEach(b => { if (!friend || this.normalizeRating(b.rating) > this.normalizeRating(friend.rating)) friend = b; });
                const mineTop = all.filter(b => this.getBrewOwner(b) === owner && this.normalizeRating(b.rating) >= 4);
                const baseline = {};
                ['bitterness', 'acidity', 'sweetness'].forEach(k => { const vals = mineTop.map(b => this.tasteValue(b, k)).filter(v => v !== null); if (vals.length >= 2) baseline[k] = vals.reduce((s, v) => s + v, 0) / vals.length; });
                const sample = inGroup[0];
                const bean = sample ? this.beans.get(String(sample.beanId)) : null;
                return { friend, baseline, bean };
            },

            adviseFirstShot(cur, ctx = {}) {
                const v = cur.values, on = k => cur.tasted.includes(k), esp = cur.method === 'Espresso';
                const ev = [];
                let under = 0, over = 0;
                const add = (cond, side, w, text) => { if (!cond) return; if (side === 'under') under += w; if (side === 'over') over += w; ev.push({ side, text }); };
                add(on('bitterness') && v.bitterness >= 7, 'over', v.bitterness >= 9 ? 2 : 1.5, `Bitterness ${v.bitterness}`);
                add(on('acidity') && v.acidity >= 8 && !(on('sweetness') && v.sweetness >= 7), 'under', v.acidity >= 9 ? 1.5 : 1, `Acidity ${v.acidity}`);
                const notes = (cur.notes || []).map(n => String(n).toLowerCase());
                add(notes.some(n => ['sour', 'sharp', 'salty', 'grassy', 'thin'].includes(n)), 'under', 1.5, 'Tasted sour or sharp');
                add(notes.some(n => ['bitter', 'harsh', 'ashy', 'drying', 'burnt'].includes(n)), 'over', 1.5, 'Tasted bitter or harsh');
                const t = cur.time;
                if (esp && t > 0) { add(t < 22, 'under', t < 18 ? 1.5 : 1, `Ran fast (${this.fmtNum(t)} s)`); add(t > 34, 'over', t > 40 ? 1.5 : 1, `Ran slow (${this.fmtNum(t)} s)`); }
                if (cur.method === 'Pour Over' && t > 0) { add(t < 120, 'under', 0.5, `Drained fast (${this.fmtNum(t)} s)`); add(t > 270, 'over', 0.5, `Drained slow (${this.fmtNum(t)} s)`); }
                const base = ctx.baseline || {};
                if (on('bitterness') && base.bitterness !== undefined && v.bitterness - base.bitterness >= 3) { over += 0.5; ev.push({ side: 'over', text: `Your best shots sit near Bitterness ${Math.round(base.bitterness)}` }); }
                if (on('acidity') && base.acidity !== undefined && v.acidity - base.acidity >= 3) { under += 0.5; ev.push({ side: 'under', text: `Your best shots sit near Acidity ${Math.round(base.acidity)}` }); }
                if (on('sweetness') && v.sweetness <= 4) { ev.push({ side: 'off', text: `Sweetness ${v.sweetness}` }); if (under > over) under += 0.5; else if (over > under) over += 0.5; }
                const f = ctx.friend;
                const note = f ? `${this.getBrewOwner(f)}'s best shot of this coffee: ${this.recipeLine(f, false)}${this.normalizeRating(f.rating) ? ` (${this.fmtNum(this.normalizeRating(f.rating))}★)` : ''}.` : '';
                const label = s => `${s >= 3 ? 'likely' : 'possible'} · first shot of this coffee`;
                const grind = this.grindText(cur.grind);
                const dark = /dark/i.test(String(ctx.bean && ctx.bean.roast || ''));
                const out = { ok: true, ref: null, evidence: ev, note };
                if (!cur.tasted.length && !(t > 0) && !notes.length) return { ok: false, ref: null, evidence: [], head: 'Set the sliders that stood out, and you\'ll get a tip even on the first shot.', note };
                if (under >= 1.5 && over >= 1.5) return { ...out, conf: label(Math.min(under, over)), head: 'Sour and bitter at once: even out the puck before touching grind.', detail: 'That usually means channeling: part of the bed under-extracts while another part over-extracts. Check distribution and tamping.' };
                if (over >= 1.5 && over >= under * 1.5) {
                    if (esp && dark && t > 0 && t <= 32) return { ...out, conf: label(over), head: 'Bitter in a normal-length shot: for a dark roast, shorten the ratio before changing grind.', detail: `Try stopping around 1:${this.ratioOf(cur) ? Math.max(1.5, this.ratioOf(cur) - 0.3).toFixed(1) : '1.8'}, or drop the water a few degrees.` };
                    return { ...out, conf: label(over), head: 'Probably over-extracted: grind coarser.', detail: `Go one step coarser${grind ? ` than ${grind}` : ''}${esp && t > 34 ? ', and aim for about 28–30 s' : ''}.` };
                }
                if (under >= 1.5 && under >= over * 1.5) return { ...out, conf: label(under), head: 'Probably under-extracted: grind finer.', detail: `Go one step finer${grind ? ` than ${grind}` : ''}${esp && t > 0 && t < 22 ? ', and aim for about 28–30 s' : ''}.` };
                if (on('body') && on('finish') && v.body <= 3 && v.finish <= 3) return { ...out, conf: label(2), head: esp ? 'Thin and short: keep the grind, stop the shot a little earlier.' : 'Thin and short: keep the grind, use a little more coffee.', detail: 'Without a sour or bitter signal, that points to strength (ratio), not extraction.' };
                return { ...out, conf: '', head: 'Nothing points to a change yet.', detail: 'Log it, and your next shot of this coffee will be compared against your best one.' };
            },

