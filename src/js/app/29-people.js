            // ---- v14.4 (phase 3): People. Find people by name, follow them (friends = you follow each other), answer
            // follow requests when your profile is private, and block. New backend only: on the Sheet none of it shows.
            ppState() { return this._people || (this._people = { data: null, me: null, at: 0, q: '', results: null, seq: 0, menu: '' }); },

            // who you follow, who follows you and who you've blocked, plus your own profile's privacy (cached a minute)
            async loadPeople(force) {
                if (!this.acctOn() || !Supa.ready()) return null;
                const st = this.ppState();
                if (!force && st.data && Date.now() - st.at < 60000) return st.data;
                const [data, me] = await Promise.all([Supa.rpc('my_people', {}), Supa.rpc('my_profile', {})]);
                st.data = data && typeof data === 'object' ? data : { following: [], followers: [], blocked: [] };
                st.me = me || null; st.at = Date.now();
                return st.data;
            },

            // the People button's count: follow requests waiting for you (inside the button, never a badge)
            peopleRequests() { const d = this.ppState().data; return d ? (d.followers || []).filter(f => f.status === 'pending') : []; },

            relationTo(name) {
                const d = this.ppState().data || {}, k = String(name || '').toLowerCase();
                const out = (d.following || []).find(f => String(f.name).toLowerCase() === k);
                const inn = (d.followers || []).find(f => String(f.name).toLowerCase() === k);
                return { you: out ? out.status : null, friend: Boolean(out && out.friend), followsYou: Boolean(inn && inn.status === 'accepted'), asks: Boolean(inn && inn.status === 'pending'),
                         blocked: (d.blocked || []).some(b => String(b).toLowerCase() === k) };
            },

            openPeople() {
                if (!this.acctOn()) return;
                const st = this.ppState(); st.q = ''; st.results = null; st.menu = '';
                const q = document.getElementById('people-q'); if (q) q.value = '';
                document.getElementById('people-modal').classList.add('active');
                this.renderPeople();
                this.loadPeople(true).then(() => this.renderPeople()).catch(e => this.peopleFailed(e));
            },

            closePeople() { const m = document.getElementById('people-modal'); if (m) m.classList.remove('active'); },

            peopleFailed(e) {
                if (e && e.signedOut) return;
                const body = document.getElementById('people-body');
                if (body && !this.ppState().data) body.innerHTML = `<p class="pp-empty">Couldn't load your people. Check your connection and try again.</p>`;
                else this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.');
            },

            // typing in the search box: people whose name starts with it (two letters or more)
            peopleSearch(value) {
                const st = this.ppState(); st.q = String(value || '');
                clearTimeout(this._peopleTimer);
                const q = st.q.trim();
                if (q.length < 2) { st.results = null; this.renderPeople(); return; }
                const seq = ++st.seq;
                this._peopleTimer = setTimeout(() => {
                    Supa.rpc('find_people', { q }).then(r => { if (seq !== st.seq) return; st.results = Array.isArray(r) ? r : []; this.renderPeople(); })
                        .catch(e => { if (seq === st.seq) this.peopleFailed(e); });
                }, 220);
            },

            personDotHtml(name, color) {
                return `<i class="acct-dot pp-dot" style="background:${this.esc(color || this.getUserColor(name))}">${this.esc(this.feedInitial(name))}</i>`;
            },

            // the one button that fits where you stand with someone
            followBtnHtml(name, rel, cls = '') {
                const n = this.esc(name), a = action => `onclick="app.peopleAct('${action}', this.getAttribute('data-name'))" data-name="${n}"`;
                if (rel.blocked) return `<button type="button" class="btn-outline pp-act ${cls}" ${a('unblock')}>Unblock</button>`;
                if (rel.you === 'accepted') return `<button type="button" class="btn-outline pp-act ${cls}" ${a('unfollow')}>Following</button>`;
                if (rel.you === 'pending') return `<button type="button" class="btn-outline pp-act is-quiet ${cls}" ${a('unfollow')}>Requested</button>`;
                return `<button type="button" class="btn-primary pp-act ${cls}" ${a('follow')}>${rel.followsYou ? 'Follow back' : 'Follow'}</button>`;
            },

            peopleRowHtml(name, rel, { color = '', sub = '', actions = '' } = {}) {
                const label = sub || (rel.friend ? 'Friends' : rel.asks ? 'Wants to follow you' : rel.followsYou && !rel.you ? 'Follows you' : rel.you === 'pending' ? 'Waiting for them to approve' : '');
                return `<div class="pp-row"><button type="button" class="pp-who" data-name="${this.esc(name)}" onclick="app.openPersonFromPeople(this.getAttribute('data-name'))">${this.personDotHtml(name, color)}<span><b>${this.esc(name)}</b>${label ? `<small>${this.esc(label)}</small>` : ''}</span></button><span class="pp-acts">${actions || this.followBtnHtml(name, rel)}</span></div>`;
            },

            renderPeople() {
                const body = document.getElementById('people-body');
                if (!body) return;
                const st = this.ppState(), d = st.data;
                if (st.q.trim().length >= 2) {
                    if (!st.results) { body.innerHTML = '<p class="pp-empty">Looking…</p>'; return; }
                    body.innerHTML = st.results.length
                        ? `<div class="pp-list">${st.results.map(p => this.peopleRowHtml(p.name, { ...this.relationTo(p.name), you: p.you || null, followsYou: Boolean(p.followsYou) }, { color: p.color, sub: p.private && !p.you ? 'Private profile' : '' })).join('')}</div>`
                        : `<p class="pp-empty">Nobody by that name yet.</p>`;
                    return;
                }
                if (!d) { body.innerHTML = '<p class="pp-empty">Loading…</p>'; return; }
                const following = d.following || [], followers = d.followers || [];
                const requests = followers.filter(f => f.status === 'pending');
                const friends = following.filter(f => f.friend && f.status === 'accepted');
                const just = following.filter(f => !f.friend);
                const fans = followers.filter(f => f.status === 'accepted' && !following.some(g => String(g.name).toLowerCase() === String(f.name).toLowerCase()));
                const section = (title, rows) => rows.length ? `<h3 class="pp-h">${title}<span>${rows.length}</span></h3><div class="pp-list">${rows.join('')}</div>` : '';
                const ask = name => { const n = this.esc(name); return `<button type="button" class="btn-primary pp-act" data-name="${n}" onclick="app.peopleAct('approve', this.getAttribute('data-name'))">Approve</button><button type="button" class="btn-outline pp-act" data-name="${n}" onclick="app.peopleAct('decline', this.getAttribute('data-name'))">Remove</button>`; };
                const html = [
                    section('Requests', requests.map(f => this.peopleRowHtml(f.name, this.relationTo(f.name), { color: f.color, actions: ask(f.name) }))),
                    section('Friends', friends.map(f => this.peopleRowHtml(f.name, this.relationTo(f.name), { color: f.color }))),
                    section('Following', just.map(f => this.peopleRowHtml(f.name, this.relationTo(f.name), { color: f.color }))),
                    section('Followers', fans.map(f => this.peopleRowHtml(f.name, this.relationTo(f.name), { color: f.color }))),
                    section('Blocked', (d.blocked || []).map(n => this.peopleRowHtml(n, { blocked: true }, { sub: 'They can\'t see or find you' }))),
                ].join('');
                body.innerHTML = html || `<p class="pp-empty">You're not following anyone yet. Find people by name above. When you follow each other, you're friends.</p>`;
            },

            // tap a name: their profile, when there's something of theirs you're allowed to see
            openPersonFromPeople(name) {
                if (!(this.knownPeople().includes(name) || this.hasLoggedData(name))) { this.showToast(`Nothing of ${name}'s to see yet.`); return; }
                this.closePeople();
                this.profileSection = 'overview';
                this.setTab('profile');
                this.setProfileUser(name);
            },

            async peopleAct(action, name) {
                if (!name) return;
                if (action === 'unfollow' && !confirm(`Stop following ${name}?`)) return;
                if (action === 'block' && !confirm(`Block ${name}? You won't see each other, they can't find you, comment or follow you, and they aren't told.`)) return;
                if (action === 'decline' && !confirm(`Remove ${name}'s request?`)) return;
                if (action === 'remove' && !confirm(`Remove ${name} as a follower? They aren't told.`)) return;
                const call = { follow: ['follow', { name }], unfollow: ['unfollow', { name }], approve: ['answer_follow', { name, accept: true }], decline: ['answer_follow', { name, accept: false }],
                               remove: ['answer_follow', { name, accept: false }], block: ['block', { name }], unblock: ['unblock', { name }] }[action];
                if (!call) return;
                const st = this.ppState(); st.menu = '';
                try {
                    const res = await Supa.rpc(call[0], call[1]);
                    if (action === 'follow') this.showToast(res === 'requested' ? `Asked to follow ${name}.` : `Following ${name}.`);
                    else if (action === 'block') this.showToast(`Blocked ${name}.`);
                    if (this.haptic) this.haptic('tick');
                    await this.loadPeople(true);
                    if (st.results) st.results = st.results.map(p => String(p.name).toLowerCase() === String(name).toLowerCase() ? { ...p, you: this.relationTo(name).you } : p).filter(p => action !== 'block' || p.name !== name);
                } catch (e) { this.peopleFailed(e); return; }
                this.renderPeople();
                if (this.tab === 'profile') this.render();
                this.sync({ silent: true });   // what you can see changed (their sessions, or none)
            },

            // the follow button (and a small menu with Block) on someone else's profile
            profileFollowHtml(name) {
                if (!this.acctOn() || !name || name === this.user || !this.ppState().data) return '';
                const rel = this.relationTo(name), st = this.ppState(), n = this.esc(name);
                const tag = rel.friend ? '<span class="you-tag pp-friend">Friends</span>' : rel.followsYou ? '<span class="pp-note">Follows you</span>' : '';
                const menu = st.menu === name ? `<div class="pp-menu">${rel.followsYou ? `<button type="button" data-name="${n}" onclick="app.peopleAct('remove', this.getAttribute('data-name'))">Remove follower</button>` : ''}${rel.blocked ? '' : `<button type="button" class="pp-danger" data-name="${n}" onclick="app.peopleAct('block', this.getAttribute('data-name'))">Block ${n}</button>`}</div>` : '';
                return `<div class="hero-follow">${this.followBtnHtml(name, rel, 'hero-act')}${tag}<button type="button" class="btn-clean pp-more" aria-label="More" data-name="${n}" onclick="app.togglePersonMenu(this.getAttribute('data-name'))"><span></span><span></span><span></span></button>${menu}</div>`;
            },

            togglePersonMenu(name) { const st = this.ppState(); st.menu = st.menu === name ? '' : name; this.render(); },

            // Settings: a private profile approves its followers
            peoplePrivacyHtml() {
                const me = this.ppState().me;
                if (!me) return '';
                return `<div class="pp-private"><span><b>Private profile</b><small>Only people you approve can follow you or see what you share with Everyone.</small></span><button type="button" class="goal-sw" role="switch" aria-checked="${me.private ? 'true' : 'false'}" aria-label="Private profile" onclick="const on = this.getAttribute('aria-checked') !== 'true'; this.setAttribute('aria-checked', on ? 'true' : 'false'); app.setPrivateProfile(on)"></button></div>`;
            },

            async setPrivateProfile(on) {
                try {
                    const me = await Supa.rpc('set_private', { make_private: Boolean(on) });
                    this.ppState().me = me || this.ppState().me;
                    await this.loadPeople(true);
                    this.showToast(on ? 'Your profile is private. You approve new followers.' : 'Your profile is open. Anyone can follow you.');
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
                if (document.getElementById('settings-modal').classList.contains('active')) this.openSettings();
                this.sync({ silent: true });
            },
        };
