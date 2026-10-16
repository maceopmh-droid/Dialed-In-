            // ---- v14.5 (phase 3, part two): anyone's profile, suggested people, help requests, community filters and goal,
            // profile links, reviewing reports. New backend only; on the Sheet none of it shows.

            // ---- anyone's profile. People in your circle come with your sync; anyone else's profile loads from the
            // database (what they share with Everyone, or everything you may see), and lives beside your circle's records
            // like the community feed does (applyCommunity), so it never counts toward your goals, awards or library.
            profState() { return this._prof || (this._prof = { name: '', events: [], card: null, at: 0, loading: false, error: '' }); },

            // someone whose sessions come with your sync: you, your private groups, the people you follow
            inCircle(name) {
                name = String(name || '');
                if (!name) return false;
                if (name === this.user || this.knownPeople().includes(name)) return true;
                const d = this.ppState().data;
                if (d && (d.following || []).some(f => f.name === name && f.status === 'accepted')) return true;
                return this.brewsOf(name).some(b => !this.isCommunity('brew', b.id));
            },

            openAnyProfile(name, event) {
                if (event && event.stopPropagation) event.stopPropagation();
                name = String(name || '').trim();
                if (!name || name === 'Unknown') return;
                if (!this.acctOn() && !(this.knownPeople().includes(name) || this.hasLoggedData(name))) return;
                ['people-modal', 'notif-modal', 'review-modal'].forEach(id => { const m = document.getElementById(id); if (m) m.classList.remove('active'); });
                if (this.acctOn() && name !== this.user && !this.inCircle(name)) {
                    const st = this.profState();
                    if (st.name !== name) { this._prof = { name, events: [], card: null, at: 0, loading: false, error: '' }; this.process(this.cloud.events); }
                    if (!this.profState().at || Date.now() - this.profState().at > 10 * 60000) this.loadProfilePage(name);
                }
                this.profileSection = 'overview';
                this.setTab('profile');
                this.setProfileUser(name);
                if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0 });
            },

            async loadProfilePage(name) {
                const st = this.profState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                st.loading = true; st.error = '';
                try {
                    const page = await Supa.rpc('profile_page', { name, max_items: 100 });
                    if (this.profState() !== st) return;   // someone else's opened meanwhile
                    const raw = page && Array.isArray(page.events) ? page.events : [];
                    await Supa.linkPhotos(raw);
                    st.events = raw.map(e => this.normalizeEvent(e)).filter(Boolean);
                    st.card = page && page.profile ? page.profile : null;
                    st.at = Date.now();
                } catch (e) {
                    st.error = e && e.signedOut ? '' : /nobody/i.test(String(e && e.message || '')) ? 'There\'s nobody by that name.' : 'Couldn\'t load this profile. Check your connection.';
                    st.at = Date.now();
                } finally { st.loading = false; }
                if (this.profState() !== st) return;
                this.process(this.cloud.events);
                if (this.tab === 'profile') this.render();
            },

            // under someone's name on their profile, when they're outside your circle: what you're looking at
            profileNoteHtml(who) {
                if (!this.acctOn() || who === this.user || this.inCircle(who)) return '';
                const st = this.profState();
                if (st.name !== who) return '';
                const card = st.card || {};
                const text = st.loading && !st.at ? 'Loading…'
                    : st.error ? st.error
                    : card.locked ? `${who}'s profile is private. Follow to ask to see their sessions.`
                    : !this.brewsOf(who).length ? `${who} hasn't shared any sessions with Everyone yet.`
                    : `What ${who} shares with Everyone.`;
                return `<p class="pp-profile-note">${this.esc(text)}</p>`;
            },

            // ---- suggested people (People tab): who brews the same coffees, roasters, grinder or methods as you
            sugState() { return this._sug || (this._sug = { list: null, at: 0, loading: false }); },

            async loadSuggestions(force) {
                const st = this.sugState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                if (!force && st.list && Date.now() - st.at < 10 * 60000) return;
                st.loading = true;
                try { const list = await Supa.rpc('suggest_people', { max_count: 8 }); st.list = Array.isArray(list) ? list : []; st.at = Date.now(); }
                catch (e) { if (!st.list) st.list = []; }
                finally { st.loading = false; }
                const m = document.getElementById('people-modal');
                if (m && m.classList.contains('active')) this.renderPeople();
            },

            suggestionsHtml() {
                const st = this.sugState();
                const rows = (st.list || []).filter(p => { const r = this.relationTo(p.name); return !r.you && !r.blocked && p.name !== this.user; }).slice(0, 6);
                if (!rows.length) return '';
                return `<h3 class="pp-h">Suggested</h3><div class="pp-list">${rows.map(p => this.peopleRowHtml(p.name, this.relationTo(p.name), { color: p.color, sub: p.reason || '' })).join('')}</div>`;
            },

            // ---- your profile's link: opens your profile (with Follow) for anyone signed in
            profileLink(name) {
                const base = (typeof location !== 'undefined' && /^https?:/.test(location.protocol)) ? location.origin + location.pathname : 'https://maceopmh-droid.github.io/Dialed-In-/';
                return `${base}?u=${encodeURIComponent(name || this.user || '')}`;
            },

            async shareProfile() {
                const url = this.profileLink(this.user), text = `Follow me on Dialed In: ${this.user}`;
                try {
                    if (navigator.share) { await navigator.share({ title: 'Dialed In', text, url }); return; }
                } catch (e) { if (e && e.name === 'AbortError') return; }
                try { await navigator.clipboard.writeText(url); this.showToast('Link copied. Send it to a friend.'); }
                catch (e) { prompt('Copy your profile link:', url); }
            },

            noteProfileLink() {
                try {
                    const name = new URLSearchParams(location.search).get('u');
                    if (!name) return;
                    safeSet('dialed_pending_profile', name);
                    const u = new URL(location.href); u.searchParams.delete('u'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
                } catch (e) {}
            },

            checkPendingProfile() {
                if (!this.acctOn() || !Supa.ready() || !this.user) return;
                const name = safeGet('dialed_pending_profile');
                if (!name) return;
                safeSet('dialed_pending_profile', '');
                if (name.toLowerCase() === String(this.user).toLowerCase()) return;
                this.openAnyProfile(name);
            },

            // ---- help requests. A session can ask for help dialing in (the log form's switch); the asker marks the most
            // helpful answer in the comments, and its author hears about it.
            helpTagHtml(brew) {
                if (!this.acctOn() || !brew) return '';
                if (brew.helpWanted) return `<span class="feed-tag is-help">${brew.helpfulAnswer ? 'Answered' : 'Asking for help'}</span>`;
                if (brew.newHere && this.getBrewOwner(brew) !== this.user) return '<span class="feed-tag">New here</span>';
                return '';
            },

            canMarkHelpful(kind, target, c) {
                return this.acctOn() && kind === 'brew' && target && target.helpWanted && this.getBrewOwner(target) === this.user && c && c.user !== this.user;
            },

            markHelpful(brewId, commentId, event) {
                if (event) event.stopPropagation();
                const brew = this.brews.get(String(brewId));
                if (!brew || this.getBrewOwner(brew) !== this.user) return;
                const same = String(brew.helpfulAnswer || '') === String(commentId);
                this.push({ ...brew, helpfulAnswer: same ? '' : String(commentId) });
                this.showToast(same ? 'Unmarked.' : 'Marked as the most helpful answer.');
            },

            // ---- the community feed's filters: Help, New here, one method
            commFilterHtml() {
                const st = this.commState(), f = st.filter || '';
                const gr = this.grState ? this.grState() : null;
                if (gr && !gr.list && !gr.busy) { gr.busy = true; this.loadGroups(true).then(() => { gr.busy = false; if (this.tab === 'feed' && this.feedMode() === 'community') this.render(); }).catch(() => { gr.busy = false; }); }
                const groups = (gr && gr.list || []).filter(g => g.open).map(g => ['g:' + g.id, g.name]);   // your open groups
                if (f.startsWith('g:') && !groups.some(([k]) => k === f)) groups.push([f, st.groupName || 'Group']);
                const opts = [['', 'All'], ['help', 'Help'], ['new', 'New here'], ...groups, ...['Espresso', 'Pour Over', 'French Press', 'AeroPress', 'Moka Pot', 'Cold Brew'].map(m => ['m:' + m, m])];
                return `<div class="comm-filters" role="tablist" aria-label="Show">${opts.map(([k, l]) => `<button type="button" class="comm-chip${k === f ? ' on' : ''}" role="tab" aria-selected="${k === f}" data-f="${this.esc(k)}" onclick="app.setCommFilter(this.getAttribute('data-f'))">${this.esc(l)}</button>`).join('')}</div>`;
            },

            setCommFilter(f) {
                const st = this.commState();
                f = String(f || '');
                if ((st.filter || '') === f) return;
                st.filter = f; st.events = []; st.next = null; st.at = 0; st.born = 0; st.error = ''; st.loading = false; st.seq = (st.seq || 0) + 1;
                this._feedHtml = null;
                this.process(this.cloud.events);
                this.loadCommunity(false);
                this.render();
            },

            commFilterArgs() {
                const f = this.commState().filter || '';
                return f === 'help' || f === 'new' ? { feed_filter: f } : f.startsWith('m:') ? { feed_method: f.slice(2) } : f.startsWith('g:') ? { feed_group: f.slice(2) } : {};
            },

            // ---- the community goal: one weekly goal everyone on Dialed In fills together
            goalState() { return this._cgoal || (this._cgoal = { goal: null, at: 0, loading: false }); },

            async loadCommunityGoal(force) {
                const st = this.goalState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                if (!force && st.goal && Date.now() - st.at < 10 * 60000) return;
                st.loading = true;
                let tz = 'America/Chicago'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
                try { const g = await Supa.rpc('community_goal', { tz }); if (g && g.title) { st.goal = g; st.at = Date.now(); } }
                catch (e) { st.at = Date.now(); }
                finally { st.loading = false; }
                if (this.tab === 'feed') { this._feedHtml = null; this.render(); }
            },

            communityGoalHtml() {
                if (!this.acctOn()) return '';
                const st = this.goalState(), g = st.goal;
                if (!st.loading && (!st.at || Date.now() - st.at > 10 * 60000)) setTimeout(() => this.loadCommunityGoal(), 0);
                if (!g) return '';
                const target = Math.max(1, Number(g.target) || 1), progress = Math.min(target, Number(g.progress) || 0), done = Boolean(g.done);
                const end = Date.parse(g.end), days = end ? Math.max(0, Math.ceil((end - Date.now()) / 864e5)) : 0;
                const left = done ? 'Done together' : days <= 1 ? 'Last day' : `${days} days left`;
                const pct = (progress / target * 100).toFixed(2);
                const style = `--cq-g:linear-gradient(90deg, var(--matcha) 0%, var(--matcha) ${pct}%, transparent ${pct}%);--cq-r1:${(100 - Number(pct)).toFixed(2)}%`;
                const mine = Number(g.yourSessions) || 0, people = Number(g.people) || 0;
                const you = mine ? `You: ${mine} session${mine === 1 ? '' : 's'}` : 'Your next session counts';
                return `
                    <section class="feed-card crew-quest comm-goal${done ? ' done' : ''}" aria-label="Community goal">
                        <div class="cq-top"><span class="cq-kicker"><svg class="icon"><use href="#i-target"/></svg>Community goal · this week</span><span class="cq-left">${this.esc(left)}</span></div>
                        <div class="cq-title">${this.esc(g.title)}</div>
                        <div class="cq-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${progress}" style="${this.esc(style)}"><div class="cq-layer cq-glow"><i class="cq-g"></i></div><div class="cq-layer cq-paint"><i class="cq-g"></i></div></div>
                        <div class="cq-meta"><span><b>${progress}</b> of ${target} ${this.esc(g.unit || '')}</span></div>
                        <div class="cq-foot"><span class="cg-you">${this.esc(you)}${people ? ` · ${people} ${people === 1 ? 'person' : 'people'} brewed this week` : ''}</span></div>
                    </section>`;
            },

            // ---- community guidelines (Settings; the Report box points here)
            openGuidelines() {
                const m = document.getElementById('review-modal'); if (!m) return;
                m.querySelector('h2').textContent = 'Community guidelines';
                document.getElementById('review-body').innerHTML = `<ul class="cg-rules">
                    <li><b>Be kind,</b> especially to people who are new.</li>
                    <li><b>Help, don't mock.</b> Say which way to go (finer, coarser, a longer ratio). Grind numbers only make sense on the same grinder.</li>
                    <li><b>Keep it about coffee.</b> No spam, no selling.</li>
                    <li><b>Share only what's yours</b> to share: your own photos and words.</li>
                    <li><b>Report what breaks these.</b> Nobody is told who reported it, and you stop seeing it right away.</li></ul>`;
                m.classList.add('active');
            },

            // ---- reviewing reports (reviewers only: Settings, under your account)
            isReviewer() { const me = this.ppState().me; return Boolean(this.acctOn() && me && me.admin); },

            async openReview() {
                const m = document.getElementById('review-modal'); if (!m) return;
                m.querySelector('h2').textContent = 'Reports';
                this._review = { list: null, error: '' };
                m.classList.add('active');
                this.renderReview();
                try { const list = await Supa.rpc('review_reports', {}); this._review.list = Array.isArray(list) ? list : []; }
                catch (e) { this._review.error = e && e.message ? e.message : 'Couldn\'t load reports.'; }
                this.renderReview();
            },

            closeReview() { const m = document.getElementById('review-modal'); if (m) m.classList.remove('active'); },

            renderReview() {
                const body = document.getElementById('review-body'), r = this._review || {};
                if (!body) return;
                if (r.error) { body.innerHTML = `<p class="pp-empty">${this.esc(r.error)}</p>`; return; }
                if (!r.list) { body.innerHTML = '<p class="pp-empty">Loading…</p>'; return; }
                if (!r.list.length) { body.innerHTML = '<p class="pp-empty">Nothing to review. Reports show up here.</p>'; return; }
                const what = x => x.kind === 'session' ? `${x.who || 'Someone'}'s session${x.coffee ? ` on ${x.coffee}` : ''}` : x.kind === 'comment' ? `${x.who || 'Someone'}'s comment` : x.kind === 'profile' ? `${x.who || 'Someone'}'s profile` : x.kind;
                body.innerHTML = `<div class="pp-list">${r.list.map(x => {
                    const t = this.esc(String(x.target || '')), k = this.esc(String(x.kind || ''));
                    const reasons = (x.reasons || []).filter(Boolean).map(s => `“${this.esc(s)}”`).join(' ');
                    return `<div class="rv-row"><div class="rv-what"><b>${this.esc(what(x))}</b><small>${x.count} report${x.count === 1 ? '' : 's'}${x.status === 'hidden' ? ' · hidden until you decide' : ''} · ${this.esc(this.formatRelativeDate(x.last))}</small>${x.text ? `<q>${this.esc(x.text)}</q>` : ''}${reasons ? `<small>${reasons}</small>` : ''}</div>
                        <div class="pp-acts"><button type="button" class="btn-outline pp-act" data-k="${k}" data-t="${t}" onclick="app.resolveReport(this.getAttribute('data-k'), this.getAttribute('data-t'), 'dismiss')">It's fine</button>${x.kind === 'session' || x.kind === 'comment' ? `<button type="button" class="btn-outline pp-act acct-delete" data-k="${k}" data-t="${t}" onclick="app.resolveReport(this.getAttribute('data-k'), this.getAttribute('data-t'), 'remove')">Remove</button>` : ''}</div></div>`;
                }).join('')}</div>`;
            },

            async resolveReport(kind, target, action) {
                if (action === 'remove' && !confirm(`Remove this ${kind}? It's deleted for everyone.`)) return;
                try {
                    await Supa.rpc('resolve_report', { kind, target, action });
                    if (this._review && this._review.list) this._review.list = this._review.list.filter(x => !(x.kind === kind && String(x.target) === String(target)));
                    this.renderReview();
                    this.showToast(action === 'remove' ? 'Removed.' : 'Shown again.');
                    this.runSync && this.runSync();
                } catch (e) { this.showToast(e && e.message ? e.message : 'That didn\'t work. Try again.'); }
            },
