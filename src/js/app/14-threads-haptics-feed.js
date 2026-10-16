            // ---- comment threads (v10): collapsible, likes + replies on each comment
            threadKey(kind, id) { return `${kind}:${String(id)}`; },

            commentTarget(kind, id) {
                return kind === 'bean' ? this.beans.get(String(id)) : this.brews.get(String(id));
            },

            // ---- v12.6: who's in a thread, for the comments button (most comments first, then newest)
            commentPeople(comments) {
                const tally = new Map();
                (comments || []).forEach((c, i) => { if (!c || !c.user) return; const t = tally.get(c.user) || { n: 0, last: -1 }; t.n++; t.last = i; tally.set(c.user, t); });
                return [...tally.entries()].sort((a, b) => (b[1].n - a[1].n) || (b[1].last - a[1].last)).map(e => e[0]);
            },

            commentFacesHtml(comments) {
                const people = this.commentPeople(comments);
                if (!people.length) return '';
                const shown = people.slice(0, 3);
                return `<span class="thread-faces" aria-hidden="true">${shown.map((p, i) => `<i style="background:${this.esc(this.getUserColor(p))};z-index:${9 - i}">${this.esc(this.feedInitial(p))}</i>`).join('')}${people.length > shown.length ? `<i class="more" style="z-index:1">+${people.length - shown.length}</i>` : ''}</span>`;
            },

            commentButtonLabel(comments) {
                const n = comments.length;
                if (!n) return 'Add a comment';
                const people = this.commentPeople(comments);
                const names = people.length <= 2 ? people.join(' and ') : `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`;
                return `${n} comment${n === 1 ? '' : 's'}${names ? ` from ${names}` : ''}`;
            },

            // ---- v12.6: a like line that doesn't fit its row says it shorter instead of cutting a name off
            likeLineShort(line) {
                const lead = line.parentElement;
                const btn = lead && lead.querySelector('.like-btn');
                const m = btn && (btn.getAttribute('onclick') || '').match(/toggle(Bean)?Like\('([^']+)'/);
                if (!m) return '';
                const item = m[1] ? this.beans.get(m[2]) : this.brews.get(m[2]);
                if (!item) return '';
                const owner = m[1] ? String(item.user || item.owner || 'Unknown') : this.getBrewOwner(item);
                const likes = [...new Set(this.normalizeLikeList(item.likes, owner).map(n => String(n || '').trim()).filter(Boolean))];
                return likes.length > 1 ? `${likes[0]} +${likes.length - 1} liked` : '';
            },

            fitLikeLines(lines) {
                const fit = this._likeFit;
                const list = [...lines].filter(l => l && l.isConnected);
                list.forEach(l => {
                    const cur = l.textContent; let st = fit.get(l);
                    if (!st || (cur !== st.full && cur !== st.short)) { st = { full: cur, short: null }; fit.set(l, st); }
                    if (cur !== st.full) l.textContent = st.full;
                });
                list.filter(l => l.clientWidth > 0 && l.scrollWidth > l.clientWidth + 1).forEach(l => {
                    const st = fit.get(l);
                    if (st.short === null) st.short = this.likeLineShort(l);
                    if (st.short) l.textContent = st.short;
                });
            },

            watchLikeLines() {
                if (this._likeFit || typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
                this._likeFit = new WeakMap();
                const SEL = '.thread-lead .social-like-line';
                const pending = new Set(); let queued = false;
                const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => this.fitLikeLines(entries.map(e => e.target))) : null;
                const run = () => { queued = false; const list = [...pending]; pending.clear(); list.forEach(l => { if (!l.isConnected && ro) ro.unobserve(l); }); this.fitLikeLines(list); };
                const add = l => { if (!l.isConnected) return; const st = this._likeFit.get(l); if (st && st.short && l.textContent === st.short) return; if (!st && ro) ro.observe(l); pending.add(l); };
                new MutationObserver(recs => {
                    recs.forEach(r => {
                        const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
                        const own = t && t.closest ? t.closest('.social-like-line') : null;
                        if (own && own.matches(SEL)) add(own);
                        r.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches(SEL)) add(n); else if (n.querySelector('.social-like-line')) n.querySelectorAll(SEL).forEach(add); });
                        if (ro) r.removedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches(SEL)) ro.unobserve(n); else if (n.querySelector('.social-like-line')) n.querySelectorAll(SEL).forEach(l => ro.unobserve(l)); });
                    });
                    if (pending.size && !queued) { queued = true; requestAnimationFrame(run); }
                }).observe(document.body, { childList: true, subtree: true, characterData: true });
                if (!ro) window.addEventListener('resize', () => { document.querySelectorAll(SEL).forEach(l => pending.add(l)); if (!queued) { queued = true; requestAnimationFrame(run); } });
                document.querySelectorAll(SEL).forEach(add);
            },

            // ---- v12.7: haptics. kind: tap | tick | success | cue | warn | finish
            haptic(kind = 'tap') {
                try {
                    if (safeGet('dialed_haptics') === 'off') return;
                } catch (e) {}
                const now = Date.now();
                if (kind === 'tick' && now - (this._hapticAt || 0) < 35) return;
                if (kind === 'tick' && this._hxOn && this._hxPress && !this._hxPress.moved && now - this._hxPress.at < 1500) return;
                this._hapticAt = now;
                this._hapticLog = (this._hapticLog || []).concat([kind]).slice(-50);
                const buzz = { tap: 10, tick: 5, success: [12, 70, 18], cue: 90, warn: [25, 60, 25, 60, 25], finish: [120, 80, 120] }[kind] || 10;
                if (this._hxOn && (kind === 'tap' || kind === 'success' || kind === 'warn')) return;
                if (this.nativeHaptic && this.nativeHaptic(kind)) return;   // v14.6: the iPhone app's own haptics
                try {
                    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') { navigator.vibrate(buzz); return; }
                } catch (e) {}
                const clicks = { success: 2, cue: 2, warn: 3, finish: 3 }[kind] || 1;
                for (let i = 0; i < clicks; i++) { if (i === 0) this.hapticClick(); else setTimeout(() => this.hapticClick(), i * 120); }
            },

            hapticClick() {
                try {
                    let label = this._hapticEl;
                    if (!label || !label.isConnected) {
                        label = document.createElement('label');
                        label.setAttribute('aria-hidden', 'true');
                        label.setAttribute('data-haptic', '');
                        label.style.display = 'none';
                        const input = document.createElement('input');
                        input.type = 'checkbox';
                        input.setAttribute('switch', '');
                        input.tabIndex = -1;
                        label.appendChild(input);
                        const quiet = e => e.stopPropagation();
                        label.addEventListener('click', quiet);
                        input.addEventListener('click', quiet);
                        input.addEventListener('change', quiet);
                        document.head.appendChild(label);
                        this._hapticEl = label;
                    }
                    label.click();
                } catch (e) {}
            },

            // wrap an action so it buzzes when it really did something; only the outermost action buzzes
            installHaptics() {
                if (this._hapticsOn) return;
                this._hapticsOn = true;
                const app = this;
                let depth = 0;
                const wrap = (name, decide) => {
                    const orig = app[name];
                    if (typeof orig !== 'function') return;
                    app[name] = function (...args) {
                        const before = depth === 0 ? decide.before.apply(app, args) : undefined;
                        depth++;
                        let out;
                        try { out = orig.apply(app, args); } finally { depth--; }
                        if (depth === 0) { try { const k = decide.after.call(app, before, args, out); if (k) app.haptic(k); } catch (e) {} }
                        return out;
                    };
                };
                const always = kind => ({ before() {}, after() { return kind; } });
                const pushes = kind => ({ before() { return app._pushCount || 0; }, after(b) { return (app._pushCount || 0) > b ? kind : null; } });
                const liked = (list) => (list || []).includes(app.user);
                // count pushes (the sign an action went through)
                const push = app.push;
                app.push = function (...args) { app._pushCount = (app._pushCount || 0) + 1; return push.apply(app, args); };
                wrap('toggleLike', { before(id) { const b = app.brews.get(String(id)); return b ? liked(app.normalizeLikeList(b.likes, app.getBrewOwner(b))) : true; }, after(was) { return was ? null : 'tap'; } });
                wrap('toggleBeanLike', { before(id) { const b = app.beans.get(String(id)); return b ? liked(app.normalizeLikeList(b.likes, String(b.user || b.owner || ''))) : true; }, after(was) { return was ? null : 'tap'; } });
                wrap('toggleCommentLike', {
                    before(kind, id, cid) {
                        const t = kind === 'bean' ? app.beans.get(String(id)) : app.brews.get(String(id));
                        const c = t && app.normalizeCommentList(t.comments, `${kind}-${id}`, t.date).find(x => x.id === String(cid));
                        return c ? c.likes.includes(app.user) : true;
                    },
                    after(was) { return was ? null : 'tap'; }
                });
                ['toggleWantToTry', 'pickNote', 'setWheel', 'toggleTimer', 'guideStartPause', 'guideNext', 'finishGuide', 'useRecipe', 'cloneLatestSession', 'toggleGuideSound'].forEach(n => wrap(n, always('tap')));
                // Reset only when you press it (opening a new log resets the timer quietly)
                const pressed = fn => { const ev = typeof window !== 'undefined' ? window.event : null; const t = ev && ev.target; return !!(t && t.closest && t.closest(`[onclick*="${fn}("]`)); };
                wrap('resetTimer', { before() {}, after() { return pressed('resetTimer') ? 'tap' : null; } });
                wrap('setRecipeLock', { before() { return app.recipeLock; }, after(b) { return app.recipeLock !== b ? 'tap' : null; } });
                wrap('cycleNote', always('tick'));
                wrap('onTasteInput', always('tick'));   // only ever called as you move a taste slider
                wrap('updateRatingDisplay', { before() {}, after() { const ev = typeof window !== 'undefined' ? window.event : null; return ev && ev.type === 'input' && ev.target && ev.target.id === 'rating-slider' ? 'tick' : null; } });   // not when a form opens
                wrap('onBrewFormInput', { before() {}, after(b, [e]) { const t = e && e.target; return t && t.type === 'checkbox' ? 'tap' : null; } });
                ['handleBrewSubmit', 'handleBeanSubmit', 'handleMasterSubmit', 'addComment', 'addBeanComment'].forEach(n => wrap(n, pushes('success')));
                wrap('saveRecipe', { before() { return app.myRecipes().length; }, after(b) { return app.myRecipes().length > b ? 'success' : null; } });
                wrap('revealAwards', always('success'));
                ['delete', 'deleteBean', 'removeComment', 'removeBeanComment', 'unpinMaster'].forEach(n => wrap(n, pushes('warn')));
                wrap('deleteRecipe', { before() { return app.myRecipes().length; }, after(b) { return app.myRecipes().length < b ? 'warn' : null; } });
            },

            // ---- v12.8: iPhone haptics need a real tap on a switch's label (iOS 26.5+)
            installTapHaptics() {
                if (this._hxOn || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
                if (this.isNative && this.isNative()) return;   // v14.6: the iPhone app has the phone's own haptics
                const nav = typeof navigator !== 'undefined' ? navigator : {};
                const ios = /iP(hone|od|ad)/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
                if (!ios || typeof nav.vibrate === 'function') return;
                this._hxOn = true;
                document.documentElement.classList.add('hx-on');
                const HOSTS = '#isMasterInput + .slider, .note-wheel, .ns-track, .ns-ticks span, .rt-track, .like-btn, .cmt-like, .dh-want, [onclick*="app.pickNote("], [onclick*="app.cycleNote("], #timer-btn, [onclick*="app.resetTimer("], [onclick*="app.guideStartPause("], [onclick*="app.guideNext("], [onclick*="app.finishGuide("], [onclick*="app.setRecipeLock("], [onclick*="app.useRecipe("], [onclick*="app.saveRecipe("], [onclick*="app.cloneLatestSession("], .modal form button[type="submit"], .comment-submit, .aw-reveal-btn';
                const sw = document.createElement('input');
                sw.type = 'checkbox'; sw.id = 'hx-switch'; sw.setAttribute('switch', ''); sw.tabIndex = -1; sw.setAttribute('aria-hidden', 'true');
                document.body.appendChild(sw);
                const ensure = host => {
                    if (!host || !host.isConnected || host.querySelector(':scope > label.hx')) return;
                    const l = document.createElement('label'); l.className = 'hx'; l.htmlFor = 'hx-switch'; l.setAttribute('aria-hidden', 'true');
                    host.appendChild(l);
                };
                const scan = root => { if (root.nodeType !== 1) return; if (root.matches(HOSTS)) ensure(root); root.querySelectorAll(HOSTS).forEach(ensure); };
                const roots = new Set(); let queued = false;
                const run = () => { queued = false; const list = [...roots]; roots.clear(); list.forEach(r => { if (r.isConnected) scan(r); }); };
                new MutationObserver(recs => {
                    recs.forEach(r => {
                        r.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList.contains('hx')) roots.add(n); });
                        if (r.target.nodeType === 1 && r.target.matches && r.target.matches(HOSTS)) roots.add(r.target);
                    });
                    if (roots.size && !queued) { queued = true; requestAnimationFrame(run); }
                }).observe(document.body, { childList: true, subtree: true });
                scan(document.body);
                // a tap on a label: nothing else sees that click; the switch flips (the tick), then the button gets its click
                let pending = null, hxSubmit = null;
                // a press that starts on a label: a tap (ticks through the label) or a slide (can't tick on iOS 26.5+)
                window.addEventListener('pointerdown', e => { const t = e.target; this._hxPress = t instanceof Element && t.classList.contains('hx') ? { at: Date.now(), x: e.clientX, y: e.clientY, moved: false } : null; }, true);
                window.addEventListener('pointermove', e => { const p = this._hxPress; if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true; }, true);
                window.addEventListener('click', e => { if (e.target instanceof Element && e.target.classList.contains('hx')) setTimeout(() => { this._hxPress = null; }, 0); }, true);   // that tap is done
                const forward = () => {
                    const p = pending; pending = null;
                    if (!p || !p.host.isConnected) return;
                    p.host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, detail: 1, screenX: p.e.screenX, screenY: p.e.screenY, clientX: p.e.clientX, clientY: p.e.clientY }));
                };
                window.addEventListener('click', e => {
                    const t = e.target;
                    if (t === sw) { e.stopPropagation(); forward(); setTimeout(() => { if (document.activeElement === sw) sw.blur(); }, 0); return; }
                    if (!(t instanceof Element) || !t.classList.contains('hx')) return;
                    e.stopPropagation();
                    let host = t.parentElement;
                    if (pending) forward();
                    if (host.classList.contains('note-wheel')) {   // v12.11: pass the tap through to what's under it
                        t.style.pointerEvents = 'none'; const under = document.elementFromPoint(e.clientX, e.clientY); t.style.pointerEvents = '';
                        const hit = under && under.closest ? under.closest('[onclick]') : null;
                        if (!hit || !host.contains(hit)) { e.preventDefault(); return; }
                        host = hit;
                    }
                    pending = { host, e };
                    let off = false; try { off = safeGet('dialed_haptics') === 'off'; } catch (err) {}
                    const quiet = off || (host.matches('.like-btn, .cmt-like') && host.classList.contains('liked'));   // unliking stays silent
                    if (quiet) { e.preventDefault(); forward(); return; }
                    this._hxTaps = (this._hxTaps || 0) + 1;
                    if (host.type === 'submit' && host.form) hxSubmit = { form: host.form, at: Date.now(), done: false };
                    setTimeout(() => { if (pending && pending.e === e) forward(); }, 80);   // in case the switch never answers
                }, true);
                // a Save button with a label inside can get pressed twice in one tap (the label's tap and the forwarded one):
                // only the first submit of that tap goes through
                window.addEventListener('submit', e => {
                    if (!hxSubmit || e.target !== hxSubmit.form || Date.now() - hxSubmit.at > 1500) return;
                    if (hxSubmit.done) { e.preventDefault(); e.stopImmediatePropagation(); return; }
                    hxSubmit.done = true;
                }, true);
                document.addEventListener('click', e => { const p = this._tapSet; if (p && e.target === p.track) { this._tapSet = null; p.set(p.track, p.x); } }, true);
                // v13.1: the master toggle is a plain checkbox again (as a native iOS switch its slider stopped moving); the tick comes from the haptics helper
                const master = document.getElementById('isMasterInput'); if (master) { master.removeAttribute('switch'); master.addEventListener('change', () => this.haptic('tick')); }
            },

            renderThread(kind, target, opts = {}) {
                const id = String(target.id);
                const key = this.threadKey(kind, id);
                const comments = this.normalizeCommentList(target.comments, `${kind}-${id}`, target.date);
                const owner = kind === 'bean' ? String(target.user || target.owner || 'Unknown') : this.getBrewOwner(target);
                const open = this.openThreads.has(key) || (kind === 'brew' && this.openCommentId === id);
                const tops = comments.filter(c => !c.parentId || !comments.some(p => p.id === c.parentId));
                const kids = parent => comments.filter(c => c.parentId === parent.id);
                const people = [...new Set(comments.map(c => c.user))].slice(0, 3);
                const idx = c => kind === 'bean' ? comments.findIndex(x => x.id === c.id) : (Array.isArray(target.comments) ? target.comments : []).findIndex(x => String(x && x.id) === c.id);
                const one = (c, isReply) => {
                    const liked = c.likes.includes(this.user);
                    const color = this.getUserColor(c.user);
                    const i = idx(c);
                    const canEdit = c.user === this.user && i >= 0;
                    const canDelete = (c.user === this.user || owner === this.user) && i >= 0;
                    const editFn = kind === 'bean' ? 'editBeanComment' : 'editComment';
                    const delFn = kind === 'bean' ? 'removeBeanComment' : 'removeComment';
                    return `
                        <div class="cmt${isReply ? ' reply' : ''}" id="cmt-${this.esc(c.id)}">
                            <div class="cmt-avatar" style="background:${this.esc(color)}" data-profile="${this.esc(c.user)}">${this.esc(this.feedInitial(c.user))}</div>
                            <div class="cmt-main">
                                <div class="cmt-head"><b data-profile="${this.esc(c.user)}">${this.esc(c.user)}</b><span>${this.esc(this.formatRelativeDate(c.timestamp))}</span>${kind === 'brew' && target.helpfulAnswer && String(target.helpfulAnswer) === String(c.id) ? '<span class="cmt-helpful">Most helpful</span>' : ''}</div>
                                <div class="cmt-text">${this.esc(c.text)}</div>
                                <div class="cmt-actions">
                                    <button type="button" class="cmt-like${liked ? ' liked' : ''}" onclick="app.toggleCommentLike('${app.escJs(kind)}','${app.escJs(id)}','${app.escJs(c.id)}',event)" aria-pressed="${liked}" aria-label="Like comment">
                                        <svg class="icon"><use href="#i-heart"/></svg>${c.likes.length ? `<span>${c.likes.length}</span>` : ''}
                                    </button>
                                    <button type="button" class="cmt-act" onclick="app.startReply('${app.escJs(kind)}','${app.escJs(id)}','${app.escJs(c.id)}',event)">Reply</button>
                                    ${canEdit ? `<button type="button" class="cmt-act" onclick="app.${editFn}('${app.escJs(id)}', ${i}, event)">Edit</button>` : ''}
                                    ${canDelete ? `<button type="button" class="cmt-act danger" onclick="app.${delFn}('${app.escJs(id)}', ${i}, event)">Delete</button>` : ''}
                                    ${this.canMarkHelpful && this.canMarkHelpful(kind, target, c) ? `<button type="button" class="cmt-act${String(target.helpfulAnswer || '') === String(c.id) ? ' on' : ''}" onclick="app.markHelpful('${app.escJs(id)}','${app.escJs(c.id)}', event)">${String(target.helpfulAnswer || '') === String(c.id) ? 'Unmark' : 'Most helpful'}</button>` : ''}
                                    ${this.acctOn() && c.user !== this.user ? `<button type="button" class="cmt-act" onclick="app.reportItem('comment','${app.escJs(id)}#${app.escJs(c.id)}', event)">Report</button>` : ''}
                                </div>
                                ${c.likes.length ? `<div class="cmt-likers">Liked by ${this.esc(c.likes.slice(0, 3).join(', '))}${c.likes.length > 3 ? ` +${c.likes.length - 3}` : ''}</div>` : ''}
                            </div>
                        </div>`;
                };
                const list = tops.map(c => one(c, false) + kids(c).map(r => one(r, true)).join('')).join('');
                const reply = this.replyTo && this.replyTo.key === key ? this.replyTo : null;
                const submit = kind === 'bean' ? `app.addBeanComment('${app.escJs(id)}', event)` : `app.addComment('${app.escJs(id)}', event)`;
                const keyHandler = opts.inputId && opts.inputId.startsWith('comment-input-')
                    ? `app.handleCommentKey(event, '${app.escJs(id)}')`
                    : `app.handleFeedCommentKey(event, '${app.escJs(kind)}', '${app.escJs(id)}')`;
                return `
                    <div class="thread${open ? ' open' : ''}${opts.wide ? ' log-wide' : ''}${opts.lead !== undefined ? ' compact' : ''}" data-thread="${this.esc(key)}" ${opts.anchorId ? `id="${this.esc(opts.anchorId)}"` : ''} onclick="event.stopPropagation()">
                        ${opts.lead !== undefined ? `<div class="thread-row"><div class="thread-lead">${opts.lead}</div><button type="button" class="thread-toggle${comments.length ? ' has-faces' : ''}" aria-expanded="${open}" aria-label="${this.esc(this.commentButtonLabel(comments))}" onclick="app.toggleThread('${app.escJs(kind)}','${app.escJs(id)}',event)"><svg class="icon"><use href="#i-message-square"/></svg>${comments.length ? `<b>${comments.length}</b>${this.commentFacesHtml(comments)}` : ''}</button></div>` : `
                        <button type="button" class="thread-toggle" aria-expanded="${open}" onclick="app.toggleThread('${app.escJs(kind)}','${app.escJs(id)}',event)">
                            <svg class="icon"><use href="#i-message-square"/></svg>
                            <span class="thread-label">${comments.length ? `Comments <b>${comments.length}</b>` : 'Add a comment'}</span>
                            ${people.length ? `<span class="thread-faces">${people.map(n => `<i style="background:${this.esc(this.getUserColor(n))}">${this.esc(this.feedInitial(n))}</i>`).join('')}</span>` : ''}
                            <svg class="icon thread-chev"><use href="#i-chevron-down"/></svg>
                        </button>`}
                        <div class="thread-body">
                            ${list || '<div class="thread-empty">No comments yet. Start the conversation.</div>'}
                            <div class="cmt-compose">
                                <div class="reply-chip"${reply ? '' : ' hidden'}>Replying to <b>${reply ? this.esc(reply.user) : ''}</b><button type="button" onclick="app.cancelReply(event)" aria-label="Cancel reply">×</button></div>
                                <div class="cmt-input-row">
                                    <input type="text" class="comment-input" id="${this.esc(opts.inputId)}" placeholder="${kind === 'bean' ? 'Comment on this bean…' : 'Add a comment…'}" onkeydown="${keyHandler}" maxlength="280">
                                    ${this.cmtShareHtml ? this.cmtShareHtml(kind, target, key) : ''}
                                    <button type="button" class="comment-submit" onclick="${submit}">Post</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
            },

            setThreadDom(key, open) {
                document.querySelectorAll('[data-thread]').forEach(el => {
                    if (el.getAttribute('data-thread') !== key) return;
                    const host = el.closest ? el.closest('[data-fkey]') : null;
                    if (host) this.dirtyKeys(host.getAttribute('data-fkey'));
                    el.classList.toggle('open', open);
                    const t = el.querySelector('.thread-toggle');
                    if (t) t.setAttribute('aria-expanded', String(open));
                });
            },

            toggleThread(kind, id, event) {
                if (event) event.stopPropagation();
                const key = this.threadKey(kind, id);
                const open = !this.openThreads.has(key) && !(kind === 'brew' && this.openCommentId === String(id));
                if (open) this.openThreads.add(key);
                else {
                    this.openThreads.delete(key);
                    if (kind === 'brew' && this.openCommentId === String(id)) this.openCommentId = null;
                    if (this.replyTo && this.replyTo.key === key) this.replyTo = null;
                }
                this.setThreadDom(key, open);
            },

            openThread(kind, id, event, focus = true) {
                if (event) event.stopPropagation();
                const key = this.threadKey(kind, id);
                this.openThreads.add(key);
                this.setThreadDom(key, true);
                if (!focus) return;
                const thread = [...document.querySelectorAll('[data-thread]')].find(el => el.getAttribute('data-thread') === key);
                const input = thread && thread.querySelector('.comment-input');
                if (input) setTimeout(() => input.focus(), 30);
            },

            startReply(kind, id, commentId, event) {
                if (event) event.stopPropagation();
                const target = this.commentTarget(kind, id);
                if (!target) return;
                const list = this.normalizeCommentList(target.comments, `${kind}-${id}`, target.date);
                const c = list.find(x => x.id === String(commentId));
                if (!c) return;
                const key = this.threadKey(kind, id);
                this.replyTo = { key, parentId: c.parentId || c.id, user: c.user };
                this.openThreads.add(key);
                document.querySelectorAll('[data-thread]').forEach(el => {
                    if (el.getAttribute('data-thread') !== key) return;
                    el.classList.add('open');
                    const chip = el.querySelector('.reply-chip');
                    if (chip){ chip.hidden = false; const b = chip.querySelector('b'); if (b) b.textContent = c.user; }
                });
                this.openThread(kind, id, null, true);
            },

            cancelReply(event) {
                if (event) event.stopPropagation();
                this.replyTo = null;
                document.querySelectorAll('.reply-chip').forEach(chip => { chip.hidden = true; });
            },

            takeReplyParent(kind, id) {
                const key = this.threadKey(kind, id);
                if (!this.replyTo || this.replyTo.key !== key) return '';
                const parent = this.replyTo.parentId;
                this.replyTo = null;
                return parent;
            },

            toggleCommentLike(kind, id, commentId, event) {
                if (event) event.stopPropagation();
                if (!this.user) return;
                const target = this.commentTarget(kind, id);
                if (!target) return;
                const comments = this.normalizeCommentList(target.comments, `${kind}-${id}`, target.date);
                const c = comments.find(x => x.id === String(commentId));
                if (!c) return;
                c.likes = c.likes.includes(this.user) ? c.likes.filter(n => n !== this.user) : [...c.likes, this.user];
                this.openThreads.add(this.threadKey(kind, id));
                if (kind === 'bean') {
                    const payload = this.buildBeanPayload(target, { comments });
                    if (payload) this.push(payload);
                } else {
                    const updated = this.withBrewOwner({ ...target, comments }, target);
                    this.push({ type: 'brew', ...updated });
                }
            },

            focusFeedComment(targetType, id) {
                const key = String(id || '');
                const inputId = targetType === 'bean'
                    ? `feed-comment-input-bean-${key}`
                    : `feed-comment-input-brew-${key}`;
                const input = document.getElementById(inputId);
                if (input) input.focus();
            },

            handleFeedCommentKey(event, targetType, id) {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (targetType === 'bean') this.addBeanComment(id, event);
                    else this.addComment(id, event);
                }
            },

            renderFeedCommentsForBrew(brew) {
                return this.renderThread('brew', brew, { inputId: `feed-comment-input-brew-${brew.id}` });
            },

            renderFeedCommentsForBean(bean) {
                return this.renderThread('bean', bean, { inputId: `feed-comment-input-bean-${bean.id}` });
            },

            renderFeedSessionCard(entry) {
                const brew = this.brews.get(String(entry.brewId || ''));
                if (!brew) return '';
                const owner = this.getBrewOwner(brew);
                const color = this.getUserColor(owner, entry.actorColor || '');
                const bean = this.beans.get(String(brew.beanId || ''));
                const roasterName = bean ? String(bean.roaster || '').trim() : '';
                const coffeeName = (bean ? String(bean.name || '').trim() : String(entry.beanName || '')) || 'Coffee';
                const rating = this.normalizeRating(brew.rating);
                const flavors = this.extractFlavors(brew).slice(0, 4);
                const gear = [...this.resolveEquipmentNames(brew), ...this.sessionExtras(brew)];
                const likes = this.normalizeLikeList(brew.likes, owner);
                const unlocks = this.achievementUnlockByBrew.get(String(brew.id)) || [];
                const notes = this.getBrewNotes(brew);
                return `
                    <article class="feed-card feed-session-card sc-card" data-card-brew="${this.esc(brew.id)}" onclick="app.openFeedTarget('${app.escJs(brew.beanId || '')}','${app.escJs(brew.id)}',true)">
                        <div class="feed-card-body">
                            <div class="feed-head">
                                <div class="feed-avatar" style="background:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(this.feedInitial(owner))}</div>
                                <div class="feed-meta">
                                    <div class="feed-actor" style="color:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(owner)}</div>
                                    <div class="feed-time" data-time="${this.esc(String(entry.date || brew.date || ''))}">${this.esc(this.formatRelativeDate(entry.date || brew.date))}</div>
                                </div>
                                ${entry.community ? this.communityFollowHtml(owner) : ''}<div class="feed-type sc-method"><svg class="method-icon"><use href="${this.methodIconUse(brew.method)}"/></svg>${this.esc(brew.method || 'Espresso')}</div>
                            </div>
                            <div class="sc-title">
                                <div class="sc-name"><div class="feed-card-title">${this.esc(coffeeName)}</div>${roasterName ? `<div class="sc-roaster"><span class="ro-link" role="link" tabindex="0" data-roaster="${this.esc(roasterName)}" onclick="app.openRoasterFrom(this, event)">${this.esc(roasterName)}</span></div>` : ''}${(tag => tag ? `<div class="sc-tags">${tag}</div>` : '')(this.helpTagHtml ? this.helpTagHtml(brew) : '')}</div>
                                ${rating > 0 ? `<div class="sc-rate"><span class="star-meter" style="--fill:${this.starFill(rating)}%;--whole:${this.starWhole(rating)};--frac:${this.starFrac(rating)}"></span><b>${this.esc(this.formatRating(rating).replace('/5', ''))}</b></div>` : ''}
                            </div>
                            ${this.recipeStripHtml(brew)}
                            ${this.renderCardTabs(brew)}
                            <div class="card-pane${this.cardTab(brew) === 'session' ? ' active' : ''}" data-pane="session">
                            ${flavors.length ? `<div class="sc-notes">${flavors.map(f => this.famChip(f)).join('')}</div>` : ''}
                            ${gear.length ? `<div class="sc-gear">${gear.map(g => this.esc(g)).join('<i></i>')}</div>` : ''}
                            ${this.renderSessionPhoto(brew, 'feed')}
                            ${notes ? `<div class="feed-note">${this.esc(notes)}</div>` : ''}
                            ${unlocks.map(unlock => `<div class="achievement-inline">${this.esc(this.formatAchievementLine(unlock, unlock.user === this.user))}</div>`).join('')}
                            </div>
                            ${this.lazyPanes(brew)}
                            ${this.renderThread('brew', brew, { inputId: `feed-comment-input-brew-${brew.id}`, lead: `<button class="social-btn like-btn ${likes.includes(this.user) ? 'liked' : ''}${this.likePopClass('brew', brew.id)}"${this.likePopStyle('brew', brew.id)} onclick="app.toggleLike('${app.escJs(brew.id)}', event)" title="Like session">
                                    <svg class="heart-icon"><use href="#i-heart"/></svg>
                                </button>${likes.length ? `<div class="social-like-line">${this.esc(this.formatLikers(likes))}</div>` : ''}` })}
                        </div>
                    </article>
                `;
            },

            // ---- v12.2: the recipe as four cells (Dose / Pull or Water / Time or Steep / Grind)
            recipeStripHtml(b) {
                const esp = !b.method || b.method === 'Espresso';
                const dose = this.num(b.dose), yld = this.num(b.yield), time = this.num(b.time);
                const hours = b.timeUnit === 'h' || b.method === 'Cold Brew';
                const grams = v => v > 0 ? `${this.esc(this.fmtNum(v, 1))}<small>g</small>` : '–';
                const ratio = dose > 0 && yld > 0 ? `1:${this.fmtNum(yld / dose, 1)}` : '';
                const t = !(time > 0) ? '–' : hours ? `${this.esc(this.fmtNum(time, 1))}<small>h</small>` : esp ? `${this.esc(this.fmtNum(time))}<small>s</small>` : this.esc(this.clock(time));
                const grind = this.grindText(b.grind);
                const cell = (v, label, sub) => `<div class="sc-cell"><b>${v}</b><span>${this.esc(label)}${sub ? ` · <em>${this.esc(sub)}</em>` : ''}</span></div>`;
                return `<div class="sc-strip feed-card-metrics${esp ? '' : ' sc-pour'}">${this.recipeBandHtml(b)}${cell(grams(dose), 'Dose')}${cell(grams(yld), esp ? 'Pull' : 'Pour', ratio)}${cell(t, hours ? 'Steep' : 'Time')}${cell(grind ? this.esc(grind) : '–', 'Grind')}</div>`;
            },

            // brewer, temperature, heat, inverted: the extras the old recipe line carried
            sessionExtras(b) {
                const out = [];
                if (b.brewer) out.push(String(b.brewer));
                if (b.temp) out.push(`${this.fmtNum(b.temp)}°C`);
                if (b.heat) out.push(`${b.heat} heat`);
                if (b.inverted) out.push('Inverted');
                return out;
            },

            renderFeedBeanCard(entry) {
                const bean = this.beans.get(String(entry.beanId || ''));
                if (!bean) return '';
                const owner = String(bean.user || bean.owner || 'Unknown');
                const color = this.getUserColor(owner, entry.actorColor || '');
                const beanName = `${bean.roaster || ''} ${bean.name || ''}`.trim() || 'Unnamed Bean';
                const likes = this.normalizeLikeList(bean.likes, owner);
                const comments = this.normalizeCommentList(bean.comments, `bean-${bean.id}`, bean.date);
                const topTags = [bean.variety, bean.origin, bean.process].filter(Boolean).slice(0, 3);
                return `
                    <article class="feed-card">
                        <div class="feed-card-body">
                            <div class="feed-head">
                                <div class="feed-avatar" style="background:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(this.feedInitial(owner))}</div>
                                <div class="feed-meta">
                                    <div class="feed-actor" style="color:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(owner)}</div>
                                    <div class="feed-time" data-time="${this.esc(String(entry.date || bean.date || ''))}">${this.esc(this.formatRelativeDate(entry.date || bean.date))}</div>
                                </div>
                                <div class="feed-type">${this.esc(entry.kindLabel || 'Bean')}</div>
                            </div>
                            <div class="feed-card-title" style="margin-top:11px">${this.esc(bean.name || beanName)}</div>
                            ${bean.roaster ? `<div class="fb-roaster"><span class="ro-link" role="link" tabindex="0" data-roaster="${this.esc(bean.roaster)}" onclick="app.openRoasterFrom(this, event)">${this.esc(bean.roaster)}</span></div>` : ''}
                            ${topTags.length ? `<div class="fb-tags">${topTags.map(tag => `<span class="tag">${this.esc(tag)}</span>`).join('')}</div>` : ''}
                            ${this.renderThread('bean', { ...bean, comments }, { inputId: `feed-comment-input-bean-${bean.id}`, lead: `<button class="social-btn like-btn ${likes.includes(this.user) ? 'liked' : ''}${this.likePopClass('bean', bean.id)}"${this.likePopStyle('bean', bean.id)} onclick="app.toggleBeanLike('${app.escJs(bean.id)}', event)" title="Like bean">
                                    <svg class="heart-icon"><use href="#i-heart"/></svg>
                                </button>${likes.length ? `<div class="social-like-line">${this.esc(this.formatLikers(likes))}</div>` : ''}<span class="social-owner-actions"><button class="btn-outline feed-open-link" type="button" onclick="app.openFeedTarget('${app.escJs(bean.id)}','',false); event.stopPropagation();">
                                    Open Bean
                                </button></span>` })}
                        </div>
                    </article>
                `;
            },

            renderFeed(grid) {
                // v14.4: on the new backend the feed has two views: Following (your circle) and Community (everyone)
                if (this.acctOn() && !this.ppState().data && !this._peopleLoading) {   // who you follow decides where a newcomer starts
                    this._peopleLoading = true;
                    this.loadPeople().then(() => { this._peopleLoading = false; if (this.tab === 'feed') this.render(); }).catch(() => { this._peopleLoading = false; });
                }
                if (this.acctOn() && this.feedMode() !== 'following') { this.renderCommunityFeed(grid); return; }   // v14.5: Community and Discover
                grid.className = 'feed-list';
                if (grid.getAttribute && grid.getAttribute('data-view') === 'community') { grid.removeAttribute('data-view'); this._feedHtml = null; }
                const entries = this.feedEntries.slice(0, 220);
                if (!entries.length) {
                    grid.innerHTML = this.acctOn()
                        ? this.feedModeHtml() + '<div class="comm-empty">Nothing here yet. Follow people (Profiles, then People) or see what everyone is brewing in Community.</div>'
                        : '<div style="text-align:center; color:#999; padding:3rem;">No feed activity yet.</div>';
                    if (grid.removeAttribute) grid.removeAttribute('data-view');
                    this._feedHtml = null;
                    return;
                }
                // v14.5: on accounts, the group goal and monthly awards belong to a private community (Feed, Community)
                const acct = this.acctOn();
                const tops = [['top:mode', this.feedModeHtml()], ['top:welcome', this.renderWelcomeBack()], ['top:quest', acct ? '' : this.renderCrewQuest()], ['top:teaser', acct ? '' : this.renderAwardsTeaser()]];
                if (!this.canPatchDom(grid)) {
                    grid.innerHTML = tops.map(t => t[1]).join('') + entries.map(e => this.feedCardHtml(e)).join('');
                    return;
                }
                // v12.2: keep what's already drawn; draw the first screens now and the rest right after
                const keep = grid.getAttribute('data-view') === 'feed' && this._feedHtml;
                if (!keep) { this._feedHtml = new Map(); this._feedShown = 0; grid.innerHTML = ''; grid.setAttribute('data-view', 'feed'); }
                const n = Math.min(entries.length, Math.max(keep ? this._feedShown || 0 : 0, 12));
                const items = tops.filter(t => t[1] && t[1].trim()).map(([key, html]) => ({ key, html }));
                for (let i = 0; i < n; i++) items.push({ key: this.feedKey(entries[i]), html: this.feedCardHtml(entries[i]) });
                this.patchKeyed(grid, items, this._feedHtml);
                this._feedShown = n;
                this.queueFeedRest();
            },


