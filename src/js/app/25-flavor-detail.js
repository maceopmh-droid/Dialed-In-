            // ===================== presenting flavor (v10) =====================
            flavorCounts(brews) {
                const counts = {}, groupCounts = {}, notes = new Map();
                brews.forEach(b => {
                    const strength = this.noteIntensities(b);
                    this.extractFlavors(b).forEach(n => {
                        const at = this.noteLocate(n);
                        const cur = notes.get(n) || { n, count: 0, strength: 0, f: at ? at.f : -1 };
                        cur.count += 1; cur.strength = Math.max(cur.strength, strength[n] || 2);
                        notes.set(n, cur);
                        if (!at) return;
                        counts[at.f] = (counts[at.f] || 0) + 1;
                        if (at.g >= 0) groupCounts[`${at.f}:${at.g}`] = (groupCounts[`${at.f}:${at.g}`] || 0) + 1;
                    });
                });
                return { counts, groupCounts, notes: [...notes.values()].sort((a, b) => b.count - a.count || b.strength - a.strength || a.n.localeCompare(b.n)) };
            },

            // two rings: families inside, groups outside; only what was tasted lights up
            wheelSvgStatic(fc) {
                const cx = 120, cy = 120, ri0 = 34, ri1 = 72, ro0 = 76, ro1 = 112;
                const arc = (r0, r1, a0, a1) => {
                    const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
                    const large = a1 - a0 > Math.PI ? 1 : 0;
                    return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
                };
                const n = NOTE_WHEEL.length, step = 2 * Math.PI / n, start = -Math.PI / 2 - step / 2;
                let out = '';
                NOTE_WHEEL.forEach((fam, i) => {
                    const a0 = start + i * step, a1 = a0 + step, lit = (fc.counts[i] || 0) > 0;
                    out += `<path d="${arc(ri0, ri1, a0, a1)}" fill="${fam.color}" fill-opacity="${lit ? 1 : 0.14}"></path>`;
                    const gs = fam.groups.length;
                    fam.groups.forEach((g, j) => {
                        const b0 = a0 + (j / gs) * step, b1 = a0 + ((j + 1) / gs) * step, glit = (fc.groupCounts[`${i}:${j}`] || 0) > 0;
                        out += `<path d="${arc(ro0, ro1, b0, b1)}" fill="${fam.color}" fill-opacity="${glit ? 0.78 : 0.07}"></path>`;
                    });
                    if (lit) {
                        const mid = (a0 + a1) / 2, r = (ri0 + ri1) / 2;
                        const short = { 'Nutty & cocoa': 'Cocoa', 'Roasted & earthy': 'Roasted', 'Tastes off': 'Off' }[fam.fam] || fam.fam;
                        out += `<text x="${(cx + r * Math.cos(mid)).toFixed(1)}" y="${(cy + r * Math.sin(mid)).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" class="ws-f">${this.esc(short)}</text>`;
                    }
                });
                const total = fc.notes.length;
                out += `<circle cx="${cx}" cy="${cy}" r="${ri0 - 3}" class="ws-center"></circle><text x="${cx}" y="${cy - 4}" text-anchor="middle" class="ws-num">${total}</text><text x="${cx}" y="${cy + 11}" text-anchor="middle" class="ws-cap">${total === 1 ? 'note' : 'notes'}</text>`;
                return `<svg class="wheel-static" viewBox="0 0 240 240" role="img" aria-label="Flavor wheel: ${this.esc(fc.notes.map(x => x.n).join(', ') || 'no notes')}">${out}</svg>`;
            },

            noteChipsHtml(notes, withCounts) {
                return notes.map(x => {
                    const color = x.f >= 0 ? NOTE_WHEEL[x.f].color : '#7D8984';
                    return `<span class="flv-note fam-chip" style="${this.famVars(color)}">${this.esc(x.n)}${withCounts ? (x.count > 1 ? `<em>×${x.count}</em>` : '') : `<span class="flv-dots">${[1, 2, 3].map(k => `<b class="${k <= x.strength ? 'on' : ''}"></b>`).join('')}</span>`}</span>`;
                }).join('');
            },

            bestOtherShot(brew) {
                let best = null;
                this.sessionsLike(brew).forEach(x => {
                    if (String(x.id) === String(brew.id)) return;
                    const r = this.normalizeRating(x.rating); if (r <= 0) return;
                    const br = best ? this.normalizeRating(best.rating) : -1;
                    if (r > br || (r === br && this.isEarlier(best, x))) best = x;
                });
                return best;
            },

            renderFlavorPane(brew) {
                const active = this.cardTab(brew) === 'flavor' ? ' active' : '';
                const tasted = this.tastedKeys(brew);
                const fc = this.flavorCounts([brew]);
                const words = this.describeCup(this.shapeValues(brew), tasted, this.extractFlavors(brew), this.noteIntensities(brew));
                const id = this.esc(brew.id);
                const shape = tasted.length
                    ? `<button type="button" class="flv-shape" onclick="app.openShapeViewer('${app.escJs(id)}', event)" aria-label="Open the 3D flavor shape"><img data-shape-for="${id}" alt=""><span class="flv-spin">Tap to spin</span></button>`
                    : '<div class="flv-empty">No taste sliders were set for this session.</div>';
                const wheel = fc.notes.length
                    ? `<div class="flv-wheel">${this.wheelSvgStatic(fc)}</div><div class="flv-notes">${this.noteChipsHtml(fc.notes, false)}</div>`
                    : '<div class="flv-empty">No tasting notes logged.</div>';
                return `<div class="card-pane pane-block log-wide${active}" data-pane="flavor"><div class="flv">${shape}<div class="flv-side">${wheel}</div></div>${words ? `<div class="flv-words">${this.esc(words)}</div>` : ''}</div>`;
            },

            fillShapeImages(root) {
                if (typeof FlavorShape === 'undefined') return;
                (root || document).querySelectorAll('img[data-shape-for]').forEach(img => {
                    if (img.getAttribute('src')) return;
                    const pane = img.closest('.card-pane');
                    if (pane && !pane.classList.contains('active')) return;
                    const brew = this.brews.get(img.getAttribute('data-shape-for'));
                    if (!brew) return;
                    const best = this.bestOtherShot(brew);
                    const tasted = this.tastedKeys(brew);
                    const url = FlavorShape.snapshot(this.shapeValues(brew), best ? this.shapeValues(best) : null, { width: 320, height: 240, zoom: 1.12, isSet: k => tasted.includes(k), setKey: tasted.join(',') });
                    if (url) img.src = url;
                });
            },

            openShapeViewer(brewId, event) {
                if (event) event.stopPropagation();
                const brew = this.brews.get(String(brewId));
                if (!brew || typeof FlavorShape === 'undefined') return;
                const best = this.bestOtherShot(brew);
                this.viewerValues = this.shapeValues(brew);
                this.viewerGhost = best ? this.shapeValues(best) : null;
                this.viewerTasted = this.tastedKeys(brew);
                if (!this.viewerView) this.viewerView = FlavorShape.createView({ values: () => this.viewerValues, ghost: () => this.viewerGhost, ghostLabel: 'Best shot', isSet: k => (this.viewerTasted || []).includes(k), fullGestures: true });
                const bean = this.beans.get(String(brew.beanId));
                document.getElementById('shape-title').innerText = bean ? this.beanLabel(bean) : 'Flavor shape';
                document.getElementById('shape-sub').innerText = `${this.getBrewOwner(brew)} · ${this.shortDate(brew.date)}${brew.method ? ` · ${brew.method}` : ''}${best ? ` · dashed: best shot (${this.shortDate(best.date)})` : ''}`;
                const host = document.getElementById('shape-host');
                if (typeof host.replaceChildren === 'function') host.replaceChildren(this.viewerView.el);
                const fc = this.flavorCounts([brew]);
                const tasted = this.tastedKeys(brew);
                const rows = TASTE_META.map(([k, label]) => { const v = this.tasteValue(brew, k); return `<div class="sv-row"><span><i style="background:${FlavorShape.COLORS[k]}"></i>${label}</span><b>${v === null ? '–' : `${v} · ${this.esc(this.tasteWord(k, v))}`}</b></div>`; }).join('');
                const words = this.describeCup(this.shapeValues(brew), tasted, this.extractFlavors(brew), this.noteIntensities(brew));
                document.getElementById('shape-detail').innerHTML = `<div class="sv-grid">${rows}</div>${fc.notes.length ? `<div class="sv-wheel">${this.wheelSvgStatic(fc)}<div class="flv-notes">${this.noteChipsHtml(fc.notes, false)}</div></div>` : ''}${words ? `<div class="flv-words">${this.esc(words)}</div>` : ''}`;
                this.openModal('shape-modal');
                this.viewerView.start();
            },

            renderBeanFlavor(brews) {
                const box = document.getElementById('d-flavor');
                if (!box) return;
                const groupKey = this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) : '';
                if (this.beanFlavorFor !== groupKey) { this.beanFlavorFor = groupKey; this.beanFlavorWho = 'all'; }
                const people = [...new Set(brews.map(b => this.getBrewOwner(b)))].sort();
                if (this.beanFlavorWho !== 'all' && !people.includes(this.beanFlavorWho)) this.beanFlavorWho = 'all';
                const pool = this.beanFlavorWho === 'all' ? brews : brews.filter(b => this.getBrewOwner(b) === this.beanFlavorWho);
                const values = {}, tasted = [];
                TASTE_KEYS.forEach(k => {
                    const list = pool.map(b => this.tasteValue(b, k)).filter(v => v !== null);
                    values[k] = list.length ? list.reduce((s, v) => s + v, 0) / list.length : 5;
                    if (list.length) tasted.push(k);
                });
                this.beanFlavorValues = values;
                const mineBest = (() => { let best = null; brews.filter(b => this.getBrewOwner(b) === this.user).forEach(b => { const r = this.normalizeRating(b.rating); if (r <= 0) return; const br = best ? this.normalizeRating(best.rating) : -1; if (r > br) best = b; }); return best; })();
                this.beanFlavorGhost = mineBest ? this.shapeValues(mineBest) : null;
                const fc = this.flavorCounts(pool);
                const chips = people.length > 1 ? `<div class="bf-people">${['all', ...people].map(p => `<button type="button" class="chip-btn" aria-pressed="${this.beanFlavorWho === p}" data-who="${this.esc(p)}" onclick="app.setBeanFlavorWho(this.getAttribute('data-who'))">${p === 'all' ? 'Everyone' : this.esc(p)}</button>`).join('')}</div>` : '';
                const words = this.describeCup(values, tasted, fc.notes.slice(0, 4).map(x => x.n), Object.fromEntries(fc.notes.map(x => [x.n, x.strength])));
                box.innerHTML = `<div class="bf-head"><div><h3>Flavor profile</h3><p>${pool.length} session${pool.length === 1 ? '' : 's'} · ${this.beanFlavorWho === 'all' ? 'everyone' : this.esc(this.beanFlavorWho)}${mineBest ? ' · dashed: your best shot' : ''}</p></div></div>${chips}<div id="bf-shape"></div>${!tasted.length ? '<div class="flv-empty">No taste sliders set on these sessions yet.</div>' : ''}${fc.notes.length ? `<div class="bf-wheel">${this.wheelSvgStatic(fc)}<div class="flv-notes">${this.noteChipsHtml(fc.notes.slice(0, 12), true)}</div></div>` : ''}${words ? `<div class="flv-words">${this.esc(words)}</div>` : ''}`;
                setTimeout(() => this.fillShapeImages(document.getElementById('detail-view')), 0);
                if (typeof FlavorShape !== 'undefined' && tasted.length) {
                    if (!this.beanView) this.beanView = FlavorShape.createView({ values: () => this.beanFlavorValues, ghost: () => this.beanFlavorGhost, ghostLabel: 'Your best' });
                    const bfHost = document.getElementById('bf-shape');
                    if (bfHost && typeof bfHost.replaceChildren === 'function') bfHost.replaceChildren(this.beanView.el);
                    this.beanView.start();
                }
            },

            setBeanFlavorWho(who) {
                this.beanFlavorWho = who || 'all';
                this.renderBeanFlavor(this.detailBrews || []);
            },

            calculateAverageRating(brews) {
                const rated = brews.map(brew => this.normalizeRating(brew.rating)).filter(r => r > 0);
                if (!rated.length) return 0;
                return rated.reduce((sum, r) => sum + r, 0) / rated.length;
            },

            getTopFlavors(brews, count = 3) {
                const counts = {};
                brews.forEach(brew => {
                    this.extractFlavors(brew).forEach(flavor => {
                        counts[flavor] = (counts[flavor] || 0) + 1;
                    });
                });
                return Object.entries(counts)
                    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
                    .slice(0, count)
                    .map(([flavor]) => flavor);
            },

            openDetail(group, brews) {
                if (!this._navKeep && !this.isDetailActive() && !this.roasterViewActive()) this.navStack = [];   // opened from the library or feed
                if (!this._navKeep && this.roasterViewActive()) { const from = this.snapPage(); if (from) { this.navStack = this.navStack || []; this.navStack.push(from); } this.hideRoasterView(); }
                document.getElementById('detail-view').classList.add('active');
                this.setDetailBackLabel();
                this.activeGroup = {
                    meta: group.meta,
                    ids: [...group.ids],
                    users: new Set(group.users)
                };
                this.activeId = group.ids.find(id => {
                    const bean = this.beans.get(id);
                    return bean && bean.user === this.user;
                }) || group.ids[0];
                const heroActions = document.querySelector('.hero-actions');
                const activeBean = this.beans.get(this.activeId);
                heroActions.style.display = (activeBean && activeBean.user === this.user) ? 'flex' : 'none';

                const bean = group.meta;
                document.getElementById('d-name').innerText = bean.name || '';
                const dRoaster = document.getElementById('d-roaster');
                dRoaster.innerHTML = bean.roaster ? `<button type="button" class="ro-link" data-roaster="${this.esc(bean.roaster)}" onclick="app.openRoasterFrom(this, event)">${this.esc(bean.roaster)}<svg class="icon ro-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>` : '';
                document.getElementById('d-variety').innerText = bean.variety || '';
                document.getElementById('d-variety').hidden = !String(bean.variety || '').trim();
                document.getElementById('d-origin').innerText = bean.origin || '-';
                document.getElementById('d-process').innerText = bean.process || '-';
                document.getElementById('d-roast').innerText = bean.roast || '-';
                this.renderDetailExtras(group, brews);

                const overallRating = this.calculateAverageRating(brews);
                const ratedCount = brews.filter(item => this.normalizeRating(item.rating) > 0).length;
                const ratingSummary = document.getElementById('d-rating-summary');
                const starsHtml = this.beanStarsHtml(brews, overallRating, ratedCount);
                ratingSummary.style.display = starsHtml ? 'inline-flex' : 'none';
                ratingSummary.innerHTML = starsHtml;
                this.fitBeanHeader();

                const topFlavors = this.getTopFlavors(brews, 3);
                document.getElementById('d-top-flavors').innerHTML = topFlavors.map(flavor => this.famChip(flavor)).join('');

                this.renderBeanFlavor(brews);
                this.detailBrews = [...brews];
                this.setDetailTab(this.detailTab || 'timeline');

                const masters = [...brews]
                    .filter(brew => brew.isMaster === true || brew.isMaster === 'true')
                    .sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                const masterBox = document.getElementById('d-masters');
                masterBox.innerHTML = '';
                const seenUsers = new Set();
                masters.forEach(master => {
                    const masterOwner = this.getBrewOwner(master);
                    if (seenUsers.has(masterOwner)) return;
                    seenUsers.add(masterOwner);
                    const card = document.createElement('div');
                    card.className = 'master-pill';
                    const profile = this.getMasterProfile(master);
                    const eq = this.resolveEquipmentNames(profile);
                    const notes = String(profile.notes || this.getBrewNotes(master) || '').trim();
                    card.innerHTML = `
                        <div class="master-top">
                            <div style="font-size:0.65rem; color:var(--matcha); font-weight:800; text-transform:uppercase;">${this.esc(masterOwner)}'s Master</div>
                            ${masterOwner === this.user ? `
                                <div class="master-actions">
                                    <button class="btn-clean" onclick="app.openMasterModal('${app.escJs(master.id)}')" title="Edit master profile">
                                        <svg class="icon" style="width:14px;height:14px;"><use href="#i-edit-2"/></svg>
                                    </button>
                                    <button class="btn-clean danger" onclick="app.unpinMaster('${app.escJs(master.id)}')" title="Remove master profile">
                                        <svg class="icon" style="width:14px;height:14px;"><use href="#i-trash-2"/></svg>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        ${this.recipeStripHtml({ ...master, ...profile, method: profile.method || master.method })}
                        ${(() => { const g = [profile.method || master.method || 'Espresso', ...eq]; return `<div class="sc-gear">${g.map(x => this.esc(x)).join('<i></i>')}</div>`; })()}
                        ${notes ? `<div class="feed-note master-note">${this.esc(notes)}</div>` : ''}
                    `;
                    masterBox.appendChild(card);
                });

                const logBox = document.getElementById('d-logs');
                const keyedLogs = this.canPatchDom(logBox);
                const logGroup = this.activeGroup ? this.activeGroup.ids.join(',') : '';
                if (!keyedLogs || logBox.getAttribute('data-keyed') !== logGroup || !this._logHtml) {
                    logBox.innerHTML = '';
                    this._logHtml = new Map();
                    if (keyedLogs) logBox.setAttribute('data-keyed', logGroup);
                }
                const logItems = [];
                [...brews].sort((a, b) => this.toTime(b.date) - this.toTime(a.date)).forEach(log => {
                    const row = document.createElement('div');
                    row.className = 'log-row sc-card sc-log';
                    row.id = `log-${log.id}`;
                    row.setAttribute('data-card-brew', String(log.id));

                    const logOwner = this.getBrewOwner(log);
                    const rating = this.normalizeRating(log.rating);
                    const brewFlavors = this.extractFlavors(log).slice(0, 3);
                    const equipmentNames = this.resolveEquipmentNames(log);
                    const likes = this.normalizeLikeList(log.likes, logOwner);
                    const isLiked = likes.includes(this.user);
                    const comments = Array.isArray(log.comments) ? log.comments : [];
                    const hasComments = comments.length > 0;
                    const unlocks = this.achievementUnlockByBrew.get(String(log.id)) || [];
                    const grind = this.grindNum(log.grind) || 0;
                    const grindDisplay = this.grindText(log.grind) || '-';
                    const noteText = this.getBrewNotes(log);
                    const hasRightContent = (rating > 0) || brewFlavors.length > 0;
                    const socialNote = likes.length
                        ? `<div class="social-like-line">${this.esc(this.formatLikers(likes))}</div>`
                        : '';

                    const rowHtml = this.renderLogCard(log);
                    if (keyedLogs) logItems.push({ key: row.id, html: `<div class="log-row sc-card sc-log" id="${this.esc(row.id)}" data-card-brew="${this.esc(String(log.id))}">${rowHtml}</div>` });
                    else { row.innerHTML = rowHtml; logBox.appendChild(row); }
                });
                if (keyedLogs) this.patchKeyed(logBox, logItems, this._logHtml);
            },

            refreshDetail() {
                const drafts = this.captureDrafts();
                this.refreshingDetail = true;
                try {
                    this.refreshDetailScreen();
                } finally {
                    this.refreshingDetail = false;
                }
                this.restoreDrafts(drafts);
            },

            refreshDetailScreen() {
                if (!this.activeGroup) return;
                const beanIds = this.activeGroup.ids.filter(id => this.beans.has(id));
                if (!beanIds.length) {
                    this.closeDetail();
                    this.activeGroup = null;
                    this.activeId = null;
                    return;
                }
                const beanItems = beanIds.map(id => this.beans.get(id)).filter(Boolean);
                const byTime = [...beanItems].sort((a, b) => this.toTime(b.date) - this.toTime(a.date));
                const latest = byTime[0] || {};
                const pick = (field) => {
                    for (const item of byTime) {
                        const value = String(item[field] || '').trim();
                        if (value) return value;
                    }
                    return '';
                };
                const mergedMeta = {
                    ...latest,
                    roaster: pick('roaster'),
                    name: pick('name'),
                    variety: pick('variety'),
                    origin: pick('origin'),
                    process: pick('process'),
                    roast: pick('roast'),
                    roastDate: pick('roastDate')
                };
                const users = new Set();
                beanItems.forEach(bean => users.add(bean.user));
                const group = { meta: mergedMeta, ids: beanIds, users };
                const relatedBrews = Array.from(this.brews.values()).filter(brew => beanIds.includes(brew.beanId));
                this.openDetail(group, relatedBrews);
            },

            closeDetail() {
                if ((this.navStack || []).length) { this.goBackPage(); return; }
                document.getElementById('detail-view').classList.remove('active');
                this.openCommentId = null;
            },

