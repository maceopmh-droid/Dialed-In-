            // ===================== v21.2: drafts from the Log =====================
            // Maceo (Nov 3): "make drafts able to be saved from logs", and "if you swipe [the Log away], it should auto save it as
            // a draft". A new session you haven't saved can be kept as a draft (Save as draft, or swipe the Log away with
            // something in it), kept on this phone, and picked up later from the coffee's page (Continue draft) or your
            // profile's Drafts (next to the espresso machine's). Saving it as a session, or deleting it, clears it.
            LOG_DRAFTS_KEY: 'dialed_log_drafts',
            LOG_DRAFTS_MAX: 20,
            logDrafts() {
                try { const all = JSON.parse(safeGet(this.LOG_DRAFTS_KEY) || '{}'); return (Array.isArray(all[this.user]) ? all[this.user] : []).filter(d => d && d.id && d.beanId); }
                catch (e) { return []; }
            },
            logDraftsPut(list) {
                try { const all = JSON.parse(safeGet(this.LOG_DRAFTS_KEY) || '{}'); all[this.user] = list.slice(0, this.LOG_DRAFTS_MAX); safeSet(this.LOG_DRAFTS_KEY, JSON.stringify(all)); return true; }
                catch (e) { return false; }
            },
            logDraftsFor(beanId) { return this.logDrafts().filter(d => String(d.beanId) === String(beanId)); },

            // the Log as it stands, as a session-shaped record openBrewModal can fill back in
            logDraftFromForm() {
                const form = this.getBrewForm();
                if (!form || form.elements.id.value || !this.activeId) return null;   // (an edit of a saved session isn't a draft)
                const method = form.method.value;
                const eq = [...document.querySelectorAll('#equipment-selector .equipment-checkbox:checked')].map(cb => cb.value);
                const secs = this.timerSeconds ? Math.round(this.timerSeconds()) : 0;
                const num = k => (form[k] ? String(form[k].value || '') : '');
                let photo = this.draftPhoto || null;
                try { if (photo && JSON.stringify(photo).length > 900000) photo = null; } catch (e) { photo = null; }   // (a huge unsent picture doesn't fit on the phone's shelf)
                return {
                    id: this._draftId || `d${Date.now()}`, beanId: String(this.activeId), savedAt: new Date().toISOString(), user: this.user, owner: this.user,
                    method, grind: num('grind'), dose: num('dose'), yield: num('yield'), time: num('time') || (secs >= 1 ? String(secs) : ''),
                    acidity: num('acidity'), sweetness: num('sweetness'), body: num('body'), finish: num('finish'), balance: num('balance'), bitterness: num('bitterness'),
                    tasted: TASTE_KEYS.filter(k => this.tasteTouched && this.tasteTouched.has(k)),
                    flavors: [...(this.selFlavors || [])].filter(Boolean), flavorNotes: Object.fromEntries((this.selFlavors || []).filter(Boolean).map(n => [n, (this.noteIntensity || {})[n] || 2])),
                    notes: num('notes'), rating: num('rating'), verdict: form.verdict ? form.verdict.value : '', isMaster: !!(document.getElementById('isMasterInput') || {}).checked,
                    roastDate: form.roastDate ? String(form.roastDate.value || '') : '', equipment: eq, recipeName: this.recipeName || '',
                    ...(this.collectMethodExtras ? this.collectMethodExtras(method) : {}),
                    photo, share: this.share ? { ...this.share } : null
                };
            },

            // Save as draft (auto: the Log swiped away with something in it)
            saveLogDraft(auto = false) {
                const form = this.getBrewForm();
                if (form && form.elements.id.value) { if (!auto) this.showToast('This session is already saved. Save your changes or dismiss them.'); return false; }
                if (!auto && !this.brewFormDirty()) { this.showToast('Nothing to save yet.'); return false; }
                const d = this.logDraftFromForm();
                if (!d) return false;
                const list = this.logDrafts().filter(x => x.id !== d.id);
                if (!this.logDraftsPut([d, ...list])) { this.showToast('Couldn\'t keep the draft on this phone.'); return false; }
                this._draftId = null; this._brewSnap = undefined;
                this.closeModals();
                if (this.timer && this.resetTimer) this.resetTimer();
                if (this.haptic) this.haptic('success');
                this.showToast(auto ? 'Saved as a draft. Continue it from the coffee\'s page.' : 'Draft saved. Continue it from the coffee\'s page.');
                this.render();
                if (this.isDetailActive && this.isDetailActive() && this.renderDraftPill) this.renderDraftPill();
                return true;
            },

            // the Log swiped away: a live timer keeps it open; an edit with changes keeps it open; otherwise a draft if there's anything in it
            logSwipeAllowed() {
                const form = this.getBrewForm();
                if (this.timer && this.timer.on) { this.showToast('The timer is running. Stop it first.'); return false; }
                if (form && form.elements.id.value && this.brewFormDirty()) { this.showToast('Save your changes or tap Dismiss.'); return false; }
                return true;
            },
            logSwipeAway() {
                if (this.brewFormDirty() && this.saveLogDraft(true)) return;
                this.closeModals();
                if (this.timer && this.resetTimer) this.resetTimer();
            },

            // pick a draft up again: its coffee's page, then the Log filled in as it was
            openLogDraft(id) {
                const d = this.logDrafts().find(x => x.id === id);
                if (!d) { this.showToast('That draft isn\'t on this phone any more.'); return; }
                if (!this.beans.has(String(d.beanId))) { this.showToast('Its coffee isn\'t here any more.'); return; }
                const go = () => {
                    this.openBrewModal({ ...d, flavors: d.flavors || [] });
                    const form = this.getBrewForm();
                    if (form) {
                        if (form.bitterness && d.bitterness !== '') form.bitterness.value = d.bitterness;
                        if (form.rating) { form.rating.value = d.rating || 0; this.updateRatingDisplay(form.rating.value); }
                        if (form.verdict && d.verdict) { form.verdict.value = d.verdict; if (this.renderVerdict) this.renderVerdict(); }
                        if (form.roastDate && d.roastDate) { form.roastDate.value = d.roastDate; if (this.paintRoastDays) this.paintRoastDays(); }
                        if (this.paintTasteSliders) this.paintTasteSliders();
                    }
                    if (d.share && this.shareOpen) { try { this.shareOpen(d.share); } catch (e) {} }
                    this._draftId = d.id;
                    setTimeout(() => { this._brewSnap = this.brewFormSnap(); }, 30);   // (opened as it was saved: nothing new to keep yet)
                };
                if (String(this.activeId) === String(d.beanId) && this.isDetailActive && this.isDetailActive()) go();
                else { this.openFeedTarget(d.beanId, '', false); setTimeout(go, 350); }
            },
            deleteLogDraft(id, ev) {
                if (ev) { ev.stopPropagation(); ev.preventDefault(); }
                if (!confirm('Delete this draft?')) return;
                this.logDraftsPut(this.logDrafts().filter(x => x.id !== id));
                if (this.haptic) this.haptic('tick');
                this.render();
                if (this.isDetailActive && this.isDetailActive() && this.renderDraftPill) this.renderDraftPill();
            },
            // saved as a session: the draft it came from is done
            logDraftDone() {
                if (!this._draftId) return;
                this.logDraftsPut(this.logDrafts().filter(x => x.id !== this._draftId));
                this._draftId = null;
            },

            logDraftLine(d) {
                const n = v => (v !== '' && v != null && isFinite(Number(v)) && Number(v) > 0 ? this.fmtNum(Number(v)) : '');
                const bits = [d.method || '', n(d.dose) && n(d.yield) ? `${n(d.dose)} → ${n(d.yield)} g` : n(d.dose) ? `${n(d.dose)} g` : '', n(d.time) ? `${n(d.time)} s` : ''].filter(Boolean);
                return bits.join(' · ');
            },
            logDraftWhen(d) { return this.nlAgo ? this.nlAgo(d.savedAt) : this.shortDate(d.savedAt); },

            // the coffee's page: Continue draft, under Log a session (only when there's one for this coffee)
            renderDraftPill() {
                const host = document.getElementById('d-draft');
                if (!host) return;
                const list = this.activeId ? this.logDraftsFor(this.activeId) : [];
                host.hidden = !list.length;
                host.innerHTML = list.slice(0, 3).map(d => `<div class="ld-pill"><button type="button" class="ld-open" onclick="app.openLogDraft('${this.escJs(d.id)}')"><svg class="icon" aria-hidden="true"><use href="#i-edit-2"/></svg><span><b>Continue draft</b><small>${this.esc([this.logDraftLine(d), this.logDraftWhen(d)].filter(Boolean).join(' · '))}</small></span></button><button type="button" class="ld-del" aria-label="Delete this draft" onclick="app.deleteLogDraft('${this.escJs(d.id)}', event)"><svg class="icon" aria-hidden="true"><use href="#i-trash-2"/></svg></button></div>`).join('');
            },

            // your profile's Drafts: the Log's drafts (each with its coffee), above the espresso machine's
            logDraftRowsHtml() {
                return this.logDrafts().map(d => {
                    const bean = this.beans.get(String(d.beanId)), name = bean ? String(bean.name || '').trim() || 'Coffee' : 'Coffee';
                    return `<div class="sd-row ld-row"><button type="button" class="sd-open" onclick="app.openLogDraft('${this.escJs(d.id)}')" aria-label="Continue your ${this.esc(name)} draft"><span class="ld-ic"><svg class="icon" aria-hidden="true"><use href="#i-edit-2"/></svg></span><span class="sd-main"><b>${this.esc(name)}</b><span>${this.esc([this.logDraftWhen(d), this.logDraftLine(d)].filter(Boolean).join(' · '))}</span></span></button><button type="button" class="sd-del" aria-label="Delete this draft" onclick="app.deleteLogDraft('${this.escJs(d.id)}', event)"><svg class="icon" aria-hidden="true"><use href="#i-trash-2"/></svg></button></div>`;
                }).join('');
            },
