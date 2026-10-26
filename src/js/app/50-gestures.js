            // ===================== v16.4: swipes =====================
            // - A coffee or roaster page (and someone else's profile): swipe left to right to go back where you came from.
            //   The page follows your finger and slides away, the way an iPhone's own back swipe does.
            // - A sheet (notifications, achievements, your level, Settings, Share...): pull it down from the top, or swipe
            //   it left to right, to close it. Sheets you type or time things in (logging a session, a new coffee, Brew
            //   along, a bug report, editing a roaster) don't close on a swipe, so nothing you've entered is lost.
            // - Coffees: swipe left or right between Mine and All. Feed: between Following, Community and Discover.
            // A swipe never starts on a slider, a 3D flavor shape, a text box or a row that scrolls sideways (except from
            // the very left edge, for Back), and a mostly-up-and-down drag is always just scrolling.
            swipeSheets() { return ['notif-modal', 'level-modal', 'notif-set-modal', 'shot-modal', 'bugs-modal', 'legal-modal', 'people-modal', 'settings-modal', 'shape-modal', 'achievement-modal', 'fab-modal', 'review-modal']; },

            topSheet() {
                const open = [...document.querySelectorAll('.modal.active')];
                if (!open.length) return null;
                const z = el => Number(getComputedStyle(el).zIndex) || 0;
                return open.reduce((a, b) => (z(b) >= z(a) ? b : a));
            },

            subPage() {
                if (this.sessionViewActive && this.sessionViewActive()) return document.getElementById('session-view');   // v17.2
                if (this.roasterViewActive && this.roasterViewActive()) return document.getElementById('roaster-view');
                if (this.isDetailActive && this.isDetailActive()) return document.getElementById('detail-view');
                return null;
            },

            // where Back from someone else's profile goes: the tab (and page) you were on when you opened it
            noteProfileFrom() {
                if (this._profFromLock) return;
                this._profBack = { tab: this.tab, scroll: typeof window !== 'undefined' ? window.scrollY : 0, page: this.snapPage ? this.snapPage() : null, stack: [...(this.navStack || [])], feedMode: this.feedMode ? this.feedMode() : '' };
            },

            swipeBack() {
                if (this.sessionViewActive && this.sessionViewActive()) { this.closeSession(true); return true; }   // v17.2
                if (this.roasterViewActive && this.roasterViewActive()) { this.goBackPage(); return true; }
                if (this.isDetailActive && this.isDetailActive()) { this.closeDetail(); return true; }
                if (this.tab === 'profile' && this.profileUser && this.profileUser !== this.user && this._profBack) {
                    const b = this._profBack; this._profBack = null;
                    this.setTab(b.tab || 'feed');
                    if (b.page) { this.navStack = [...(b.stack || []), b.page]; this.goBackPage(); }
                    else if (typeof window !== 'undefined') setTimeout(() => window.scrollTo(0, b.scroll || 0), 30);
                    return true;
                }
                return false;
            },

            swipeTabs() {
                if (this.tab === 'my') return { list: ['mine', 'all'], now: this.coffeeScopeNow(), set: v => this.setCoffeeScope(v) };
                if (this.tab === 'feed' && this.acctOn && this.acctOn()) return { list: ['following', 'groups', 'discover'], now: this.feedMode(), set: v => this.setFeedMode(v) };
                return null;
            },

            bindGestures() {
                if (this._gesturesBound || typeof document === 'undefined' || typeof window === 'undefined') return;
                this._gesturesBound = true;
                // remember where a profile was opened from (the shared click handler opens it)
                const realOpen = this.openAnyProfile;
                if (realOpen) this.openAnyProfile = function (name, ev) { const n = String(name || '').trim(); if (n && n !== this.user && !(this.tab === 'profile' && this.profileUser === n)) this.noteProfileFrom(); return realOpen.call(this, name, ev); };
                const W = () => window.innerWidth || 390, H = () => window.innerHeight || 844;
                const EDGE = 28;
                const sideways = el => {
                    for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
                        if (n.scrollWidth > n.clientWidth + 2) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
                    }
                    return false;
                };
                const blocked = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], canvas, .no-swipe, .wl-wrap'));
                const scrollerAtTop = (el, stop) => {
                    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
                        if (n.scrollHeight > n.clientHeight + 2) { const oy = getComputedStyle(n).overflowY; if ((oy === 'auto' || oy === 'scroll') && n.scrollTop > 0) return false; }
                        if (n === stop) break;
                    }
                    return true;
                };
                const ease = 'transform 0.22s cubic-bezier(.2,.8,.2,1), opacity 0.22s ease';
                const clear = (el, keep) => { if (!el) return; el.style.transition = ''; if (!keep) { el.style.transform = ''; el.style.opacity = ''; el.style.boxShadow = ''; } };
                let g = null;

                document.addEventListener('touchstart', e => {
                    g = null;
                    if (e.touches.length !== 1) return;
                    const t = e.touches[0], target = e.target, x = t.clientX, y = t.clientY;
                    const sheet = this.topSheet();
                    if (sheet) {
                        if (!this.swipeSheets().includes(sheet.id) || blocked(target)) return;
                        const card = sheet.querySelector('.modal-card');
                        if (!card || !card.contains(target)) return;
                        g = { kind: 'sheet', el: card, modal: sheet, x0: x, y0: y, t0: Date.now(), top: scrollerAtTop(target, card), side: !sideways(target) || x < EDGE };
                        return;
                    }
                    const on = id => { const el = document.getElementById(id); return !!(el && el.classList.contains('active')); };
                    if (on('guide-modal') || on('welcome-view')) return;
                    const page = this.subPage();
                    const edge = x < EDGE;
                    if (page) { if (edge || (!blocked(target) && !sideways(target))) g = { kind: 'back', el: page, x0: x, y0: y, t0: Date.now() }; return; }
                    if (this.tab === 'profile' && this.profileUser && this.profileUser !== this.user && this._profBack) {
                        if (edge || (!blocked(target) && !sideways(target))) g = { kind: 'back', el: document.getElementById('grid'), soft: true, x0: x, y0: y, t0: Date.now() };
                        return;
                    }
                    const tabs = this.swipeTabs();
                    if (tabs && !blocked(target) && !sideways(target) && !(target.closest && target.closest('#mobile-nav, .app-header, header'))) g = { kind: 'tabs', el: document.getElementById('grid'), tabs, x0: x, y0: y, t0: Date.now() };
                }, { passive: true });

                document.addEventListener('touchmove', e => {
                    if (!g || e.touches.length !== 1) return;
                    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
                    if (!g.lock) {
                        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
                        const across = Math.abs(dx) > Math.abs(dy) * 1.3, down = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.3;
                        if (g.kind === 'sheet') g.lock = down && g.top ? 'down' : (across && dx > 0 && g.side ? 'right' : 'none');
                        else if (g.kind === 'back') g.lock = across && dx > 0 ? 'right' : 'none';
                        else g.lock = across ? 'side' : 'none';
                        if (g.lock === 'none') { g = null; return; }
                        g.el.style.transition = 'none';
                        if (g.kind === 'back' && !g.soft) g.el.style.boxShadow = '-14px 0 34px rgba(0,0,0,0.22)';
                    }
                    if (e.cancelable) e.preventDefault();   // this drag is ours: no scrolling under it
                    g.dx = dx; g.dy = dy; g.t = Date.now();
                    if (g.lock === 'down') { g.el.style.transform = `translateY(${Math.max(0, dy)}px)`; g.modal.style.opacity = String(Math.max(0.35, 1 - Math.max(0, dy) / (H() * 1.4))); }
                    else if (g.lock === 'right' && g.kind === 'sheet') { g.el.style.transform = `translateX(${Math.max(0, dx)}px)`; g.modal.style.opacity = String(Math.max(0.35, 1 - Math.max(0, dx) / (W() * 1.4))); }
                    else if (g.kind === 'back') g.el.style.transform = `translateX(${g.soft ? Math.max(0, dx) * 0.4 : Math.max(0, dx)}px)`;
                    else if (g.kind === 'tabs') {
                        const i = g.tabs.list.indexOf(g.tabs.now), next = dx < 0 ? i + 1 : i - 1, room = next >= 0 && next < g.tabs.list.length;
                        g.el.style.transform = `translateX(${dx * (room ? 0.3 : 0.08)}px)`; g.el.style.opacity = String(room ? Math.max(0.55, 1 - Math.abs(dx) / (W() * 1.6)) : 1);
                    }
                }, { passive: false });

                const finish = () => {
                    const s = g; g = null;
                    if (!s || !s.lock || s.lock === 'none' || s.dx === undefined) { if (s && s.el && s.lock) clear(s.el); return; }
                    const ms = Math.max(1, (s.t || Date.now()) - s.t0), w = W(), h = H();
                    const vx = s.dx / ms, vy = s.dy / ms;
                    if (s.kind === 'sheet') {
                        const go = s.lock === 'down' ? (s.dy > Math.min(140, h * 0.18) || (vy > 0.5 && s.dy > 40)) : (s.dx > w * 0.3 || (vx > 0.5 && s.dx > 40));
                        const modal = s.modal;
                        s.el.style.transition = ease; modal.style.transition = 'opacity 0.22s ease';
                        if (!go) { s.el.style.transform = ''; modal.style.opacity = ''; setTimeout(() => { clear(s.el); modal.style.transition = ''; }, 240); return; }
                        s.el.style.transform = s.lock === 'down' ? `translateY(${h}px)` : `translateX(${w}px)`; modal.style.opacity = '0';
                        setTimeout(() => {
                            modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // its own close (what tapping outside it does)
                            if (modal.classList.contains('active')) modal.classList.remove('active');
                            clear(s.el); modal.style.opacity = ''; modal.style.transition = '';
                        }, 200);
                        if (this.haptic) this.haptic('tick');
                        return;
                    }
                    if (s.kind === 'back') {
                        const go = s.dx > w * (s.soft ? 0.22 : 0.33) || (vx > 0.45 && s.dx > 40);
                        s.el.style.transition = ease;
                        if (!go) { s.el.style.transform = ''; setTimeout(() => clear(s.el), 240); return; }
                        if (s.soft) { clear(s.el); this.swipeBack(); return; }
                        s.el.style.transform = `translateX(${w}px)`;
                        setTimeout(() => { this.swipeBack(); clear(s.el); }, 200);
                        if (this.haptic) this.haptic('tick');
                        return;
                    }
                    if (s.kind === 'tabs') {
                        const list = s.tabs.list, i = list.indexOf(s.tabs.now), next = s.dx < 0 ? i + 1 : i - 1;
                        const go = next >= 0 && next < list.length && (Math.abs(s.dx) > Math.min(90, w * 0.22) || (Math.abs(vx) > 0.45 && Math.abs(s.dx) > 40));
                        s.el.style.transition = ease;
                        if (!go) { s.el.style.transform = ''; s.el.style.opacity = ''; setTimeout(() => clear(s.el), 240); return; }
                        clear(s.el);
                        s.tabs.set(list[next]);
                        const grid = document.getElementById('grid');
                        if (grid) {   // the new list comes in from the side you swiped toward
                            grid.style.transition = 'none'; grid.style.transform = `translateX(${s.dx < 0 ? 36 : -36}px)`; grid.style.opacity = '0.4';
                            requestAnimationFrame(() => requestAnimationFrame(() => { grid.style.transition = ease; grid.style.transform = ''; grid.style.opacity = ''; setTimeout(() => clear(grid), 260); }));
                        }
                        if (this.haptic) this.haptic('tick');
                    }
                };
                document.addEventListener('touchend', finish, { passive: true });
                document.addEventListener('touchcancel', () => { const s = g; g = null; if (s && s.el && s.lock) { s.el.style.transition = ease; s.el.style.transform = ''; s.el.style.opacity = ''; if (s.modal) s.modal.style.opacity = ''; setTimeout(() => clear(s.el), 240); } }, { passive: true });
            },
