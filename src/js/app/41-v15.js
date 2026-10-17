            // ---- v15.0: everyone's color is the one on their profile, the same on every phone and browser. Yours changes
            // on the server as soon as you pick it (until the server has it, this device keeps your pick).
            colorPending() {
                let p = null;
                try { p = JSON.parse(safeGet('dialed_color_pending') || 'null'); } catch (e) { p = null; }
                return p && p.who && this.user && String(p.who).toLowerCase() === String(this.user).toLowerCase() ? this.normalizeHexColor(p.color) : '';
            },
            setColorPending(color) { safeSet('dialed_color_pending', color ? JSON.stringify({ who: this.user, color }) : ''); },

            // colors the server sent (People, profiles, the people list): theirs wins over anything this device guessed
            adoptColors(list) {
                if (!Array.isArray(list)) return false;
                let changed = false;
                list.forEach(p => {
                    const name = String((p && p.name) || '').trim(), color = this.normalizeHexColor((p && p.color) || '');
                    if (!name || !color) return;
                    if (name === this.user) {
                        const pend = this.colorPending();
                        if (pend) { if (pend === color) this.setColorPending(''); return; }
                    }
                    if (this.normalizeHexColor(this.userColors[name]) !== color) { this.userColors[name] = color; changed = true; }
                });
                if (changed) safeSet('dialed_user_colors', JSON.stringify(this.userColors));
                return changed;
            },
            adoptPeopleColors(data, me) {
                const d = data || {};
                return this.adoptColors([...(d.following || []), ...(d.followers || []), ...(me && me.name ? [me] : [])]);
            },

            // ---- v15.0: your friends (you follow each other), for Friends' palates and the awards on your profile
            friendNames() {
                const others = () => this.knownPeople().filter(n => n && n !== this.user);
                if (!(this.acctOn && this.acctOn())) return others();
                const d = this.ppState().data;
                if (!d) return others();
                return [...new Set((d.following || []).filter(f => f && f.status === 'accepted' && f.friend).map(f => String(f.name || '')).filter(n => n && n !== this.user))];
            },
            // the awards on your profile are between you and your friends, every month (a community's own awards stay on
            // its Community tab)
            friendsCrew() {
                if (!(this.acctOn && this.acctOn()) || !this.ppState().data) return null;
                const names = this.friendNames();
                if (!names.length) return null;
                return { id: 'friends', name: 'Friends', open: false, since: '', members: [this.user, ...names].map(name => ({ name })) };
            },

            // someone's tag beside their name on their profile: Friends, or Follows you
            profileRelTagHtml(name) {
                if (!this.acctOn() || !name || name === this.user || !this.ppState().data) return '';
                const rel = this.relationTo(name);
                return rel.friend ? '<span class="you-tag pp-friend">Friends</span>' : rel.followsYou ? '<span class="pp-note">Follows you</span>' : '';
            },

            // ---- v15.0: while you're typing (the keyboard is up) the page knows it (html.typing): the bottom bar steps
            // aside instead of riding up on the keyboard, and on the home-screen app a tap on Post or Save goes straight
            // to the button (through the tick layer it didn't go through on iPhone)
            bindTyping() {
                if (this._typingBound || typeof document === 'undefined' || !document.addEventListener) return;
                this._typingBound = true;
                const typing = el => typeof Element !== 'undefined' && el instanceof Element && (el.tagName === 'TEXTAREA' || el.isContentEditable
                    || (el.tagName === 'INPUT' && !/^(checkbox|radio|range|color|button|submit|reset|file|hidden|image|date|time|datetime-local|month|week)$/i.test(el.type || '')));
                let off = 0;
                document.addEventListener('focusin', e => { if (!typing(e.target)) return; clearTimeout(off); document.documentElement.classList.add('typing'); }, true);
                document.addEventListener('focusout', e => {
                    if (!typing(e.target)) return;
                    clearTimeout(off);
                    off = setTimeout(() => { if (!typing(document.activeElement)) document.documentElement.classList.remove('typing'); }, 500);
                }, true);
            },

            // ---- v15.0: share a session, a coffee, a roaster, a profile or a community as a link that opens that exact
            // thing (for anyone signed in who can see it; a session or coffee they can't see opens its owner's profile)
            shareBase() {
                const web = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
                return web ? location.origin + location.pathname : 'https://maceopmh-droid.github.io/Dialed-In-/';
            },
            shareUrl(params) {
                const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && String(v) !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
                return `${this.shareBase()}?${q}`;
            },
            // what it is goes in the message itself, with the link under it (Messages showed only the link when they were
            // sent apart, and every link's preview reads the same)
            async shareLink(url, text, title = 'Dialed In') {
                const msg = `${text}\n${url}`;
                try { if (navigator.share) { await navigator.share({ title, text: msg }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
                try { await navigator.clipboard.writeText(msg); this.showToast('Link copied.'); return 'copied'; } catch (e) { /* no clipboard */ }
                prompt('Copy this link:', msg);
                return 'shown';
            },
            // "4.5★ · 18 g → 40 g (1:2.2) in 28 s" for a session
            shareSessionLine(b) {
                const r = this.normalizeRating(b.rating), dose = Number(b.dose) || 0, out = Number(b.yield) || 0, time = Number(b.time) || 0;
                const recipe = dose && out ? `${this.fmtNum(dose, 1)} g → ${this.fmtNum(out, 1)} g (1:${this.fmtNum(out / dose, 1)})${time ? ` in ${b.method === 'Espresso' ? `${Math.round(time)} s` : this.clock(time)}` : ''}` : '';
                return [r > 0 ? `${this.formatRating(r)}★` : '', recipe].filter(Boolean).join(' · ');
            },
            shareItem(kind, ref, event) {
                if (event && event.stopPropagation) event.stopPropagation();
                const id = String(ref || '');
                if (kind === 'session') {
                    const b = this.brews.get(id); if (!b) return;
                    const owner = this.getBrewOwner(b), bean = this.beans.get(String(b.beanId || ''));
                    const coffee = bean && bean.name ? `${bean.name}${bean.roaster ? ` (${bean.roaster})` : ''}` : 'a coffee';
                    const line = this.shareSessionLine(b);
                    return this.shareLink(this.shareUrl({ s: id, by: owner }), `${owner === this.user ? 'My' : `${owner}'s`} ${String(b.method || 'session').toLowerCase()} of ${coffee}${line ? `: ${line}` : ''}. On Dialed In:`);
                }
                if (kind === 'coffee') {
                    const bean = this.beans.get(id); if (!bean) return;
                    const owner = String(bean.user || bean.owner || '');
                    const bits = [bean.origin, bean.process, bean.roast ? `${bean.roast} roast` : ''].map(x => String(x || '').trim()).filter(Boolean).join(', ');
                    return this.shareLink(this.shareUrl({ c: id, by: owner }), `${bean.name || 'A coffee'}${bean.roaster ? ` from ${bean.roaster}` : ''}${bits ? ` (${bits})` : ''}. On Dialed In:`);
                }
                if (kind === 'roaster') {
                    const r = this.roasterFind ? this.roasterFind(this.roasterKey(id)) : null, n = r && r.coffees ? r.coffees.length : 0;
                    return this.shareLink(this.shareUrl({ r: id }), `${id}, the roaster${n ? `: ${n} coffee${n === 1 ? '' : 's'} logged` : ''}. On Dialed In:`);
                }
                if (kind === 'profile') return this.shareLink(this.shareUrl({ u: id }), id === this.user ? `Follow me on Dialed In (${id}):` : `${id}'s coffee log on Dialed In:`);
            },
            shareCurrentCoffee() { return this.shareItem('coffee', this.activeId); },
            // a community: its invite link (the same one People has)
            shareCommunity(gid, event) {
                if (event && event.stopPropagation) event.stopPropagation();
                const g = (this.grState().list || []).find(x => String(x.id) === String(gid));
                if (!g || !g.invite) { this.showToast('Only its members can invite people.'); return; }
                return this.shareInvite(g.invite, g.name);
            },

            // a shared link (?s= session or ?c= coffee, with by= its owner; ?r= roaster): remembered until you're signed in and loaded, then opened
            noteShareLink() {
                try {
                    const q = new URLSearchParams(location.search), s = q.get('s'), c = q.get('c'), r = q.get('r');
                    if (!s && !c && !r) return;
                    safeSet('dialed_pending_share', JSON.stringify({ s: s || '', c: c || '', r: r || '', u: q.get('by') || '' }));
                    const u = new URL(location.href); ['s', 'c', 'r', 'by'].forEach(k => u.searchParams.delete(k));
                    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
                } catch (e) {}
            },
            checkPendingShare() {
                if (!this.acctOn() || !Supa.ready() || !this.user) return;
                let p = null;
                try { p = JSON.parse(safeGet('dialed_pending_share') || 'null'); } catch (e) { p = null; }
                if (!p) return;
                safeSet('dialed_pending_share', '');
                if (p.s) {
                    const b = this.brews.get(String(p.s));
                    if (b && this.beans.has(String(b.beanId || ''))) { this.setTab('feed'); this.openFeedTarget(b.beanId, String(p.s), false); return; }
                    if (p.u && p.u !== this.user) this.openAnyProfile(p.u); else this.showToast('That session isn\'t shared with you.');
                    return;
                }
                if (p.c) {
                    if (this.beans.has(String(p.c))) { this.openFeedTarget(String(p.c)); return; }
                    if (p.u && p.u !== this.user) this.openAnyProfile(p.u); else this.showToast('That coffee isn\'t shared with you.');
                    return;
                }
                if (p.r) {
                    const k = this.roasterKey(p.r);
                    if (this.roasterFind && this.roasterFind(k)) this.openRoaster(k);
                    else this.showToast(`${p.r} isn't on Dialed In yet.`);
                }
            },

