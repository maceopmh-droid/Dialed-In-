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

            inviteLink(code) {   // (from the iPhone app, the website's address: that's what a friend can open)
                const web = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
                return `${web ? location.origin + location.pathname : 'https://maceopmh-droid.github.io/Dialed-In-/'}?join=${encodeURIComponent(code)}`;
            },

            renderGroups(body) {
                const st = this.grState();
                if (!st.list) { body.innerHTML = '<p class="pp-empty">Loading…</p>'; if (!st.busy) { st.busy = true; this.loadGroups(true).then(() => { st.busy = false; this.renderPeople(); }).catch(e => { st.busy = false; this.peopleFailed(e); }); } return; }
                const groupRow = g => {
                    const n = (g.members || []).length, isOpen = st.open === String(g.id), id = this.esc(String(g.id));
                    const role = g.role === 'owner' ? 'You run it' : g.role === 'admin' ? 'Admin' : '';
                    const members = isOpen ? `<div class="gr-members">${(g.members || []).map(m => `<div class="gr-member"><span class="gr-who" data-profile="${this.esc(m.name)}">${this.personDotHtml(m.name)}</span><span data-profile="${this.esc(m.name)}">${this.esc(m.name)}${m.role === 'owner' ? ' <small>owner</small>' : m.role === 'admin' ? ' <small>admin</small>' : ''}</span>${(g.role === 'owner' || g.role === 'admin') && m.name !== this.user && m.role !== 'owner' ? `<button type="button" class="btn-outline pp-act is-quiet" data-g="${id}" data-name="${this.esc(m.name)}" onclick="app.groupAct('remove', this.getAttribute('data-g'), this.getAttribute('data-name'))">Remove</button>` : ''}</div>`).join('')}</div>` : '';
                    const invite = isOpen && g.invite ? `<div class="gr-invite"><span>Invite code <b>${this.esc(g.invite.toUpperCase())}</b></span><button type="button" class="btn-primary pp-act" data-code="${this.esc(g.invite)}" data-name="${this.esc(g.name)}" onclick="app.shareInvite(this.getAttribute('data-code'), this.getAttribute('data-name'))">Share invite</button></div>` : '';
                    const leave = isOpen ? `<button type="button" class="gr-leave" data-g="${id}" data-name="${this.esc(g.name)}" data-open="${g.open ? '1' : ''}" onclick="app.groupAct('leave', this.getAttribute('data-g'), this.getAttribute('data-name'), this.getAttribute('data-open'))">Leave community</button>` : '';
                    // v14.5: an open group's sessions show under its name in Community
                    const see = isOpen ? `<div class="gr-invite"><span>${g.open ? 'Members\' sessions shared with Everyone' : 'Members\' sessions, its goal and awards'}</span><button type="button" class="btn-primary pp-act" data-g="${id}" onclick="app.seeGroupFeed(this.getAttribute('data-g'))">Open its feed</button></div>` : '';
                    return `<div class="gr-card${isOpen ? ' is-open' : ''}"><button type="button" class="gr-head" data-g="${id}" onclick="app.toggleGroup(this.getAttribute('data-g'))"><span class="gr-icon"><svg class="icon"><use href="#i-users"/></svg></span><span class="gr-name"><b>${this.esc(g.name)}</b><small>${n} ${n === 1 ? 'person' : 'people'}${g.open ? ' · open' : ''}${role ? ' · ' + role : ''}</small></span><svg class="icon gr-chev"><use href="#i-chevron-down"/></svg></button>${invite}${see}${members}${leave}</div>`;
                };
                const kind = st.makeOpen ? 'open' : 'private';
                const kindSeg = `<div class="seg-control gr-kind" role="group" aria-label="Kind of community">${[['private', 'Private'], ['open', 'Open']].map(([k, l]) => `<button type="button" aria-pressed="${k === kind}" onclick="app.setGroupKind('${app.escJs(k)}')">${l}</button>`).join('')}</div>`;
                const form = st.form === 'create'
                    ? `${kindSeg}<form class="gr-form" onsubmit="event.preventDefault(); app.groupAct('create', this.elements.n.value)"><input name="n" class="pp-search" maxlength="60" placeholder="${kind === 'open' ? 'Like Moka pot club or Chicago coffee' : 'Group name'}" autocomplete="off" autocapitalize="words"><button type="submit" class="btn-primary pp-act">Create</button></form><p class="gr-note">${kind === 'open' ? 'An open community: anyone can find it and join with one tap. Its members\' sessions shared with Everyone show in its feed.' : 'A private community: up to 30 people, who join with its invite. You see each other\'s sessions in its feed and share a weekly goal and monthly awards.'}</p>`
                    : st.form === 'join'
                        ? `<form class="gr-form" onsubmit="event.preventDefault(); app.groupAct('join', this.elements.c.value)"><input name="c" class="pp-search" maxlength="40" placeholder="Invite code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="submit" class="btn-primary pp-act">Join</button></form>`
                        : st.form === 'find' ? this.openGroupsHtml()
                        : `<div class="gr-actions"><button type="button" class="btn-outline pp-act" onclick="app.groupForm('find')">Find communities</button><button type="button" class="btn-outline pp-act" onclick="app.groupForm('create')">Start a community</button><button type="button" class="btn-outline pp-act" onclick="app.groupForm('join')">Join with a code</button></div>`;
                body.innerHTML = (st.list.length ? `<div class="gr-list">${st.list.map(groupRow).join('')}</div>` : `<p class="pp-empty">You're not in a community yet. Communities are groups around friends, a place or a way of brewing, each with its own feed. Find one, start your own, or join with a code someone sent you.</p>`) + form;
                const f = st.form === 'find' ? null : body.querySelector('.gr-form input'); if (f && f.focus) f.focus();
            },

            // v14.5: open groups. Browse the biggest, or search by name; join with one tap
            setGroupKind(kind) { this.grState().makeOpen = kind === 'open'; this.renderPeople(); },

            openGroupsHtml() {
                const st = this.grState(), found = st.found;
                if (!found && !st.finding) { st.finding = true; this.findOpenGroups(''); }
                const rows = (found || []).map(g => `<div class="pp-row"><span class="pp-who"><span class="gr-icon"><svg class="icon"><use href="#i-users"/></svg></span><span><b>${this.esc(g.name)}</b><small>${g.members} ${g.members === 1 ? 'person' : 'people'}</small></span></span><span class="pp-acts">${g.joined
                    ? `<button type="button" class="btn-outline pp-act is-quiet" data-g="${this.esc(String(g.id))}" onclick="app.seeGroupFeed(this.getAttribute('data-g'))">Joined</button>`
                    : `<button type="button" class="btn-primary pp-act" data-g="${this.esc(String(g.id))}" onclick="app.groupAct('join', this.getAttribute('data-g'))">Join</button>`}</span></div>`).join('');
                return `<input class="pp-search gr-find" type="search" placeholder="Find communities by name" autocomplete="off" autocapitalize="words" spellcheck="false" value="${this.esc(st.findQ || '')}" oninput="app.findOpenGroups(this.value)">
                    ${!found ? '<p class="pp-empty">Looking…</p>' : rows ? `<div class="pp-list">${rows}</div>` : `<p class="pp-empty">${st.findQ ? 'No community by that name yet. Start one.' : 'No open communities yet. Start the first one.'}</p>`}
                    <div class="gr-actions"><button type="button" class="btn-outline pp-act" onclick="app.groupForm('create')">Start a community</button><button type="button" class="btn-outline pp-act is-quiet" onclick="app.groupForm('')">Done</button></div>`;
            },

            findOpenGroups(q) {
                const st = this.grState(); st.findQ = String(q || '');
                clearTimeout(this._grFindTimer);
                const seq = st.findSeq = (st.findSeq || 0) + 1, text = st.findQ.trim();
                if (text.length === 1) return;
                this._grFindTimer = setTimeout(async () => {
                    try { const r = await Supa.rpc('find_groups', { q: text }); if (seq !== st.findSeq) return; st.found = Array.isArray(r) ? r : []; }
                    catch (e) { if (seq === st.findSeq) st.found = []; }
                    st.finding = false;
                    // redraw the results without the search box (it keeps its focus and what's typed)
                    const body = document.getElementById('people-body'), box = body && body.querySelector('.gr-find');
                    if (!body || st.form !== 'find') return;
                    const html = this.openGroupsHtml(), tmp = document.createElement('div'); tmp.innerHTML = html;
                    if (box) { [...body.children].forEach(c => { if (c !== box) c.remove(); }); [...tmp.children].slice(1).forEach(c => body.appendChild(c)); }
                    else this.renderPeople();
                }, text ? 220 : 0);
            },

            seeGroupFeed(id) {   // v14.5: Feed, Community, with this community picked
                this.closePeople();
                this._feedGroup = String(id || ''); safeSet('dialed_feed_group', this._feedGroup);
                this.setTab('feed');
                this.setFeedMode('groups');
            },

            toggleGroup(id) { const st = this.grState(); st.open = st.open === String(id) ? '' : String(id); this.renderPeople(); },
            groupForm(kind) { this.grState().form = kind; this.renderPeople(); },

            async shareInvite(code, name) {
                const url = this.inviteLink(code), text = `Join ${name} on Dialed In: ${url} (or use the invite code ${String(code).toUpperCase()})`;
                try {
                    if (navigator.share) { await navigator.share({ title: `Join ${name} on Dialed In`, text }); return; }   // (v15.0: the words and the link together)
                    await navigator.clipboard.writeText(text);
                    this.showToast('Invite link copied.');
                } catch (e) { if (e && e.name === 'AbortError') return; this.showToast(`Invite code: ${String(code).toUpperCase()}`); }
            },

            async groupAct(action, a, b, c) {
                const st = this.grState();
                try {
                    if (action === 'create') { const open = Boolean(st.makeOpen); const g = await Supa.rpc('create_group', { name: String(a || '').trim(), open }); st.form = ''; st.makeOpen = false; st.found = null; st.open = g && g.id ? String(g.id) : ''; this.showToast(open ? `Made ${g && g.name ? g.name : 'your group'}. Anyone can find it and join.` : `Made ${g && g.name ? g.name : 'your group'}. Share the invite with friends.`); }
                    else if (action === 'join') { const g = await Supa.rpc('join_group', { code: String(a || '').trim() }); st.form = ''; st.found = null; st.open = g && g.id ? String(g.id) : ''; this.showToast(`You joined ${g && g.name ? g.name : 'the group'}.`); }
                    else if (action === 'leave') { if (!confirm(c ? `Leave ${b}?` : `Leave ${b}? You'll stop sharing its goal and awards.`)) return; await Supa.rpc('leave_group', { group_id: a }); st.open = ''; st.found = null; this.showToast(`You left ${b}.`); }
                    else if (action === 'remove') { if (!confirm(`Remove ${b} from the community?`)) return; await Supa.rpc('remove_member', { group_id: a, name: b }); }
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
                setTimeout(() => { if (confirm('You were invited to a community on Dialed In. Join it?')) this.groupAct('join', code); }, 400);
            },
