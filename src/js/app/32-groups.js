            // ---- v14.4 (phase 3): groups. Private groups (up to 30, joined with an invite code or link) are the people
            // who share your group goal and monthly awards; open groups anyone can find. They live in People, Groups.
            grState() { return this._groups || (this._groups = { list: null, at: 0, open: '', form: '', busy: false }); },

            async loadGroups(force) {
                if (!this.acctOn() || !Supa.ready()) return null;
                const st = this.grState();
                if (!force && st.list && Date.now() - st.at < 60000) return st.list;
                const r = await Supa.rpc('my_groups', {});
                st.list = Array.isArray(r) ? r : []; st.at = Date.now();
                return st.list;
            },

            inviteLink(code) { return `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`; },

            renderGroups(body) {
                const st = this.grState();
                if (!st.list) { body.innerHTML = '<p class="pp-empty">Loading…</p>'; if (!st.busy) { st.busy = true; this.loadGroups(true).then(() => { st.busy = false; this.renderPeople(); }).catch(e => { st.busy = false; this.peopleFailed(e); }); } return; }
                const groupRow = g => {
                    const n = (g.members || []).length, isOpen = st.open === String(g.id), id = this.esc(String(g.id));
                    const role = g.role === 'owner' ? 'You run it' : g.role === 'admin' ? 'Admin' : '';
                    const members = isOpen ? `<div class="gr-members">${(g.members || []).map(m => `<div class="gr-member">${this.personDotHtml(m.name)}<span>${this.esc(m.name)}${m.role === 'owner' ? ' <small>owner</small>' : m.role === 'admin' ? ' <small>admin</small>' : ''}</span>${(g.role === 'owner' || g.role === 'admin') && m.name !== this.user && m.role !== 'owner' ? `<button type="button" class="btn-outline pp-act is-quiet" data-g="${id}" data-name="${this.esc(m.name)}" onclick="app.groupAct('remove', this.getAttribute('data-g'), this.getAttribute('data-name'))">Remove</button>` : ''}</div>`).join('')}</div>` : '';
                    const invite = isOpen && g.invite ? `<div class="gr-invite"><span>Invite code <b>${this.esc(g.invite.toUpperCase())}</b></span><button type="button" class="btn-primary pp-act" data-code="${this.esc(g.invite)}" data-name="${this.esc(g.name)}" onclick="app.shareInvite(this.getAttribute('data-code'), this.getAttribute('data-name'))">Share invite</button></div>` : '';
                    const leave = isOpen ? `<button type="button" class="gr-leave" data-g="${id}" data-name="${this.esc(g.name)}" onclick="app.groupAct('leave', this.getAttribute('data-g'), this.getAttribute('data-name'))">Leave group</button>` : '';
                    return `<div class="gr-card${isOpen ? ' is-open' : ''}"><button type="button" class="gr-head" data-g="${id}" onclick="app.toggleGroup(this.getAttribute('data-g'))"><span class="gr-icon"><svg class="icon"><use href="#i-users"/></svg></span><span class="gr-name"><b>${this.esc(g.name)}</b><small>${n} ${n === 1 ? 'person' : 'people'}${g.open ? ' · open' : ''}${role ? ' · ' + role : ''}</small></span><svg class="icon gr-chev"><use href="#i-chevron-down"/></svg></button>${invite}${members}${leave}</div>`;
                };
                const form = st.form === 'create'
                    ? `<form class="gr-form" onsubmit="event.preventDefault(); app.groupAct('create', this.elements.n.value)"><input name="n" class="pp-search" maxlength="60" placeholder="Group name" autocomplete="off" autocapitalize="words"><button type="submit" class="btn-primary pp-act">Create</button></form><p class="gr-note">A private group: up to 30 people, who join with its invite. You share a weekly goal and monthly awards.</p>`
                    : st.form === 'join'
                        ? `<form class="gr-form" onsubmit="event.preventDefault(); app.groupAct('join', this.elements.c.value)"><input name="c" class="pp-search" maxlength="40" placeholder="Invite code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="submit" class="btn-primary pp-act">Join</button></form>`
                        : `<div class="gr-actions"><button type="button" class="btn-outline pp-act" onclick="app.groupForm('create')">Create a group</button><button type="button" class="btn-outline pp-act" onclick="app.groupForm('join')">Join with a code</button></div>`;
                body.innerHTML = (st.list.length ? `<div class="gr-list">${st.list.map(groupRow).join('')}</div>` : `<p class="pp-empty">You're not in a group yet. Groups share a weekly goal and monthly awards. Make one and invite friends, or join with a code someone sent you.</p>`) + form;
                const f = body.querySelector('.gr-form input'); if (f && f.focus) f.focus();
            },

            toggleGroup(id) { const st = this.grState(); st.open = st.open === String(id) ? '' : String(id); this.renderPeople(); },
            groupForm(kind) { this.grState().form = kind; this.renderPeople(); },

            async shareInvite(code, name) {
                const url = this.inviteLink(code), text = `Join ${name} on Dialed In: ${url} (or use the invite code ${String(code).toUpperCase()})`;
                try {
                    if (navigator.share) { await navigator.share({ title: `Join ${name} on Dialed In`, text, url }); return; }
                    await navigator.clipboard.writeText(text);
                    this.showToast('Invite link copied.');
                } catch (e) { if (e && e.name === 'AbortError') return; this.showToast(`Invite code: ${String(code).toUpperCase()}`); }
            },

            async groupAct(action, a, b) {
                const st = this.grState();
                try {
                    if (action === 'create') { const g = await Supa.rpc('create_group', { name: String(a || '').trim() }); st.form = ''; st.open = g && g.id ? String(g.id) : ''; this.showToast(`Made ${g && g.name ? g.name : 'your group'}. Share the invite with friends.`); }
                    else if (action === 'join') { const g = await Supa.rpc('join_group', { code: String(a || '').trim() }); st.form = ''; st.open = g && g.id ? String(g.id) : ''; this.showToast(`You joined ${g && g.name ? g.name : 'the group'}.`); }
                    else if (action === 'leave') { if (!confirm(`Leave ${b}? You'll stop sharing its goal and awards.`)) return; await Supa.rpc('leave_group', { group_id: a }); st.open = ''; this.showToast(`You left ${b}.`); }
                    else if (action === 'remove') { if (!confirm(`Remove ${b} from the group?`)) return; await Supa.rpc('remove_member', { group_id: a, name: b }); }
                    else return;
                    if (this.haptic) this.haptic('tick');
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); return; }
                await this.loadGroups(true).catch(() => {});
                this.renderPeople();
                this.sync({ silent: true });   // your people list (and who shares your goal) changed
            },

            // an invite link (?join=CODE): remembered until you're signed in, then offered once
            noteInviteLink() {
                try {
                    const code = new URLSearchParams(location.search).get('join');
                    if (!code) return;
                    safeSet('dialed_pending_join', code);
                    const u = new URL(location.href); u.searchParams.delete('join'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
                } catch (e) {}
            },

            checkPendingJoin() {
                if (!this.acctOn() || !Supa.ready() || this._joinAsked) return;
                const code = safeGet('dialed_pending_join');
                if (!code) return;
                this._joinAsked = true;
                safeSet('dialed_pending_join', '');
                setTimeout(() => { if (confirm('You were invited to a group on Dialed In. Join it?')) this.groupAct('join', code); }, 400);
            },
