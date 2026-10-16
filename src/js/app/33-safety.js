            // ---- v14.4 (phase 3): safety and your account. Report a profile, session or comment; download everything
            // that's yours; delete your account. New backend only.
            async reportItem(kind, ref, event) {
                if (event) event.stopPropagation();
                if (!this.acctOn() || !ref) return;
                const what = kind === 'profile' ? ref : kind === 'session' ? 'this session' : 'this comment';
                const reason = prompt(`Report ${what}? Say what's wrong (optional). Nobody is told who reported it.`, '');
                if (reason === null) return;
                try {
                    await Supa.rpc('report_item', { kind, ref, reason });
                    const st = this.ppState(); if (st.menu) { st.menu = ''; this.render(); }
                    // v14.5: it's gone for you right away (the database leaves it out of everything you're sent from now on)
                    if (kind === 'session') {
                        (this._reportedIds = this._reportedIds || new Set()).add('brew:' + ref);
                        const drop = list => list.filter(e => !(e.type === 'brew' && String(e.id) === String(ref)));
                        this.commState().events = drop(this.commState().events);
                        if (this.profState) this.profState().events = drop(this.profState().events);
                        this.process(this.cloud.events); this._feedHtml = null;
                        this.render();
                    }
                    if (kind !== 'profile' && this.runSync) this.runSync();
                    this.showToast('Reported. Thanks for telling us.');
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },

            acctToolsHtml() {
                return `<div class="acct-tools">${this.isReviewer && this.isReviewer() ? '<button type="button" class="btn-outline pp-act" onclick="app.openReview()">Review reports</button>' : ''}<button type="button" class="btn-outline pp-act" onclick="app.downloadMyData()">Download my data</button><button type="button" class="btn-outline pp-act acct-delete" onclick="app.deleteMyAccount()">Delete account</button></div>`;
            },

            async downloadMyData() {
                try {
                    const data = await Supa.rpc('export_my_data', {});
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = `dialed-in-${String(this.user || 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                    this.showToast('Your data is downloading.');
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },

            async deleteMyAccount() {
                if (!confirm('Delete your account? Your sessions, notes, photos, comments and likes are deleted for good. Coffees others brewed stay with them.')) return;
                const typed = prompt(`To confirm, type your name: ${this.user}`, '');
                if (typed === null) return;
                try {
                    await Supa.rpc('delete_account', { confirm_name: typed });
                    this.closeModals();
                    this.showToast('Your account is deleted.');
                    this.signOut();
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },
