            // ===================== v14.2: signing in (only on the new backend; the Sheet never shows any of this) =====================
            // The welcome gains three steps: your email, the code we email you, and (for people from the Sheet era) the claim
            // code that brings your name and history over. New people go on to the usual name, gear and coffee steps.
            acctOn() { return typeof Supa !== 'undefined' && Supa.on(); },

            // from the welcome's first screen: new people and returning people both sign in first
            wlStart(path) {
                const s = this.wl; if (!s) return;
                s.path = path;
                const sess = Supa.session();
                if (sess && sess.refresh_token && !sess.profile) { s.step = path === 'back' ? 'claim' : 'name'; this.renderWelcome(); return; }
                s.email = s.email || (sess && sess.user && sess.user.email) || '';
                s.step = 'email';
                this.renderWelcome();
            },

            acctStepHtml(s) {
                const esc = v => this.esc(v);
                const top = back => `<div class="wl-top"><button type="button" class="wl-back" data-go="${back}" onclick="app.wlGo(this.getAttribute('data-go'))"><svg class="icon"><use href="#i-arrow-left"/></svg>Back</button></div>`;
                const msg = '<div class="wl-taken" id="wl-msg" role="alert" hidden></div>';
                if (s.step === 'email') {
                    setTimeout(() => { const i = document.getElementById('wl-email'); if (i && !i.value) i.focus(); }, 60);
                    return `<div class="wl-step">
                        ${s.again ? '' : top('intro')}
                        <h2 class="wl-h2">${s.again ? 'Sign in again.' : (s.path === 'back' ? 'Welcome back.' : 'First, your email.')}</h2>
                        <p class="wl-sub">${s.again ? 'It\'s been a while, so Dialed In needs to check it\'s you. Your saves are waiting on this phone.' : 'We\'ll email you a 6-digit code to sign in. There\'s no password to remember.'}</p>
                        <input class="wl-input" id="wl-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="120" placeholder="you@example.com" value="${esc(s.email || '')}" oninput="app.wl.email = this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();app.wlSendCode()}">
                        ${msg}
                        <div class="wl-actions"><button type="button" class="btn-primary wl-main" id="wl-busy" onclick="app.wlSendCode()">Send code</button></div>
                    </div>`;
                }
                if (s.step === 'code') {
                    setTimeout(() => { const i = document.getElementById('wl-code'); if (i) i.focus(); }, 60);
                    return `<div class="wl-step">
                        ${top('email')}
                        <h2 class="wl-h2">Check your email.</h2>
                        <p class="wl-sub">Enter the 6-digit code we sent to <b>${esc(s.email || '')}</b>.</p>
                        <input class="wl-input wl-code" id="wl-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" spellcheck="false" oninput="this.value = this.value.replace(/\\D/g, '').slice(0, 6); if (this.value.length === 6) app.wlVerify()" onkeydown="if(event.key==='Enter'){event.preventDefault();app.wlVerify()}">
                        ${msg}
                        <div class="wl-actions">
                            <button type="button" class="btn-primary wl-main" id="wl-busy" onclick="app.wlVerify()">Sign in</button>
                            <button type="button" class="wl-link" onclick="app.wlSendCode(true)">Send a new code</button>
                        </div>
                    </div>`;
                }
                if (s.step === 'claim') {
                    setTimeout(() => { const i = document.getElementById('wl-claim'); if (i) i.focus(); }, 60);
                    return `<div class="wl-step">
                        <h2 class="wl-h2">Bring your sessions over.</h2>
                        <p class="wl-sub">Enter your claim code. It links this sign-in to your name and everything you've logged.</p>
                        <input class="wl-input wl-code" id="wl-claim" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="Claim code" onkeydown="if(event.key==='Enter'){event.preventDefault();app.wlClaim()}">
                        ${msg}
                        <div class="wl-actions">
                            <button type="button" class="btn-primary wl-main" id="wl-busy" onclick="app.wlClaim()">Continue</button>
                            <button type="button" class="wl-link" onclick="app.wlGo('name')">No code? Set up a new profile</button>
                        </div>
                    </div>`;
                }
                return '';
            },

            // a message under the field (in place of the "already taken" line), or none
            wlSay(text) { const box = document.getElementById('wl-msg') || document.getElementById('wl-taken'); if (!box) { if (text) this.showToast(text); return; } box.hidden = !text; box.innerHTML = text ? `<span>${this.esc(text)}</span>` : ''; },
            async wlBusy(fn) {
                const b = document.getElementById('wl-busy') || document.getElementById('wl-next');
                if (b && b.disabled) return;
                if (b) { b.disabled = true; b.classList.add('is-busy'); }
                try { await fn(); } catch (e) {
                    const m = String((e && e.message) || '');
                    this.wlSay(/fetch|network|load failed/i.test(m) ? 'No connection. Try again in a moment.' : (/expired|invalid/i.test(m) ? 'That code didn\'t work. Check it, or send a new one.' : m || 'Something went wrong. Try again.'));
                } finally { if (b && document.body.contains(b)) { b.disabled = false; b.classList.remove('is-busy'); } }
            },

            wlSendCode(again = false) {
                const s = this.wl; if (!s) return;
                const email = String(s.email || '').trim();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (s.step === 'email') { this.wlShake('wl-email'); this.wlSay('Enter your email address.'); } return; }
                return this.wlBusy(async () => {
                    await Supa.sendCode(email);
                    s.email = email;
                    if (s.step !== 'code') { s.step = 'code'; this.renderWelcome(); }
                    if (again) this.showToast('A new code is on its way.');
                });
            },

            wlVerify() {
                const s = this.wl; const el = document.getElementById('wl-code'); if (!s || !el) return;
                const code = el.value.replace(/\D/g, '');
                if (code.length !== 6) { this.wlShake('wl-code'); return; }
                return this.wlBusy(async () => {
                    const was = (Supa.session() || {}).profile;
                    const p = await Supa.verify(s.email, code);
                    if (p) { this.acctReady(p, was); return; }
                    s.step = s.path === 'back' ? 'claim' : 'name';
                    this.renderWelcome();
                });
            },

            wlClaim() {
                const el = document.getElementById('wl-claim'); if (!el) return;
                const code = el.value.trim();
                if (!code) { this.wlShake('wl-claim'); return; }
                return this.wlBusy(async () => { const p = await Supa.claim(code); this.acctReady(p, null); });
            },

            // the name step on the new backend: the name is checked by the server (it's unique) and becomes your profile
            acctCreate() {
                const s = this.wl; if (!s) return;
                const n = String(s.name || '').trim().replace(/\s+/g, ' ');
                if (!this.validPersonName(n) || n.length < 2) { this.wlShake('wl-name'); return; }
                return this.wlBusy(async () => {
                    const p = await Supa.createProfile(n, s.color || this.wlFreeColor());
                    s.name = p.name;
                    this.user = p.name;
                    this.setUserColor(p.name, s.color || this.wlFreeColor(), true);
                    s.step = 'gear';
                    this.renderWelcome();
                });
            },

            // signed in with a profile: start over as that person (the on-phone copy and outbox are per account)
            acctReady(profile, was) {
                const same = was && profile && was.id === profile.id;
                if (same && this.welcomeOpen && this.wl && this.wl.again) {   // signed in again as the same person: carry on
                    this.closeWelcome(); this.user = profile.name; this.sync({ silent: true }); this.showToast('Signed in.'); return;
                }
                this.showToast(`Welcome, ${profile.name}.`);
                setTimeout(() => location.reload(), 350);
            },

            // the sign-in ran out (or was revoked somewhere else): ask for the email code again, once
            needSignIn() {
                if (!this.acctOn() || this.welcomeOpen) return;
                const sess = Supa.session() || {};
                // whatever was open (a coffee page, a form) would sit on top of the welcome: close it first
                try { this.closeModals(); this.navStack = []; const d = document.getElementById('detail-view'); if (d) d.classList.remove('active'); if (this.hideRoasterView) this.hideRoasterView(); } catch (e) {}
                this.openWelcome('email');
                this.wl.again = true; this.wl.path = 'back';
                this.wl.email = (sess.user && sess.user.email) || '';
                this.renderWelcome();
            },

            signOut() {
                const waiting = this.pendingOutbox().length;
                if (!confirm(waiting ? `${waiting} change${waiting === 1 ? '' : 's'} on this phone haven't been saved yet and will be lost. Sign out anyway?` : 'Sign out of Dialed In on this phone?')) return;
                const keys = [this.cacheKey(), this.outboxKey()];
                Promise.all(keys.map(k => this.idbPut(k, null).catch(() => {}))).finally(() => {
                    Supa.signOut();
                    location.reload();
                });
            },

            // After the move: saves this phone made on the Sheet that never got out (it was offline when it updated) go to the
            // new backend instead, once, as whoever is signed in. push_event only ever applies that person's own part.
            async adoptSheetOutbox() {
                if (this._adoptedSheet || !this.acctOn() || !Supa.ready()) return;
                this._adoptedSheet = true;
                const key = 'outbox:' + CLOUD_URL;
                let saved = null; try { saved = await this.idbGet(key); } catch (e) { return; }
                const waiting = (Array.isArray(saved) ? saved : []).filter(x => x && x.ev && x.ev.type && x.ev.id && !x.landedAt);
                if (!waiting.length) return;
                waiting.forEach(x => this.queueOutbox(x.ev, x.base || null));
                try { await this.idbPut(key, []); } catch (e) {}
                this.flushOutbox();
            },

            // ---- who sees what (new backend only). A session is for Everyone, Friends & groups, or Only me; when it's for
            // everyone, its notes and photo each choose Everyone or Friends (Friends to start). A comment chooses too, where
            // people outside your friends can see the thing it's on. The Sheet has no audiences, so none of this shows there.
            shareOpen(brew) {
                const row = document.getElementById('share-row'); if (!row) return;
                if (!this.acctOn()) { row.hidden = true; row.innerHTML = ''; this.share = null; return; }
                let last = {}; try { last = JSON.parse(safeGet('dialed_share_last') || '{}') || {}; } catch (e) { last = {}; }
                const A = v => ['everyone', 'friends', 'only_me'].includes(v) ? v : '', I = v => ['everyone', 'friends'].includes(v) ? v : '';
                const from = brew || last;   // a new session starts where your last one was set
                this.share = { audience: A(from.audience) || 'friends', noteAudience: I(from.noteAudience) || 'friends', photoAudience: I(from.photoAudience) || 'friends' };
                row.hidden = false;
                this.renderShareRow();
            },

            renderShareRow() {
                const row = document.getElementById('share-row'), s = this.share; if (!row || !s) return;
                const seg = (key, opts) => `<div class="seg-control share-seg n${opts.length}" role="group">${opts.map(([v, label]) => `<button type="button" aria-pressed="${s[key] === v}" data-k="${key}" data-v="${v}" onclick="app.setShare(this.getAttribute('data-k'), this.getAttribute('data-v'))">${label}</button>`).join('')}</div>`;
                const say = { everyone: 'Anyone on Dialed In can see this session.', friends: 'Your friends (people you follow who follow you back) and your private groups.', only_me: 'Just you. It still counts for your stats and the coach.' }[s.audience];
                row.innerHTML = `<label>Who sees this session</label>${seg('audience', [['everyone', 'Everyone'], ['friends', 'Friends'], ['only_me', 'Only me']])}
                    ${s.audience === 'everyone' ? `<div class="share-items"><div class="share-item"><span>Your notes</span>${seg('noteAudience', [['friends', 'Friends'], ['everyone', 'Everyone']])}</div>
                    <div class="share-item"><span>Photo</span>${seg('photoAudience', [['friends', 'Friends'], ['everyone', 'Everyone']])}</div></div>` : ''}
                    <p class="share-note">${say}</p>`;
            },

            setShare(key, value) {
                if (!this.share || !(key in this.share)) return;
                this.share[key] = value;
                try { safeSet('dialed_share_last', JSON.stringify(this.share)); } catch (e) {}
                this.renderShareRow();
            },

            // the comment box: who sees your comment, where people beyond your friends can see the thing it's on
            cmtShareOpenTo(kind, target) { return this.acctOn() && (kind === 'bean' || (target && target.audience === 'everyone')); },
            cmtShareHtml(kind, target, key) {
                if (!this.cmtShareOpenTo(kind, target)) return '';
                const a = (this.cmtAud || {})[key] || 'friends';
                return `<button type="button" class="cmt-aud${a === 'everyone' ? ' on' : ''}" data-key="${this.esc(key)}" onclick="app.toggleCmtAudience(this.getAttribute('data-key'), event)" aria-label="Who sees your comment: ${a === 'everyone' ? 'everyone' : 'friends'}" title="Who sees your comment">${a === 'everyone' ? 'Everyone' : 'Friends'}</button>`;
            },
            toggleCmtAudience(key, event) {
                if (event) event.stopPropagation();
                this.cmtAud = this.cmtAud || {};
                this.cmtAud[key] = (this.cmtAud[key] || 'friends') === 'friends' ? 'everyone' : 'friends';
                document.querySelectorAll('.cmt-aud').forEach(b => { if (b.getAttribute('data-key') !== key) return; const on = this.cmtAud[key] === 'everyone'; b.classList.toggle('on', on); b.textContent = on ? 'Everyone' : 'Friends'; b.setAttribute('aria-label', `Who sees your comment: ${on ? 'everyone' : 'friends'}`); });
            },
            cmtAudienceFor(kind, target) {
                if (!this.cmtShareOpenTo(kind, target)) return {};
                return { audience: (this.cmtAud || {})[this.threadKey(kind, String(target.id))] || 'friends' };
            },

            // Settings on the new backend: who you're signed in as, and sign out (instead of picking a person)
            acctSettingsHtml() {
                const sess = Supa.session() || {};
                const email = sess.user && sess.user.email ? sess.user.email : '';
                const color = this.getUserColor(this.user);
                return `<div class="acct-row"><i class="acct-dot" style="background:${this.esc(color)}">${this.esc(this.feedInitial(this.user || '?'))}</i><span class="acct-who"><b>${this.esc(this.user || '')}</b>${email ? `<small>${this.esc(email)}</small>` : ''}</span><button type="button" class="btn-outline acct-out" onclick="app.signOut()">Sign out</button></div>`;
            },
        };

