            // ---- v14.4 (phase 3): the community feed. Your sync carries only your circle (you, friends, your groups, the
            // people you follow); everyone else's sessions shared with Everyone come a page at a time from the database
            // and live beside your circle's records (this.communityIds), so they never count toward your group goal,
            // awards, library or the Following feed. New backend only.
            commState() { return this._comm || (this._comm = { events: [], next: null, at: 0, loading: false, error: '' }); },

            feedMode() {
                if (!this.acctOn()) return 'following';
                if (!this._feedMode) { const saved = safeGet('dialed_feed_mode'); if (saved === 'community' || saved === 'following') this._feedMode = saved; }
                if (this._feedMode) return this._feedMode;
                // until you pick: Community for someone who follows nobody and has no group yet (their Following is empty)
                const d = this.ppState().data;
                return d && !(d.following || []).length && !this.knownPeople().some(n => n !== this.user) ? 'community' : 'following';
            },

            setFeedMode(mode) {
                this._feedMode = mode === 'community' ? 'community' : 'following';
                safeSet('dialed_feed_mode', this._feedMode);
                this._feedHtml = null;
                const st = this.commState();
                if (this._feedMode === 'community' && (!st.at || Date.now() - st.at > 60000)) this.loadCommunity(false);
                this.render();
                const g = document.getElementById('grid'); if (g && g.scrollIntoView && window.scrollY > 200) window.scrollTo({ top: 0 });
            },

            // the first page again (fresh), or with more = true the next older page
            async loadCommunity(more) {
                const st = this.commState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                if (more && !st.next) return;
                // photo links last two hours: after ninety minutes start over from the first page, so none go stale
                if (!more && st.born && Date.now() - st.born > 90 * 60000) { st.events = []; st.next = null; st.at = 0; st.born = 0; }
                if (!st.born) st.born = Date.now();
                const seq = st.seq = (st.seq || 0) + 1;   // v14.5: a filter change starts over; an answer for the old one is dropped
                st.loading = true; st.error = '';
                if (this.tab === 'feed' && this.feedMode() === 'community') this.render();
                try {
                    const args = { max_items: 30, ...(this.commFilterArgs ? this.commFilterArgs() : {}) };
                    const page = await Supa.rpc('community_feed', more ? { ...args, before: st.next } : args);
                    if (st.seq !== seq) return;
                    const raw = page && Array.isArray(page.events) ? page.events : [];
                    await Supa.linkPhotos(raw);   // photos in storage: short-lived links, as in a sync
                    if (st.seq !== seq) return;
                    const evs = raw.map(e => this.normalizeEvent(e)).filter(Boolean);
                    if (more) {
                        const have = new Set(st.events.map(e => e.type + ':' + e.id));
                        st.events = [...st.events, ...evs.filter(e => !have.has(e.type + ':' + e.id))];
                    } else {
                        // a fresh first page replaces what it covers and keeps older pages already loaded
                        const fresh = new Set(evs.map(e => e.type + ':' + e.id));
                        st.events = [...evs, ...st.events.filter(e => !fresh.has(e.type + ':' + e.id))];
                        if (!st.at) st.next = page ? page.next || null : null;
                    }
                    if (more) st.next = page ? page.next || null : null;
                    st.at = Date.now();
                } catch (e) {
                    if (st.seq === seq) st.error = e && e.signedOut ? '' : 'Couldn\'t load the community feed. Check your connection.';
                } finally { if (st.seq === seq) st.loading = false; }
                if (st.seq !== seq) return;
                this.process(this.cloud.events);
                if (this.tab === 'feed') { this._feedHtml = null; this.render(); }
            },

            // in process(): community records that aren't already part of your circle's sync
            applyCommunity() {
                this.communityIds = new Set();
                if (!this.acctOn()) return;
                const st = this.commState();
                // v14.5: and the profile of someone outside your circle you've opened (their sessions, coffees and gear)
                [...st.events, ...(this.profState ? this.profState().events : [])].forEach(ev => {
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

            // your own like or comment on a community session: keep the community copy up to date (your circle's sync
            // won't bring it back)
            noteCommunityPush(event) {
                if (!event || !this.isCommunity(event.type, event.id)) return;
                const st = this.commState();
                st.events = st.events.map(e => (e.type === event.type && String(e.id) === String(event.id) ? event : e));
            },

            feedModeHtml() {
                if (!this.acctOn()) return '';
                const m = this.feedMode();
                return `<div class="feed-top"><div class="seg-control feed-mode" role="tablist" aria-label="Feed">${[['following', 'Following'], ['community', 'Community']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === m}" aria-pressed="${k === m}" onclick="app.setFeedMode('${app.escJs(k)}')">${l}</button>`).join('')}</div>${this.notifButtonHtml ? this.notifButtonHtml() : ''}</div>`;
            },

            communityEntries() {
                const st = this.commState(), seen = new Set();
                return st.events.filter(e => e.type === 'brew' && !(this._reportedIds && this._reportedIds.has('brew:' + e.id))).map(e => this.brews.get(String(e.id))).filter(b => b && !seen.has(b.id) && seen.add(b.id) && b.audience !== 'only_me')
                    .sort((a, b) => this.toTime(b.date) - this.toTime(a.date))
                    .map(b => ({ kind: 'session', brewId: b.id, date: b.date, actorColor: b.actorColor || '', community: true }));
            },

            renderCommunityFeed(grid) {
                grid.className = 'feed-list';
                if (grid.setAttribute) grid.setAttribute('data-view', 'community');
                this._feedHtml = null;
                const st = this.commState();
                const entries = this.communityEntries();
                const head = this.feedModeHtml() + (this.communityGoalHtml ? this.communityGoalHtml() + this.commFilterHtml() : '');   // v14.5: the community goal and filters
                if (!entries.length) {
                    const f = st.filter || '';
                    const none = f === 'help' ? 'No help requests right now. When someone asks for help dialing in, it shows here.'
                        : f === 'new' ? 'Nobody new in the last two weeks.'
                        : f ? `No ${f.slice(2)} sessions shared with Everyone yet.`
                        : 'Nothing shared with Everyone yet. Sessions people share with Everyone show up here.';
                    const msg = st.loading || !st.at ? 'Loading the community…' : st.error || none;
                    grid.innerHTML = head + `<div class="comm-empty">${this.esc(msg)}</div>`;
                    return;
                }
                if (!st.loading && Date.now() - st.at > 120000) setTimeout(() => this.loadCommunity(false), 0);   // a fresh first page now and then
                if (!this.ppState().data && !this._peopleLoading) { this._peopleLoading = true; this.loadPeople().then(() => { this._peopleLoading = false; if (this.tab === 'feed') this.render(); }).catch(() => { this._peopleLoading = false; }); }
                const foot = st.error ? `<div class="comm-empty">${this.esc(st.error)}</div>`
                    : st.next ? `<button type="button" class="btn-outline comm-more" onclick="app.loadCommunity(true)"${st.loading ? ' disabled' : ''}>${st.loading ? 'Loading…' : 'Show older sessions'}</button>`
                    : `<div class="comm-empty">You're all caught up.</div>`;
                grid.innerHTML = head + entries.map(e => this.renderFeedSessionCard(e)).join('') + foot;
            },

            // on a community card: follow the person right there (their name and a Follow button)
            communityFollowHtml(owner) {
                if (!this.acctOn() || !owner || owner === this.user || !this.ppState().data) return '';
                const rel = this.relationTo(owner);
                if (rel.you || rel.blocked || this.knownPeople().includes(owner)) return '';
                return this.followBtnHtml(owner, rel, 'comm-follow', true);
            },
