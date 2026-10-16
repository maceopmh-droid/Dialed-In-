            // ---- v12.0: center each initial's ink (not just its text box) in its circle
            centerInitials(root) {
                if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return;
                const scope = root && root.querySelectorAll ? root : document;
                const els = [...scope.querySelectorAll(INITIAL_SEL)];
                if (root && root.matches && root.matches(INITIAL_SEL)) els.unshift(root);
                if (!els.length) return;
                if (!this._icCtx) { const c = document.createElement('canvas'); this._icCtx = c.getContext ? c.getContext('2d') : null; this._icCache = new Map(); }
                const ctx = this._icCtx;
                if (!ctx || typeof ctx.measureText !== 'function') return;
                els.forEach(el => {
                    const node = el.firstChild;
                    if (!node || node.nodeType !== 3 || el.childNodes.length !== 1) return;
                    const ch = node.nodeValue.trim();
                    if (!ch || ch.length > 2) return;
                    const cs = getComputedStyle(el);
                    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                    const key = `${font}|${ch}`;
                    let d = this._icCache.get(key);
                    if (!d) {
                        // ink shape from canvas, measured big (small sizes come back rounded) and scaled down
                        const BIG = 200, size = parseFloat(cs.fontSize) || 12, k = size / BIG;
                        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${BIG}px ${cs.fontFamily}`;
                        const m = ctx.measureText(ch);
                        const ok = [m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent].every(Number.isFinite);
                        // where the browser actually puts the baseline inside the letter's box (font tables don't say reliably)
                        const box = document.createElement('div');
                        box.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
                        const probeSpan = document.createElement('span');
                        probeSpan.className = 'ini';
                        Object.assign(probeSpan.style, { fontStyle: cs.fontStyle, fontWeight: cs.fontWeight, fontSize: cs.fontSize, fontFamily: cs.fontFamily });
                        probeSpan.textContent = ch;
                        const mark = document.createElement('i');
                        mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
                        probeSpan.appendChild(mark);
                        box.appendChild(probeSpan);
                        document.body.appendChild(box);
                        const sr = probeSpan.getBoundingClientRect();
                        const base = mark.getBoundingClientRect().top - sr.top;
                        box.remove();
                        d = ok && sr.height > 0 ? {
                            x: k * (m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2),
                            y: sr.height / 2 - (base + k * (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2)
                        } : { x: 0, y: 0 };
                        this._icCache.set(key, d);
                    }
                    const span = document.createElement('span');
                    span.className = 'ini';
                    span.textContent = ch;
                    span.style.transform = `translate(${d.x.toFixed(2)}px, ${d.y.toFixed(2)}px)`;
                    el.replaceChildren(span);
                });
            },

            watchInitials() {
                if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
                // v12.2: only what was just added gets looked at
                const roots = new Set();
                let queued = false;
                const run = () => { queued = false; const list = [...roots]; roots.clear(); list.forEach(r => { if (r.isConnected) this.centerInitials(r); }); };
                new MutationObserver(recs => {
                    recs.forEach(r => r.addedNodes.forEach(n => {
                        if (n.nodeType === 1) { if (!n.classList.contains('ini')) roots.add(n); }
                        else if (n.nodeType === 3 && n.parentElement) roots.add(n.parentElement);
                    }));
                    if (roots.size && !queued) { queued = true; requestAnimationFrame(run); }
                }).observe(document.body, { childList: true, subtree: true });
                this.centerInitials();
            },

            init() {
                if (this.noteInviteLink) this.noteInviteLink();   // v14.4: ?join=CODE, offered once you're signed in
                if (this.noteProfileLink) this.noteProfileLink();   // v14.5: ?u=Name opens their profile once you're signed in
                this.initFlavors();
                this.bindGlobalHandlers();
                this.applyInitialRoute();
                let colorChanged = false;
                this.users.forEach(userName => {
                    const saved = this.normalizeHexColor(this.userColors[userName]);
                    if (!saved) {
                        this.userColors[userName] = this.defaultUserColor(userName);
                        colorChanged = true;
                    }
                });
                if (colorChanged) safeSet('dialed_user_colors', JSON.stringify(this.userColors));
                const mobileSort = document.getElementById('mobile-sort-select');
                const mobileMethod = document.getElementById('mobile-method-select');
                if (mobileSort) mobileSort.value = this.currentSort;
                if (mobileMethod) mobileMethod.value = this.currentMethodFilter;
                if (!this.user) this.openWelcome();   // v14.0
                else this.updateBadge('connecting');
                this.watchInitials();
                this.watchLikeLines();
                this.installHaptics();
                this.installTapHaptics();
                this.bindRatingSlider();
                this.setTab(this.tab);
                this.outboxReady = this.loadOutbox();
                if (typeof window.addEventListener === 'function') window.addEventListener('online', () => { (this.outbox || []).forEach(x => { x.lastTry = 0; }); this.flushOutbox(); });   // (a stand-in window in some tests has none)
                this.bootFromCache().then(() => {
                    if (this.user || this.welcomeOpen) this.sync();
                });
                this.syncTimer = setInterval(() => {
                    if (!document.hidden) this.sync({ silent: true });
                }, 30000);
                // v14.0: a newer version reloads the app by itself (when nothing is open)
                setTimeout(() => this.checkForUpdate(), 4000);
                this.updateTimer = setInterval(() => { if (!document.hidden) this.checkForUpdate(); }, 20 * 60000);
                document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (this._updCheckedAt || 0) > 120000) this.checkForUpdate(); });
                document.addEventListener('visibilitychange', () => {
                    // v13.4: the phone lets go of "keep the screen on" while you're away; ask again on the way back
                    const guide = document.getElementById('guide-modal');
                    if (!document.hidden && this.timer && this.timer.on && guide && guide.classList.contains('active') && navigator.wakeLock && (!this.wakeLock || this.wakeLock.released)) navigator.wakeLock.request('screen').then(l => { this.wakeLock = l; }).catch(() => {});
                    if (!document.hidden && Date.now() - this.lastSyncAt > 5000) this.sync({ silent: true });
                    if (!document.hidden && this.tab === 'feed') this.playCrewLoop();
                });
            },

            bindGlobalHandlers() {
                document.addEventListener('click', (event) => {
                    const menu = document.getElementById('sort-menu');
                    const btn = document.querySelector('.sort-btn');
                    if (!menu || !btn) return;
                    if (!menu.contains(event.target) && !btn.contains(event.target)) {
                        menu.classList.remove('active');
                    }

                    const mobilePanel = document.getElementById('mobile-controls-panel');
                    const mobileBtn = document.getElementById('mobile-controls-btn');
                    if (!mobilePanel || !mobileBtn) return;
                    if (document.body.classList.contains('mobile-controls-open') &&
                        !mobilePanel.contains(event.target) &&
                        !mobileBtn.contains(event.target)) {
                        this.closeMobileControls();
                    }
                });

                document.addEventListener('keydown', (event) => {
                    if (event.key !== 'Escape') return;
                    if (this._wr) return;
                    this.closeModals();
                    this.closeDetail();
                    this.closeMobileControls();
                    document.getElementById('sort-menu').classList.remove('active');
                });
            },

            applyInitialRoute() {
                try {
                    const params = new URLSearchParams(window.location.search || '');
                    const view = String(params.get('view') || '').toLowerCase();
                    if (view === 'feed' || view === 'shared' || view === 'my' || view === 'profile') {
                        this.tab = view;
                    }
                } catch (err) {
                    this.tab = this.tab || 'my';
                }
            },

