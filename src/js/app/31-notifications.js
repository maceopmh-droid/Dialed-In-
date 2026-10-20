            // ---- v14.4 (phase 3): notifications. A bell in the header (the unread count inside it, never a badge), a
            // sheet of what happened, newest first; tap one to go to it. New backend only.
            notifState() { return this._notif || (this._notif = { items: null, unread: 0, at: 0, loading: false }); },

            async loadNotifications(max = 50) {
                if (!this.acctOn() || !Supa.ready()) return null;
                const st = this.notifState();
                if (st.loading) return st;
                st.loading = true;
                try {
                    const r = await Supa.rpc('my_notifications', { max_count: max });
                    st.unread = Number(r && r.unread) || 0;
                    if (max > 1 || !st.items) st.items = r && Array.isArray(r.items) ? r.items : [];
                    st.at = Date.now();
                } finally { st.loading = false; }
                this.paintNotifButton();
                return st;
            },

            // after a sync: the unread count, at most once a minute
            checkNotifications() {
                if (!this.acctOn() || !Supa.ready()) return;
                const st = this.notifState();
                if (Date.now() - st.at < 60000) { this.paintNotifButton(); return; }
                this.loadNotifications(1).catch(() => {});
            },

            // the bell lives at the top of the Feed, beside Following | Community (the header keeps its height); the unread
            // count is inside it
            notifButtonHtml() {
                const unread = this.notifState().unread;
                return `<button type="button" class="locker-btn notif-btn${unread ? ' has-unread' : ''}" onclick="app.openNotifications()" aria-label="${unread ? `Notifications, ${unread} new` : 'Notifications'}"><svg class="icon"><use href="#i-bell"/></svg>${unread ? `<span class="locker-count">${unread > 99 ? '99+' : unread}</span>` : ''}</button>`;
            },

            paintNotifButton() {
                // v15.0: patched in place, and only when it changed (it's frosted glass: a new one every sync made the screen flicker)
                const html = this.notifButtonHtml();
                document.querySelectorAll('.notif-btn').forEach(b => { if (b.outerHTML === html) return; const t = document.createElement('div'); t.innerHTML = html; this.morphEl(b, t.firstElementChild); });
            },

            openNotifications() {
                if (!this.acctOn()) return;
                document.getElementById('notif-modal').classList.add('active');
                this.renderNotifications();
                this.loadNotifications(50).then(st => {
                    this.renderNotifications();
                    const top = st && st.items && st.items[0];
                    if (st && st.unread && top) Supa.rpc('mark_notifications_read', { up_to: top.id }).then(() => { st.unread = 0; this.paintNotifButton(); }).catch(() => {});
                }).catch(() => { const b = document.getElementById('notif-body'); if (b && !this.notifState().items) b.innerHTML = '<p class="pp-empty">Couldn\'t load notifications. Check your connection.</p>'; });
            },

            closeNotifications() { const m = document.getElementById('notif-modal'); if (m) m.classList.remove('active'); },

            notifText(n) {
                const who = `<b>${this.esc(n.who || 'Someone')}</b>`, said = n.comment ? ` <q>${this.esc(n.comment)}</q>` : '';
                switch (n.kind) {
                    case 'like': return n.coffee && !n.session ? `${who} liked your coffee` : `${who} liked your session`;
                    case 'comment': return `${who} commented${said}`;
                    case 'reply': return `${who} replied${said}`;
                    case 'comment_like': return `${who} liked your comment${said}`;
                    case 'follow': return `${who} started following you`;
                    case 'follow_request': return `${who} wants to follow you`;
                    case 'follow_accepted': return `${who} approved your follow request`;
                    case 'joined_group': return `${who} joined ${this.esc(n.group || 'your group')}`;
                    case 'helpful': return `${who} marked your answer most helpful${said}`;   // v14.5
                    case 'friend_session': { const b = n.sessionCoffee ? this.beans.get(String(n.sessionCoffee)) : null; return `${who} logged a session${b && b.name ? ` of <b>${this.esc(b.name)}</b>` : ''}`; }   // v15.8
                    case 'report': return 'Something was reported. Review it within a day.';
                    case 'bug': return `${who} reported a bug. Read it in Settings.`;   // v15.1: reviewers only
                    default: return who;
                }
            },

            renderNotifications() {
                const body = document.getElementById('notif-body');
                if (!body) return;
                const st = this.notifState();
                if (!st.items) { body.innerHTML = this.loadingBlockHtml(); return; }
                if (!st.items.length) { body.innerHTML = '<p class="pp-empty">Nothing yet. When people like, comment on or follow your brewing, it shows up here.</p>'; return; }
                body.innerHTML = `<div class="pp-list">${st.items.map(n => `<button type="button" class="nt-row${n.read ? '' : ' is-new'}" data-id="${this.esc(String(n.id))}" onclick="app.openNotification(this.getAttribute('data-id'))">${n.kind === 'report' ? this.personDotHtml('!', '#8A8F8B') : this.personDotHtml(n.who || '?', n.color)}<span class="nt-text"><span>${this.notifText(n)}</span><small>${this.esc(this.formatRelativeDate(n.at))}</small></span></button>`).join('')}</div>`;
            },

            // tap a notification: the session or coffee it's about, or People for follows
            openNotification(id) {
                const n = (this.notifState().items || []).find(x => String(x.id) === String(id));
                if (!n) return;
                if (n.kind === 'follow_request') { this.closeNotifications(); this.openPeople(); return; }
                if (n.kind === 'report') { this.closeNotifications(); if (this.openReview) this.openReview(); return; }
                if (n.kind === 'bug') { this.closeNotifications(); if (this.openBugReports) this.openBugReports(); return; }   // v15.1   // v14.6
                if ((n.kind === 'follow' || n.kind === 'follow_accepted') && this.openAnyProfile) { this.closeNotifications(); this.openAnyProfile(n.who); return; }   // v14.5: their profile
                if (n.kind === 'follow' || n.kind === 'follow_accepted') { this.closeNotifications(); this.openPeople(); return; }
                if (n.kind === 'joined_group') { this.closeNotifications(); this.openPeople(); return; }
                const brew = n.session ? this.brews.get(String(n.session)) : null;
                const beanId = brew ? brew.beanId : (n.sessionCoffee || n.coffee || '');
                if (n.session && !brew && n.who && this.openAnyProfile) { this.closeNotifications(); this.openAnyProfile(n.who); return; }   // v14.5: someone else's session outside your circle (a help answer): their profile
                if (!beanId || (n.session && !brew && !this.beans.has(String(beanId)))) { this.showToast('That isn\'t on this phone anymore.'); return; }
                this.closeNotifications();
                if (n.comment && n.session) this.openThreads.add(this.threadKey('brew', n.session));
                this.openFeedTarget(beanId, n.session || '', true);
            },
