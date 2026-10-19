            // ---- weekly rhythm: welcome back after a break ----
            renderWelcomeBack() {
                if (!this.user) return '';
                const mine = this.brewsOf(this.user).filter(b => this.toTime(b.date) > 0);
                if (!mine.length) return '';
                const lastT = Math.max(...mine.map(b => this.toTime(b.date)));
                if (Date.now() - lastT < 14 * 864e5) return '';
                if (safeGet('dialed_welcome_dismissed') === String(lastT)) return '';
                const sessions = new Map();
                const beansAdded = new Map();
                this.brews.forEach(b => {
                    const owner = this.getBrewOwner(b);
                    if (owner === this.user || this.toTime(b.date) <= lastT) return;
                    sessions.set(owner, (sessions.get(owner) || 0) + 1);
                });
                this.beans.forEach(b => {
                    if (!b.user || b.user === this.user || this.toTime(b.date) <= lastT) return;
                    beansAdded.set(b.user, (beansAdded.get(b.user) || 0) + 1);
                });
                const names = [...new Set([...sessions.keys(), ...beansAdded.keys()])].sort();
                const parts = names.map(name => {
                    const bits = [];
                    if (sessions.get(name)) bits.push(`logged ${sessions.get(name)} session${sessions.get(name) === 1 ? '' : 's'}`);
                    if (beansAdded.get(name)) bits.push(`added ${beansAdded.get(name)} bean${beansAdded.get(name) === 1 ? '' : 's'}`);
                    return `${name} ${bits.join(' and ')}`;
                });
                const days = Math.round((Date.now() - lastT) / 864e5);
                return `<div class="welcome-card"><div><div class="welcome-title">Welcome back, ${this.esc(this.user)}</div><div class="welcome-text">It's been ${days} days since your last session. ${parts.length ? `Since then: ${this.esc(parts.join('; '))}.` : 'Things were quiet here too.'}</div></div><button type="button" class="btn-clean" onclick="app.dismissWelcome(${lastT})" title="Dismiss"><svg class="icon" style="width:14px;height:14px;"><use href="#i-x"/></svg></button></div>`;
            },

            dismissWelcome(lastT) {
                safeSet('dialed_welcome_dismissed', String(lastT));
                this.render();
            },

            // ---- gear that follows you (synced through the sheet as 'gear' events) ----
            gearKeep() {
                const mine = this.gearByUser.get(String(this.user || ''));
                if (!mine) return {};
                const { actor, actorColor, eventAt, date, type, id, user, owner, ...rest } = mine;
                return rest;
            },

            gearItemsFor(list) {
                return (Array.isArray(list) ? list : []).map(i => ({ ...(i && typeof i === 'object' ? i : {}), id: String(i && i.id || ''), name: String(i && i.name || '').trim(), type: String(i && i.type || 'Other') })).filter(i => i.id && i.name);
            },

            applyGearFromCloud() {
                if (!this.user || this.gearPushPending) return;   // v13.4: an equipment change is about to upload
                const mine = this.gearByUser.get(this.user);
                if (mine) {
                    const items = this.gearItemsFor(mine.items);
                    const last = (mine.lastByMethod && typeof mine.lastByMethod === 'object') ? JSON.parse(JSON.stringify(mine.lastByMethod)) : {};
                    if (JSON.stringify(items) !== JSON.stringify(this.equipment)) {
                        this.equipment = items;
                        safeSet('dialed_equipment', JSON.stringify(items));
                    }
                    if (JSON.stringify(last) !== JSON.stringify(this.lastEquipment)) {
                        this.lastEquipment = last;
                        safeSet('dialed_last_equipment', JSON.stringify(last));
                    }
                    this.gearShownFor = this.user;
                    // This device now holds cloud gear, so it never uploads its list as someone else's.
                    if (!safeGet('dialed_gear_migrated')) safeSet('dialed_gear_migrated', 'cloud');
                    return;
                }
                if (!this.syncedOnce) return;
                const migratedFor = safeGet('dialed_gear_migrated');
                if (!migratedFor) {
                    // First sync after the update: this device's list becomes the active user's synced gear, once.
                    safeSet('dialed_gear_migrated', this.user);
                    this.gearShownFor = this.user;
                    this.gearRetryDone = true;
                    if (this.equipment.length || Object.keys(this.lastEquipment).length) setTimeout(() => this.pushGear(), 0);
                    return;
                }
                if (migratedFor === this.user && !this.gearRetryDone && (this.equipment.length || Object.keys(this.lastEquipment).length)) {
                    // The first upload never landed (e.g. the old script was still live): try again once per app open.
                    this.gearRetryDone = true;
                    this.gearShownFor = this.user;
                    setTimeout(() => this.pushGear(), 0);
                    return;
                }
                if (this.gearShownFor && this.gearShownFor !== this.user) {
                    // Switched to someone with no saved gear: don't show the previous person's list.
                    this.equipment = [];
                    this.lastEquipment = {};
                    safeSet('dialed_equipment', '[]');
                    safeSet('dialed_last_equipment', '{}');
                }
                this.gearShownFor = this.user;
            },

            pushGear() {
                if (!this.user) return;
                this.gearShownFor = this.user;
                this.push({
                    ...this.gearKeep(),
                    type: 'gear',
                    id: `gear-${this.user}`,
                    user: this.user,
                    owner: this.user,
                    items: this.gearItemsFor(this.equipment),
                    lastByMethod: this.lastEquipment || {},
                    recipes: this.myRecipes(),
                    ...this.roasterCarry()
                });
            },

            queueGearPush() {
                clearTimeout(this.gearPushTimer);
                this.gearPushPending = true;
                this.gearPushTimer = setTimeout(() => {
                    this.gearPushPending = false;
                    const mine = this.gearByUser.get(this.user);
                    const same = mine &&
                        JSON.stringify(this.gearItemsFor(mine.items)) === JSON.stringify(this.gearItemsFor(this.equipment)) &&
                        JSON.stringify(mine.lastByMethod || {}) === JSON.stringify(this.lastEquipment || {});
                    if (!same) this.pushGear();
                }, 1500);
            },

            // ---- exploration achievements ----
            trackExploration(stats, event) {
                const bean = this.beans.get(String(event.beanId));
                if (!bean) return;
                this.originList(bean.origin).forEach(o => stats.originSet.add(o.toLowerCase()));
                if (this.coffeeContinent && stats.continentSet) this.originList(bean.origin).forEach(o => { const c = this.coffeeContinent(o); if (c) stats.continentSet.add(c); });   // v15.1
                const process = this.normalizeTag(bean.process);
                if (process) stats.processSet.add(process.toLowerCase());
                const roast = String(bean.roast || '').trim();
                if (roast) stats.roastSet.add(roast.toLowerCase());
                const roaster = this.normalizeTag(bean.roaster);
                if (!roaster) return;
                const key = roaster.toLowerCase();
                stats.roasterSet.add(key);
                const t = this.toTime(event.date);
                if (!t) return;
                stats.roasterLog.push({ t, key });
                const windowMs = 30 * 864e5;
                const ends = [t, ...stats.roasterLog.filter(x => x.t > t && x.t <= t + windowMs).map(x => x.t)];
                ends.forEach(end => {
                    const keys = new Set(stats.roasterLog.filter(x => x.t <= end && x.t >= end - windowMs).map(x => x.key));
                    stats.samplerMax = Math.max(stats.samplerMax, keys.size);
                });
            },

            renderAchievementCard(def, stats, levels) {
                const value = Number(def.metric(stats) || 0);
                const level = Number(levels[def.key] || 0);
                const max = def.thresholds.length;
                const done = level >= max;
                const next = done ? null : def.thresholds[level];
                const prev = level > 0 ? def.thresholds[level - 1] : 0;
                const progress = done ? 100 : Math.max(0, Math.min(100, ((value - prev) / Math.max(1, next - prev)) * 100));
                const pips = max > 1 ? `<div class="ach-pips">${def.thresholds.map((t, i) => `<span class="ach-pip${i < level ? ' on' : ''}"></span>`).join('')}</div>` : '';
                const levelText = max > 1 ? (done ? `Level ${max} · Complete` : `Level ${level} of ${max}`) : (done ? 'Unlocked' : 'Locked');
                const right = done ? 'Complete' : `Next: ${def.format(next)}`;
                let hint = '';
                const listHint = (all, usedRaw) => {
                    const used = new Set([...(usedRaw instanceof Set ? usedRaw : new Set(Array.isArray(usedRaw) ? usedRaw : []))].map(v => String(v).toLowerCase()));
                    const have = all.filter(x => used.has(x.toLowerCase()));
                    const missing = all.filter(x => !used.has(x.toLowerCase()));
                    return `<div class="achievement-hint">${this.esc(have.length ? `Done: ${have.join(' · ')}` : 'None yet')}${missing.length ? `<br>${this.esc(`To go: ${missing.join(' · ')}`)}` : ''}</div>`;
                };
                if (def.key === 'brew_master') hint = listHint(['Espresso', 'Pour Over', 'French Press', 'Moka Pot', 'AeroPress', 'Cold Brew'], stats.methodSet);
                if (def.key === 'roast_spectrum') hint = listHint(['Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark'], stats.roastSet);
                return `<div class="ach-card${done ? ' complete' : ''}"><div class="ach-top"><div class="ach-name">${this.esc(def.title)}</div><div class="ach-level">${levelText}</div></div><div class="ach-desc">${this.esc(def.desc || '')}</div>${pips}<div class="achievement-track"><div class="achievement-fill" style="width:${progress}%;"></div></div><div class="achievement-meta"><span>${this.esc(def.format(value))}</span><span>${this.esc(right)}</span></div>${hint}</div>`;
            },

