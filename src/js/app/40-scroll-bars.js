            // ---- v14.7: like Instagram on a phone: scrolling down tucks the top bar away and makes the bottom bar smaller;
            // a small scroll back up brings both back. Near the top both bars always show. Computers keep both as they are.
            bindScrollBars() {
                if (this._barsBound || typeof document === 'undefined') return;
                const sc = document.getElementById('main-content');
                if (!sc || typeof sc.addEventListener !== 'function') return;
                this._barsBound = true;
                const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches;
                const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f => setTimeout(f, 16));
                let last = sc.scrollTop, down = 0, up = 0, queued = false;
                const update = () => {
                    queued = false;
                    const y = sc.scrollTop, max = sc.scrollHeight - sc.clientHeight, dy = y - last;
                    last = y;
                    if (!phone()) { this.setBarsTucked(false); return; }
                    const head = document.querySelector('.header-sticky');
                    if (y <= (head ? head.offsetHeight : 120)) { down = up = 0; this.setBarsTucked(false); return; }   // near the top
                    if (y >= max - 2) return;   // the bounce at the very bottom isn't a scroll back up
                    if (dy > 0) { down += dy; up = 0; if (down > 12) this.setBarsTucked(true); }
                    else if (dy < 0) { up -= dy; down = 0; if (up > 8) this.setBarsTucked(false); }
                };
                sc.addEventListener('scroll', () => { if (!queued) { queued = true; raf(update); } }, { passive: true });
            },

            setBarsTucked(on) {
                on = Boolean(on);
                if (this._barsTucked === on || typeof document === 'undefined' || !document.body) return;
                this._barsTucked = on;
                document.body.classList.toggle('bars-tucked', on);
            },

            // ---- v14.8: tabs (Following / Community / Discover, a profile's sections, People) switch when your finger
            // lifts, so a tap still counts when the list was still moving (iPhone spends that tap stopping the scroll
            // and sends no click). A press that slides more than a little is a scroll, not a tap.
            // v15.0: the bottom bar works the same way (from Feed, a tap there used to need a second try)
            bindTabTaps() {
                if (this._tabTapsBound || typeof document === 'undefined') return;
                this._tabTapsBound = true;
                const SEL = '.seg-control[role="tablist"] > button, #mobile-nav .mob-item, #mobile-nav .mob-fab';
                let down = null, fired = null;
                document.addEventListener('pointerdown', e => {
                    const b = e.target && e.target.closest ? e.target.closest(SEL) : null;
                    down = b && e.pointerType !== 'mouse' ? { b, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
                }, true);
                document.addEventListener('pointercancel', e => { if (down && e.pointerId === down.id) down = null; }, true);
                document.addEventListener('pointerup', e => {
                    const d = down; down = null;
                    if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || !d.b.isConnected) return;
                    fired = { b: d.b, at: Date.now(), x: e.clientX, y: e.clientY };
                    d.b.click();   // the tab's own handler, right away
                }, true);
                // the click iPhone may still send for the same tap: it already counted (whatever is under the finger now,
                // like the sheet the + button just opened)
                document.addEventListener('click', e => {
                    const f = fired;
                    if (!f || !e.isTrusted || Date.now() - f.at > 700) return;
                    const b = e.target && e.target.closest ? e.target.closest(SEL) : null;
                    if (!b && Math.hypot(e.clientX - f.x, e.clientY - f.y) > 30) return;
                    fired = null; e.preventDefault(); e.stopPropagation();
                }, true);
            },

