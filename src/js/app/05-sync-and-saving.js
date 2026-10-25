            normalizeEvent(event) {
                if (!event || !event.type) return null;
                const now = new Date().toISOString();
                const actor = String(event.actor || event.user || this.user || 'Unknown');
                const actorColor = this.normalizeHexColor(event.actorColor || event.userColor || this.userColors[actor] || '');

                if (event.type === 'bean') {
                    if (!event.id) return null;
                    const owner = String(event.owner || event.user || event.actor || 'Unknown');
                    const likes = this.normalizeLikeList(event.likes, owner);
                    const comments = this.normalizeCommentList(this.withCommentMeta(event.comments, event.commentMeta), `bean-${event.id}`, event.date || event.eventAt || now);
                    return {
                        ...event,
                        id: String(event.id),
                        user: owner,
                        owner,
                        actor,
                        actorColor,
                        date: event.date || event.eventAt || now,
                        likes,
                        comments,
                        wantToTry: this.normalizeLikeList(event.wantToTry, owner)
                    };
                }

                if (event.type === 'brew') {
                    if (!event.id || !event.beanId) return null;
                    const owner = String(event.owner || event.user || event.actor || 'Unknown');
                    const likes = this.normalizeLikeList(event.likes, owner);
                    const comments = this.normalizeCommentList(this.withCommentMeta(event.comments, event.commentMeta), `brew-${event.id}`, event.date || event.eventAt || now);
                    const photo = this.normalizePhoto(event.photo);
                    const rawMaster = (event.masterProfile && typeof event.masterProfile === 'object') ? event.masterProfile : null;
                    const masterProfile = rawMaster ? {
                        method: String(rawMaster.method || event.method || ''),
                        grind: this.grindText(event.masterGrind) || this.grindText(rawMaster.grind) || this.grindText(event.grind),
                        dose: this.asNumber(rawMaster.dose, this.asNumber(event.dose, 0)),
                        yield: this.asNumber(rawMaster.yield, this.asNumber(event.yield, 0)),
                        time: this.asNumber(rawMaster.time, this.asNumber(event.time, 0)),
                        notes: String(rawMaster.notes || '').trim(),
                        equipment: Array.isArray(rawMaster.equipment) ? rawMaster.equipment.map(v => String(v)) : [],
                        equipmentSnapshot: Array.isArray(rawMaster.equipmentSnapshot) ? rawMaster.equipmentSnapshot.map(v => String(v)) : []
                    } : null;

                    return {
                        ...event,
                        id: String(event.id),
                        beanId: String(event.beanId),
                        user: owner,
                        owner,
                        actor,
                        actorColor,
                        date: event.date || event.brewedAt || event.eventAt || now,
                        rating: this.normalizeRating(event.rating),
                        likes,
                        comments,
                        photo,
                        equipment: Array.isArray(event.equipment) ? event.equipment.map(v => String(v)) : [],
                        equipmentSnapshot: Array.isArray(event.equipmentSnapshot) ? event.equipmentSnapshot.map(v => String(v)) : [],
                        masterProfile
                    };
                }

                if (event.type === 'delete') {
                    if (!event.id) return null;
                    return {
                        ...event,
                        id: String(event.id),
                        targetType: event.targetType === 'bean' ? 'bean' : 'brew',
                        user: String(event.user || event.actor || this.user || 'System'),
                        actor,
                        actorColor,
                        date: event.date || event.eventAt || now
                    };
                }

                if (event.type === 'flavor') {
                    const name = this.normalizeFlavorName(event.name || '');
                    if (!name) return null;
                    return {
                        ...event,
                        id: String(event.id || `flavor-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
                        name,
                        user: String(event.user || event.actor || this.user || 'Unknown'),
                        actor,
                        actorColor,
                        date: event.date || event.eventAt || now
                    };
                }

                if (event.type === 'gear') {
                    const owner = String(event.owner || event.user || '').trim();
                    if (!owner) return null;
                    return {
                        ...event,
                        id: String(event.id || `gear-${owner}`),
                        user: owner,
                        owner,
                        actor,
                        items: this.gearItemsFor(event.items),
                        lastByMethod: (event.lastByMethod && typeof event.lastByMethod === 'object') ? event.lastByMethod : {},
                        date: event.date || event.eventAt || now
                    };
                }

                return null;
            },

            applyEvent(event) {
                if (!event) return;
                this._dataRev = (this._dataRev || 0) + 1;   // v15.1: anything that changed the data (crema's memo goes by it: a like inside a session changes no count)
                // v13.4: something deleted stays deleted; a later like / comment / edit from a phone that hadn't seen the delete is ignored
                if ((event.type === 'brew' || event.type === 'bean') && this.tombs && this.tombs.size) {
                    const at = this.toTime(event.eventAt);
                    const t = this.tombs.get(`${event.type}:${event.id}`), tb = event.type === 'brew' ? this.tombs.get(`bean:${event.beanId}`) : 0;
                    if ((t && at > t) || (tb && at > tb)) return;
                }
                if (event.type === 'delete' && event.eventAt && this.toTime(event.eventAt) > 0) {
                    if (!this.tombs) this.tombs = new Map();
                    this.tombs.set(`${event.targetType === 'bean' ? 'bean' : 'brew'}:${event.id}`, this.toTime(event.eventAt));
                }
                if (event.type === 'gear') {
                    // v13.1: one shared record holds group settings (who counts toward group goals)
                    if (String(event.owner) === '__group__') { this.groupSettings = event; return; }
                    if (String(event.owner) === '__people__') { this.peopleReg = event; return; }   // v14.0: the shared people list
                    this.gearByUser.set(String(event.owner), event);
                    return;
                }
                if (event.type === 'bean') {
                    this.beans.set(event.id, event);
                    return;
                }
                if (event.type === 'brew') {
                    const existing = this.brews.get(event.id);
                    const owner = String(
                        (existing && (existing.owner || existing.user)) ||
                        event.owner ||
                        event.user ||
                        'Unknown'
                    );
                    const next = {
                        ...event,
                        user: owner,
                        owner
                    };
                    this.brews.set(event.id, next);
                    return;
                }
                if (event.type === 'delete') {
                    if (event.targetType === 'bean') {
                        this.beans.delete(event.id);
                        for (const [brewId, brew] of this.brews.entries()) {
                            if (brew.beanId === event.id) this.brews.delete(brewId);
                        }
                    } else {
                        this.brews.delete(event.id);
                    }
                    return;
                }
                if (event.type === 'flavor') {
                    this.customFlavors.set(event.id, event);
                }
            },

            sync(opts = {}) {
                const silent = Boolean(opts.silent);
                if (this.syncInFlight) {
                    // One sync at a time: remember to run one more right after this one.
                    this.syncQueued = true;
                    if (!silent) {
                        this.syncQueuedLoud = true;
                        this.updateBadge('connecting');
                    }
                    return this.syncInFlight;
                }
                const run = this.runSync(silent);
                this.syncInFlight = run;
                const done = () => {
                    this.syncInFlight = null;
                    if (this.syncQueued) {
                        const loud = this.syncQueuedLoud;
                        this.syncQueued = false;
                        this.syncQueuedLoud = false;
                        this.sync({ silent: !loud });
                    }
                };
                run.then(done, done);
                return run;
            },

            async runSync(silent) {
                if (!silent) this.updateBadge('connecting');
                try {
                    if (this.cacheReady) await this.cacheReady;
                    if (this.outboxReady) await this.outboxReady;
                    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    const hang = ctl ? setTimeout(() => ctl.abort(), 20000) : null;
                    let text;
                    const pullStarted = Date.now();
                    try { text = await Cloud.pull(this.syncPosition(), ctl ? { signal: ctl.signal } : {}); } finally { if (hang) clearTimeout(hang); }
                    const json = JSON.parse(text);
                    this.lastCloudAt = Date.now();
                    if (this.syncFailed) this.pendingOutbox().forEach(x => { x.lastTry = 0; });   // back online: send what's waiting now
                    this.syncFailed = false;
                    // the older backend sends everything every time: an identical reply changes nothing
                    if (Array.isArray(json) && this.cloudLoaded && this.lastFullReply === text && !(this.outbox || []).length && this.user === this.drawnUser && !this.optimisticPending) {
                        this.syncedOnce = true;
                        this.updateBadge('synced');
                        this.redrawAfterSync(false);
                        return;
                    }
                    this.lastFullReply = Array.isArray(json) ? text : '';
                    const changed = this.mergeCloudResponse(json);
                    this.pullStartedFor = pullStarted;   // v14.2: saves the new backend confirmed before this pull began are in it
                    this.syncedOnce = true;
                    const colorsBefore = JSON.stringify(this.userColors);
                    this.process(this.cloud.events);
                    const colorsChanged = JSON.stringify(this.userColors) !== colorsBefore;
                    this.updateBadge('synced');
                    this.redrawAfterSync(changed || colorsChanged || this.optimisticPending || this.user !== this.drawnUser);
                    this.optimisticPending = false;
                    if (this.awaitingFreshData) {
                        this.awaitingFreshData = false;
                        if (this.markFreshData) this.markFreshData();
                    }
                    if (changed) this.persistCloudCache();
                    if (this.adoptSheetOutbox && Cloud.confirms) this.adoptSheetOutbox();   // v14.2: saves made on the Sheet that never left this phone
                    if (this.checkNotifications) this.checkNotifications();   // v14.4: the bell's unread count
                    if (this.checkShotDrafts) this.checkShotDrafts();   // v16.9: shots from your espresso machine
                    if (this.checkPendingJoin) this.checkPendingJoin();   // v14.4: an invite link opened before signing in
                    if (this.checkPendingProfile) this.checkPendingProfile();   // v14.5: a profile link
                    if (this.checkPendingShare) this.checkPendingShare();   // v15.0: a shared session, coffee or roaster
                    if (this.checkPushOpen) this.checkPushOpen();   // v14.5: opened from a phone notification
                    if (this.pendingOutbox().some(x => this.outboxDue(x))) setTimeout(() => this.flushOutbox(), 0);
                } catch (e) {
                    this.syncFailed = true;
                    this.updateBadge('error');
                    if (e && e.signedOut && this.needSignIn) this.needSignIn();   // v14.2: the new backend's sign-in ran out
                    console.error('Sync error:', e);
                } finally {
                    this.lastSyncAt = Date.now();
                    this.paintOutboxBadge();
                }
            },

            // where this device is in the shared log, for Cloud.pull
            syncPosition() {
                return { since: this.cloud.next || 0, version: this.cloud.version || '', anchor: this.cloud.anchor || '' };
            },

            // Folds a server reply into this.cloud. Returns true when the event list changed.
            mergeCloudResponse(json) {
                if (Array.isArray(json)) {
                    // Older backend (v7): it always sends everything.
                    if (json.length === 1 && json[0] && json[0].type === 'error') {
                        throw new Error(json[0].message || 'Server error.');
                    }
                    this.cloud = { version: '', next: 0, anchor: '', events: json };
                    this.cloudLoaded = true;
                    return true;
                }
                if (!json || json.v !== 2 || json.error || !Array.isArray(json.events) || !Number.isInteger(json.next)) {
                    throw new Error((json && json.error) || 'Unexpected sync response.');
                }
                if (json.reset) {
                    this.cloud = {
                        version: String(json.version || ''),
                        next: json.next,
                        anchor: String(json.anchor || ''),
                        events: json.events
                    };
                    this.cloudLoaded = true;
                    return true;
                }
                if (json.since !== this.cloud.next) return false; // reply to an older request; ignore it
                this.cloud = {
                    version: String(json.version || ''),
                    next: json.next,
                    anchor: String(json.anchor || ''),
                    events: json.events.length ? this.cloud.events.concat(json.events) : this.cloud.events
                };
                this.cloudLoaded = true;
                return json.events.length > 0;
            },

            renderAfterData() {
                if (this.welcomeOpen) this.refreshWelcome();   // v14.0: the welcome shows the group as it loads
                if (document.getElementById('detail-view').classList.contains('active') && this.activeGroup) {
                    this.refreshDetail();
                } else {
                    this.render();
                }
                if (this.roasterViewActive()) this.renderRoasterPage();
            },

            isDetailActive() {
                return document.getElementById('detail-view').classList.contains('active') && Boolean(this.activeGroup);
            },

            // A background sync redraws only when what's on screen would change, and waits
            // while someone is typing in (or using a dropdown on) the part that would be redrawn.
            redrawAfterSync(dataChanged) {
                if (dataChanged) this.gridStale = true;
                const detailActive = this.isDetailActive();
                // v13.4: a new day changes the weekly goal, awards and recaps even when no data does
                const today = this.dayNum(Date.now()), dayTurned = this._drawnDay !== undefined && this._drawnDay !== today;
                const due = dataChanged || this.redrawWhenIdle || dayTurned ||
                    (!detailActive && (this.gridStale || Date.now() >= this.nextFreshExpiry));
                if (!due || this.isEditingOnScreen()) {
                    if (due) this.redrawWhenIdle = true;
                    this.refreshTimeLabels();
                    return;
                }
                this.redrawWhenIdle = false;
                this.drawnUser = this.user;
                this.renderAfterData();
            },

            isEditingOnScreen() {
                const el = document.activeElement;
                if (!el || !el.tagName || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
                const grid = document.getElementById('grid');
                if (grid && grid.contains(el)) return true;
                const detail = document.getElementById('detail-view');
                if (this.roasterViewActive() && document.getElementById('roaster-view').contains(el)) return true;
                return Boolean(detail && this.isDetailActive() && detail.contains(el));
            },

            // Keeps "5m ago" labels current without rebuilding the feed.
            refreshTimeLabels() {
                document.querySelectorAll('#grid .feed-time[data-time]').forEach(el => {
                    const text = this.formatRelativeDate(el.getAttribute('data-time'));
                    if (el.textContent !== text) el.textContent = text;
                });
            },

            // Text typed into comment boxes survives any redraw (boxes are matched by their id).
            captureDrafts() {
                const drafts = [];
                document.querySelectorAll('.comment-input').forEach(input => {
                    if (input.id && input.value) drafts.push({ id: input.id, value: input.value });
                });
                return drafts;
            },

            restoreDrafts(drafts) {
                const boxes = [...document.querySelectorAll('.comment-input')];
                drafts.forEach(draft => {
                    boxes.forEach(input => { if (input.id === draft.id && !input.value) input.value = draft.value; });   // v16.0: every copy of that box
                });
            },

            // ---- On-device copy of the shared log (IndexedDB) ----

            cacheKey() {
                return 'cloud:' + Cloud.id;
            },

            openCacheDb() {
                if (this.cacheDbPromise) return this.cacheDbPromise;
                this.cacheDbPromise = new Promise(resolve => {
                    let settled = false;
                    const finish = db => {
                        if (settled) return;
                        settled = true;
                        resolve(db);
                    };
                    setTimeout(() => finish(null), 2000);
                    try {
                        if (typeof indexedDB === 'undefined' || !indexedDB) {
                            finish(null);
                            return;
                        }
                        const request = indexedDB.open('dialed-in-cache', 1);
                        request.onupgradeneeded = () => {
                            const db = request.result;
                            if (!db.objectStoreNames.contains('cloud')) db.createObjectStore('cloud');
                        };
                        request.onsuccess = () => {
                            const db = request.result;
                            db.onversionchange = () => db.close();
                            finish(db);
                        };
                        request.onerror = () => finish(null);
                        request.onblocked = () => finish(null);
                    } catch (err) {
                        finish(null);
                    }
                });
                return this.cacheDbPromise;
            },

            readCloudCache() {
                return this.openCacheDb().then(db => new Promise(resolve => {
                    if (!db) {
                        resolve(null);
                        return;
                    }
                    let settled = false;
                    const finish = value => {
                        if (settled) return;
                        settled = true;
                        resolve(value);
                    };
                    setTimeout(() => finish(null), 2000);
                    try {
                        const request = db.transaction('cloud', 'readonly').objectStore('cloud').get(this.cacheKey());
                        request.onsuccess = () => finish(request.result || null);
                        request.onerror = () => finish(null);
                    } catch (err) {
                        finish(null);
                    }
                }));
            },

            writeCloudCache(snapshot) {
                return this.openCacheDb().then(db => new Promise(resolve => {
                    if (!db) {
                        resolve(false);
                        return;
                    }
                    try {
                        const tx = db.transaction('cloud', 'readwrite');
                        tx.oncomplete = () => resolve(true);
                        tx.onerror = () => resolve(false);
                        tx.onabort = () => resolve(false);
                        tx.objectStore('cloud').put(snapshot, this.cacheKey());
                    } catch (err) {
                        resolve(false);
                    }
                }));
            },

            persistCloudCache() {
                this.writeCloudCache({
                    schema: 1,
                    url: Cloud.id,
                    savedAt: Date.now(),
                    version: this.cloud.version,
                    next: this.cloud.next,
                    anchor: this.cloud.anchor,
                    events: this.cloud.events
                }).catch(() => {});
            },

            isUsableSnapshot(snapshot) {
                return Boolean(snapshot) &&
                    snapshot.schema === 1 &&
                    snapshot.url === Cloud.id &&
                    Array.isArray(snapshot.events) &&
                    Number.isInteger(snapshot.next) && snapshot.next >= 0 &&
                    typeof snapshot.version === 'string' &&
                    typeof snapshot.anchor === 'string';
            },

            bootFromCache() {
                this.cacheReady = Promise.all([this.readCloudCache(), this.outboxReady]).then(([snapshot]) => {
                    if (!this.isUsableSnapshot(snapshot) || this.cloudLoaded) return;
                    this.cloud = {
                        version: snapshot.version,
                        next: snapshot.next,
                        anchor: snapshot.anchor,
                        events: snapshot.events
                    };
                    this.cloudLoaded = true;
                    try {
                        this.process(this.cloud.events);
                    } catch (err) {
                        // Unreadable copy: forget it and let the first sync load everything.
                        this.cloud = { version: '', next: 0, anchor: '', events: [] };
                        this.cloudLoaded = false;
                        throw err;
                    }
                    // Until the first sync confirms this copy, edits wait for fresh data (see push).
                    this.awaitingFreshData = true;
                    this.freshDataReady = new Promise(resolve => { this.markFreshData = resolve; });
                    this.renderAfterData();
                    this.drawnUser = this.user;
                }).catch(err => {
                    console.error('Cache read error:', err);
                });
                return this.cacheReady;
            },

            // ---- Edits made while the screen still shows the on-device copy ----

            shouldWaitForFreshData(payload) {
                if (!this.awaitingFreshData || !payload) return false;
                if (payload.type === 'brew') return this.brews.has(String(payload.id));
                if (payload.type === 'bean') return this.beans.has(String(payload.id));
                return false;
            },

            recordFor(payload) {
                const map = payload.type === 'bean' ? this.beans : this.brews;
                return map.get(String(payload.id));
            },

            sendAfterFreshData(payload, base) {
                const current = this.recordFor(payload);
                if (!current) return; // it was deleted meanwhile; don't bring it back
                const next = this.sameValue(current, base) ? payload : this.mergeOntoFresh(base, payload, current);
                this.push(next);
            },

            // Three-way merge: keep every field the user didn't touch from the fresh copy,
            // and merge likes/comments item by item so nobody else's change is lost.
            mergeOntoFresh(base, mine, theirs) {
                const out = { ...theirs };
                const keys = new Set([...Object.keys(base || {}), ...Object.keys(mine || {})]);
                keys.forEach(key => {
                    if (key === 'likes' || key === 'comments' || key === 'wantToTry') return;
                    if (this.sameValue(mine[key], base[key])) return;
                    if (mine[key] === undefined) delete out[key];
                    else out[key] = mine[key];
                });
                out.likes = this.mergeLikeLists(base.likes, mine.likes, theirs.likes);
                if (base.wantToTry || mine.wantToTry || theirs.wantToTry) out.wantToTry = this.mergeLikeLists(base.wantToTry, mine.wantToTry, theirs.wantToTry);
                out.comments = this.mergeCommentLists(base.comments, mine.comments, theirs.comments);
                return out;
            },

            mergeLikeLists(base, mine, theirs) {
                const b = new Set((base || []).map(String));
                const m = new Set((mine || []).map(String));
                const out = (theirs || []).map(String).filter(name => !(b.has(name) && !m.has(name)));
                m.forEach(name => {
                    if (!b.has(name) && !out.includes(name)) out.push(name);
                });
                return out;
            },

            mergeCommentLists(base, mine, theirs) {
                const idOf = c => String((c && c.id) || '');
                const baseById = new Map((base || []).map(c => [idOf(c), c]));
                const mineById = new Map((mine || []).map(c => [idOf(c), c]));
                const out = (theirs || [])
                    .filter(c => !(baseById.has(idOf(c)) && !mineById.has(idOf(c))))
                    .map(c => {
                        const key = idOf(c);
                        const edited = mineById.get(key);
                        const was = baseById.get(key);
                        if (!edited || !was || this.sameValue(edited, was)) return c;
                        // both sides may have touched this comment: keep my text edit, merge likes item by item
                        const merged = { ...c, ...(String(edited.text) !== String(was.text) ? { text: edited.text } : {}) };
                        merged.likes = this.mergeLikeLists(was.likes || [], edited.likes || [], c.likes || []);
                        return merged;
                    });
                const present = new Set(out.map(idOf));
                (mine || []).forEach(c => {
                    const key = idOf(c);
                    if (!baseById.has(key) && !present.has(key)) {
                        out.push(c);
                        present.add(key);
                    }
                });
                return out;
            },

            sameValue(a, b) {
                if (a === b) return true;
                if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
                if (Array.isArray(a) !== Array.isArray(b)) return false;
                if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => this.sameValue(v, b[i]));
                const ka = Object.keys(a).filter(k => a[k] !== undefined);
                const kb = Object.keys(b).filter(k => b[k] !== undefined);
                return ka.length === kb.length && ka.every(k => this.sameValue(a[k], b[k]));
            },

            updateBadge(status) {
                const text = document.getElementById('sync-text');
                const dot = document.getElementById('sync-dot');
                if (status === 'connecting') { text.innerText = 'Syncing...'; dot.className = 'dot'; }
                if (status === 'synced') { text.innerText = 'Synced'; dot.className = 'dot synced'; }
                if (status === 'error') { text.innerText = 'Offline'; dot.className = 'dot'; }
                if (this.pendingOutbox && this.pendingOutbox().length) this.paintOutboxBadge();
            },

            process(raw) {
                const items = Array.isArray(raw) ? raw : [];
                const events = [...items]
                    .sort((a, b) => this.toTime(a.eventAt || a.date) - this.toTime(b.eventAt || b.date))
                    .map(item => this.normalizeEvent(item))
                    .filter(Boolean);

                let colorChanged = false;
                events.forEach(event => {
                    const actor = String(event.actor || event.user || '').trim();
                    const color = this.normalizeHexColor(event.actorColor || '');
                    const existing = this.normalizeHexColor(this.userColors[actor] || '');
                    if (!actor || !color) return;
                    if (actor === this.user) {
                        if (this.acctOn && this.acctOn()) {   // v15.0: the color on your profile, unless you just picked one here
                            const pend = this.colorPending();
                            if (pend) { if (pend === color) this.setColorPending(''); return; }
                            if (existing !== color) { this.userColors[actor] = color; colorChanged = true; }
                            return;
                        }
                        if (!existing) {
                            this.userColors[actor] = color;
                            colorChanged = true;
                        }
                        return;
                    }
                    if (this.userColors[actor] !== color) {
                        this.userColors[actor] = color;
                        colorChanged = true;
                    }
                });
                if (colorChanged) safeSet('dialed_user_colors', JSON.stringify(this.userColors));

                this.beans.clear();
                this.brews.clear();
                this.customFlavors.clear();
                this.gearByUser.clear();
                this.groupSettings = null;
                this.peopleReg = null;
                this.tombs = new Map();
                events.forEach(event => this.applyEvent(event));
                // v13.4: saves still on their way to the sheet go on top of it
                if (this.applyCommunity) this.applyCommunity();   // v14.4: community records beside your circle's (before the outbox, so a like on one isn't taken for a delete)
                const pending = this.settleOutbox(items);
                pending.forEach(event => this.applyEvent(event));
                this.applyGearFromCloud();
                this.syncKnownUsers();
                this.eventLog = pending.length ? [...events, ...pending].sort((a, b) => this.toTime(a.eventAt || a.date) - this.toTime(b.eventAt || b.date)) : events;
                this.feedEntries = this.buildFeedEntries(this.eventLog);
                this.updateAchievementCount();
                const selected = [...this.selFlavors];
                this.initFlavors();
                this.selFlavors = selected;
                if (document.getElementById('brew-modal') && document.getElementById('brew-modal').classList.contains('active')) this.renderNotePicker();
            },

            async push(payload, opts = {}) {
                if (payload && Array.isArray(payload.comments)) payload = { ...payload, commentMeta: this.commentMetaOf(payload.comments) };
                const prev = this.recordOf(payload);
                const nowMs = Date.now();
                // v13.4: never older than the version it was made from
                const eventAt = new Date(prev && prev.eventAt && this.toTime(prev.eventAt) >= nowMs ? this.toTime(prev.eventAt) + 1 : nowMs).toISOString();
                const now = new Date(nowMs).toISOString();
                const actor = String(payload.actor || this.user || 'Unknown');
                const draft = {
                    ...payload,
                    actor,
                    actorColor: this.getUserColor(actor, payload.actorColor || ''),
                    eventAt,
                    ...(prev && prev.eventAt && payload.type !== 'delete' ? { baseAt: prev.eventAt } : {}),
                    date: payload.date || now,
                    user: payload.user || payload.owner || actor
                };
                const event = this.normalizeEvent(draft);
                if (!event) return;
                if (this.noteCommunityPush) this.noteCommunityPush(event);

                this.queueOutbox(event, prev);
                this.applyEvent(event);
                this.optimisticPending = true;
                this.eventLog = [...this.eventLog, event].sort((a, b) => this.toTime(a.eventAt || a.date) - this.toTime(b.eventAt || b.date));
                this.feedEntries = this.buildFeedEntries(this.eventLog);
                if (opts.quiet && this.patchLikeDom(payload.id)) {
                    this.gridStale = true;   // drawn in place; the next sync tidies anything else
                } else {
                    this.render();
                    if (document.getElementById('detail-view').classList.contains('active') && this.activeGroup) {
                        this.refreshDetail();
                    }
                }
                if (this.roasterViewActive && this.roasterViewActive()) this.renderRoasterPage();
                this.paintOutboxBadge();
                await this.flushOutbox();
            },

            // ===================== v13.4: saves on their way to the sheet (outbox) =====================
            outboxKey() { return 'outbox:' + Cloud.id; },

            idbGet(key) {
                return this.openCacheDb().then(db => new Promise(resolve => {
                    if (!db) { resolve(null); return; }
                    let settled = false; const finish = v => { if (!settled) { settled = true; resolve(v); } };
                    setTimeout(() => finish(null), 2000);
                    try { const r = db.transaction('cloud', 'readonly').objectStore('cloud').get(key); r.onsuccess = () => finish(r.result || null); r.onerror = () => finish(null); } catch (e) { finish(null); }
                }));
            },

            idbPut(key, value) {
                return this.openCacheDb().then(db => new Promise(resolve => {
                    if (!db) { resolve(false); return; }
                    try { const tx = db.transaction('cloud', 'readwrite'); tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); tx.onabort = () => resolve(false); tx.objectStore('cloud').put(value, key); } catch (e) { resolve(false); }
                }));
            },

            loadOutbox() {
                if (!this.outbox) this.outbox = [];
                return this.idbGet(this.outboxKey()).then(saved => {
                    const ok = x => x && typeof x.k === 'string' && x.ev && typeof x.ev === 'object' && x.ev.type && x.ev.eventAt;
                    const fromDisk = Array.isArray(saved) ? saved.filter(ok) : [];
                    const now = this.outbox || [];
                    this.outbox = [...fromDisk.filter(x => !now.some(y => y.k === x.k)), ...now];
                }).catch(() => {});
            },

            saveOutbox() { this.idbPut(this.outboxKey(), (this.outbox || []).map(x => ({ k: x.k, ev: x.ev, base: x.base || null, tries: x.tries || 0, lastTry: x.lastTry || 0, at: x.at || 0, landedAt: x.landedAt || 0, ...(x.confirmed ? { confirmed: true } : {}) }))).catch(() => {}); },

            // the record a save replaces (null for something new, a flavor, or a delete of something missing)
            recordOf(p) {
                if (!p) return null;
                if (p.type === 'brew') return this.brews.get(String(p.id)) || null;
                if (p.type === 'bean') return this.beans.get(String(p.id)) || null;
                if (p.type === 'gear' && String(p.owner || p.user || '') === '__people__') return this.peopleReg || null;
                if (p.type === 'gear') return String(p.owner || p.user || '') === '__group__' ? (this.groupSettings || null) : (this.gearByUser.get(String(p.owner || p.user || '')) || null);   // the group's settings record lives apart
                if (p.type === 'delete') return (p.targetType === 'bean' ? this.beans : this.brews).get(String(p.id)) || null;
                return null;
            },

            stripMeta(r) { if (!r || typeof r !== 'object') return r; const { actor, actorColor, eventAt, baseAt, commentMeta, ...rest } = r; return rest; },

            queueOutbox(ev, prev) {
                const ob = this.outbox || (this.outbox = []);
                const k = `${ev.type}:${ev.id}`;
                if (ev.type === 'delete') {
                    // nothing waiting for this record (or, for a coffee, its sessions) needs sending any more
                    const gone = ev.targetType === 'bean' ? (x => (x.ev.type === 'bean' && x.ev.id === ev.id) || (x.ev.type === 'brew' && String(x.ev.beanId) === String(ev.id))) : (x => x.ev.type === 'brew' && x.ev.id === ev.id);
                    for (let i = ob.length - 1; i >= 0; i--) if (gone(ob[i])) ob.splice(i, 1);
                }
                const at = ob.findIndex(x => x.k === k);
                // (a gear record nobody has saved yet starts from {}, so two first saves at once still merge)
                const base = ev.type === 'brew' || ev.type === 'bean' || ev.type === 'gear' ? (prev ? JSON.parse(JSON.stringify(prev)) : (ev.type === 'gear' ? {} : null)) : null;
                // not confirmed yet: the first edit's starting point stays the base. If the earlier version was already sent it may
                // be in the sheet by now, so it's remembered: once a sync shows it landed, it becomes the base (otherwise
                // "off, then on again" would merge as "no change since the start" onto the sheet's "off" and stay off)
                if (at >= 0 && !ob[at].landedAt) { const old = ob[at]; const sent = old.lastTry ? [...(old.sent || []), old.ev].slice(-5) : (old.sent || []); ob[at] = { ...old, ev, sent, tries: 0, lastTry: 0, netFail: false }; }
                else if (at >= 0) ob[at] = { k, ev, base, tries: 0, lastTry: 0, at: Date.now() };   // the earlier one landed: this is a new save
                else ob.push({ k, ev, base, tries: 0, lastTry: 0, at: Date.now() });
                this.saveOutbox();
            },

            // after a sync: drop what landed, merge edits onto anything that changed meanwhile, return what's still on its way.
            // A save that landed is watched for a few minutes: if someone who hadn't seen it saves the same record after it
            // (their baseAt is older than this save), it's merged back in and sent again.
            settleOutbox(items) {
                const ob = this.outbox || [];
                if (!ob.length) return [];
                const landed = new Set((items || []).map(e => e ? `${e.type}:${e.id}:${e.eventAt}` : ''));
                const keep = [], out = [], now = Date.now();
                let changed = false;
                const cloudRec = ev => ev.type === 'gear' ? (String(ev.owner) === '__people__' ? this.peopleReg : String(ev.owner) === '__group__' ? this.groupSettings : this.gearByUser.get(String(ev.owner))) : (ev.type === 'bean' ? this.beans.get(String(ev.id)) : (ev.type === 'brew' ? this.brews.get(String(ev.id)) : null));
                const rebase = (x, theirs) => {
                    const ev = x.ev;
                    const merged = ev.type === 'gear' ? this.mergeGear(x.base, ev, theirs) : this.mergeOntoFresh(x.base, ev, theirs);
                    const at = Math.max(this.toTime(ev.eventAt), this.toTime(theirs.eventAt) + 1);
                    const raw = { ...merged, type: ev.type, id: ev.id, actor: ev.actor, actorColor: ev.actorColor, user: ev.user, owner: ev.owner, date: ev.date, eventAt: new Date(at).toISOString(), baseAt: theirs.eventAt };
                    if (Array.isArray(raw.comments)) raw.commentMeta = this.commentMetaOf(raw.comments);
                    const next = this.normalizeEvent(raw);
                    if (!next) return false;
                    x.ev = next; x.base = JSON.parse(JSON.stringify(theirs)); x.tries = 0; x.lastTry = 0; x.landedAt = 0; x.netFail = false;
                    return true;
                };
                ob.forEach(x => {
                    const ev = x.ev;
                    // v14.2: the new backend confirmed it; it stays on top until a pull that began after that, which has it
                    if (x.confirmed) {
                        if ((this.pullStartedFor || 0) > (x.landedAt || 0)) { changed = true; return; }
                        keep.push(x); out.push(ev); return;
                    }
                    const isRec = ev.type === 'brew' || ev.type === 'bean' || ev.type === 'gear';
                    const theirs = isRec ? cloudRec(ev) : null;
                    if (x.landedAt || landed.has(`${ev.type}:${ev.id}:${ev.eventAt}`)) {
                        if (!x.landedAt) { x.landedAt = now; changed = true; }
                        // someone else's save of the same record that didn't include ours: later, or at the very same millisecond
                        const later = theirs && (this.toTime(theirs.eventAt) > this.toTime(ev.eventAt) || (this.toTime(theirs.eventAt) === this.toTime(ev.eventAt) && !this.sameValue(this.stripMeta(theirs), this.stripMeta(ev))));
                        if (x.base && later && !(theirs.baseAt && this.toTime(theirs.baseAt) >= this.toTime(ev.eventAt))) {
                            const merged = ev.type === 'gear' ? this.mergeGear(x.base, ev, theirs) : this.mergeOntoFresh(x.base, ev, theirs);
                            if (!this.sameValue(this.stripMeta(merged), this.stripMeta(theirs)) && rebase(x, theirs)) { keep.push(x); out.push(x.ev); changed = true; return; }
                        }
                        if (x.base && now - x.landedAt < 180000) { keep.push(x); return; }
                        changed = true;
                        return;
                    }
                    if (x.sent && x.sent.length) {   // an earlier version of this save landed: what's left to merge starts from it
                        const i = x.sent.map(v => landed.has(`${v.type}:${v.id}:${v.eventAt}`)).lastIndexOf(true);
                        if (i >= 0) { x.base = JSON.parse(JSON.stringify(x.sent[i])); x.sent = x.sent.slice(i + 1); changed = true; }
                    }
                    if (isRec && x.base) {
                        if (!theirs && ev.type !== 'gear') { changed = true; return; }   // deleted meanwhile: don't bring it back
                        if (theirs && !this.sameValue(this.stripMeta(theirs), this.stripMeta(x.base)) && rebase(x, theirs)) changed = true;
                    }
                    keep.push(x); out.push(x.ev);
                });
                if (changed) { this.outbox = keep; this.saveOutbox(); }
                return out;
            },

            pendingOutbox() { return (this.outbox || []).filter(x => !x.landedAt); },

            // gear: every field you didn't change comes from the newest copy; roaster choices merge item by item
            mergeGear(base, mine, theirs) {
                const META = new Set(['actor', 'actorColor', 'eventAt', 'date', 'type', 'id', 'user', 'owner']);
                const out = { ...theirs };
                new Set([...Object.keys(base || {}), ...Object.keys(mine || {})]).forEach(k => {
                    if (META.has(k) || this.sameValue(mine[k], (base || {})[k])) return;
                    if (k === 'roasters') { out.roasters = this.mergeRoasterPrefs((base || {}).roasters, mine.roasters, theirs.roasters); return; }
                    if (k === 'people' || k === 'removed') { out[k] = this.mergePeopleLists(theirs[k], mine[k], k); return; }   // v14.0
                    if (k === 'goalExclude') { out.goalExclude = this.mergeLikeLists((base || {}).goalExclude, mine.goalExclude, theirs.goalExclude); return; }   // two people switching different people off both stick
                    if (mine[k] === undefined) delete out[k]; else out[k] = mine[k];
                });
                return out;
            },

            mergeRoasterPrefs(b, m, t) {
                const P = v => (v && typeof v === 'object') ? v : {};
                b = P(b); m = P(m); t = P(t);
                const pairKey = x => Array.isArray(x) ? [String(x[0] || '').toLowerCase(), String(x[1] || '').toLowerCase()].sort().join('|') : '';
                const list = name => { const bk = new Set((b[name] || []).map(pairKey)), mk = new Set((m[name] || []).map(pairKey)); const out = (t[name] || []).filter(x => !(bk.has(pairKey(x)) && !mk.has(pairKey(x)))); const have = new Set(out.map(pairKey)); (m[name] || []).forEach(x => { const k = pairKey(x); if (!bk.has(k) && !have.has(k)) { out.push(x); have.add(k); } }); return out; };
                const info = { ...P(t.info) };
                Object.keys(P(m.info)).forEach(k => { if (!this.sameValue(P(m.info)[k], P(b.info)[k])) info[k] = m.info[k]; });
                // v16.0: "Local to me" came along too (it was dropped here, so a tick made while another save of your gear was on
                // its way didn't stick), and anything newer this phone doesn't know stays as it was
                return { ...t, merged: list('merged'), notSame: list('notSame'), fav: this.mergeLikeLists(b.fav, m.fav, t.fav), ...this.mergeLocalTicks([t, m]), info };
            },

            // v16.0: ticks [name, when] and ones taken off (localOff) from every copy: per roaster the newest wins (the
            // server does the same, so a phone that hadn't caught up can neither wipe a tick nor bring one back)
            mergeLocalTicks(copies) {
                const last = new Map(), at = e => Array.isArray(e) ? (Date.parse(e[1] || '') || -Infinity) : -Infinity;
                const key = e => String(Array.isArray(e) ? e[0] || '' : e || '').trim().toLowerCase();
                copies.forEach(c => {
                    const P = c && typeof c === 'object' ? c : {};
                    [[P.local, true], [P.localOff, false]].forEach(([list, on]) => (Array.isArray(list) ? list : []).forEach(e => {
                        const k = key(e); if (!k) return;
                        const cur = last.get(k), t = at(e);
                        if (!cur || t > cur.t || (t === cur.t && !on)) last.set(k, { e, t, on });
                    }));
                });
                const all = [...last.values()].sort((a, b) => a.t - b.t);
                return { local: all.filter(x => x.on).map(x => x.e), localOff: all.filter(x => !x.on && Array.isArray(x.e)).slice(-100).map(x => x.e) };
            },

            outboxDue(x) {
                if (x.landedAt) return false;
                if (!x.lastTry) return true;
                const wait = x.netFail ? 10000 : [45, 60, 120, 240, 300][Math.min(Math.max(0, (x.tries || 1) - 1), 4)] * 1000;
                return Date.now() - x.lastTry >= wait;
            },

            postEvent(ev) {
                const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = ctl ? setTimeout(() => ctl.abort(), 20000) : null;
                return Cloud.send(ev, ctl ? { signal: ctl.signal } : {})
                    .finally(() => { if (timer) clearTimeout(timer); });
            },

            async flushOutbox() {
                if (this._flushing) { this._flushAgain = true; return; }
                this._flushing = true;
                let sent = 0;
                try {
                    do {
                        this._flushAgain = false;
                        if (!(this.outbox || []).some(x => this.outboxDue(x))) break;
                        // edits of existing records go out merged onto the newest copy
                        if ((this.outbox || []).some(x => x.base && this.outboxDue(x)) && Date.now() - (this.lastCloudAt || 0) > 1500) {
                            try { await this.sync({ silent: true }); } catch (e) {}
                        }
                        for (const x of (this.outbox || []).filter(y => this.outboxDue(y))) {
                            if ((x.tries || 0) >= 15) {   // the sheet keeps refusing it: stop, and say so
                                this.outbox = (this.outbox || []).filter(y => y !== x); this.saveOutbox();
                                this.showToast(Cloud.confirms ? 'One change couldn\'t be saved (it was refused).' : 'One change couldn\'t be saved (the sheet kept refusing it).');
                                continue;
                            }
                            if ((x.tries || 0) >= 3 && x.ev.type === 'brew' && x.ev.photo && /^data:/i.test(String(x.ev.photo.url || ''))) {
                                x.ev = { ...x.ev, photo: null };   // the photo won't upload: save the session without it
                                this.applyEvent(x.ev);
                                this.showToast('Saving the session without its photo (it wouldn\'t upload).');
                            }
                            x.tries = (x.tries || 0) + 1; x.lastTry = Date.now();
                            this.saveOutbox();
                            try {
                                const r = await this.postEvent(x.ev); x.netFail = false; sent++;
                                // v14.2: the new backend answers, so a save it accepted is done (unless a newer edit replaced it meanwhile)
                                if (r && r.landed && Cloud.confirms && (this.outbox || []).includes(x)) { x.landedAt = Date.now(); x.confirmed = true; this.saveOutbox(); }
                            } catch (e) {
                                if (e && e.refused && Cloud.confirms && !e.signedOut) {   // the server said no: counts toward giving up
                                    x.netFail = false;
                                    // v14.6: a speed limit passes in a few minutes (the retries outlast it); say so once
                                    if (/going a bit fast/i.test(String(e.message || '')) && Date.now() - (this._fastAt || 0) > 60000) { this._fastAt = Date.now(); this.showToast('You\'re going a bit fast. It\'ll save in a few minutes.'); }
                                }
                                else if (e && e.signedOut) { x.netFail = false; x.tries = Math.max(0, x.tries - 1); x.lastTry = 0; this.saveOutbox(); if (this.needSignIn) this.needSignIn(); }   // signed out: it goes as soon as they sign in again (even after a reload)
                                else { x.netFail = true; x.tries = Math.max(0, x.tries - 1); }   // no connection doesn't count toward giving up
                                console.error('Push error:', e);
                            }
                        }
                    } while (this._flushAgain);
                } finally {
                    this._flushing = false;
                }
                this.paintOutboxBadge();
                if (sent) setTimeout(() => this.sync({ silent: true }), 1200);
            },

            outboxStale() { return this.pendingOutbox().some(x => x.tries >= 1 && x.lastTry && (x.netFail || Date.now() - (x.at || x.lastTry) > 40000)); },

            paintOutboxBadge() {
                const text = document.getElementById('sync-text'), dot = document.getElementById('sync-dot');
                const n = this.pendingOutbox().length;
                if (!text || !dot) return;
                if (n) {
                    const stale = this.outboxStale();
                    text.innerText = this.syncFailed ? 'Offline · not saved yet' : (stale ? 'Not saved yet' : 'Saving...');
                    dot.className = 'dot pending';
                    if ((stale || this.syncFailed) && !this._unsavedToast && this.pendingOutbox().some(x => x.tries >= 1)) { this._unsavedToast = true; this.showToast('Not saved yet. Dialed In will keep trying.'); }
                } else if (this._unsavedToast) {
                    this._unsavedToast = false;
                    this.showToast('Saved.');
                }
            },

