            // ===================== v21.11: changing your name =====================
            // Maceo, Nov 14 (a new member misspelled her own name at sign-up and couldn't find a way to fix it): "please make
            // it possible to change names". Edit on the You card at the top of Settings. The server (set_name) checks the new
            // name the way sign-up does, keeps the old one as yours (nobody else can take it, and a phone still using it is
            // understood), and moves your kept awards over. This phone then starts fresh under the new name and comes back to
            // Settings; another phone signed in to the same account notices at its next launch (checkMyName).
            nameClean(v) { return String(v || '').trim().replace(/\s+/g, ' '); },
            nameProblem(n) {
                return n.length < 2 || n.length > 24 || /[<>\u0000-\u001f\u007f]/.test(n) || /^__/.test(n) || /^(unknown|undefined|null|everyone|system)$/i.test(n)
                    ? 'Use 2 to 24 characters for your name.' : '';
            },
            // the You card while editing (what's typed so far survives Settings redrawing itself underneath)
            nameEditHtml() {
                const typed = document.getElementById('acct-name-in');
                const v = typed ? typed.value : (this.user || '');
                return `<span class="acct-name-edit">
                    <input id="acct-name-in" class="acct-name-in" type="text" maxlength="24" autocomplete="nickname" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Your name" value="${this.esc(v)}"
                        oninput="app.nameSay('')" onkeydown="if(event.key==='Enter'){event.preventDefault();app.nameEditSave()}else if(event.key==='Escape'){app.nameEditCancel()}">
                    <small class="acct-name-msg" id="acct-name-msg" role="alert" hidden></small>
                    <span class="acct-name-actions"><button type="button" class="btn-outline" onclick="app.nameEditCancel()">Cancel</button><button type="button" class="btn-primary" id="acct-name-save" onclick="app.nameEditSave()">Save</button></span>
                </span>`;
            },
            nameSay(text) { const m = document.getElementById('acct-name-msg'); if (!m) return; m.hidden = !text; m.textContent = text || ''; },
            paintAcctRow() {
                const row = document.querySelector('#settings-modal .acct-row'); if (!row) return;
                const d = document.createElement('div'); d.innerHTML = this.acctSettingsHtml();
                row.replaceWith(d.firstElementChild);
                if (this.noteFaces) this.noteFaces(document.querySelector('#settings-modal .acct-row'));
            },
            nameEditOpen() {
                if (!(this.acctOn && this.acctOn()) || this._nameSaving) return;
                this._nameEdit = true; this.paintAcctRow();
                const i = document.getElementById('acct-name-in');
                if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* not a text box */ } }
            },
            nameEditCancel() { if (this._nameSaving) return; this._nameEdit = false; this.paintAcctRow(); },
            async nameEditSave() {
                if (this._nameSaving) return;
                const i = document.getElementById('acct-name-in'); if (!i) return;
                const n = this.nameClean(i.value), old = String(this.user || '');
                if (n === old) { this.nameEditCancel(); return; }
                const bad = this.nameProblem(n); if (bad) { this.nameSay(bad); i.focus(); return; }
                const btn = document.getElementById('acct-name-save');
                this._nameSaving = true; if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
                try {
                    const p = await Supa.rpc('set_name', { name: n });
                    if (!p || !p.name) throw new Error('That didn\'t work. Try again.');
                    this._nameSaving = false;
                    if (!this.adoptName(p, old, true)) { this._nameEdit = false; this.paintAcctRow(); }
                } catch (e) {
                    this._nameSaving = false;
                    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Save'; }
                    const msg = e && e.message ? String(e.message) : '';
                    this.nameSay(/taken|another name|2 to 24|a bit fast/i.test(msg) ? msg : 'That didn\'t save. Check your connection and try again.');
                }
            },
            // the server knows this account by a new name (changed here, on another phone, or by us): this phone takes it on.
            // What it keeps under the old name (your color, your picture) moves over; its copy of everything is started fresh
            // (it was written with the old name), then the app opens again. Saves still waiting to go out keep the old name:
            // the server reads them as yours.
            adoptName(p, old, here) {
                const nm = p && p.name ? String(p.name) : '', was = String(old || '');
                if (!nm || nm === was || typeof Supa === 'undefined') return false;
                const sess = Supa.session(); if (!sess) return false;
                Supa.store(Supa.SESSION, { ...sess, profile: { ...(sess.profile || {}), ...p } });
                if (Cloud.who() !== nm) { this.user = nm; return false; }   // this phone can't keep it: carry on as the new name without starting over
                if (was) {
                    const color = this.userColors && this.userColors[was];
                    if (color) this.setUserColor(nm, color, true);
                    try { const f = this.faceStore(), had = f.get(was.toLowerCase()); if (had) { f.set(nm.toLowerCase(), had); this.saveFaces(); } } catch (e) { /* no pictures kept */ }
                    try { localStorage.removeItem(`dialed_frozen_awards:${was}`); } catch (e) { /* (fetched again) */ }
                }
                this.user = nm;
                try { sessionStorage.setItem('dialed_renamed', here ? 'settings' : 'quiet'); } catch (e) { /* no note: it just opens */ }
                const go = () => location.reload();
                this.showToast(here ? `You're now ${nm}.` : `Your name is now ${nm}.`);
                Promise.race([this.idbPut(this.cacheKey(), null).catch(() => {}), new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(go, 500));
                return true;
            },
            // once a launch, after the first sync: is this phone's name still the account's? And after a change made in
            // Settings, back to Settings with the new name showing.
            checkMyName() {
                if (this._nameChecked || !(this.acctOn && this.acctOn()) || !Supa.ready()) return;
                this._nameChecked = true;
                let note = ''; try { note = sessionStorage.getItem('dialed_renamed') || ''; sessionStorage.removeItem('dialed_renamed'); } catch (e) { /* none */ }
                if (note === 'settings') setTimeout(() => { if (!document.querySelector('.modal.active')) this.openSettings(); }, 300);
                Supa.rpc('my_profile').then(p => { if (p && p.name && p.name !== Cloud.who()) this.adoptName(p, Cloud.who(), false); }).catch(() => { /* next launch */ });
            },
