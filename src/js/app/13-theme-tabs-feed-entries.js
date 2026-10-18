            // ---- appearance (v10)
            setThemePref(pref) {
                if (!['system', 'light', 'dark'].includes(pref)) return;
                if (window.__dialedTheme) window.__dialedTheme.set(pref);
                this.renderThemeControl();
                this.onThemeChange();
            },

            renderThemeControl() {
                const pref = window.__dialedTheme ? window.__dialedTheme.pref : 'system';
                document.querySelectorAll('[data-theme-opt]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-opt') === pref)));
            },

            onThemeChange() {
                if (this.nativeStatusBar) this.nativeStatusBar();
                // canvases read colors when drawn, so redraw what's on screen
                try { this.render(); } catch (err) { console.warn('theme redraw', err); }
                if (this.activeGroup && this.detailBrews) {
                    try { this.openDetail(this.activeGroup, this.detailAllBrews || this.detailBrews); } catch (err) { console.warn('theme detail redraw', err); }
                }
            },

            setTab(tab) {
                const prevTab = this.tab;
                if (tab === 'shared') { tab = 'my'; this.coffeeScope = 'all'; }   // v15.1: the old Shared tab is Coffees, All
                if (tab === 'profile' && this.tab !== 'profile') this.profileUser = this.user;
                const freshRecap = tab === 'profile' && this.tab !== 'profile' && !this._noRecapJump ? this.freshRecap() : null;
                if (freshRecap) { this.profileSection = 'activity'; this.recapPeriod = freshRecap; this._recapOpen = true; setTimeout(() => { const el = document.getElementById('recap-card'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); }
                this.tab = tab;
                if (this.setBarsTucked) this.setBarsTucked(false);   // v14.7: a new tab starts with both bars
                document.querySelectorAll('.nav-btn, .mob-item').forEach(el => el.classList.remove('active'));
                document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.add('active'));
                // v15.1: the page title is the tab's name (Coffees holds yours and everyone's; Roasters is its own tab)
                const titles = { my: 'Coffees', roasters: 'Roasters', feed: 'Feed', profile: 'Profile' };
                document.getElementById('view-title').innerText = titles[tab] || 'Coffees';
                document.body.classList.toggle('feed-mode', tab === 'feed' || tab === 'profile');
                document.body.classList.toggle('roasters-mode', tab === 'roasters');
                if (prevTab !== tab && document.body.classList.contains('search-open')) { document.body.classList.remove('search-open'); const t = document.getElementById('search-input-top'); if (t) t.value = ''; ['search-input', 'search-input-mobile'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }   // v15.1: a new tab starts unsearched
                ['search-input', 'search-input-mobile', 'search-input-top'].forEach(id => { const el = document.getElementById(id); if (el) el.placeholder = tab === 'roasters' ? 'Search roasters…' : 'Search coffees…'; });
                this.closeMobileControls();
                this.updateAchievementCount();
                this.render();
                if (tab === 'feed') this.playCrewLoop();
            },

            beanGroupKey(bean) {
                if (!bean) return '';
                return `${bean.name || ''}${bean.roaster || ''}`.toLowerCase().trim();
            },

            mergeGroupMeta(beans) {
                const byTime = [...beans].sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                const latest = byTime[0] || {};
                const pick = (field) => {
                    for (const item of byTime) {
                        const value = String(item[field] || '').trim();
                        if (value) return value;
                    }
                    return '';
                };
                return {
                    ...latest,
                    roaster: pick('roaster'),
                    name: pick('name'),
                    variety: pick('variety'),
                    origin: pick('origin'),
                    process: pick('process'),
                    roast: pick('roast'),
                    roastDate: pick('roastDate')
                };
            },

            buildBeanGroups() {
                const groups = {};
                this.beans.forEach(bean => {
                    const key = this.beanGroupKey(bean);
                    if (!key) return;
                    if (!groups[key]) {
                        groups[key] = {
                            ids: [],
                            beans: [],
                            users: new Set(),
                            addedAt: this.toTime(bean.date) || Infinity
                        };
                    }
                    groups[key].ids.push(bean.id);
                    groups[key].beans.push(bean);
                    groups[key].users.add(bean.user);
                    groups[key].addedAt = Math.min(groups[key].addedAt, this.toTime(bean.date) || Infinity);
                    groups[key].meta = this.mergeGroupMeta(groups[key].beans);
                });

                return Object.values(groups).map(group => {
                    const idSet = new Set(group.ids);
                    const brews = Array.from(this.brews.values()).filter(brew => idSet.has(brew.beanId));
                    return { group, brews };
                });
            },

            createAchievementStats() {
                return {
                    doseTotal: 0,
                    yieldTotal: 0,
                    brewTimeTotal: 0,
                    sessionCount: 0,
                    beanIds: new Set(),
                    methodSet: new Set(),
                    commentsWritten: 0,
                    likesReceived: 0,
                    originSet: new Set(),
                    continentSet: new Set(),   // v15.1
                    processSet: new Set(),
                    roastSet: new Set(),
                    roasterSet: new Set(),
                    roasterLog: [],
                    samplerMax: 0
                };
            },

            getAchievementStatsForUser(statsByUser, user) {
                const key = String(user || 'Unknown');
                if (!statsByUser.has(key)) statsByUser.set(key, this.createAchievementStats());
                return statsByUser.get(key);
            },

            evaluateAchievementUnlocks(user, stats, levelsByUser, ts, sourceType, sourceId) {
                const actor = String(user || 'Unknown');
                if (!levelsByUser[actor]) levelsByUser[actor] = {};
                const userLevels = levelsByUser[actor];
                const unlocks = [];
                this.getAchievementCatalog().forEach(def => {
                    const value = Number(def.metric(stats) || 0);
                    const nextLevel = this.getAchievementLevel(value, def.thresholds);
                    const prevLevel = Number(userLevels[def.key] || 0);
                    if (nextLevel <= prevLevel) return;
                    for (let level = prevLevel + 1; level <= nextLevel; level += 1) {
                        unlocks.push({
                            id: `unlock-${actor}-${def.key}-${level}-${this.toTime(ts)}`,
                            key: def.key,
                            level,
                            threshold: def.thresholds[level - 1],
                            user: actor,
                            date: ts,
                            sourceType,
                            sourceId: String(sourceId || ''),
                            definition: def
                        });
                    }
                    userLevels[def.key] = nextLevel;
                });
                return unlocks;
            },

            buildFeedEntries(events) {
                const items = [];
                const seenBeanIds = new Set();
                const beanKeyUsers = new Map();
                const brewStates = new Map();
                const beanStates = new Map();
                const statsByUser = new Map();
                const levelsByUser = {};
                const unlockByBrew = new Map();
                const unlockByBean = new Map();

                const appendUnlocks = (unlocks, sourceType, sourceId) => {
                    if (!Array.isArray(unlocks) || !unlocks.length) return;
                    const key = String(sourceId || '');
                    if (!key) return;
                    const targetMap = sourceType === 'bean' ? unlockByBean : unlockByBrew;
                    if (!targetMap.has(key)) targetMap.set(key, []);
                    const row = targetMap.get(key);
                    unlocks.forEach(unlock => {
                        row.push(unlock);
                    });
                };

                // a comment counts toward its writer's "comments written" the first time it's seen
                const countComment = (comment, fallbackActor, ts, kind, id) => {
                    const commentActor = String(comment.user || fallbackActor || 'Unknown');
                    const commenterStats = this.getAchievementStatsForUser(statsByUser, commentActor);
                    commenterStats.commentsWritten += 1;
                    appendUnlocks(this.evaluateAchievementUnlocks(commentActor, commenterStats, levelsByUser, comment.timestamp || ts, kind, id), kind, id);
                };

                events.forEach(event => {
                    const ts = event.date || event.eventAt || new Date().toISOString();
                    if ((event.type === 'brew' && !this.brews.has(String(event.id))) || (event.type === 'bean' && !this.beans.has(String(event.id)))) return;   // v13.4: deleted since
                    if ((event.type === 'brew' || event.type === 'bean') && this.communityIds && this.communityIds.has(`${event.type}:${event.id}`)) return;   // v14.4: someone outside your circle (Community)
                    if (event.type === 'bean') {
                        const beanId = String(event.id || '');
                        if (!beanId) return;
                        const actor = String(event.actor || event.user || 'Unknown');
                        const owner = String(event.user || actor || 'Unknown');
                        const actorColor = this.getUserColor(actor, event.actorColor || '');
                        const likes = this.normalizeLikeList(event.likes, owner);
                        const comments = this.normalizeCommentList(event.comments, `bean-${beanId}`, ts);
                        const key = this.beanGroupKey(event);
                        const users = beanKeyUsers.get(key) || new Set();
                        const libraryAdd = users.size > 0 && !users.has(actor);
                        users.add(actor);
                        beanKeyUsers.set(key, users);
                        const beanName = `${event.roaster || ''} ${event.name || ''}`.trim() || 'Unnamed coffee';
                        const prevBean = beanStates.get(beanId);

                        if (!seenBeanIds.has(beanId)) {
                            seenBeanIds.add(beanId);
                            items.push({
                                id: `feed-bean-${beanId}-${this.toTime(ts)}`,
                                kind: libraryAdd ? 'library' : 'bean',
                                kindLabel: libraryAdd ? 'Added' : 'New coffee',
                                actor,
                                actorColor,
                                date: ts,
                                text: libraryAdd
                                    ? `${actor} added ${beanName} to their library`
                                    : `${actor} added a new bean: ${beanName}`,
                                beanId,
                                beanName
                            });
                        }

                        if (prevBean) {
                            const prevLikeCount = Array.isArray(prevBean.likes) ? prevBean.likes.length : 0;
                            const likeDelta = likes.length - prevLikeCount;
                            if (likeDelta) {
                                const ownerStats = this.getAchievementStatsForUser(statsByUser, owner);
                                ownerStats.likesReceived = Math.max(0, ownerStats.likesReceived + likeDelta);
                                if (likeDelta > 0) {
                                    appendUnlocks(
                                        this.evaluateAchievementUnlocks(owner, ownerStats, levelsByUser, ts, 'bean', beanId),
                                        'bean',
                                        beanId
                                    );
                                }
                            }
                            const seenCommentIds = new Set((prevBean.comments || []).map(comment => String(comment.id || '')));
                            comments.forEach(comment => {
                                if (seenCommentIds.has(String(comment.id || ''))) return;
                                countComment(comment, actor, ts, 'bean', beanId);
                            });
                        } else {
                            // v14.2: a coffee that arrives with likes or comments already on it counts them now. The new
                            // backend sends each record once, as it is today; from the Sheet a coffee's first save has none.
                            if (likes.length) {
                                const ownerStats = this.getAchievementStatsForUser(statsByUser, owner);
                                ownerStats.likesReceived += likes.length;
                                appendUnlocks(this.evaluateAchievementUnlocks(owner, ownerStats, levelsByUser, ts, 'bean', beanId), 'bean', beanId);
                            }
                            comments.forEach(comment => countComment(comment, actor, ts, 'bean', beanId));
                        }

                        beanStates.set(beanId, {
                            ...event,
                            user: owner,
                            owner,
                            likes,
                            comments
                        });
                        return;
                    }

                    if (event.type !== 'brew') return;
                    const brewId = String(event.id || '');
                    if (!brewId) return;
                    const owner = this.getBrewOwner(event);
                    const actor = String(event.actor || owner || 'Unknown');
                    const actorColor = this.getUserColor(actor, event.actorColor || '');
                    const prev = brewStates.get(brewId);
                    const nextLikes = this.normalizeLikeList(event.likes, owner);
                    const nextComments = this.normalizeCommentList(event.comments, `brew-${brewId}`, ts);
                    const ownerStats = this.getAchievementStatsForUser(statsByUser, owner);

                    const doseNow = this.asNumber(event.dose, 0);
                    const yieldNow = this.asNumber(event.yield, 0);
                    const timeNow = this.asNumber(event.time, 0);
                    const dosePrev = prev ? this.asNumber(prev.dose, 0) : 0;
                    const yieldPrev = prev ? this.asNumber(prev.yield, 0) : 0;
                    const timePrev = prev ? this.asNumber(prev.time, 0) : 0;
                    ownerStats.doseTotal = Math.max(0, ownerStats.doseTotal + (doseNow - dosePrev));
                    ownerStats.yieldTotal = Math.max(0, ownerStats.yieldTotal + (yieldNow - yieldPrev));
                    ownerStats.brewTimeTotal = Math.max(0, ownerStats.brewTimeTotal + (timeNow - timePrev));
                    if (!prev) {
                        ownerStats.sessionCount += 1;
                        if (event.beanId) ownerStats.beanIds.add(String(event.beanId));
                        this.trackExploration(ownerStats, event);
                    }
                    if (event.method) ownerStats.methodSet.add(String(event.method));
                    const likeDelta = nextLikes.length - (prev ? (Array.isArray(prev.likes) ? prev.likes.length : 0) : 0);
                    ownerStats.likesReceived = Math.max(0, ownerStats.likesReceived + likeDelta);

                    if (!prev) {
                        nextComments.forEach(comment => { if (String(comment.id || '')) countComment(comment, actor, ts, 'brew', brewId); });   // v14.2: as for coffees
                        const bean = this.beans.get(event.beanId);
                        const beanName = bean ? `${bean.roaster || ''} ${bean.name || ''}`.trim() : 'Coffee';
                        items.push({
                            id: `feed-brew-${brewId}-${this.toTime(ts)}`,
                            kind: 'session',
                            kindLabel: 'Session',
                            actor: owner,
                            actorColor: this.getUserColor(owner, actorColor),
                            date: ts,
                            text: `${owner} logged a ${event.method || 'brew'} session`,
                            beanId: String(event.beanId || ''),
                            brewId,
                            beanName,
                            metrics: `${event.dose || 0}g / ${event.yield || 0}g / ${event.time || 0}s`
                        });
                    } else {
                        const seen = new Set((prev.comments || []).map(comment => String(comment.id || '')));
                        nextComments.forEach(comment => {
                            const id = String(comment.id || '');
                            if (!id || seen.has(id)) return;
                            countComment(comment, actor, ts, 'brew', brewId);
                        });
                    }

                    appendUnlocks(
                        this.evaluateAchievementUnlocks(owner, ownerStats, levelsByUser, ts, 'brew', brewId),
                        'brew',
                        brewId
                    );

                    brewStates.set(brewId, {
                        ...event,
                        likes: nextLikes,
                        comments: nextComments
                    });
                });

                const statsObj = {};
                statsByUser.forEach((value, key) => { statsObj[key] = value; });
                this.achievementStatsByUser = statsObj;
                this.achievementLevelsByUser = levelsByUser;
                this.achievementUnlockByBrew = unlockByBrew;
                this.achievementUnlockByBean = unlockByBean;

                this.joinFeedItems().forEach(x => items.push(x));   // v14.0: someone joined
                return items.sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
            },

