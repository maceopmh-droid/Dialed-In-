            // ---- profiles ----
            setProfileUser(name) {
                this.profileUser = name;
                this.render();
            },

            shiftCalendarYear(delta) {
                const now = new Date(Date.now()).getFullYear();
                this.calendarYear = Math.min(now, (this.calendarYear || now) + delta);
                this.render();
            },

            setRecapPeriod(value) {
                this.recapPeriod = value;
                this.render();
            },

            renderProfile(grid) {
                grid.className = 'profile-view';
                const people = this.profileRowPeople();   // v14.4: you and the people you follow (each person's own row)
                const opened = this.acctOn() && this.profState && this.profState().name === this.profileUser;   // v14.5: someone outside your circle, opened by tapping their name
                if (!this.profileUser || !(people.includes(this.profileUser) || this.hasLoggedData(this.profileUser) || opened)) this.profileUser = this.user || people[0] || '';
                const who = this.profileUser;
                if (!who) {
                    grid.innerHTML = '<div class="panel-empty">Pick a user in Settings to see profiles.</div>';
                    return;
                }
                if (this.acctOn() && !people.includes(who)) people.splice(1, 0, who);   // someone opened from People or a card: their chip shows while you look
                const chips = people.map(name => {
                    const color = this.getUserColor(name);
                    return `<button type="button" class="person-chip${name === who ? ' active' : ''}" data-name="${this.esc(name)}" onclick="app.setProfileUser(this.getAttribute('data-name'))"><span class="person-dot" style="background:${this.esc(color)};">${this.esc(this.feedInitial(name))}</span>${this.acctOn() && name === this.user ? 'You' : `${this.esc(name)}${name === this.user ? ' <span class="you-tag">You</span>' : ''}`}</button>`;
                }).join('');
                // v14.4: People (new backend): find, follow, requests. Follow requests waiting are counted inside the button
                const asks = this.acctOn() ? this.peopleRequests().length : 0;
                const peopleChip = this.acctOn() ? `<button type="button" class="person-chip pp-chip" onclick="app.openPeople()"><svg class="icon"><use href="#i-users"/></svg>People${asks ? `<span class="pp-count">${asks}</span>` : ''}</button>` : '';
                if (this.acctOn() && !this._peopleLoading && Date.now() - this.ppState().at > 60000) {
                    this._peopleLoading = true;
                    this.loadPeople().then(() => { this._peopleLoading = false; if (this.tab === 'profile') this.render(); }).catch(() => { this._peopleLoading = false; this.ppState().at = Date.now(); });
                }
                const section = ['sessions', 'overview', 'taste', 'activity'].includes(this.profileSection) ? this.profileSection : 'sessions';   // v14.5: Sessions first
                const freshRecap = who === this.user ? this.freshRecap() : null;
                const tabs = `<div class="seg-control profile-tabs" role="tablist" aria-label="Profile sections">${[['sessions', 'Sessions'], ['overview', 'Overview'], ['taste', 'Taste'], ['activity', 'Activity']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === section}" aria-pressed="${k === section}" onclick="app.setProfileSection('${app.escJs(k)}')">${l}${k === 'activity' && freshRecap && section !== 'activity' ? '<span class="nav-dot"></span>' : ''}</button>`).join('')}</div>`;
                const cards = section === 'sessions' ? [this.profileSessionsHtml(who)]
                    : section === 'taste'
                    ? [this.renderPalateCard(who), who === this.user ? this.renderFriendPalates() : '', this.renderMatchesCard(who), this.renderWantCard(who)]
                    : section === 'activity'
                        ? [this.renderCrewAwardsCard(), this.renderCalendarCard(who), this.renderRecapCard(who)]
                        : [this.renderFabFour(who), this.profileCoffeesHtml(who), this.renderAchievementsCard(who), who !== this.user ? this.renderGearCard(who) : ''];
                const body = cards.filter(Boolean).join('') || '<div class="panel-empty">Nothing here yet. Log a few sessions and this fills in.</div>';
                grid.innerHTML = [
                    `<div class="people-switch${this.acctOn() ? ' one-row' : ''}">${chips}${peopleChip}</div>`,
                    this.renderProfileHero(who),
                    this.profileNoteHtml ? this.profileNoteHtml(who) : '',
                    tabs,
                    `<div class="profile-section" data-section="${section}">${body}</div>`
                ].join('');
                // v13.1: the equipment locker lives on your own profile (Overview), not in Settings
                this.placeGearLocker(who === this.user && section === 'overview' ? grid.querySelector('.profile-section') : null);
                this.fitRoasterTileNames(grid);
                this.fitPeopleRow(grid);
            },

            setProfileSection(section) {
                this.profileSection = section;
                this.render();
                const tabs = document.querySelector('.profile-tabs');
                if (tabs && tabs.getBoundingClientRect && tabs.getBoundingClientRect().top < 0 && tabs.scrollIntoView) tabs.scrollIntoView({ block: 'start' });
            },

            rhythmFor(user) {
                const brews = this.brewsOf(user).filter(b => this.toTime(b.date) > 0);
                const days = new Set(brews.map(b => this.dayNum(this.toTime(b.date))));
                const now = Date.now();
                const today = this.dayNum(now);
                const thisWeekStart = today - ((new Date(now).getDay() + 6) % 7);
                const weeks = [];
                for (let w = 7; w >= 0; w--) {
                    const start = thisWeekStart - w * 7;
                    let on = false;
                    for (let d = start; d < start + 7; d++) {
                        if (days.has(d)) {
                            on = true;
                            break;
                        }
                    }
                    weeks.push(on);
                }
                let streak = 0;
                let cursor = days.has(today) ? today : today - 1;
                while (days.has(cursor)) {
                    streak++;
                    cursor--;
                }
                const lastT = brews.reduce((m, b) => Math.max(m, this.toTime(b.date)), 0);
                return { weeks, active: weeks.filter(Boolean).length, streak, lastT };
            },

            // ---- v12.6: the streak badge, hotter every day (gold -> amber -> ember red, tops out at 30 days)
            streakChipHtml(n) {
                n = Math.floor(Number(n) || 0);
                if (n < 2) return '';
                const heat = Math.pow(Math.min(1, (n - 2) / 28), 0.8);
                const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ');
                const top = [[247, 208, 118], [250, 168, 72], [244, 112, 58]], bot = [[224, 160, 60], [228, 108, 40], [190, 48, 32]];
                const seg = heat < 0.5 ? 0 : 1, t = heat < 0.5 ? heat / 0.5 : (heat - 0.5) / 0.5;
                const glow = mix([232, 176, 72], [242, 92, 42], heat);
                const light = heat < 0.62;
                const vars = [
                    `--s1:rgb(${mix(top[seg], top[seg + 1], t)})`, `--s2:rgb(${mix(bot[seg], bot[seg + 1], t)})`,
                    `--sg:rgba(${glow}, ${(0.34 + 0.5 * heat).toFixed(2)})`, `--sg2:rgba(${glow}, ${(0.4 * heat * heat).toFixed(2)})`, `--sr:${Math.round(6 + 30 * heat)}px`,
                    `--fs:${(12 + 6 * heat).toFixed(1)}px`, `--es:${(3 + 1.5 * heat).toFixed(1)}px`,
                    `--sp:${(3.4 - 1.7 * heat).toFixed(2)}s`, `--sf:${(1.3 - 0.75 * heat).toFixed(2)}s`,
                    `--sk:${light ? '#4A2906' : '#FFFFFF'}`, `--sts:${light ? 'none' : '0 1px 1px rgba(90, 20, 0, 0.35)'}`,
                    `--sfl:${light ? '#C8461A' : '#FFE29A'}`, `--sfc:${light ? '#F7B23B' : '#FFFFFF'}`, `--sfg:${light ? 'rgba(255, 190, 90, 0.7)' : 'rgba(255, 236, 160, 0.9)'}`,
                    `--sec:${light ? '#FFB347' : '#FFD27A'}`
                ].join(';');
                const embers = n >= 10 ? Math.min(8, 2 + Math.floor((n - 10) / 3)) : 0;
                const em = Array.from({ length: embers }, (_, i) => {
                    const x = 14 + ((i * 37) % 72), dx = ((i % 2 ? 1 : -1) * (3 + (i * 5) % 7)), dur = (2.6 - 0.9 * heat + (i % 3) * 0.35).toFixed(2), dl = ((i * 0.53) % 2).toFixed(2);
                    return `<i class="ember" style="--ex:${x}%;--edx:${dx}px;--ed:${dur}s;--edl:${dl}s"></i>`;
                }).join('');
                return `<span class="streak-chip heat${n >= 5 ? ' shine' : ''}${n >= 20 ? ' blaze' : ''}" style="${vars}" title="${n} days in a row">${n >= 3 ? `<svg class="flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 2.2c.5 3-1 4.8-2.5 6.4C8.5 10.3 7 12 7 14.9a5 5 0 0 0 10 0c0-2.1-.9-3.8-2-5.1.1 1.5-.5 2.8-1.5 3.3.4-3.8-.6-7.6-.9-10.9Z"/><path class="flame-core" d="M12 13.4c-1 1-1.7 1.9-1.7 3.1a1.7 1.7 0 0 0 3.4 0c0-1.1-.7-2-1.7-3.1Z"/></svg>` : ''}<span>${n}-day streak</span>${em}</span>`;
            },

            renderProfileHero(user) {
                const color = this.getUserColor(user);
                const brews = this.brewsOf(user);
                const r = this.rhythmFor(user);
                const beans = new Set(brews.map(b => this.groupKeyOfBrew(b))).size;
                const methods = new Set(brews.map(b => b.method).filter(Boolean)).size;
                const dots = r.weeks.map((on, i) => `<span class="week-dot${on ? ' on' : ''}" title="${i === 7 ? 'This week' : `${7 - i} week${7 - i === 1 ? '' : 's'} ago`}"></span>`).join('');
                const streak = this.streakChipHtml(r.streak);
                const last = r.lastT ? `Last brewed ${this.formatRelativeDate(r.lastT)}` : 'No sessions yet';
                return `<section class="profile-card profile-hero" style="--pc-rgb:${this.hexRgb(color)}"><div class="hero-row"><div class="hero-avatar" style="background:${this.esc(color)};">${this.esc(this.feedInitial(user))}</div><div><div class="hero-name">${this.esc(user)}${user === this.user ? '<span class="you-tag">You</span>' : ''}</div><div class="hero-sub">${this.esc(last)}</div>${this.acctOn() ? this.profileFollowHtml(user) : ''}</div></div><div class="rhythm"><div class="week-dots">${dots}</div><div class="rhythm-text">Brewed in ${r.active} of the last 8 weeks</div>${streak}</div><div class="stat-row"><div class="stat-box"><div class="stat-num">${brews.length}</div><div class="stat-cap">${brews.length === 1 ? 'Session' : 'Sessions'}</div></div><div class="stat-box"><div class="stat-num">${beans}</div><div class="stat-cap">${beans === 1 ? 'Bean' : 'Beans'}</div></div><div class="stat-box"><div class="stat-num">${methods}</div><div class="stat-cap">${methods === 1 ? 'Method' : 'Methods'}</div></div></div></section>`;
            },

            palateFor(user) {
                const brews = this.brewsOf(user);
                if (!brews.length) return null;
                const dims = { notes: new Map(), origins: new Map(), processes: new Map(), roasts: new Map(), methods: new Map(), varieties: new Map() };
                const bump = (map, label, w) => {
                    if (!label) return;
                    const k = label.toLowerCase();
                    const cur = map.get(k) || { label, w: 0, n: 0 };
                    cur.w += w;
                    cur.n += 1;
                    map.set(k, cur);
                };
                let rated = 0;
                let ratingSum = 0;
                brews.forEach(b => {
                    const r = this.normalizeRating(b.rating);
                    if (r > 0) {
                        rated++;
                        ratingSum += r;
                    }
                    const w = r > 0 ? Math.max(0.25, r - 2) : 1;
                    this.extractFlavors(b).forEach(f => bump(dims.notes, this.normalizeTag(f), w));
                    const bean = this.beans.get(String(b.beanId));
                    if (bean) {
                        this.originList(bean.origin).forEach(o => bump(dims.origins, o, w));
                        bump(dims.processes, this.normalizeTag(bean.process), w);
                        bump(dims.roasts, String(bean.roast || '').trim(), w);
                        bump(dims.varieties, this.normalizeTag(bean.variety), w);
                    }
                    bump(dims.methods, String(b.method || '').trim(), 1);
                });
                const top = (map, n) => [...map.values()].sort((a, b) => b.w - a.w || b.n - a.n || a.label.localeCompare(b.label)).slice(0, n);
                return {
                    user, dims, count: brews.length, rated, avgRating: rated ? ratingSum / rated : 0,
                    notes: top(dims.notes, 5), origins: top(dims.origins, 3), processes: top(dims.processes, 2),
                    roasts: top(dims.roasts, 2), methods: top(dims.methods, 2), varieties: top(dims.varieties, 2)
                };
            },

            palateSentence(p) {
                if (!p) return 'No sessions yet.';
                if (p.count < 3) return 'Still forming. A few more sessions will fill this in.';
                const lower = s => String(s).toLowerCase();
                const bits = [];
                const adj = [p.roasts[0] && `${lower(p.roasts[0].label)}-roast`, p.processes[0] && lower(p.processes[0].label)].filter(Boolean).join(', ');
                let first = `Leans toward ${adj ? `${adj} coffees` : 'coffees'}`;
                if (p.origins[0]) first += ` from ${p.origins[0].label}${p.origins[1] ? ` and ${p.origins[1].label}` : ''}`;
                bits.push(`${first}.`);
                const notes = p.notes.slice(0, 2).map(n => lower(n.label));
                if (notes.length) bits.push(`Favorite notes: ${notes.join(' and ')}.`);
                if (p.methods[0]) bits.push(`Brews mostly ${lower(p.methods[0].label)}.`);
                return bits.join(' ');
            },

            renderPalateCard(user) {
                const p = this.palateFor(user);
                const chips = (label, items) => (items.length ? `<div class="palate-group"><span class="palate-key">${label}</span>${items.map(i => label === 'Notes' ? this.famChip(i.label) : `<span class="flavor-mini">${this.esc(i.label)}</span>`).join('')}</div>` : '');
                const groups = p && p.count >= 3
                    ? [chips('Notes', p.notes), chips('Origins', p.origins), chips('Process', p.processes), chips('Roast', p.roasts), chips('Variety', p.varieties), chips('Methods', p.methods)].join('')
                    : '';
                const meta = p && p.rated ? `<div class="palate-meta">Weighted by ${p.rated} rated session${p.rated === 1 ? '' : 's'} · avg ${this.esc(this.formatRating(p.avgRating))}★</div>` : '';
                return `<section class="profile-card"><h4 class="section-label">${user === this.user ? 'Your palate' : `${this.esc(user)}'s palate`}</h4><div class="palate-summary">${this.esc(this.palateSentence(p))}</div>${groups ? `<div class="palate-groups">${groups}</div>` : ''}${meta}</section>`;
            },

            renderFriendPalates() {
                const others = this.knownPeople().filter(n => n !== this.user);
                if (!others.length) return '';
                const rows = others.map(name => {
                    const color = this.getUserColor(name);
                    return `<button type="button" class="friend-palate" data-profile="${this.esc(name)}"><span class="person-dot" style="background:${this.esc(color)};">${this.esc(this.feedInitial(name))}</span><span class="friend-palate-text"><b>${this.esc(name)}</b>${this.esc(this.palateSentence(this.palateFor(name)))}</span></button>`;
                }).join('');
                return `<section class="profile-card"><h4 class="section-label">Friends' palates</h4><div class="friend-palates">${rows}</div></section>`;
            },

            likelyMatches(forUser, fromUser) {
                const p = this.palateFor(forUser);
                if (!p || p.count < 3) return null;
                const tried = new Set(this.brewsOf(forUser).map(b => this.groupKeyOfBrew(b)));
                const share = (map, label) => {
                    if (!label) return 0;
                    let max = 0;
                    map.forEach(v => { max = Math.max(max, v.w); });
                    const hit = map.get(String(label).toLowerCase());
                    return hit && max > 0 ? hit.w / max : 0;
                };
                const out = [];
                this.buildBeanGroups().forEach(({ group, brews }) => {
                    const key = this.beanGroupKey(group.meta);
                    if (tried.has(key) || group.users.has(forUser)) return;
                    if (fromUser && !group.users.has(fromUser) && !brews.some(b => this.getBrewOwner(b) === fromUser)) return;
                    const meta = group.meta;
                    const origins = this.originList(meta.origin);
                    const originHit = origins.map(o => ({ o, s: share(p.dims.origins, o) })).sort((a, b) => b.s - a.s)[0];
                    const originScore = originHit ? originHit.s : 0;
                    const process = this.normalizeTag(meta.process);
                    const processScore = share(p.dims.processes, process);
                    const roast = String(meta.roast || '').trim();
                    const roastScore = share(p.dims.roasts, roast);
                    const notes = this.getTopFlavors(brews, 4).map(f => this.normalizeTag(f)).filter(Boolean);
                    const noteScores = notes.map(n => ({ n, s: share(p.dims.notes, n) }));
                    const noteScore = noteScores.length ? noteScores.reduce((s, x) => s + x.s, 0) / noteScores.length : 0;
                    const othersRated = brews.filter(b => this.getBrewOwner(b) !== forUser && this.normalizeRating(b.rating) > 0);
                    const friendAvg = othersRated.length ? othersRated.reduce((s, b) => s + this.normalizeRating(b.rating), 0) / othersRated.length : 0;
                    const score = 0.3 * originScore + 0.2 * processScore + 0.15 * roastScore + 0.2 * noteScore + 0.15 * (friendAvg / 5);
                    const why = [];
                    if (originScore >= 0.5) why.push(originHit.o);
                    if (processScore >= 0.5) why.push(process);
                    if (roastScore >= 0.5) why.push(`${roast} roast`);
                    const sharedNotes = noteScores.filter(x => x.s >= 0.4).slice(0, 2).map(x => x.n.toLowerCase());
                    if (sharedNotes.length) why.push(sharedNotes.join(' & '));
                    if (othersRated.length) {
                        const top = othersRated.slice().sort((a, b) => this.normalizeRating(b.rating) - this.normalizeRating(a.rating))[0];
                        why.push(`${this.getBrewOwner(top)} rated it ${this.fmtNum(this.normalizeRating(top.rating))}★`);
                    }
                    const holder = group.ids.map(id => this.beans.get(id)).find(Boolean);
                    out.push({ meta, score, why, beanId: holder ? holder.id : group.ids[0] });
                });
                return out.filter(m => m.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 4);
            },

            renderMatchesCard(user) {
                const own = user === this.user;
                const title = own ? 'Likely matches for you' : `Likely matches for you from ${this.esc(user)}'s beans`;
                if (!this.user) return '';
                const matches = this.likelyMatches(this.user, own ? null : user);
                let body;
                if (matches === null) body = '<div class="panel-empty">Log at least 3 sessions and your matches will show here.</div>';
                else if (!matches.length) body = `<div class="panel-empty">${own ? 'No untried beans in the library match your palate yet.' : `Nothing of ${this.esc(user)}'s that you haven't tried matches your palate yet.`}</div>`;
                else {
                    body = `<div class="match-list">${matches.map(m => {
                        const label = m.score >= 0.55 ? 'Strong match' : (m.score >= 0.35 ? 'Good match' : 'Worth a try');
                        return `<button type="button" class="match-item" data-bean="${this.esc(m.beanId)}" onclick="app.openFeedTarget(this.getAttribute('data-bean'),'',false)"><div><div class="match-name">${this.esc(this.beanLabel(m.meta))}</div><div class="match-why">${this.esc(m.why.join(' · ') || 'Close to your palate')}</div></div><span class="match-score">${label}</span></button>`;
                    }).join('')}</div>`;
                }
                return `<section class="profile-card"><h4 class="section-label">${title}</h4>${body}</section>`;
            },

            renderWantCard(user) {
                const seen = new Set();
                const items = [];
                this.beans.forEach(b => {
                    if (!Array.isArray(b.wantToTry) || !b.wantToTry.includes(user)) return;
                    const key = this.beanGroupKey(b);
                    if (seen.has(key)) return;
                    seen.add(key);
                    items.push({ bean: b, tried: this.brewsOf(user).some(x => this.groupKeyOfBrew(x) === key) });
                });
                const own = user === this.user;
                const body = items.length
                    ? `<div class="match-list">${items.map(({ bean, tried }) => `<button type="button" class="match-item" data-bean="${this.esc(bean.id)}" onclick="app.openFeedTarget(this.getAttribute('data-bean'),'',false)"><div><div class="match-name">${this.esc(this.beanLabel(bean))}</div><div class="match-why">From ${this.esc(bean.user || 'Unknown')}'s collection${bean.origin ? ` · ${this.esc(bean.origin)}` : ''}</div></div>${tried ? '<span class="tried-tag">Tried</span>' : ''}</button>`).join('')}</div>`
                    : `<div class="panel-empty">${own ? 'Nothing saved yet. Open a friend\'s bean and tap Want to Try.' : `${this.esc(user)} hasn't saved any beans yet.`}</div>`;
                return `<section class="profile-card"><h4 class="section-label">${own ? 'Your want-to-try list' : `${this.esc(user)}'s want-to-try list`}</h4>${body}</section>`;
            },

            calendarData(user, year) {
                const days = new Map();
                this.brewsOf(user).forEach(b => {
                    const t = this.toTime(b.date);
                    if (!t || new Date(t).getFullYear() !== year) return;
                    const key = this.dayKey(t);
                    const cur = days.get(key) || { count: 0, best: null };
                    cur.count++;
                    const r = this.normalizeRating(b.rating);
                    const br = cur.best ? this.normalizeRating(cur.best.rating) : -1;
                    if (r > br || (r === br && this.isEarlier(cur.best, b))) cur.best = b;
                    days.set(key, cur);
                });
                return days;
            },

            renderCalendarCard(user) {
                const thisYear = new Date(Date.now()).getFullYear();
                const year = this.calendarYear || thisYear;
                const days = this.calendarData(user, year);
                this.calendarView = { user, year, days };
                const colorOf = new Map();
                const keyItems = [];
                [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([, info]) => {
                    const gk = this.groupKeyOfBrew(info.best);
                    if (colorOf.has(gk)) return;
                    const color = this.beanPalette[colorOf.size % this.beanPalette.length];
                    colorOf.set(gk, color);
                    keyItems.push({ color, label: this.beanLabel(this.beans.get(String(info.best.beanId))) });
                });
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                let cells = '';
                months.forEach((m, mi) => {
                    cells += `<div class="cal-month">${m}</div>`;
                    const daysIn = new Date(year, mi + 1, 0).getDate();
                    for (let d = 1; d <= 31; d++) {
                        if (d > daysIn) {
                            cells += '<div class="cal-cell none"></div>';
                            continue;
                        }
                        const key = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const info = days.get(key);
                        if (!info) {
                            cells += '<div class="cal-cell"></div>';
                            continue;
                        }
                        const color = colorOf.get(this.groupKeyOfBrew(info.best));
                        const r = this.normalizeRating(info.best.rating);
                        const opacity = r > 0 ? (0.35 + 0.65 * (r / 5)).toFixed(2) : '0.28';
                        cells += `<div class="cal-cell has" style="background:${color}; opacity:${opacity};" data-day="${key}" onclick="app.showCalendarDay(this)"></div>`;
                    }
                });
                const key = keyItems.length
                    ? `<div class="cal-key">${keyItems.map(k => `<span class="cal-key-item"><span class="cal-swatch" style="background:${k.color};"></span>${this.esc(k.label)}</span>`).join('')}</div><div class="cal-rating-key"><span>Color = bean of the day's best shot.</span><span class="cal-swatch" style="opacity:1;"></span><span>5★</span><span class="cal-swatch" style="opacity:0.61;"></span><span>2★</span><span class="cal-swatch" style="opacity:0.28;"></span><span>unrated</span></div>`
                    : '';
                return `<section class="profile-card"><h4 class="section-label">Coffee calendar</h4><div class="cal-head"><div class="cal-sub">${days.size} brewing day${days.size === 1 ? '' : 's'} in ${year}</div><div class="cal-nav"><button type="button" class="cal-btn" onclick="app.shiftCalendarYear(-1)" aria-label="Previous year">‹</button><span>${year}</span><button type="button" class="cal-btn" onclick="app.shiftCalendarYear(1)" aria-label="Next year"${year >= thisYear ? ' disabled' : ''}>›</button></div></div><div class="cal-grid">${cells}</div>${key}<div class="cal-day" id="cal-day">${days.size ? 'Tap a day to see the bean and rating.' : ''}</div></section>`;
            },

            showCalendarDay(el) {
                const view = this.calendarView;
                if (!view || !el) return;
                const key = el.getAttribute('data-day');
                const info = view.days.get(key);
                const out = document.getElementById('cal-day');
                if (!info || !out) return;
                document.querySelectorAll('.cal-cell.sel').forEach(c => c.classList.remove('sel'));
                el.classList.add('sel');
                const r = this.normalizeRating(info.best.rating);
                const date = new Date(this.parseLocalDate(key)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                out.innerText = `${date} · ${this.beanLabel(this.beans.get(String(info.best.beanId)))} · ${r > 0 ? `${this.fmtNum(r)}★` : 'unrated'} · ${info.count} session${info.count === 1 ? '' : 's'}`;
            },

            recapPeriods(user) {
                const months = new Set();
                const years = new Set();
                this.brewsOf(user).forEach(b => {
                    const t = this.toTime(b.date);
                    if (!t) return;
                    const d = new Date(t);
                    months.add(`m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    years.add(`y:${d.getFullYear()}`);
                });
                // v12.0: this month and this year are always listed (locked until they're over; the year opens Dec 20)
                if (months.size) {
                    const now = new Date();
                    months.add(`m:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                    years.add(`y:${now.getFullYear()}`);
                }
                return [...months].sort().reverse().concat([...years].sort().reverse());
            },

            periodLocked(p) {
                if (String(p).startsWith('y:')) return Date.now() < this.periodUnlockDate(p).getTime();
                return this.monthLocked(String(p).slice(2));
            },

            periodUnlockDate(p) {
                if (String(p).startsWith('y:')) return new Date(Number(String(p).slice(2)), 11, 20);
                const [y, m] = String(p).slice(2).split('-').map(Number);
                return new Date(y, m, 1);
            },

            // the recap that just came out and you haven't looked at yet: last month's on the 1st-3rd, the year's on Dec 20-23
            freshRecap(user = this.user) {
                if (!user) return null;
                const now = new Date();
                let p = null;
                if (now.getMonth() === 11 && now.getDate() >= 20 && now.getDate() <= 23) p = `y:${now.getFullYear()}`;
                else if (now.getDate() <= 3) { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); p = `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
                if (!p || this.periodLocked(p)) return null;
                const [a, b] = this.periodRange(p);
                if (!this.brewsOf(user).some(x => { const t = this.toTime(x.date); return t >= a && t < b; })) return null;
                return this.hasSeen('dialed_recap_seen', p) ? null : p;
            },

            // ---- v12.0: the monthly recap as two cards, styled like the Year in Coffee but calm (no slides, nothing moves)
            monthCrewStats(period) {
                const [a, b] = this.periodRange(period);
                const list = this.sessionsBetween(a, b);
                const owner = x => this.getBrewOwner(x);
                const by = new Map();
                list.forEach(x => by.set(owner(x), (by.get(owner(x)) || 0) + 1));
                const people = [...by.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]));
                const ratingOf = x => this.normalizeRating(x.rating);
                const likesOf = x => (Array.isArray(x.likes) ? x.likes.filter(n => String(n || '').trim() && String(n).trim() !== owner(x)).length : 0);
                const groups = new Map();
                list.forEach(x => { const k = this.groupKeyOfBrew(x); const g = groups.get(k) || { n: 0, who: new Set(), bean: this.beans.get(String(x.beanId)) }; g.n++; g.who.add(owner(x)); groups.set(k, g); });
                const ranked = [...groups.values()].sort((p, q) => q.n - p.n);
                const coffee = ranked.find(g => g.who.size > 1) || ranked[0] || null;
                const days = new Map();
                list.forEach(x => { const k = this.dayKey(this.localTime(x.date)); days.set(k, (days.get(k) || 0) + 1); });
                const busiest = [...days.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))[0] || null;
                let goals = 0;
                for (let ws = this.weekStartOf(a); ws < b; ws = this.weekStartOf(ws + 7 * 864e5 + 3 * 3600e3)) { if (ws < a) continue; if (ws + 7 * 864e5 > Date.now()) break; if (this.crewQuest(ws + 3 * 864e5).done) goals++; }
                const key = period.slice(2);
                const [y, m] = key.split('-').map(Number);
                const awards = this.crewAwardsMemo(y, m - 1);
                const st = this.awardStandings(awards);
                // no spoilers: the champion only shows once you've revealed the month's awards
                const champ = st.length && !this.awardsNeedReveal(key, awards) ? st.filter(r => r[1] === st[0][1]).map(r => r[0]) : [];
                const rated = list.filter(x => ratingOf(x) > 0);
                return { count: list.length, people, grams: list.reduce((s, x) => s + this.num(x.dose), 0), fives: rated.filter(x => ratingOf(x) >= 5).length, avg: rated.length ? rated.reduce((s, x) => s + ratingOf(x), 0) / rated.length : 0, likes: list.reduce((s, x) => s + likesOf(x), 0), coffee, busiest, goals, champ, sealed: !!st.length && !champ.length };
            },

            monthCardsHtml(user, s, period, best) {
                const esc = v => this.esc(v);
                const month = this.monthName(period.slice(2), false);
                const face = n => `<b class="mrc-face" style="background:${esc(this.getUserColor(n))}">${esc(this.feedInitial(n))}</b>`;
                const amount = g => g >= 1000 ? `${this.fmtNum(g / 1000, 2)} kg` : `${Math.round(g)} g`;
                const stats = [[amount(s.grams), 'coffee'], [s.avgRating ? `${this.fmtNum(s.avgRating, 1)}★` : '—', 'average rating'], [`${s.longestStreak} day${s.longestStreak === 1 ? '' : 's'}`, 'longest run'], [String(s.newBeans || 0), `new coffee${s.newBeans === 1 ? '' : 's'}`]];
                const lines = [];
                if (s.topBean) lines.push(['Top coffee', `${s.topBean.name || s.topBean.label} · ${s.topBean.count}×`]);
                if (s.topMethod) lines.push(['Method', `${s.topMethod.label} · ${s.topMethod.count}×`]);
                if (s.buddy) lines.push(['Brew buddy', s.buddy.name]);
                const row = ([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`;
                const you = `
                    <div class="mrc-card mrc-you" style="--uc:${esc(this.getUserColor(user))}">
                        <div class="mrc-kicker">${face(user)}${esc(user)} · ${esc(month)}</div>
                        <div class="mrc-head"><span class="mrc-big">${s.count}</span><span class="mrc-sub">session${s.count === 1 ? '' : 's'}<br>on ${s.days} day${s.days === 1 ? '' : 's'}</span></div>
                        <div class="mrc-stats">${stats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
                        ${lines.length ? `<div class="mrc-lines">${lines.map(row).join('')}</div>` : ''}
                        ${best}
                    </div>`;
                const c = this.monthCrewStats(period);
                if (c.people.length < 2) return you;
                const names = c.people.map(p => p[0]);
                const crewG = `linear-gradient(150deg, ${names.map((n, i) => `${this.hexMix(this.getUserColor(n), '#000000', 0.12)} ${Math.round(i / Math.max(1, names.length - 1) * 100)}%`).join(', ')})`;
                const max = c.people[0][1];
                const board = c.people.map(([n, k]) => `<div><span class="mrc-name">${face(n)}<span class="mrc-nm">${esc(n)}</span></span><i><b style="width:${(k / max * 100).toFixed(1)}%"></b></i><span class="mrc-n">${k}</span></div>`).join('');
                const cstats = [[amount(c.grams), 'coffee'], [String(c.fives), `5★ shot${c.fives === 1 ? '' : 's'}`], [String(c.likes), `like${c.likes === 1 ? '' : 's'}`], [String(c.goals), `goal${c.goals === 1 ? '' : 's'} reached`]];
                const clines = [];
                if (c.coffee && c.coffee.bean) clines.push(['Crew coffee', `${String(c.coffee.bean.name || '').trim() || this.beanLabel(c.coffee.bean)} · ${c.coffee.n}×`]);
                if (c.busiest && c.busiest[1] > 1) clines.push(['Busiest day', `${new Date(this.parseLocalDate(c.busiest[0])).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${c.busiest[1]} sessions`]);
                if (c.champ.length) clines.push(['Champion', c.champ.join(' & ')]);
                else if (c.sealed) clines.push(['Awards', 'ready to reveal']);
                const crew = `
                    <div class="mrc-card mrc-crew" style="--crew-g:${esc(crewG)}">
                        <div class="mrc-kicker"><span class="mrc-faces">${names.map(face).join('')}</span>The crew · ${esc(month)}</div>
                        <div class="mrc-head"><span class="mrc-big">${c.count}</span><span class="mrc-sub">sessions<br>together</span></div>
                        <div class="mrc-board">${board}</div>
                        <div class="mrc-stats">${cstats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
                        ${clines.length ? `<div class="mrc-lines">${clines.map(row).join('')}</div>` : ''}
                    </div>`;
                // side by side: swipe left for the crew, right to come back
                return `<div class="mrc-swipe" onscroll="app.recapSwipeDots(this)">${you}${crew}</div><div class="mrc-dots" role="tablist" aria-label="Recap cards"><button type="button" class="on" aria-label="Your card" onclick="app.recapSwipeTo(this, 0)"></button><button type="button" aria-label="The crew's card" onclick="app.recapSwipeTo(this, 1)"></button></div>`;
            },

            recapSwipeDots(el) {
                const max = el.scrollWidth - el.clientWidth;
                const i = max > 0 && el.scrollLeft > max / 2 ? 1 : 0;
                const dots = el.nextElementSibling;
                if (dots) [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
            },

            recapSwipeTo(btn, i) {
                const el = btn.parentElement.previousElementSibling;
                if (!el) return;
                const left = i ? el.scrollWidth - el.clientWidth : 0;
                if (el.scrollTo) el.scrollTo({ left, behavior: this.motionOK() ? 'smooth' : 'auto' }); else el.scrollLeft = left;
            },

            // v12.1: the monthly share image matches the new cards (yours above, the crew's below), story-sized
            async shareMonthRecap(s) {
                const user = s.user, period = s.period;
                const month = this.monthName(period.slice(2));
                const c = typeof this.monthCrewStats === 'function' ? this.monthCrewStats(period) : null;
                const crew = c && c.people.length > 1 ? c : null;
                const W = 1080, PAD = 60, CW = W - PAD * 2, IN = 50;
                const font = (w, z) => `${w} ${z}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`;
                const amount = g => g >= 1000 ? `${this.fmtNum(g / 1000, 2)} kg` : `${Math.round(g)} g`;
                const youStats = [[amount(s.grams), 'coffee'], [s.avgRating ? `${this.fmtNum(s.avgRating, 1)}★` : '—', 'average rating'], [`${s.longestStreak} day${s.longestStreak === 1 ? '' : 's'}`, 'longest run'], [String(s.newBeans || 0), `new coffee${s.newBeans === 1 ? '' : 's'}`]];
                const youLines = [];
                if (s.topBean) youLines.push(['Top coffee', `${s.topBean.name || s.topBean.label} · ${s.topBean.count}×`]);
                if (s.topMethod) youLines.push(['Method', `${s.topMethod.label} · ${s.topMethod.count}×`]);
                if (s.best) { const bn = this.beans.get(String(s.best.beanId)); youLines.push(['Best shot', `${bn ? (String(bn.name || '').trim() || this.beanLabel(bn)) : 'Coffee'} · ${this.fmtNum(this.normalizeRating(s.best.rating))}★`]); }
                if (s.buddy) youLines.push(['Brew buddy', s.buddy.name]);
                const crewStats = crew ? [[amount(crew.grams), 'coffee'], [String(crew.fives), `5★ shot${crew.fives === 1 ? '' : 's'}`], [String(crew.likes), `like${crew.likes === 1 ? '' : 's'}`], [String(crew.goals), `goal${crew.goals === 1 ? '' : 's'} reached`]] : [];
                const crewLines = [];
                if (crew && crew.coffee && crew.coffee.bean) crewLines.push(['Crew coffee', `${String(crew.coffee.bean.name || '').trim() || this.beanLabel(crew.coffee.bean)} · ${crew.coffee.n}×`]);
                if (crew && crew.busiest && crew.busiest[1] > 1) crewLines.push(['Busiest day', `${new Date(this.parseLocalDate(crew.busiest[0])).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${crew.busiest[1]} sessions`]);
                if (crew && crew.champ.length) crewLines.push(['Champion', crew.champ.join(' & ')]);
                const statsH = 2 * 132 + 22;
                const youH = 54 + 96 + 170 + statsH + 30 + youLines.length * 58 + 40;
                const crewH = crew ? 54 + 96 + 170 + crew.people.length * 62 + 20 + statsH + 30 + crewLines.length * 58 + 40 : 0;
                const H = Math.max(1920, 170 + youH + (crew ? 40 + crewH : 0) + 130);
                const canvas = document.createElement('canvas');
                canvas.width = W; canvas.height = H;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.fillStyle = '#F4F1EC'; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#586A58'; ctx.font = font(800, 36); ctx.fillText(`Dialed In · ${month}`, PAD + 6, 110);
                const face = (n, x, y, r) => { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = this.getUserColor(n); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = font(800, Math.round(r * 0.95)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.feedInitial(n), x, y + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; };
                const card = (y, h, fill) => { ctx.save(); this.roundRect(ctx, PAD, y, CW, h, 56); ctx.fillStyle = fill; ctx.shadowColor = 'rgba(40,30,20,0.18)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; ctx.fill(); ctx.restore(); ctx.save(); this.roundRect(ctx, PAD, y, CW, h, 56); ctx.clip(); const hl = ctx.createRadialGradient(PAD + CW * 0.92, y, 0, PAD + CW * 0.92, y, CW * 0.5); hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(PAD, y, CW, h); ctx.restore(); };
                const head = (y, n, sub1, sub2) => { ctx.fillStyle = '#fff'; ctx.font = font(860, 170); const nw = ctx.measureText(String(n)).width; ctx.fillText(String(n), PAD + IN, y + 150); ctx.font = font(700, 44); ctx.globalAlpha = 0.92; ctx.fillText(sub1, PAD + IN + nw + 30, y + 88); ctx.fillText(sub2, PAD + IN + nw + 30, y + 140); ctx.globalAlpha = 1; };
                const stats = (y, list) => { const bw = (CW - IN * 2 - 22) / 2; list.forEach(([v, l], i) => { const x = PAD + IN + (i % 2) * (bw + 22), yy = y + Math.floor(i / 2) * (132 + 22); ctx.fillStyle = 'rgba(255,255,255,0.14)'; this.roundRect(ctx, x, yy, bw, 132, 30); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = font(820, 54); ctx.fillText(this.fitText(ctx, v, bw - 60), x + 32, yy + 66); ctx.globalAlpha = 0.82; ctx.font = font(650, 30); ctx.fillText(l, x + 32, yy + 108); ctx.globalAlpha = 1; }); };
                const lines = (y, list) => { list.forEach(([l, v], i) => { const yy = y + i * 58; ctx.globalAlpha = 0.8; ctx.font = font(600, 36); ctx.fillStyle = '#fff'; ctx.fillText(l, PAD + IN, yy); ctx.globalAlpha = 1; ctx.font = font(750, 36); const t = this.fitText(ctx, v, CW - IN * 2 - 260); ctx.textAlign = 'right'; ctx.fillText(t, PAD + CW - IN, yy); ctx.textAlign = 'left'; }); };
                // your card
                let y = 160;
                const uc = this.getUserColor(user);
                const ug = ctx.createLinearGradient(PAD, y, PAD + CW * 0.6, y + youH); ug.addColorStop(0, this.hexMix(uc, '#000000', 0.12)); ug.addColorStop(1, this.hexMix(uc, '#000000', 0.54));
                card(y, youH, ug);
                face(user, PAD + IN + 26, y + 80, 26);
                ctx.fillStyle = '#fff'; ctx.font = font(750, 40); ctx.fillText(`${user} · ${this.monthName(period.slice(2), false)}`, PAD + IN + 74, y + 94);
                head(y + 110, s.count, `session${s.count === 1 ? '' : 's'}`, `on ${s.days} day${s.days === 1 ? '' : 's'}`);
                stats(y + 330, youStats);
                lines(y + 330 + statsH + 70, youLines);
                // the crew's card
                if (crew) {
                    y += youH + 40;
                    const names = crew.people.map(p => p[0]);
                    const cg = ctx.createLinearGradient(PAD, y, PAD + CW * 0.6, y + crewH);
                    names.forEach((n, i) => cg.addColorStop(names.length > 1 ? i / (names.length - 1) : 0, this.hexMix(this.getUserColor(n), '#000000', 0.25)));
                    card(y, crewH, cg);
                    names.forEach((n, i) => face(n, PAD + IN + 26 + i * 64, y + 80, 26));
                    ctx.fillStyle = '#fff'; ctx.font = font(750, 40); ctx.fillText(`The crew · ${this.monthName(period.slice(2), false)}`, PAD + IN + 26 + names.length * 64, y + 94);
                    head(y + 110, crew.count, 'sessions', 'together');
                    const max = crew.people[0][1], by = y + 330;
                    crew.people.forEach(([n, k], i) => { const yy = by + i * 62; face(n, PAD + IN + 22, yy + 20, 20); ctx.fillStyle = '#fff'; ctx.font = font(750, 36); ctx.fillText(this.fitText(ctx, n, 200), PAD + IN + 58, yy + 33); const bx = PAD + IN + 290, bw = CW - IN * 2 - 290 - 90; ctx.fillStyle = 'rgba(255,255,255,0.2)'; this.roundRect(ctx, bx, yy + 12, bw, 16, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.92)'; this.roundRect(ctx, bx, yy + 12, Math.max(16, bw * k / max), 16, 8); ctx.fill(); ctx.textAlign = 'right'; ctx.fillText(String(k), PAD + CW - IN, yy + 33); ctx.textAlign = 'left'; });
                    const sy = by + crew.people.length * 62 + 20;
                    stats(sy, crewStats);
                    lines(sy + statsH + 70, crewLines);
                }
                ctx.fillStyle = '#586A58'; ctx.font = font(700, 30); ctx.fillText('Logged with Dialed In', PAD + 6, H - 70);
                // always a phone-story frame (9:16): scale down to fit when the cards run long
                let outCanvas = canvas;
                if (H > 1920) {
                    outCanvas = document.createElement('canvas');
                    outCanvas.width = 1080; outCanvas.height = 1920;
                    const o = outCanvas.getContext('2d');
                    const k = 1920 / H;
                    o.fillStyle = '#F4F1EC'; o.fillRect(0, 0, 1080, 1920);
                    o.drawImage(canvas, (1080 - W * k) / 2, 0, W * k, 1920);
                }
                const blob = await new Promise(r => outCanvas.toBlob(r, 'image/png'));
                if (!blob) return;
                const file = new File([blob], `dialed-in-${period.slice(2)}.png`, { type: 'image/png' });
                try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${user}'s ${month}` }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            },

            updateRecapDot() {
                if (typeof document === 'undefined') return;
                const fresh = this.freshRecap();
                document.querySelectorAll('.mob-item[data-tab="profile"], .nav-btn[data-tab="profile"]').forEach(el => {
                    let dot = el.querySelector('.nav-dot');
                    if (fresh && !dot) { dot = document.createElement('span'); dot.className = 'nav-dot'; el.appendChild(dot); }
                    if (dot) dot.title = fresh ? `${this.periodLabel(fresh)} is ready` : '';
                    if (!fresh && dot) dot.remove();
                });
            },

            periodLabel(p) {
                if (p.startsWith('y:')) return `Year in Coffee ${p.slice(2)}`;
                const [y, m] = p.slice(2).split('-').map(Number);
                return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            },

            periodRange(p) {
                if (p.startsWith('y:')) {
                    const y = Number(p.slice(2));
                    return [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()];
                }
                const [y, m] = p.slice(2).split('-').map(Number);
                return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()];
            },

            recapStats(user, period) {
                const [start, end] = this.periodRange(period);
                const all = this.brewsOf(user);
                const inRange = t => t >= start && t < end;
                const brews = all.filter(b => inRange(this.toTime(b.date)));
                const s = { user, period, label: this.periodLabel(period), count: brews.length, isYear: period.startsWith('y:') };
                if (!brews.length) return s;
                s.grams = brews.reduce((sum, b) => sum + this.num(b.dose), 0);
                s.out = brews.reduce((sum, b) => sum + this.num(b.yield), 0);
                const dayNums = [...new Set(brews.map(b => this.dayNum(this.toTime(b.date))))].sort((a, b) => a - b);
                s.days = dayNums.length;
                let longest = 0;
                let run = 0;
                let prev = null;
                dayNums.forEach(d => {
                    run = prev !== null && d === prev + 1 ? run + 1 : 1;
                    longest = Math.max(longest, run);
                    prev = d;
                });
                s.longestStreak = longest;
                const countBy = fn => {
                    const m = new Map();
                    brews.forEach(b => {
                        const k = fn(b);
                        if (!k) return;
                        m.set(k, (m.get(k) || 0) + 1);
                    });
                    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
                };
                const topBean = countBy(b => this.groupKeyOfBrew(b))[0];
                if (topBean) {
                    const sample = brews.find(b => this.groupKeyOfBrew(b) === topBean[0]);
                    const topB = this.beans.get(String(sample.beanId));
                    s.topBean = { label: this.beanLabel(topB), name: topB ? String(topB.name || '').trim() : '', count: topBean[1] };
                }
                const topRoaster = countBy(b => {
                    const bean = this.beans.get(String(b.beanId));
                    return bean ? this.normalizeTag(bean.roaster) : '';
                })[0];
                if (topRoaster) s.topRoaster = { label: topRoaster[0], count: topRoaster[1] };
                const topMethod = countBy(b => b.method)[0];
                if (topMethod) s.topMethod = { label: topMethod[0], count: topMethod[1] };
                const rated = brews.filter(b => this.normalizeRating(b.rating) > 0);
                if (rated.length) {
                    s.best = rated.reduce((a, b) => {
                        const ra = this.normalizeRating(a.rating);
                        const rb = this.normalizeRating(b.rating);
                        return rb > ra || (rb === ra && this.isEarlier(a, b)) ? b : a;
                    });
                    s.avgRating = rated.reduce((sum, b) => sum + this.normalizeRating(b.rating), 0) / rated.length;
                }
                const firstSeen = new Map();
                all.forEach(b => {
                    const k = this.groupKeyOfBrew(b);
                    const t = this.toTime(b.date);
                    if (!t) return;
                    if (!firstSeen.has(k) || t < firstSeen.get(k)) firstSeen.set(k, t);
                });
                s.newBeans = [...firstSeen.values()].filter(inRange).length;
                const myKeys = new Set(brews.map(b => this.groupKeyOfBrew(b)));
                const buddies = new Map();
                this.brews.forEach(b => {
                    const owner = this.getBrewOwner(b);
                    if (owner === user || !inRange(this.toTime(b.date)) || !myKeys.has(this.groupKeyOfBrew(b))) return;
                    buddies.set(owner, (buddies.get(owner) || 0) + 1);
                });
                const buddy = [...buddies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
                if (buddy) s.buddy = { name: buddy[0], count: buddy[1] };
                if (s.isYear) s.months = new Set(brews.map(b => new Date(this.toTime(b.date)).getMonth())).size;
                return s;
            },

            recapNumbers(s) {
                const grams = s.grams >= 1000 ? `${this.fmtNum(s.grams / 1000, 2)} kg` : `${Math.round(s.grams)} g`;
                const out = s.out >= 1000 ? `${this.fmtNum(s.out / 1000, 2)} L` : `${Math.round(s.out)} ml`;
                return [[String(s.count), 'Sessions'], [String(s.days), 'Brewing days'], [grams, 'Coffee used'], [out, 'Brewed out']];
            },

            recapLines(s) {
                const lines = [];
                if (s.topBean) lines.push(['Top bean', `${s.topBean.label} · ${s.topBean.count}×`]);
                if (s.topRoaster) lines.push(['Top roaster', s.topRoaster.label]);
                if (s.topMethod) lines.push(['Most-used method', `${s.topMethod.label} · ${s.topMethod.count}×`]);
                lines.push(['New beans tried', String(s.newBeans || 0)]);
                lines.push(['Longest daily run', `${s.longestStreak} day${s.longestStreak === 1 ? '' : 's'}`]);
                if (s.avgRating) lines.push(['Average rating', `${this.fmtNum(s.avgRating)}★`]);
                if (s.buddy) lines.push(['Brew buddy', `${s.buddy.name} · ${s.buddy.count} session${s.buddy.count === 1 ? '' : 's'} on the same beans`]);
                if (s.isYear) lines.push(['Months active', `${s.months} of 12`]);
                return lines;
            },

            renderRecapCard(user) {
                const periods = this.recapPeriods(user);
                if (!periods.length) return '<section class="profile-card" id="recap-card"><h4 class="section-label">Recap</h4><div class="panel-empty">No sessions yet.</div></section>';
                const countIn = p => {
                    const [start, end] = this.periodRange(p);
                    return this.brewsOf(user).filter(b => { const t = this.toTime(b.date); return t >= start && t < end; }).length;
                };
                // open on the most recent finished month with a real recap; this month (and the year, until Dec 20) stay locked
                const open = periods.filter(p => !this.periodLocked(p));
                const fallback = open.find(p => p.startsWith('m:') && countIn(p) >= 3) || open.find(p => p.startsWith('m:')) || periods[0];
                const period = this.recapPeriod && periods.includes(this.recapPeriod) ? this.recapPeriod : fallback;
                const whose = user === this.user ? 'Your' : `${user}'s`;
                const options = periods.map(p => `<option value="${p}"${p === period ? ' selected' : ''}>${this.esc(this.periodLabel(p))}${this.periodLocked(p) ? ' (locked)' : ''}</option>`).join('');
                const isYear = period.startsWith('y:');
                // "New" stays on for this visit; the dot clears once you've seen it
                const fresh = user === this.user ? this.freshRecap(user) : null;
                if (fresh && fresh === period) { this._recapNew = period; this.markSeen('dialed_recap_seen', period); }
                const isNew = user === this.user && this._recapNew === period;
                const title = `<div class="recap-title">${this.esc(whose)} ${this.esc(this.periodLabel(period))}${isNew ? '<span class="recap-new">New</span>' : ''}</div>`;
                const head = `<div class="recap-head">${title}<select class="recap-select" aria-label="Recap period" onchange="app.setRecapPeriod(this.value)">${options}</select></div>`;
                if (this.periodLocked(period)) {
                    const unlock = this.periodUnlockDate(period);
                    const days = this.daysUntil(unlock);
                    const ghosts = [1, 2, 3, 4].map(() => '<div class="stat-box"><div class="stat-num">0</div><div class="stat-cap">&nbsp;</div></div>').join('');
                    const sub = isYear
                        ? `${user === this.user ? 'Your' : `${this.esc(user)}'s`} whole ${this.esc(period.slice(2))} in coffee, told in stories. It opens on Dec 20.`
                        : `${user === this.user ? 'Your' : `${this.esc(user)}'s`} ${this.esc(this.monthName(period.slice(2), false))} recap opens when the month is over.`;
                    return `<section class="profile-card" id="recap-card"><h4 class="section-label">Recap</h4>${head}
                        <div class="recap-locked">
                            <div class="recap-ghost" aria-hidden="true"><div class="recap-grid">${ghosts}</div><div class="recap-ghost-line" style="width:80%"></div><div class="recap-ghost-line" style="width:60%"></div><div class="recap-ghost-line" style="width:70%"></div></div>
                            <div class="aw-lock-card">
                                <span class="aw-lock-icon"><svg class="icon"><use href="#i-lock"/></svg></span>
                                <div class="aw-lock-title">Come back ${this.esc(this.unlockLabel(unlock))}</div>
                                <div class="aw-lock-sub">${sub}</div>
                                <div class="aw-lock-count">${days === 1 ? 'Tomorrow' : `${days} days to go`}</div>
                            </div>
                        </div></section>`;
                }
                const s = this.recapStats(user, period);
                this.lastRecap = s;
                const min = s.isYear ? 10 : 3;
                let body;
                if (s.count < min) {
                    body = `<div class="panel-empty">${s.count} session${s.count === 1 ? '' : 's'} in ${this.esc(s.label)}. The recap fills in at ${min}.</div>`;
                } else {
                    const boxes = this.recapNumbers(s).map(([n, cap]) => `<div class="stat-box"><div class="stat-num">${this.esc(n)}</div><div class="stat-cap">${cap}</div></div>`).join('');
                    const lines = this.recapLines(s).map(([label, value]) => `<div class="recap-line"><span>${label}</span><span>${this.esc(value)}</span></div>`).join('');
                    let best = '';
                    if (s.best) {
                        const photo = this.normalizePhoto(s.best.photo);
                        const fb = photo ? this.buildDriveFallbackUrls(photo.fileId || this.extractDriveFileId(photo.url), photo.url) : [];
                        const src = photo ? (fb[0] || photo.url) : '';
                        best = `<div class="recap-best">${src ? `<img src="${this.esc(src)}" alt="Best shot" loading="lazy" data-fallback-index="0" data-fallbacks="${this.esc(fb.join('|'))}" onerror="app.handlePhotoFallback(this)">` : ''}<div class="recap-best-text"><b>Best shot</b> · ${this.esc(this.shortDate(s.best.date))}<br>${this.esc((bn => bn ? (String(bn.name || '').trim() || this.beanLabel(bn)) : 'Coffee')(this.beans.get(String(s.best.beanId))))} · ${this.esc(this.fmtNum(this.normalizeRating(s.best.rating)))}★</div></div>`;
                    }
                    const cover = isYear && typeof this.yearCoverHtml === 'function' ? this.yearCoverHtml(user, Number(period.slice(2))) : '';
                    const share = '<button type="button" class="btn-outline recap-share" onclick="app.shareRecap()">Share Recap Image</button>';
                    // a month gets two calm cards (you, then the crew); the year keeps the big story
                    body = isYear ? `${cover}<div class="recap-grid">${boxes}</div>${best}<div class="recap-lines">${lines}</div>${share}` : `${this.monthCardsHtml(user, s, period, best)}${share}`;
                }
                return `<section class="profile-card" id="recap-card"><h4 class="section-label">Recap</h4>${head}${body}</section>`;
            },

