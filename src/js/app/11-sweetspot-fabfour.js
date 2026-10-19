            // ---- Sweet-spot map: ratio vs time, colored by rating
            ratingColor(r) {
                if (!(r > 0)) return 'var(--text-faint)';
                const stops = [[1, [201, 107, 102]], [3, [227, 174, 69]], [4, [134, 172, 136]], [5, [62, 126, 78]]];
                let i = 0; while (i < stops.length - 2 && r > stops[i + 1][0]) i++;
                const [r0, c0] = stops[i], [r1, c1] = stops[i + 1];
                const t = Math.max(0, Math.min(1, (r - r0) / (r1 - r0)));
                return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',')})`;
            },

            sweetPoints(brews) {
                return brews.map(b => {
                    const dose = this.num(b.dose), yld = this.num(b.yield), time = this.num(b.time);
                    if (!(dose > 0) || !(yld > 0) || !(time > 0)) return null;
                    return { b, ratio: yld / dose, time, rating: this.normalizeRating(b.rating), who: this.getBrewOwner(b) };
                }).filter(Boolean);
            },

            sweetZone(points) {
                const rated = points.filter(p => p.rating > 0);
                if (rated.length < 3) return null;
                const best = Math.max(...rated.map(p => p.rating));
                const cut = Math.max(Math.min(4, best), best - 0.5);
                const top = rated.filter(p => p.rating >= cut);
                if (top.length < 2) return null;
                const rs = top.map(p => p.ratio), ts = top.map(p => p.time);
                return { r0: Math.min(...rs), r1: Math.max(...rs), t0: Math.min(...ts), t1: Math.max(...ts), n: top.length, cut };
            },

            fmtSeconds(s) { return s >= 90 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)} s`; },

            sweetSvg(points, zone) {
                const W = 340, H = 230, L = 44, R = 12, T = 14, B = 34;
                const rs = points.map(p => p.ratio), ts = points.map(p => p.time);
                let x0 = Math.min(...rs), x1 = Math.max(...rs), y0 = Math.min(...ts), y1 = Math.max(...ts);
                const padX = Math.max(0.15, (x1 - x0) * 0.12), padY = Math.max(2, (y1 - y0) * 0.12);
                x0 -= padX; x1 += padX; y0 = Math.max(0, y0 - padY); y1 += padY;
                const X = v => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), Y = v => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
                const ticks = (a, b, n) => { const step = (b - a) / n; const mag = Math.pow(10, Math.floor(Math.log10(step))); const nice = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= step) || step; const out = []; for (let v = Math.ceil(a / nice) * nice; v <= b + 1e-9; v += nice) out.push(+v.toFixed(6)); return out; };
                const grid = ticks(x0, x1, 4).map(v => `<line class="sw-grid" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}"/><text class="sw-tick" x="${X(v)}" y="${H - B + 14}" text-anchor="middle">1:${this.fmtNum(v, 1)}</text>`).join('')
                    + ticks(y0, y1, 4).map(v => `<line class="sw-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="sw-tick" x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${this.esc(this.fmtSeconds(v))}</text>`).join('');
                const z = zone ? `<rect class="sw-zone" x="${X(zone.r0) - 9}" y="${Y(zone.t1) - 9}" width="${Math.max(18, X(zone.r1) - X(zone.r0) + 18)}" height="${Math.max(18, Y(zone.t0) - Y(zone.t1) + 18)}" rx="12"/><text class="sw-zlabel" x="${X(zone.r0) - 6}" y="${Y(zone.t1) - 13}">Sweet spot</text>` : '';
                const dots = points.slice().sort((p, q) => p.rating - q.rating).map(p => {
                    const id = this.esc(p.b.id);
                    const rated = p.rating > 0;
                    return `<circle class="sw-dot${rated ? '' : ' unrated'}" data-sw="${id}" cx="${X(p.ratio).toFixed(1)}" cy="${Y(p.time).toFixed(1)}" r="${p.rating >= 4.5 ? 7 : 5.5}" fill="${rated ? this.ratingColor(p.rating) : 'none'}" stroke="${rated ? 'var(--surface)' : 'var(--text-faint)'}" onclick="app.showSweetDot('${app.escJs(id)}', event)"><title>${this.esc(this.shortDate(p.b.date))} · ${this.esc(p.who)} · ${rated ? `${this.fmtNum(p.rating)}★` : 'unrated'}</title></circle>`;
                }).join('');
                return `<svg class="sweet-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ratio against shot time for ${points.length} sessions">${grid}<text class="sw-axis" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Ratio (out ÷ in)</text><text class="sw-axis" transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Time</text>${z}${dots}</svg>`;
            },

            renderSweetSpot() {
                const pane = document.getElementById('d-sweet-pane');
                if (!pane) return;
                const all = this.sweetPoints(this.detailBrews || []);
                const methods = [...new Set(all.map(p => p.b.method).filter(Boolean))];
                const count = m => all.filter(p => p.b.method === m).length;
                methods.sort((a, b) => count(b) - count(a));
                if (!methods.includes(this.sweetMethod)) this.sweetMethod = methods[0] || '';
                const byMethod = all.filter(p => !this.sweetMethod || p.b.method === this.sweetMethod);
                const people = [...new Set(byMethod.map(p => p.who))].sort();
                if (this.sweetWho !== 'all' && !people.includes(this.sweetWho)) this.sweetWho = 'all';
                const points = byMethod.filter(p => this.sweetWho === 'all' || p.who === this.sweetWho);
                const chip = (label, active, fn) => `<button type="button" class="chip-btn" aria-pressed="${active}" onclick="${fn}">${this.esc(label)}</button>`;
                const methodRow = methods.length > 1 ? `<div class="sw-chips">${methods.map(m => chip(m, m === this.sweetMethod, `app.setSweet('method', '${app.escJs(m)}')`)).join('')}</div>` : '';
                const peopleRow = people.length > 1 ? `<div class="sw-chips">${['all', ...people].map(p => chip(p === 'all' ? 'All' : p, p === this.sweetWho, `app.setSweet('who', '${app.escJs(p)}')`)).join('')}</div>` : '';
                if (points.length < 3) {
                    pane.innerHTML = `<div class="sweet-card"><div class="sw-head"><h3>Sweet spot</h3><p>Where your best ${this.esc(this.shotWord(this.sweetMethod))}s land: ratio against time, colored by rating.</p></div>${methodRow}${peopleRow}<div class="panel-empty">Log a few rated sessions with dose, yield and time${this.sweetMethod ? ` for ${this.esc(this.sweetMethod)}` : ''} to see your sweet spot.</div></div>`;
                    return;
                }
                const zone = this.sweetZone(points);
                const summary = zone
                    ? `Best ${this.esc(this.shotWord(this.sweetMethod))}s${this.sweetWho === 'all' ? '' : ` for ${this.esc(this.sweetWho)}`} cluster at <b>1:${this.fmtNum(zone.r0, 1)}${zone.r1 - zone.r0 >= 0.05 ? `–${this.fmtNum(zone.r1, 1)}` : ''}</b> in <b>${zone.t1 - zone.t0 < 1 ? this.esc(this.fmtSeconds(zone.t0)) : (zone.t1 < 90 ? `${Math.round(zone.t0)}–${Math.round(zone.t1)} s` : `${this.esc(this.fmtSeconds(zone.t0))}–${this.esc(this.fmtSeconds(zone.t1))}`)}</b> (${zone.n} ${this.esc(this.shotWord(this.sweetMethod))}s at ${this.fmtNum(zone.cut)}★+).`
                    : 'Rate a few more sessions to find the cluster.';
                pane.innerHTML = `
                    <div class="sweet-card">
                        <div class="sw-head"><h3>Sweet spot</h3><p>Ratio against time, colored by rating. Ratios and times compare across people; grind doesn't.</p></div>
                        ${methodRow}${peopleRow}
                        <div class="sw-chart">${this.sweetSvg(points, zone)}</div>
                        <div class="sw-legend"><span><i style="background:${this.ratingColor(2)}"></i>2★</span><span><i style="background:${this.ratingColor(3.5)}"></i>3.5★</span><span><i style="background:${this.ratingColor(4.5)}"></i>4.5★</span><span><i class="hollow"></i>unrated</span></div>
                        <div class="sw-summary">${summary}</div>
                        <div class="sw-info" id="sw-info">Tap a dot to see that session.</div>
                    </div>`;
            },

            setSweet(kind, value) {
                if (kind === 'method') this.sweetMethod = value; else this.sweetWho = value;
                this.renderSweetSpot();
            },

            showSweetDot(id, event) {
                if (event) event.stopPropagation();
                const b = this.brews.get(String(id));
                const info = document.getElementById('sw-info');
                if (!b || !info) return;
                document.querySelectorAll('.sw-dot.picked').forEach(d => d.classList.remove('picked'));
                document.querySelectorAll('.sw-dot').forEach(d => { if (d.getAttribute('data-sw') === String(id)) d.classList.add('picked'); });
                const r = this.normalizeRating(b.rating);
                info.innerHTML = `<b>${this.esc(this.shortDate(b.date))} · ${this.esc(this.getBrewOwner(b))}</b> · ${this.esc(this.recipeLine(b, b.owner === this.user || this.getBrewOwner(b) === this.user))}${r ? ` · ${this.esc(this.fmtNum(r))}★` : ''}`;
            },

            // ---- Fab Four: four pinned coffees + last four brewed
            fabFourOf(user) {
                const rec = this.gearByUser.get(String(user || ''));
                const raw = rec && Array.isArray(rec.fabFour) ? rec.fabFour : [];
                return [0, 1, 2, 3].map(i => { const id = raw[i] ? String(raw[i]) : ''; return id && this.beans.has(id) ? id : ''; });
            },

            lastFourOf(user) {
                const seen = new Set(), out = [];
                this.brewsOf(user).slice().sort((a, b) => this.localTime(b.date) - this.localTime(a.date)).forEach(b => {
                    const key = this.groupKeyOfBrew(b);
                    if (seen.has(key) || out.length >= 4 || !this.beans.has(String(b.beanId))) return;
                    seen.add(key); out.push({ beanId: String(b.beanId), date: b.date });
                });
                return out;
            },

            // v14.7: the stars on a coffee's tile are that person's average for it (their rated sessions), not their best
            avgRatingFor(user, beanId) {
                const bean = this.beans.get(String(beanId));
                if (!bean) return 0;
                const key = this.beanGroupKey(bean);
                const rs = this.brewsOf(user).filter(b => this.groupKeyOfBrew(b) === key).map(b => this.normalizeRating(b.rating)).filter(r => r > 0);
                return rs.length ? Math.round(rs.reduce((a, r) => a + r, 0) / rs.length * 10) / 10 : 0;
            },

            coverArt(bean) {
                const seed = String((bean && (bean.origin || bean.roaster || bean.name)) || 'coffee');
                let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
                const hues = [28, 18, 42, 8, 150, 168, 200, 330, 270, 95];
                const hue = hues[h % hues.length];
                const roast = String((bean && bean.roast) || '').toLowerCase();
                const l = roast.includes('dark') ? 30 : roast.includes('medium') ? 42 : 54;
                const words = String((bean && (bean.roaster || bean.name)) || '?').trim().split(/\s+/).filter(Boolean);
                const first = w => { const m = /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|.)/u.exec(w); return m ? m[0] : ''; };
                const g0 = words.length ? first(words[0]) : '?';
                const initials = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(g0) ? g0 : (words.slice(0, 2).map(first).join('').toUpperCase() || '?');   // v11.8
                return { bg: `linear-gradient(145deg, hsl(${hue} 46% ${l + 14}%), hsl(${(hue + 24) % 360} 42% ${l - 6}%))`, initials };
            },

            fabTileHtml(beanId, opts = {}) {
                const bean = beanId ? this.beans.get(String(beanId)) : null;
                const click = opts.click || (bean ? `app.openFeedTarget('${app.escJs(bean.id)}','',false)` : '');
                if (!bean) return `<button type="button" class="fab-tile empty${opts.small ? ' small' : ''}"${click ? ` onclick="${click}"` : ' disabled'} aria-label="${opts.editable ? 'Add a favorite' : 'Empty slot'}"><span class="fab-art empty">${opts.editable ? '<svg class="icon"><use href="#i-plus"/></svg>' : ''}</span><span class="fab-name">${opts.editable ? 'Add favorite' : '—'}</span></button>`;
                const art = this.coverArt(bean);
                const r = opts.user ? this.avgRatingFor(opts.user, bean.id) : 0;
                return `<button type="button" class="fab-tile${opts.small ? ' small' : ''}" onclick="${click}" aria-label="${this.esc(this.beanLabel(bean))}"><span class="fab-art" style="background:${art.bg}"><b>${this.esc(art.initials)}</b>${r ? `<em>${this.esc(this.fmtNum(r))}★</em>` : ''}</span><span class="fab-name">${this.esc(bean.name || this.beanLabel(bean))}</span><span class="fab-roaster">${this.esc(bean.roaster || '')}</span></button>`;
            },

            renderFabFour(who) {
                if (!who) return '';
                const mine = who === this.user;
                const slots = this.fabFourOf(who);
                const favRo = this.favRoastersOf(who);
                if (!mine && !slots.some(Boolean) && !favRo.length) return '';   // v14.7: no "Recently brewed" row (the sessions below are in order already)
                const tiles = slots.map((id, i) => this.fabTileHtml(id, { user: who, editable: mine, click: mine ? `app.openFabPicker(${i})` : '' })).join('');
                return `
                    <div class="profile-card fab-four">
                        <div class="label">Favorites</div>
                        <div class="fab-sub">${mine ? 'Up to four coffees you love. Tap a slot to add or change one.' : (slots.some(Boolean) ? `${this.esc(who)}'s favorite coffees.` : `${this.esc(who)} hasn't picked favorites yet.`)}</div>
                        <div class="fab-row">${tiles}</div>
                        ${this.favRoastersHtml(who, favRo, mine)}
                    </div>`;
            },

            openFabPicker(slot) {
                if (!this.user) return;
                this.fabSlot = slot;
                const slots = this.fabFourOf(this.user);
                const groups = new Map();
                this.brewsOf(this.user).forEach(b => { const bean = this.beans.get(String(b.beanId)); if (!bean) return; const key = this.beanGroupKey(bean); const g = groups.get(key) || { bean, best: 0, n: 0 }; g.best = Math.max(g.best, this.normalizeRating(b.rating)); g.n++; groups.set(key, g); });
                this.beans.forEach(bean => { const owner = String(bean.user || bean.owner || ''); if (owner !== this.user) return; const key = this.beanGroupKey(bean); if (!groups.has(key)) groups.set(key, { bean, best: 0, n: 0 }); });
                const list = [...groups.values()].sort((a, b) => b.best - a.best || b.n - a.n || this.beanLabel(a.bean).localeCompare(this.beanLabel(b.bean)));
                const current = slots[slot];
                const pinnedKeys = slots.map(id => (id && this.beans.get(id)) ? this.beanGroupKey(this.beans.get(id)) : '');
                const rows = list.map(g => {
                    const art = this.coverArt(g.bean);
                    const at = pinnedKeys.indexOf(this.beanGroupKey(g.bean));
                    return `<button type="button" class="fab-pick${at === slot ? ' current' : ''}" onclick="app.setFabSlot(${slot}, '${app.escJs(g.bean.id)}')"><span class="fab-art mini" style="background:${art.bg}"><b>${this.esc(art.initials)}</b></span><span class="fp-main"><b>${this.esc(g.bean.name || this.beanLabel(g.bean))}</b><span>${this.esc(g.bean.roaster || '')}${g.n ? ` · ${g.n} session${g.n === 1 ? '' : 's'}` : ''}</span></span><span class="fp-side">${g.best ? `${this.esc(this.fmtNum(g.best))}★` : ''}${at >= 0 ? `<em>${at === slot ? 'This spot' : 'In favorites'}</em>` : ''}</span></button>`;
                }).join('');
                document.getElementById('fab-title').innerText = current ? 'Change favorite' : 'Add a favorite';
                document.getElementById('fab-list').innerHTML = rows || '<div class="panel-empty">Brew or add a coffee first, then pick it here.</div>';
                const clear = document.getElementById('fab-clear');
                if (clear) clear.hidden = !current;
                this.openModal('fab-modal');
            },

            setFabSlot(slot, beanId) {
                if (!this.user || slot < 0 || slot > 3) return;
                const slots = this.fabFourOf(this.user);
                const id = beanId ? String(beanId) : '';
                if (id) {
                    const key = this.beans.get(id) ? this.beanGroupKey(this.beans.get(id)) : '';
                    slots.forEach((s, i) => { if (s && this.beans.get(s) && this.beanGroupKey(this.beans.get(s)) === key) slots[i] = ''; });
                }
                slots[slot] = id;
                const mine = this.gearByUser.get(this.user);
                this.gearShownFor = this.user;
                this.push({
                    ...this.gearKeep(),
                    type: 'gear', id: `gear-${this.user}`, user: this.user, owner: this.user,
                    items: this.gearItemsFor(mine ? mine.items : this.equipment),
                    lastByMethod: (mine && mine.lastByMethod && typeof mine.lastByMethod === 'object') ? mine.lastByMethod : (this.lastEquipment || {}),
                    fabFour: slots,
                    recipes: this.myRecipes(),
                    ...this.roasterCarry()
                });
                this.closeModals();
            },

