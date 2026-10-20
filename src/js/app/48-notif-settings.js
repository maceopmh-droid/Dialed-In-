            // ===================== v15.8: choose your notifications =====================
            // Settings, Notifications: the phone switch, then one switch per kind. Off means it isn't sent at all (not in
            // the bell, not on the phone). New: a friend's new session (people you follow or share a community with, at
            // most once per friend every three hours). Saved on your account, so every phone you sign in on follows it.
            notifKinds() {
                return [
                    ['friend_sessions', 'Friends\' new sessions', 'When someone you follow or share a community with logs a session (once every few hours at most)'],
                    ['likes', 'Likes', 'On your sessions and coffees'],
                    ['comments', 'Comments', 'On your sessions and coffees'],
                    ['replies', 'Replies', 'When someone answers your comment'],
                    ['comment_likes', 'Likes on your comments', ''],
                    ['follows', 'Followers', 'New followers, follow requests and approvals'],
                    ['groups', 'Your communities', 'When someone joins a community you run'],
                    ['helpful', 'Most helpful', 'When your answer is marked most helpful'],
                ];
            },

            notifPrefState() { return this._nprefs || (this._nprefs = { prefs: null, loading: false, busy: {} }); },

            openNotifSettings() {
                if (!this.acctOn()) return;
                document.getElementById('notif-set-modal').classList.add('active');
                this.renderNotifSettings();
                const st = this.notifPrefState();
                if (st.loading) return;
                st.loading = true;
                Supa.rpc('my_notification_prefs', {}).then(p => { st.prefs = p && typeof p === 'object' ? p : {}; })
                    .catch(() => { if (!st.prefs) st.failed = true; })
                    .finally(() => { st.loading = false; this.renderNotifSettings(); });
            },

            closeNotifSettings() { const m = document.getElementById('notif-set-modal'); if (m) m.classList.remove('active'); },

            renderNotifSettings() {
                const body = document.getElementById('notif-set-body');
                if (!body) return;
                const st = this.notifPrefState(), push = this.pushRowHtml ? this.pushRowHtml() : '';
                const sw = ([key, title, sub]) => {
                    const on = !st.prefs || st.prefs[key] !== false;
                    return `<div class="pp-private nset-row"><span><b>${this.esc(title)}</b>${sub ? `<small>${this.esc(sub)}</small>` : ''}</span><button type="button" class="goal-sw" role="switch" aria-checked="${on}" aria-label="${this.esc(title)}"${st.prefs && !st.busy[key] ? '' : ' disabled'} onclick="app.setNotifPref('${app.escJs(key)}', this.getAttribute('aria-checked') !== 'true')"></button></div>`;
                };
                body.innerHTML = `${push ? `<div class="set-label">This phone</div><div class="set-group">${push}</div>` : ''}
                    <div class="set-label">What you hear about</div>
                    ${st.failed && !st.prefs ? '<p class="pp-empty">Couldn\'t load your choices. Check your connection and try again.</p>' : `<div class="set-group">${this.notifKinds().map(sw).join('')}</div>`}
                    <p class="nset-foot">Off means it isn't sent at all: not in your notifications, not on your phone. Your choices follow you to every phone you sign in on.</p>`;
            },

            async setNotifPref(key, on) {
                const st = this.notifPrefState();
                if (!st.prefs || st.busy[key]) return;
                const was = st.prefs[key] !== false;
                st.prefs[key] = on; st.busy[key] = true; this.renderNotifSettings();
                try { const p = await Supa.rpc('set_notification_pref', { pref: key, turn_on: on }); if (p && typeof p === 'object') st.prefs = p; }
                catch (e) { st.prefs[key] = was; this.showToast(e && e.message ? e.message : 'That didn\'t save. Try again.'); }
                finally { st.busy[key] = false; this.renderNotifSettings(); }
            },
