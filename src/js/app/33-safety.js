            // ---- v14.4 (phase 3): safety and your account. Report a profile, session or comment; download everything
            // that's yours; delete your account. New backend only.
            async reportItem(kind, ref, event) {
                if (event) event.stopPropagation();
                if (!this.acctOn() || !ref) return;
                const what = kind === 'profile' ? ref : kind === 'session' ? 'this session' : 'this comment';
                const reason = prompt(`Report ${what}? Say what's wrong (optional). Nobody is told who reported it. (Community guidelines are in Settings.)`, '');
                if (reason === null) return;
                try {
                    await Supa.rpc('report_item', { kind, ref, reason });
                    const st = this.ppState(); if (st.menu) { st.menu = ''; this.render(); }
                    // v14.5: it's gone for you right away (the database leaves it out of everything you're sent from now on)
                    if (kind === 'session') {
                        (this._reportedIds = this._reportedIds || new Set()).add('brew:' + ref);
                        const drop = list => list.filter(e => !(e.type === 'brew' && String(e.id) === String(ref)));
                        Object.values(this._streams || {}).forEach(st => { st.events = drop(st.events); });   // Discover and communities
                        if (this.profState) this.profState().events = drop(this.profState().events);
                        this.process(this.cloud.events); this._feedHtml = null;
                        this.render();
                    }
                    if (kind !== 'profile' && this.runSync) this.runSync();
                    this.showToast('Reported. Thanks for telling us.');
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },

            // v14.6: the terms and privacy policy (pages beside the app; from the iPhone app, the website's copies)
            legalUrl(page) {
                const local = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/^capacitor:/.test(String(location.href));
                return (local ? '' : 'https://maceopmh-droid.github.io/Dialed-In-/') + page + '.html';
            },
            legalLinksHtml() { return `<a href="${this.legalUrl('terms')}" target="_blank" rel="noopener" onclick="app.openLegal('terms'); return false;">Terms</a> and <a href="${this.legalUrl('privacy')}" target="_blank" rel="noopener" onclick="app.openLegal('privacy'); return false;">Privacy Policy</a>`; },

            // v14.7: Terms and Privacy open in a sheet inside the app (the pages ship with it), with Done to come back
            openLegal(page) {
                const m = document.getElementById('legal-modal'), f = document.getElementById('legal-frame');
                if (!m || !f) { location.href = this.legalUrl(page); return; }
                const title = page === 'privacy' ? 'Privacy Policy' : page === 'support' ? 'Help' : 'Terms of Use';   // (v15.0: and Help)
                document.getElementById('legal-title').textContent = title; f.title = title;
                f.src = (page === 'privacy' || page === 'support' ? page : 'terms') + '.html';
                m.classList.add('active');
            },
            closeLegal() {
                const m = document.getElementById('legal-modal'), f = document.getElementById('legal-frame');
                if (m) m.classList.remove('active');
                if (f) f.removeAttribute('src');
            },

            // v15.0: Settings with an account, in groups like the phone's own Settings (the rows above them, you and
            // Appearance, are in the page)
            acctToolsHtml(priv = '', pushRow = '') {
                const row = (onclick, title, sub = '', cls = '') => `<button type="button" class="set-row set-link${cls ? ` ${cls}` : ''}" onclick="${onclick}"><span class="set-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><svg class="icon set-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>`;
                const link = (page, title) => `<a class="set-row set-link" href="${this.legalUrl(page)}" target="_blank" rel="noopener" onclick="app.openLegal('${app.escJs(page)}'); return false;"><span class="set-main"><b>${title}</b></span><svg class="icon set-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></a>`;
                const group = (label, rows, cls = '') => rows ? `<div class="set-label">${label}</div><div class="set-group${cls ? ` ${cls}` : ''}">${rows}</div>` : '';
                return [
                    group('Privacy and notifications', `${priv}${pushRow}`),
                    group('Community', `${row('app.openGuidelines()', 'Community guidelines', 'What\'s welcome here, and how reporting works')}${this.isReviewer && this.isReviewer() ? row('app.openReview()', 'Review reports', 'Reports waiting for a reviewer') : ''}`),
                    group('Help', `${row('app.openBugReport()', 'Report a bug', 'Something broken or confusing? Tell us')}${this.isReviewer && this.isReviewer() ? row('app.openBugReports()', 'Bug reports', 'What people have reported') : ''}`),   // v15.1
                    group('Your data', `${row('app.downloadMyData()', 'Download my data', 'Everything on your account, in one file')}${row('app.exportData(\'csv\')', 'Export sessions', 'A spreadsheet (CSV) of your sessions')}`),
                    group('About', `${link('terms', 'Terms of Use')}${link('privacy', 'Privacy Policy')}${link('support', 'Help and support')}`, 'acct-legal'),
                    `<div class="set-group set-end"><button type="button" class="set-row acct-out" onclick="app.signOut()"><span class="set-main"><b>Sign out</b></span></button><button type="button" class="set-row acct-delete" onclick="app.deleteMyAccount()"><span class="set-main"><b>Delete account</b></span></button></div>`
                ].join('');
            },

            async downloadMyData() {
                try {
                    const data = await Supa.rpc('export_my_data', {});
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const how = await this.saveFile(blob, `dialed-in-${String(this.user || 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`, 'My Dialed In data');
                    if (how === 'downloaded') this.showToast('Your data is downloading.');
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },

            async deleteMyAccount() {
                if (!confirm('Delete your account? Your sessions, notes, photos, comments and likes are deleted for good. Coffees others brewed stay with them.')) return;
                const typed = prompt(`To confirm, type your name: ${this.user}`, '');
                if (typed === null) return;
                try {
                    if (String(typed).trim().toLowerCase() !== String(this.user || '').toLowerCase()) throw new Error('Type your name exactly to confirm.');
                    // v14.6: your photos first (storage), then everything else (the database); a photo that won't go is
                    // tried once more, then left unreadable (nothing points at it once the account is gone)
                    await Supa.removeMyPhotos().catch(() => Supa.removeMyPhotos().catch(() => 0));
                    if (Supa.removeMyAvatars) await Supa.removeMyAvatars().catch(() => 0);   // v15.1
                    await Supa.rpc('delete_account', { confirm_name: typed });
                    this.closeModals();
                    this.showToast('Your account is deleted.');
                    this.signOut(true);
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },
