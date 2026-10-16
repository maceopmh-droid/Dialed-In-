            // ---- v14.4 (phase 3): the Feed beyond your circle. Your sync carries only your circle (you, friends, your private
            // communities, the people you follow). v14.5: the Feed has three tabs: Following (your circle, as before),
            // Community (one of your communities at a time: its members' sessions, its goal and awards) and Discover
            // (everyone's sessions shared with Everyone, ranked by discover_feed). What these bring in lives beside your
            // circle's records (this.communityIds), so it never counts toward your goals, awards, library or Following.
            // New backend only.
            streamState(key) {
                this._streams = this._streams || {};
                return this._streams[key] || (this._streams[key] = { events: [], order: [], next: null, asOf: null, at: 0, born: 0, loading: false, error: '', seq: 0, filter: '' });
            },
            commState() { return this.streamState('discover'); },   // Discover (and its filters)

            feedMode() {
                if (!this.acctOn()) return 'following';
                if (!this._feedMode) {
                    const saved = safeGet('dialed_feed_mode');
                    if (saved === 'following' || saved === 'groups' || saved === 'discover') this._feedMode = saved;
                    else if (saved === 'community') this._feedMode = 'discover';   // v14.4's Community is v14.5's Discover
                }
                if (this._feedMode) return this._feedMode;
                // until you pick: Discover for someone who follows nobody and has no community yet (their Following is empty)
                const d = this.ppState().data;
                return d && !(d.following || []).length && !this.knownPeople().some(n => n !== this.user) ? 'discover' : 'following';
            },

            setFeedMode(mode) {
                if (mode === 'community') mode = 'discover';   // (v14.4's name for it)
                const was = this.feedMode();
                this._feedMode = mode === 'groups' || mode === 'discover' ? mode : 'following';
                safeSet('dialed_feed_mode', this._feedMode);
                this._feedHtml = null; this._groupMenu = false;
                const fresh = st => !st.loading && (was !== this._feedMode || !st.at || Date.now() - st.at > 1500);   // tapping a tab (even the one you're on): what's new since
                if (this._feedMode === 'discover') { const st = this.commState(); if (fresh(st)) this.loadCommunity(false); }
                if (this._feedMode === 'groups') { const id = this.feedGroupId(); if (id) { const st = this.streamState('g:' + id); if (fresh(st)) this.loadGroupFeed(id, false); } }
                this.render();
                const g = document.getElementById('grid'); if (g && g.scrollIntoView && window.scrollY > 200) window.scrollTo({ top: 0 });
            },

            feedModeHtml() {
                if (!this.acctOn()) return '';
                const m = this.feedMode();
                return `<div class="feed-top"><div class="seg-control feed-mode" role="tablist" aria-label="Feed">${[['following', 'Following'], ['groups', 'Community'], ['discover', 'Discover']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === m}" aria-pressed="${k === m}" onclick="app.setFeedMode('${app.escJs(k)}')">${l}</button>`).join('')}</div>${this.notifButtonHtml ? this.notifButtonHtml() : ''}</div>`;
            },

            // Discover, the first page again (fresh: ranked as of now), or with more = true the next page of the same ranking
            async loadCommunity(more) {
                const st = this.commState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                if (more && st.next === null) return;
                // photo links last two hours: after ninety minutes start over from the first page, so none go stale
                if (!more && st.born && Date.now() - st.born > 90 * 60000) { st.events = []; st.order = []; st.next = null; st.at = 0; st.born = 0; }
                const seq = st.seq = (st.seq || 0) + 1;   // a filter change starts over; an answer for the old one is dropped
                st.loading = true; st.error = '';
                if (this.tab === 'feed' && this.feedMode() === 'discover') this.render();
                try {
                    const args = { max_items: 20, ...(this.commFilterArgs ? this.commFilterArgs() : {}) };
                    const page = await Supa.rpc('discover_feed', more ? { ...args, as_of: st.asOf, page: st.next } : args);
                    if (st.seq !== seq) return;
                    const raw = page && Array.isArray(page.events) ? page.events : [];
                    await Supa.linkPhotos(raw);   // photos in storage: short-lived links, as in a sync
                    if (st.seq !== seq) return;
                    const evs = raw.map(e => this.normalizeEvent(e)).filter(Boolean), order = (page && Array.isArray(page.order) ? page.order : []).map(String);
                    if (more) {
                        const have = new Set(st.events.map(e => e.type + ':' + e.id));
                        st.events = [...st.events, ...evs.filter(e => !have.has(e.type + ':' + e.id))];
                        st.order = [...st.order, ...order.filter(id => !st.order.includes(id))];
                    } else { st.events = evs; st.order = order; st.asOf = page ? page.asOf : null; st.born = Date.now(); }
                    st.next = page && page.next !== null && page.next !== undefined ? page.next : null;
                    st.at = Date.now();
                } catch (e) {
                    if (st.seq === seq) { st.error = e && e.signedOut ? '' : 'Couldn\'t load Discover. Check your connection.'; st.at = Date.now(); }
                } finally { if (st.seq === seq) st.loading = false; }
                if (st.seq !== seq) return;
                this.process(this.cloud.events);
                if (this.tab === 'feed') { this._feedHtml = null; this.render(); }
            },

            // one community's feed: its members' sessions you may see, newest first, a page at a time
            async loadGroupFeed(id, more) {
                const st = this.streamState('g:' + id);
                if (st.loading || !this.acctOn() || !Supa.ready() || !id) return;
                if (more && !st.next) return;
                if (!more && st.born && Date.now() - st.born > 90 * 60000) { st.events = []; st.next = null; st.at = 0; st.born = 0; }
                if (!st.born) st.born = Date.now();
                const seq = st.seq = (st.seq || 0) + 1;
                st.loading = true; st.error = '';
                try {
                    const page = await Supa.rpc('community_feed', more ? { max_items: 30, feed_group: id, before: st.next } : { max_items: 30, feed_group: id });
                    if (st.seq !== seq) return;
                    const raw = page && Array.isArray(page.events) ? page.events : [];
                    await Supa.linkPhotos(raw);
                    if (st.seq !== seq) return;
                    const evs = raw.map(e => this.normalizeEvent(e)).filter(Boolean);
                    if (more) {
                        const have = new Set(st.events.map(e => e.type + ':' + e.id));
                        st.events = [...st.events, ...evs.filter(e => !have.has(e.type + ':' + e.id))];
                        st.next = page ? page.next || null : null;
                    } else {
                        const fresh = new Set(evs.map(e => e.type + ':' + e.id));
                        st.events = [...evs, ...st.events.filter(e => !fresh.has(e.type + ':' + e.id))];
                        if (!st.at) st.next = page ? page.next || null : null;
                    }
                    st.at = Date.now();
                } catch (e) {
                    if (st.seq === seq) { st.error = e && e.signedOut ? '' : 'Couldn\'t load this community. Check your connection.'; st.at = Date.now(); }
                } finally { if (st.seq === seq) st.loading = false; }
                if (st.seq !== seq) return;
                this.process(this.cloud.events);
                if (this.tab === 'feed') { this._feedHtml = null; this.render(); }
            },

            // in process(): records from Discover, communities and an opened profile that aren't already part of your circle's sync
            applyCommunity() {
                this.communityIds = new Set();
                if (!this.acctOn()) return;
                const all = [...Object.values(this._streams || {}).flatMap(st => st.events), ...(this.profState ? this.profState().events : [])];
                all.forEach(ev => {
                    if (ev.type === 'gear') { const o = String(ev.owner || ''); if (o && o !== this.user && !o.startsWith('__') && !this.gearByUser.has(o)) this.gearByUser.set(o, ev); return; }
                    if (ev.type !== 'bean' && ev.type !== 'brew') return;
                    const id = String(ev.id), key = ev.type + ':' + id;
                    if (ev.type === 'bean' ? this.beans.has(id) : this.brews.has(id)) return;
                    if (ev.actor && ev.actorColor && !this.userColors[ev.actor]) this.userColors[ev.actor] = this.normalizeHexColor(ev.actorColor) || this.userColors[ev.actor];
                    this.applyEvent(ev);
                    this.communityIds.add(key);
                });
            },

            isCommunity(type, id) { return Boolean(this.communityIds && this.communityIds.has(`${type}:${id}`)); },

            // your own like or comment on one of these sessions: keep its copy up to date (your circle's sync won't bring it back)
            noteCommunityPush(event) {
                if (!event || !this.isCommunity(event.type, event.id)) return;
                Object.values(this._streams || {}).forEach(st => { st.events = st.events.map(e => (e.type === event.type && String(e.id) === String(event.id) ? event : e)); });
                if (this.profState) { const p = this.profState(); p.events = p.events.map(e => (e.type === event.type && String(e.id) === String(event.id) ? event : e)); }
            },

            streamCard(b, community) { return this.renderFeedSessionCard({ kind: 'session', brewId: b.id, date: b.date, actorColor: b.actorColor || '', community }); },
            reported(id) { return Boolean(this._reportedIds && this._reportedIds.has('brew:' + id)); },

            // Discover's sessions, in its ranking
            communityEntries() {
                const st = this.commState(), seen = new Set();
                return st.order.map(id => this.brews.get(String(id))).filter(b => b && !seen.has(b.id) && seen.add(b.id) && b.audience !== 'only_me' && !this.reported(b.id));
            },

            renderCommunityFeed(grid) {
                grid.className = 'feed-list';
                if (grid.setAttribute) grid.setAttribute('data-view', 'community');
                this._feedHtml = null;
                if (!this.ppState().data && !this._peopleLoading) { this._peopleLoading = true; this.loadPeople().then(() => { this._peopleLoading = false; if (this.tab === 'feed') this.render(); }).catch(() => { this._peopleLoading = false; }); }
                if (this.feedMode() === 'groups') { this.renderGroupFeed(grid); return; }
                const st = this.commState();
                const list = this.communityEntries();
                const head = this.feedModeHtml() + (this.communityGoalHtml ? this.communityGoalHtml() : '') + (this.commFilterHtml ? this.commFilterHtml() : '');
                if (!list.length) {
                    const f = st.filter || '';
                    const none = f === 'help' ? 'No help requests right now. When someone asks for help dialing in, it shows here.'
                        : f === 'new' ? 'Nobody new in the last two weeks.'
                        : f ? `No ${f.slice(2)} sessions shared with Everyone lately.`
                        : 'Nothing shared with Everyone lately. Sessions people share with Everyone show up here.';
                    grid.innerHTML = head + `<div class="comm-empty">${this.esc(st.loading || !st.at ? 'Loading…' : st.error || none)}</div>`;
                    if (!st.loading && (!st.at || Date.now() - st.at > 60000)) setTimeout(() => this.loadCommunity(false), 0);
                    return;
                }
                if (!st.loading && Date.now() - st.at > 10 * 60000 && window.scrollY < 300) setTimeout(() => this.loadCommunity(false), 0);   // ranked afresh now and then (only from the top)
                const foot = st.error ? `<div class="comm-empty">${this.esc(st.error)}</div>`
                    : st.next !== null ? `<button type="button" class="btn-outline comm-more" onclick="app.loadCommunity(true)"${st.loading ? ' disabled' : ''}>${st.loading ? 'Loading…' : 'Show more'}</button>`
                    : `<div class="comm-empty">You're all caught up.</div>`;
                grid.innerHTML = head + list.map(b => this.streamCard(b, true)).join('') + foot;
            },

            // ---- the Community tab: one of your communities at a time (a picker when you're in more than one)
            feedGroupId() {
                const gr = this.grState(), list = gr.list || [];
                if (!list.length) return '';
                const want = this._feedGroup || safeGet('dialed_feed_group') || '';
                return (list.find(g => String(g.id) === String(want)) || list[0]).id;
            },

            pickFeedGroup(id) {
                this._feedGroup = String(id || ''); safeSet('dialed_feed_group', this._feedGroup);
                this._groupMenu = false; this._feedHtml = null;
                const st = this.streamState('g:' + id);
                if (!st.at || Date.now() - st.at > 60000) this.loadGroupFeed(id, false);
                this.render();
            },

            toggleGroupMenu(event) {
                if (event) event.stopPropagation();
                this._groupMenu = !this._groupMenu; this._feedHtml = null; this.render();
                if (this._groupMenu && typeof document !== 'undefined') {   // a tap anywhere else closes it
                    const close = e => { if (e.target && e.target.closest && e.target.closest('.grp-pick')) return; document.removeEventListener('click', close, true); if (this._groupMenu) { this._groupMenu = false; this._feedHtml = null; this.render(); } };
                    setTimeout(() => document.addEventListener('click', close, true), 0);
                }
            },

            renderGroupFeed(grid) {
                const gr = this.grState();
                if (!gr.list) {
                    grid.innerHTML = this.feedModeHtml() + '<div class="comm-empty">Loading…</div>';
                    if (!gr.busy) { gr.busy = true; this.loadGroups(true).then(() => { gr.busy = false; if (this.tab === 'feed') this.render(); }).catch(() => { gr.busy = false; gr.list = gr.list || []; if (this.tab === 'feed') this.render(); }); }
                    return;
                }
                if (!gr.list.length) {
                    grid.innerHTML = this.feedModeHtml() + `<div class="grp-empty"><b>Find your community</b><p>Communities are groups around friends, a place or a way of brewing: your roommates, a cafe's regulars, Moka pot people. Each one has its own feed.</p><div class="gr-actions"><button type="button" class="btn-primary pp-act" onclick="app.openPeople('groups'); app.groupForm('find')">Find communities</button><button type="button" class="btn-outline pp-act" onclick="app.openPeople('groups'); app.groupForm('create')">Start one</button></div></div>`;
                    return;
                }
                const id = this.feedGroupId(), g = gr.list.find(x => String(x.id) === String(id)) || gr.list[0];
                const st = this.streamState('g:' + g.id);
                if (!st.loading && (!st.at || Date.now() - st.at > 120000)) setTimeout(() => this.loadGroupFeed(g.id, false), 0);
                const n = (g.members || []).length;
                const menu = this._groupMenu ? `<div class="pp-menu grp-menu">${gr.list.map(x => `<button type="button" class="${String(x.id) === String(g.id) ? 'on' : ''}" data-g="${this.esc(String(x.id))}" onclick="app.pickFeedGroup(this.getAttribute('data-g'))"><b>${this.esc(x.name)}</b><small>${(x.members || []).length} ${(x.members || []).length === 1 ? 'person' : 'people'} · ${x.open ? 'open' : 'private'}</small></button>`).join('')}<i class="grp-sep"></i><button type="button" onclick="app.openPeople('groups'); app.groupForm('find')">Find communities</button><button type="button" onclick="app.openPeople('groups'); app.groupForm('create')">Start a community</button></div>` : '';
                const pick = `<div class="grp-pick"><button type="button" class="grp-pick-btn" aria-expanded="${this._groupMenu ? 'true' : 'false'}" onclick="app.toggleGroupMenu(event)"><span class="grp-name">${this.esc(g.name)}</span><svg class="icon"><use href="#i-chevron-down"/></svg></button><span class="grp-meta">${n} ${n === 1 ? 'person' : 'people'} · ${g.open ? 'open' : 'private'}</span>${menu}</div>`;
                // a private community is the people who share the group goal and monthly awards (the crew's)
                const tops = g.open ? '' : [this.renderCrewQuest(), this.renderAwardsTeaser()].join('');
                const seen = new Set();
                const list = st.events.filter(e => e.type === 'brew').map(e => this.brews.get(String(e.id))).filter(b => b && !seen.has(b.id) && seen.add(b.id) && b.audience !== 'only_me' && !this.reported(b.id))
                    .sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                const body = list.length ? list.map(b => this.streamCard(b, this.isCommunity('brew', b.id))).join('')
                    : `<div class="comm-empty">${this.esc(st.loading || !st.at ? 'Loading…' : st.error || (g.open ? 'Nothing here yet. Members\' sessions shared with Everyone show here.' : 'Nothing here yet. Members\' sessions show here.'))}</div>`;
                const foot = !list.length ? '' : st.error ? `<div class="comm-empty">${this.esc(st.error)}</div>`
                    : st.next ? `<button type="button" class="btn-outline comm-more" data-g="${this.esc(String(g.id))}" onclick="app.loadGroupFeed(this.getAttribute('data-g'), true)"${st.loading ? ' disabled' : ''}>${st.loading ? 'Loading…' : 'Show older sessions'}</button>`
                    : `<div class="comm-empty">You're all caught up.</div>`;
                grid.innerHTML = this.feedModeHtml() + pick + tops + body + foot;
            },

            // on a Discover card: follow the person right there (their name and a Follow button)
            communityFollowHtml(owner) {
                if (!this.acctOn() || !owner || owner === this.user || !this.ppState().data) return '';
                const rel = this.relationTo(owner);
                if (rel.you || rel.blocked || this.knownPeople().includes(owner)) return '';
                return this.followBtnHtml(owner, rel, 'comm-follow', true);
            },
