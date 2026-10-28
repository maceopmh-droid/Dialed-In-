            // ---- bean page extras ----
            // ---- v12.2: a flavor note as a chip in its wheel family's color (shaded, no dot)
            famChip(name) {
                const at = this.noteLocate(name);
                const hex = at && at.f >= 0 ? at.color : '#7D8984';   // (v17.0: a tea note in its tea family's color)
                const s = String(this.normalizeHexColor(hex) || '#7D8984').slice(1);
                const rgb = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)).join(', ');
                return `<span class="fam-chip" style="${this.famVars(hex)}">${this.esc(name)}</span>`;
            },

            // the star widget stays beside the name unless that would split a word or squeeze the name past two lines;
            // then it sits just under the name instead
            fitBeanHeader() {
                const row = document.querySelector('.dh-name-row'), name = document.getElementById('d-name');
                if (!row || !name || !row.classList || typeof name.getBoundingClientRect !== 'function' || typeof getComputedStyle !== 'function') return;
                row.classList.remove('dh-wrap');
                // a word that won't fit beside the widget would be split mid-word: drop the widget instead
                name.style.overflowWrap = 'normal';
                const split = name.scrollWidth > name.clientWidth + 1;
                name.style.overflowWrap = '';
                const lh = parseFloat(getComputedStyle(name).lineHeight) || 32;
                if (split || name.getBoundingClientRect().height > lh * 2.4) row.classList.add('dh-wrap');
            },

            famVars(hex) {
                const s = String(this.normalizeHexColor(hex) || '#7D8984').slice(1);
                const rgb = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)).join(', ');
                return `--fc-rgb:${rgb};--fc-ink:${this.hexMix(hex, '#1d2420', 0.38)};--fc-ink-d:${this.hexMix(hex, '#ffffff', 0.5)}`;
            },

            // the star widget on the coffee page: stars, average, rated-session count, faces of everyone who brewed it
            beanStarsHtml(brews, avg, rated) {
                const tally = new Map();
                (brews || []).forEach(b => { const o = this.getBrewOwner(b); if (o) tally.set(o, (tally.get(o) || 0) + 1); });
                const people = [...tally.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).map(e => e[0]);
                if (!(avg > 0) && !people.length) return '';
                const shown = people.slice(0, 4);
                const faces = shown.map((p, i) => `<i data-face="${this.esc(p)}" style="background:${this.esc(this.getUserColor(p))};z-index:${9 - i}" title="${this.esc(p)}">${this.esc(this.feedInitial(p))}</i>`).join('')
                    + (people.length > shown.length ? `<i class="more" style="z-index:1">+${people.length - shown.length}</i>` : '');
                const stars = avg > 0 ? `<span class="star-meter" style="--fill:${this.starFill(avg)}%;--whole:${this.starWhole(avg)};--frac:${this.starFrac(avg)}"></span><b class="dh-avg">${this.esc(this.formatRating(avg).replace('/5', ''))}</b><span class="dh-n" title="${rated} rated session${rated === 1 ? '' : 's'}">${rated}</span>` : '';
                return `${stars}${people.length ? `<span class="dh-faces" aria-label="Brewed by ${this.esc(people.join(', '))}">${faces}</span>` : ''}`;
            },

            // ---- v12.4: a session on the coffee page: the same card as the feed (plus edit / delete on your own)
            renderLogCard(log) {
                if (this.newLook && this.newLook()) return this.nlLogRow(log);   // v17.2
                const owner = this.getBrewOwner(log);
                const color = this.getUserColor(owner, log.actorColor || '');
                const rating = this.normalizeRating(log.rating);
                const flavors = this.extractFlavors(log).slice(0, 4);
                const gear = [...this.resolveEquipmentNames(log), ...this.sessionExtras(log), ...(this.roastDayLabel ? this.roastDayLabel(log) : [])];   // v15.1: day N off roast
                const likes = this.normalizeLikeList(log.likes, owner);
                const unlocks = this.achievementUnlockByBrew.get(String(log.id)) || [];
                const notes = this.getBrewNotes(log);
                const bean = this.beans.get(String(log.beanId || ''));
                const tea = this.isTeaBrew(log);   // v17.0
                const coffeeName = (bean ? String(bean.name || '').trim() : '') || (tea ? 'Tea' : 'Coffee');
                const roasterName = bean ? String(bean.roaster || '').trim() : '';
                const id = this.esc(log.id);
                const lead = `<button class="social-btn like-btn ${likes.includes(this.user) ? 'liked' : ''}${this.likePopClass('brew', log.id)}"${this.likePopStyle('brew', log.id)} onclick="app.toggleLike('${app.escJs(id)}', event)" title="Like session"><svg class="heart-icon"><use href="#i-heart"/></svg></button>${likes.length ? `<div class="social-like-line">${this.esc(this.formatLikers(likes))}</div>` : ''}${owner === this.user ? `<span class="social-owner-actions"><button class="btn-clean" onclick="app.editBrew('${app.escJs(id)}')" title="Edit session"><svg class="icon" style="width:14px;height:14px;"><use href="#i-edit-2"/></svg></button><button class="btn-clean danger" onclick="app.delete('brew','${app.escJs(id)}')" title="Delete session"><svg class="icon" style="width:14px;height:14px;"><use href="#i-trash-2"/></svg></button></span>` : this.acctOn() ? `<span class="social-owner-actions"><button class="btn-clean" onclick="app.reportItem('session','${app.escJs(id)}', event)" title="Report session" aria-label="Report session"><svg class="icon" style="width:14px;height:14px;"><use href="#i-flag"/></svg></button></span>` : ''}`;
                return `
                        <div class="feed-card-body">
                            <div class="feed-head">
                                <div class="feed-avatar" style="background:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(this.feedInitial(owner))}</div>
                                <div class="feed-meta">
                                    <div class="feed-actor" style="color:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(owner)}${this.levelDotHtml ? this.levelDotHtml(owner) : ''}</div>
                                    <div class="feed-time">${this.esc(this.formatRelativeDate(log.date))}</div>
                                </div>
                                <div class="feed-type sc-method"><svg class="method-icon"><use href="${this.methodIconUse(log.method)}"/></svg>${this.esc(this.methodLabel(log.method || (tea ? 'Western' : 'Espresso')))}</div><button type="button" class="feed-share" onclick="app.shareItem('session', '${app.escJs(id)}', event)" aria-label="Share" title="Share"><svg class="icon"><use href="#i-share-2"/></svg></button>
                            </div>
                            <div class="sc-title">
                                <div class="sc-name"><div class="feed-card-title">${this.esc(coffeeName)}</div>${roasterName ? `<div class="sc-roaster"><span class="ro-link" role="link" tabindex="0" data-roaster="${this.esc(roasterName)}"${tea ? ' data-kind="tea"' : ''} onclick="app.openRoasterFrom(this, event)">${this.esc(roasterName)}</span></div>` : (bean && this.teaMakerName(bean) ? `<div class="sc-roaster">${this.esc(this.teaMakerName(bean))}</div>` : '')}</div>
                                ${rating > 0 ? `<div class="sc-rate"><span class="star-meter" style="--fill:${this.starFill(rating)}%;--whole:${this.starWhole(rating)};--frac:${this.starFrac(rating)}"></span><b>${this.esc(this.formatRating(rating))}</b></div>` : ''}
                            </div>
                            ${this.recipeStripHtml(log)}
                            ${this.renderCardTabs(log)}
                            <div class="card-pane${this.cardTab(log) === 'session' ? ' active' : ''}" data-pane="session">
                            ${flavors.length ? `<div class="sc-notes">${flavors.map(f => this.famChip(f)).join('')}</div>` : ''}
                            ${gear.length ? `<div class="sc-gear">${gear.map(g => this.esc(g)).join('<i></i>')}</div>` : ''}
                            ${this.renderSessionPhoto(log, 'feed')}
                            ${notes ? `<div class="feed-note">${this.esc(notes)}</div>` : ''}
                            ${unlocks.map(unlock => `<div class="achievement-inline">${this.esc(this.formatAchievementLine(unlock, unlock.user === this.user))}</div>`).join('')}
                            </div>
                            ${this.lazyPanes(log)}
                            ${this.renderThread('brew', log, { inputId: `comment-input-${log.id}`, anchorId: `comments-${log.id}`, lead })}
                        </div>
                    `;
            },

            // the master form's labels follow its method, like the log form's
            masterLabels(method) {
                const p = METHOD_PROFILES[method] || METHOD_PROFILES.Espresso;
                const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
                set('master-lbl-dose', p.dose); set('master-lbl-yield', p.yld); set('master-lbl-time', p.time);
            },

            // "r, g, b" for a #hex color (so tints work without color-mix)
            hexRgb(hex) {
                const s = String(this.normalizeHexColor(hex) || '#8A958C').slice(1);
                return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)).join(', ');
            },

            renderDetailExtras(group, brews) {
                const meta = group.meta || {};
                const roastLine = document.getElementById('d-roast-date');
                if (roastLine) {   // v15.1: your bag (others' bags are on their sessions: day N off roast)
                    const rd = this.bagRoastDate(this.beanGroupKey(meta)), t = this.parseLocalDate(rd);
                    const days = t ? Math.round((this.parseLocalDate(this.dayKey(Date.now())) - t) / 864e5) : -1;
                    roastLine.innerText = t ? `Your bag: roasted ${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${days >= 0 ? ` · ${days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`}` : ''}` : '';
                    roastLine.style.display = t ? 'block' : 'none';
                }
                const btn = document.getElementById('d-want-btn');
                const line = document.getElementById('d-want-line');
                const beans = group.ids.map(id => this.beans.get(id)).filter(Boolean);
                const wanters = [...new Set(beans.flatMap(b => (Array.isArray(b.wantToTry) ? b.wantToTry : [])))];
                const mineAlready = beans.some(b => b.user === this.user) || (brews || []).some(b => this.getBrewOwner(b) === this.user);
                const on = wanters.includes(this.user);
                if (btn) {
                    btn.style.display = (this.user && (!mineAlready || on)) ? 'inline-flex' : 'none';
                    btn.classList.toggle('active', on);
                    if (btn.setAttribute) btn.setAttribute('aria-pressed', String(on));
                    const label = btn.querySelector ? btn.querySelector('span') : null;
                    if (label && label.tagName) label.textContent = on ? 'On your list' : 'Want to try';
                    else btn.innerText = on ? 'On Your List' : 'Want to Try';
                }
                if (line) line.innerText = '';
                if (this.coffeeCommOnOpen) this.coffeeCommOnOpen(group);   // v14.6: the Everyone tab
            },

            toggleWantToTry() {
                if (!this.activeGroup || !this.user) return;
                const beans = this.activeGroup.ids.map(id => this.beans.get(id)).filter(Boolean);
                const holder = beans.find(b => Array.isArray(b.wantToTry) && b.wantToTry.includes(this.user))
                    || beans.find(b => b.user !== this.user)
                    || beans[0];
                if (!holder) return;
                if (String(holder.user || holder.owner || '') === this.user) {
                    this.showToast('You\'ve already added this coffee.');
                    return;
                }
                const list = Array.isArray(holder.wantToTry) ? holder.wantToTry : [];
                const on = list.includes(this.user);
                const next = on ? list.filter(n => n !== this.user) : [...list, this.user];
                const payload = this.buildBeanPayload(holder, { wantToTry: next });
                if (!payload) return;
                this.push(payload);
                this.showToast(on ? 'Removed from your want-to-try list.' : 'Added to your want-to-try list.');
            },

            renderSidePanel() {
                const box = document.getElementById('d-side-pane');
                if (!box) return;
                const byOwner = new Map();
                this.detailBrews.forEach(b => {
                    const owner = this.getBrewOwner(b);
                    if (!byOwner.has(owner)) byOwner.set(owner, []);
                    byOwner.get(owner).push(b);
                });
                if (byOwner.size < 2) {
                    const only = [...byOwner.keys()][0];
                    box.innerHTML = `<div class="panel-empty">${only ? `Only ${this.esc(only)} has brewed this bean so far.` : 'No sessions yet.'} Side by side appears once a second person logs it.</div>`;
                    return;
                }
                const owners = [...byOwner.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
                box.innerHTML = `<div class="side-note">Ratio, time and taste compare across grinders, so grind settings are left out on purpose.</div><div class="side-grid">${owners.map(([owner, list]) => this.renderSideCard(owner, list)).join('')}</div>`;
            },

            renderSideCard(owner, list) {
                const color = this.getUserColor(owner);
                const latestFirst = [...list].sort((a, b) => (this.isEarlier(a, b) ? 1 : -1));
                const master = latestFirst.find(b => this.isMasterBrew(b));
                const rated = latestFirst.filter(b => this.normalizeRating(b.rating) > 0);
                const best = rated.slice().sort((a, b) => this.normalizeRating(b.rating) - this.normalizeRating(a.rating))[0];
                const pick = master ? this.getMasterProfile(master) : (best || latestFirst[0]);
                const pickLabel = master ? 'Master recipe' : `${best ? 'Best-rated' : 'Latest'} ${this.shotWord(pick && pick.method)}`;
                const methods = [...new Set(list.map(b => b.method).filter(Boolean))];
                const avg = key => list.reduce((s, b) => s + (b[key] === undefined || b[key] === '' ? 5 : this.num(b[key])), 0) / list.length;
                // v17.5: in the New look each bar wears its taste's color (sweetness red, acidity yellow…), all six tastes, in tea words for a tea
                const nl = !!(this.newLook && this.newLook()), kind = nl && list[0] && this.kindOfBrew ? this.kindOfBrew(list[0]) : 'coffee';
                const rows = nl ? ['acidity', 'sweetness', 'body', 'finish', 'bitterness', 'balance'].map(k => [this.tasteLabel ? this.tasteLabel(k, kind) : k, k]) : [['Acidity', 'acidity'], ['Sweetness', 'sweetness'], ['Body', 'body'], ['Finish', 'finish'], ['Complexity', 'balance']];
                const bars = rows.map(([label, key]) => {
                    const v = avg(key), fill = nl && typeof FlavorShape !== 'undefined' && FlavorShape.COLORS && FlavorShape.COLORS[key] ? FlavorShape.COLORS[key] : color;
                    return `<div class="taste-bar"><span>${label}</span><div class="taste-track"><div class="taste-fill" style="width:${Math.max(0, Math.min(100, v * 10))}%; background:${this.esc(fill)};"></div></div><span>${this.esc(this.fmtNum(v))}</span></div>`;
                }).join('');
                const flavors = this.getTopFlavors(list, 3);
                const avgRating = this.calculateAverageRating(list);
                return `<div class="side-card"><div class="side-name" style="color:${this.esc(color)};" data-profile="${this.esc(owner)}">${this.esc(owner)}</div><div class="side-stat">${list.length} session${list.length === 1 ? '' : 's'} · ${this.esc(methods.join(', ') || '-')}${avgRating > 0 ? ` · avg ${this.esc(this.formatRating(avgRating))}★` : ''}</div><div class="side-label">${pickLabel}${pick && pick.method ? ` · ${this.esc(pick.method)}` : ''}</div><div class="side-recipe">${this.esc(this.recipeLine(pick, false) || '-')}</div><div class="taste-bars">${bars}</div>${flavors.length ? `<div class="side-flavors">${flavors.map(f => this.famChip(f)).join('')}</div>` : ''}</div>`;
            },

            dialinSeries() {
                const groups = new Map();
                this.detailBrews.forEach(b => {
                    if (this.learnPotatoBrew && this.learnPotatoBrew(b)) return;   // v19.0: a potato-defect cup isn't part of dialing in
                    const key = `${this.getBrewOwner(b)}\u0001${b.method || ''}`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(b);
                });
                return [...groups.entries()].map(([key, list]) => {
                    const [owner, method] = key.split('\u0001');
                    const shots = list.sort((a, b) => (this.isEarlier(a, b) ? -1 : 1));
                    const ratings = shots.map(b => this.normalizeRating(b.rating) || null);
                    let dialedAt = shots.findIndex(b => this.isMasterBrew(b));
                    let how = 'pinned as Master';
                    if (dialedAt < 0) {
                        dialedAt = shots.findIndex(b => this.normalizeRating(b.rating) >= 4.5);
                        how = 'first 4.5★ session';
                    }
                    return { owner, method, shots, ratings, dialedAt, how };
                }).sort((a, b) => a.owner.localeCompare(b.owner) || a.method.localeCompare(b.method));
            },

            renderDialinChart() {
                const pane = document.getElementById('d-dialin-pane');
                if (!pane) return;
                const all = this.dialinSeries();
                const head = '<div class="sw-head"><h3>Dial-in</h3><p>Each person\'s ratings, session by session. The star marks where they dialed it in.</p></div>';
                if (!all.length) { pane.innerHTML = `<div class="sweet-card">${head}<div class="panel-empty">No sessions on this coffee yet.</div></div>`; return; }
                const shotsOf = m => all.filter(s => s.method === m).reduce((n, s) => n + s.shots.length, 0);
                const methods = [...new Set(all.map(s => s.method).filter(Boolean))].sort((a, b) => shotsOf(b) - shotsOf(a));
                if (!methods.includes(this.dialinMethod)) this.dialinMethod = methods[0] || '';
                const series = all.filter(s => !this.dialinMethod || s.method === this.dialinMethod);
                const used = new Set();
                series.forEach(s => { let c = this.getUserColor(s.owner); if (used.has(String(c).toLowerCase())) c = (this.beanPalette || []).find(p => !used.has(String(p).toLowerCase())) || c; used.add(String(c).toLowerCase()); s.color = c; });
                const methodRow = methods.length > 1 ? `<div class="sw-chips">${methods.map(m => `<button type="button" class="chip-btn" aria-pressed="${m === this.dialinMethod}" onclick="app.setDialinMethod('${app.escJs(m)}')">${this.esc(m)}</button>`).join('')}</div>` : '';
                const anyRated = series.some(s => s.ratings.some(Boolean));
                const rows = series.map(s => {
                    const rated = s.ratings.filter(Boolean);
                    const n = s.shots.length;
                    const status = s.dialedAt >= 0
                        ? `Dialed in on session ${s.dialedAt + 1} · ${s.how === 'pinned as Master' ? 'Master' : 'first 4.5★+'}`
                        : (rated.length ? `Best so far ${this.fmtNum(Math.max(...rated))}★` : 'No ratings yet');
                    return `<div class="di-row"><i style="background:${this.esc(s.color)}"></i><b>${this.esc(s.owner)}</b><span>${this.esc(status)}</span><em>${n} session${n === 1 ? '' : 's'}</em></div>`;
                }).join('');
                if (!anyRated) { pane.innerHTML = `<div class="sweet-card">${head}${methodRow}<div class="panel-empty">Rate shots on this coffee and each person's curve draws here.</div><div class="di-rows">${rows}</div></div>`; return; }
                const W = 340, H = 200, L = 30, R = 14, T = 14, B = 28;
                const maxN = Math.max(2, ...series.map(s => s.shots.length));
                const X = i => L + (maxN === 1 ? 0 : (i / (maxN - 1)) * (W - L - R));
                const Y = r => H - B - ((r - 1) / 4) * (H - T - B);
                let grid = '';
                [1, 2, 3, 4, 5].forEach(r => { grid += `<line class="sw-grid" x1="${L}" x2="${W - R}" y1="${Y(r)}" y2="${Y(r)}"/><text class="sw-tick" x="${L - 7}" y="${Y(r) + 3}" text-anchor="end">${r}★</text>`; });
                const step = maxN > 12 ? Math.ceil(maxN / 6) : (maxN > 6 ? 2 : 1);
                for (let i = 0; i < maxN; i += step) grid += `<text class="sw-tick" x="${X(i)}" y="${H - B + 15}" text-anchor="middle">${i + 1}</text>`;
                const star = (cx, cy, r, color) => { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; d += `${k ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`; } return `<path class="di-star" d="${d}Z" fill="${this.esc(color)}"/>`; };
                const lines = series.map(s => {
                    const pts = s.ratings.map((r, i) => (r ? [X(i), Y(r)] : null)).filter(Boolean);
                    if (!pts.length) return '';
                    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
                    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
                    const dots = s.ratings.map((r, i) => r && i !== s.dialedAt ? `<circle class="di-dot" cx="${X(i).toFixed(1)}" cy="${Y(r).toFixed(1)}" r="3.6" fill="${this.esc(s.color)}"><title>${this.esc(s.owner)} · session ${i + 1} · ${this.fmtNum(r)}★</title></circle>` : '').join('');
                    const mark = s.dialedAt >= 0 && s.ratings[s.dialedAt] ? star(X(s.dialedAt), Y(s.ratings[s.dialedAt]), 8.5, s.color) : '';
                    return `<path class="di-line" d="${d}" stroke="${this.esc(s.color)}"/>${dots}${mark}`;
                }).join('');
                pane.innerHTML = `
                    <div class="sweet-card">
                        ${this.storyShareBtn ? head.replace('<h3>Dial-in</h3>', `<h3>Dial-in</h3>${this.storyShareBtn('app.openDialinStory()', 'Share the dial-in curves as a picture')}`) : head}${methodRow}
                        <div class="sw-chart"><svg class="sweet-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dial-in curves">${grid}<text class="sw-axis" x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle">Session number</text>${lines}</svg></div>
                        <div class="di-rows">${rows}</div>
                    </div>`;
            },

            setDialinMethod(m) { this.dialinMethod = m; this.renderDialinChart(); },

