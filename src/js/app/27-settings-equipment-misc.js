            openSettings() {
                this.renderThemeControl();
                if (this.paintAvatarSetting) this.paintAvatarSetting();   // v15.1
                const list = document.getElementById('user-list');
                list.innerHTML = '';
                // v14.2: on the new backend you are who you signed in as: your account and Sign out, then the goal switches
                const acct = this.acctOn();
                const label = document.getElementById('user-list-label'); if (label) label.textContent = acct ? 'You' : 'Active User';
                const addRow = document.getElementById('add-user-row'); if (addRow) addRow.style.display = acct ? 'none' : 'flex';
                const sheet = document.getElementById('settings-modal'); if (sheet) sheet.classList.toggle('acct', acct);
                const groups = document.getElementById('settings-acct'); if (groups) groups.innerHTML = '';
                if (acct) {
                    // v15.0: you at the top, then the groups (Privacy & notifications, Community, Your data, About), then
                    // Sign out and Delete account
                    const me = document.createElement('div'); me.innerHTML = this.acctSettingsHtml(); list.appendChild(me.firstElementChild);
                    const priv = this.peoplePrivacyHtml();   // v14.4: a private profile approves its followers
                    if (!priv && !this._privLoading) { this._privLoading = true; this.loadPeople(true).then(() => { this._privLoading = false; if (document.getElementById('settings-modal').classList.contains('active')) this.openSettings(); }).catch(() => { this._privLoading = false; }); }
                    const pushRow = this.pushRowHtml ? this.pushRowHtml() : '';   // v14.5: notifications on this phone
                    if (groups) groups.innerHTML = this.acctToolsHtml(priv, pushRow);
                }
                // v14.6: with accounts, Settings is only yours: the old list of people (and their group goal switches) stays
                // for the Sheet-era app; who shares your goal is your private communities
                const head = document.createElement('div');
                head.className = 'user-head';
                head.innerHTML = '<span>Counts in group goal</span>';
                if (!acct) list.appendChild(head);

                (acct ? [] : this.users).forEach(userName => {
                    const row = document.createElement('div');
                    row.className = 'user-row';
                    const color = this.getUserColor(userName);

                    const selectBtn = document.createElement('button');
                    selectBtn.className = 'btn-outline user-switch';
                    selectBtn.type = 'button';
                    selectBtn.innerText = userName;
                    selectBtn.style.borderColor = `${color}66`;
                    if (userName === this.user) {
                        selectBtn.style.background = color;
                        selectBtn.style.color = 'white';
                    }
                    if (acct) { selectBtn.disabled = true; selectBtn.classList.add('acct-name'); }
                    selectBtn.onclick = () => {
                        if (acct) return;
                        this.user = userName;
                        safeSet('dialed_user', userName);
                        this.applyGearFromCloud();
                        this.openSettings();
                        this.sync();
                    };

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'user-delete';
                    removeBtn.type = 'button';
                    removeBtn.innerText = 'Remove';
                    // people who have logged sessions stay on the list, so Remove only shows when it would work
                    const removable = !acct && this.users.length > 1 && userName !== this.user && !this.hasLoggedData(userName);
                    removeBtn.onclick = () => this.deleteUser(userName);

                    // v13.2: a real switch for "counts in the group goal" (shared with everyone)
                    const goal = document.createElement('button');
                    goal.type = 'button';
                    goal.className = 'goal-sw';
                    goal.setAttribute('role', 'switch');
                    goal.setAttribute('aria-checked', this.goalExcluded(userName) ? 'false' : 'true');
                    goal.setAttribute('aria-label', `${userName} counts in the group goal`);
                    goal.onclick = () => { const next = goal.getAttribute('aria-checked') !== 'true'; goal.setAttribute('aria-checked', next ? 'true' : 'false'); this.setGoalExcluded(userName, !next); };

                    row.classList.toggle('can-remove', removable);
                    row.appendChild(selectBtn);
                    row.appendChild(goal);
                    if (removable) row.appendChild(removeBtn);
                    list.appendChild(row);
                });

                const colorInput = document.getElementById('user-color-input');
                const colorValue = document.getElementById('user-color-value'), swatch = document.getElementById('user-color-swatch');
                const currentColor = this.getUserColor(this.user);
                if (colorInput) colorInput.value = currentColor;
                if (colorValue) colorValue.innerText = currentColor.toUpperCase();
                if (swatch) swatch.style.background = currentColor;

                this.cancelEquipmentEdit();
                this.renderEquipmentList();
                this.closeMobileControls();
                this.openModal('settings-modal');
            },

            addUser() {
                const input = document.getElementById('new-user-input');
                const value = String(input.value || '').trim().replace(/\s+/g, ' ');
                if (!value) return;
                if (!this.validPersonName(value)) { this.showToast('Use a name up to 24 characters.'); return; }
                const exists = this.knownPeople().some(name => name.toLowerCase() === value.toLowerCase());
                if (exists) {
                    this.showToast(`${value} is already here.`);
                    return;
                }
                this.users.push(value);
                safeSet('dialed_users', JSON.stringify(this.users));
                this.setUserColor(value, this.defaultUserColor(value), true);
                if (!this.user) {
                    this.user = value;
                    safeSet('dialed_user', value);
                }
                this.registerPerson(value, { joinedAt: new Date().toISOString() });   // v14.0: on every device, with a post in the feed
                input.value = '';
                this.openSettings();
                this.showToast(`${value} added. They'll show up on everyone's devices.`);
            },

            deleteUser(name) {
                if (this.users.length <= 1) {
                    this.showToast('At least one person is required.');
                    return;
                }
                if (!confirm(`Remove "${name}" from Dialed In? They'll disappear from everyone's devices.`)) return;
                this.users = this.users.filter(userName => userName !== name);
                safeSet('dialed_users', JSON.stringify(this.users));
                if (this.userColors[name]) {
                    delete this.userColors[name];
                    safeSet('dialed_user_colors', JSON.stringify(this.userColors));
                }
                if (this.user === name) {
                    this.user = this.users[0];
                    safeSet('dialed_user', this.user);
                    this.applyGearFromCloud();
                }
                this.unregisterPerson(name);   // v14.0: off every device
                this.openSettings();
            },

            saveEquipment() {
                const idInput = document.getElementById('equipment-edit-id');
                const nameInput = document.getElementById('new-equipment-name');
                const typeInput = document.getElementById('new-equipment-type');
                const id = idInput.value;
                const name = nameInput.value.trim();
                const type = typeInput.value;
                if (!name) {
                    this.showToast('Equipment name is required.');
                    return;
                }

                if (id) {
                    this.equipment = this.equipment.map(eq => eq.id === id ? { ...eq, name, type } : eq);
                    this.showToast('Equipment updated.');
                } else {
                    this.equipment.push({ id: `${Date.now()}`, name, type });
                    this.showToast('Equipment added.');
                }
                safeSet('dialed_equipment', JSON.stringify(this.equipment));
                this.queueGearPush();
                this.cancelEquipmentEdit();
                this.renderEquipmentList();
            },

            cancelEquipmentEdit() {
                document.getElementById('equipment-edit-id').value = '';
                document.getElementById('new-equipment-name').value = '';
                document.getElementById('new-equipment-type').value = 'Machine';
                document.getElementById('equipment-save-btn').innerText = 'Add Equipment';
                document.getElementById('equipment-cancel-btn').style.display = 'none';
            },

            startEquipmentEdit(id) {
                const match = this.equipment.find(eq => eq.id === id);
                if (!match) return;
                document.getElementById('equipment-edit-id').value = match.id;
                document.getElementById('new-equipment-name').value = match.name;
                document.getElementById('new-equipment-type').value = match.type || 'Machine';
                document.getElementById('equipment-save-btn').innerText = 'Save Equipment';
                document.getElementById('equipment-cancel-btn').style.display = 'block';
            },

            deleteEquipment(id) {
                if (!confirm('Remove this equipment?')) return;
                this.equipment = this.equipment.filter(eq => eq.id !== id);
                safeSet('dialed_equipment', JSON.stringify(this.equipment));
                Object.keys(this.lastEquipment).forEach(method => {
                    this.lastEquipment[method] = (this.lastEquipment[method] || []).filter(eqId => eqId !== id);
                });
                safeSet('dialed_last_equipment', JSON.stringify(this.lastEquipment));
                this.queueGearPush();
                this.renderEquipmentList();
                const method = document.getElementById('method-select').value;
                if (method) this.loadEquipmentForMethod(method);
                this.showToast('Equipment removed.');
            },

            // v13.2: someone else's equipment on their profile: see it, not edit it
            renderGearCard(who) {
                const rec = this.gearByUser.get(who);
                const items = rec && rec.items ? this.gearItemsFor(rec.items) : [];
                const body = items.length
                    ? `<div class="equipment-list">${items.map(eq => `<div class="equipment-item"><div class="equipment-info"><div class="equipment-name">${this.esc(eq.name)}</div><div class="equipment-type">${this.esc(eq.type)}</div></div></div>`).join('')}</div>`
                    : `<p class="gear-note">${this.esc(who)} hasn't added any equipment yet.</p>`;
                return `<div class="profile-card gear-locker gear-view"><div class="label">Equipment</div>${body}</div>`;
            },

            // v13.1: move the equipment locker into your profile, or back to its hidden parking spot
            placeGearLocker(target) {
                const gear = this._gearEl || (this._gearEl = document.getElementById('equipment-locker'));
                const park = document.getElementById('gear-park');
                if (!gear || !park) return;
                if (target) { target.appendChild(gear); this.renderEquipmentList(); }
                else if (gear.parentNode !== park) park.appendChild(gear);
                if (!this._gearWatch && typeof MutationObserver === 'function') {
                    const grid = document.getElementById('grid');
                    if (grid) { this._gearWatch = new MutationObserver(() => { if (!gear.isConnected) park.appendChild(gear); }); this._gearWatch.observe(grid, { childList: true }); }
                }
            },

            renderEquipmentList() {
                const list = (this._gearEl && this._gearEl.querySelector('#equipment-list')) || document.getElementById('equipment-list');
                if (!list) return;
                list.innerHTML = '';
                if (!this.equipment.length) {
                    list.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:1rem; font-size:0.85rem;">No equipment added yet</div>';
                    return;
                }

                this.equipment.forEach(eq => {
                    const item = document.createElement('div');
                    item.className = 'equipment-item';

                    const info = document.createElement('div');
                    info.className = 'equipment-info';
                    info.innerHTML = `
                        <div class="equipment-name">${this.esc(eq.name)}</div>
                        <div class="equipment-type">${this.esc(eq.type)}</div>
                    `;

                    const actions = document.createElement('div');
                    actions.className = 'equipment-actions';

                    const editBtn = document.createElement('button');
                    editBtn.className = 'equipment-edit';
                    editBtn.type = 'button';
                    editBtn.innerText = 'Edit';
                    editBtn.onclick = () => this.startEquipmentEdit(eq.id);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'equipment-delete';
                    deleteBtn.type = 'button';
                    deleteBtn.innerText = 'Remove';
                    deleteBtn.onclick = () => this.deleteEquipment(eq.id);

                    actions.appendChild(editBtn);
                    actions.appendChild(deleteBtn);
                    item.appendChild(info);
                    item.appendChild(actions);
                    list.appendChild(item);
                });
            },

            loadEquipmentForMethod(method, selectedOverride = null) {
                const container = document.getElementById('equipment-container');
                const selector = document.getElementById('equipment-selector');
                const wrap = document.getElementById('equipment-selector-wrap');
                const summary = document.getElementById('equipment-summary');
                const toggleBtn = document.getElementById('equipment-toggle-btn');
                if (!method) {
                    container.style.display = 'none';
                    return;
                }

                container.style.display = 'block';
                selector.innerHTML = '';
                if (!this.equipment.length) {
                    if (summary) summary.innerText = 'No equipment saved yet. Add gear in Settings to auto-fill this brew method.';
                    if (wrap) wrap.classList.add('collapsed');
                    if (toggleBtn) toggleBtn.style.display = 'none';
                    return;
                }

                if (toggleBtn) toggleBtn.style.display = 'inline-flex';
                if (summary) summary.innerText = 'Using saved setup for this brew method.';
                const selected = new Set(Array.isArray(selectedOverride) ? selectedOverride : (this.lastEquipment[method] || []));
                const shouldCollapse = window.matchMedia('(max-width: 768px)').matches;
                if (wrap) wrap.classList.toggle('collapsed', shouldCollapse);
                if (toggleBtn) toggleBtn.innerText = shouldCollapse ? 'Switch Equipment' : 'Hide Equipment';

                this.equipment.forEach(eq => {
                    const item = document.createElement('div');
                    item.className = 'equipment-select-item';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'equipment-checkbox';
                    checkbox.value = eq.id;
                    checkbox.checked = selected.has(eq.id);
                    checkbox.addEventListener('change', () => this.updateEquipmentSummary());

                    const label = document.createElement('label');
                    label.className = 'equipment-select-label';
                    label.innerHTML = `<strong>${this.esc(eq.name)}</strong> <span style="color:var(--text-muted); font-size:0.75rem;">(${this.esc(eq.type)})</span>`;

                    item.appendChild(checkbox);
                    item.appendChild(label);
                    item.addEventListener('click', (event) => {
                        if (event.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
                        this.updateEquipmentSummary();
                    });
                    selector.appendChild(item);
                });
                this.updateEquipmentSummary();
            },

            toggleEquipmentPicker() {
                if (!this.equipment.length) {
                    this.showToast('Add equipment in Settings first.');
                    return;
                }
                const wrap = document.getElementById('equipment-selector-wrap');
                const toggleBtn = document.getElementById('equipment-toggle-btn');
                if (!wrap || !toggleBtn) return;
                wrap.classList.toggle('collapsed');
                toggleBtn.innerText = wrap.classList.contains('collapsed') ? 'Switch Equipment' : 'Hide Equipment';
            },

            updateEquipmentSummary() {
                const summary = document.getElementById('equipment-summary');
                if (!summary) return;
                const selected = Array.from(
                    document.querySelectorAll('#equipment-selector .equipment-checkbox:checked')
                ).map(cb => cb.value);
                if (!selected.length) {
                    summary.innerText = 'No equipment selected yet.';
                    return;
                }
                const names = selected.map(id => {
                    const match = this.equipment.find(eq => eq.id === id);
                    return match ? match.name : '';
                }).filter(Boolean);
                summary.innerText = names.length ? `Selected: ${names.join(' • ')}` : 'Selected equipment ready.';
            },

            updateRatingDisplay(value) {
                const display = document.getElementById('rating-display');
                const rIn = document.getElementById('rating-slider');
                if (rIn) { const rv = this.normalizeRating(value); rIn.style.setProperty('--p', (rv / 5).toFixed(4)); rIn.classList.toggle('rated', rv > 0); }
                const rating = this.normalizeRating(value);
                if (!rating) {
                    display.innerText = 'Skip Rating';
                    display.className = 'rating-display unrated';
                    return;
                }
                display.className = 'rating-display';
                display.innerHTML = `
                    <span class="star-meter large" style="--fill:${this.starFill(rating)}%;--whole:${this.starWhole(rating)};--frac:${this.starFrac(rating)}"></span>
                    <span class="rating-score">${this.esc(this.formatRating(rating))}</span>
                `;
            },

            skipRating() {
                document.getElementById('rating-slider').value = 0;
                this.updateRatingDisplay(0);
            },

            exportData(format) {
                const data = {
                    beans: Array.from(this.beans.values()),
                    brews: Array.from(this.brews.values()),
                    users: this.users,
                    userColors: this.userColors,
                    equipment: this.equipment,
                    lastEquipment: this.lastEquipment,
                    exportDate: new Date().toISOString(),
                    activeUser: this.user
                };

                if (format === 'json') {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    this.saveFile(blob, `dialed-in-export-${Date.now()}.json`, 'Dialed In export').then(how => { if (how !== 'cancelled') this.showToast('JSON exported successfully.'); });
                    return;
                }

                const header = [
                    'Date', 'User', 'Bean', 'Method', 'Dose', 'Yield', 'Time',
                    'Rating(/5)', 'Likes', 'Comments', 'Equipment',
                    'Acidity', 'Sweetness', 'Body', 'Finish', 'Complexity', 'Flavors', 'Notes'
                ];
                const rows = [header.map(col => this.csvEscape(col)).join(',')];
                data.brews.forEach(brew => {
                    const bean = this.beans.get(brew.beanId);
                    const beanName = bean ? `${bean.roaster} ${bean.name}` : 'Unknown';
                    const row = [
                        brew.date,
                        this.getBrewOwner(brew),
                        beanName,
                        brew.method,
                        brew.dose,
                        brew.yield,
                        brew.time,
                        this.formatRating(brew.rating),
                        (brew.likes || []).length,
                        (brew.comments || []).length,
                        this.resolveEquipmentNames(brew).join(' | '),
                        brew.acidity,
                        brew.sweetness,
                        brew.body,
                        brew.finish,
                        brew.balance,
                        this.extractFlavors(brew).join(' | '),
                        this.getBrewNotes(brew)
                    ];
                    rows.push(row.map(value => this.csvEscape(value)).join(','));
                });
                const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
                this.saveFile(blob, `dialed-in-export-${Date.now()}.csv`, 'Dialed In export').then(how => { if (how !== 'cancelled') this.showToast('CSV exported successfully.'); });
            },

            calcStats(brews) {
                if (!brews.length) return { a: 5, s: 5, b: 5, f: 5, c: 5 };
                let total = { a: 0, s: 0, b: 0, f: 0, c: 0 };
                brews.forEach(brew => {
                    total.a += this.asNumber(brew.acidity, 5);
                    total.s += this.asNumber(brew.sweetness, 5);
                    total.b += this.asNumber(brew.body, 5);
                    total.f += this.asNumber(brew.finish, 5);
                    total.c += this.asNumber(brew.balance, 5);
                });
                return {
                    a: total.a / brews.length,
                    s: total.s / brews.length,
                    b: total.b / brews.length,
                    f: total.f / brews.length,
                    c: total.c / brews.length
                };
            },

            drawRadar(stats) {
                if (typeof Chart === 'undefined') { setTimeout(() => { if (typeof Chart !== 'undefined' && document.getElementById('radar-chart')) this.drawRadar(stats); }, 400); return; }   // v15.8: the chart library loads after the page now
                const existing = window.myChart;
                if (this.refreshingDetail && existing && existing.data && Array.isArray(existing.data.datasets) &&
                    existing.data.datasets[0] && typeof existing.update === 'function') {
                    existing.data.datasets[0].data = [stats.a, stats.s, stats.b, stats.f, stats.c];
                    existing.update('none');
                    return;
                }
                const ctx = document.getElementById('radar-chart');
                if (window.myChart) window.myChart.destroy();
                window.myChart = new Chart(ctx, {
                    type: 'radar',
                    data: {
                        labels: ['ACID', 'SWEET', 'BODY', 'FINISH', 'COMPLEXITY'],
                        datasets: [{
                            data: [stats.a, stats.s, stats.b, stats.f, stats.c],
                            backgroundColor: 'rgba(88, 106, 88, 0.2)',
                            borderColor: '#586A58',
                            borderWidth: 2,
                            pointRadius: 0
                        }]
                    },
                    options: {
                        scales: {
                            r: {
                                min: 0,
                                max: 10,
                                ticks: { display: false },
                                grid: { color: '#EEE' },
                                pointLabels: {
                                    font: { size: 9, weight: '700' },
                                    color: '#999'
                                }
                            }
                        },
                        plugins: { legend: { display: false } },
                        maintainAspectRatio: false
                    }
                });
            },

            toggleTimer() {
                const t = this.timer;
                if (t.on) {
                    // pause: keep the elapsed time, write it into the form
                    t.acc += (Date.now() - t.start) / 1000;
                    t.on = false;
                    clearInterval(t.int);
                    t.int = null;
                    if (this.teaSteepStop && this.teaSteepStop(t)) { this.paintTimer(); this.renderTasteTip(); return; }   // v17.0: a tea steep (each stop is one steep)
                    const input = document.getElementById('time-input');
                    const prof = this.methodProfile(this.activeMethod);
                    if (input) input.value = prof.hours ? String(Math.max(0.5, Math.round(t.acc / 1800) / 2)) : prof.minutes ? String(Math.max(0.5, Math.round(t.acc / 30) / 2)) : Math.round(t.acc);   // (v17.1: a simmer is timed in minutes; v18.6: a cold brew or cold steep in hours, to the half hour)
                    this.paintTimer();
                    this.renderTasteTip();
                    return;
                }
                if (t.teaNext) { t.acc = 0; t.teaNext = false; }   // v17.0: the next steep times from zero
                t.on = true;
                t.runFrom = t.acc;
                t.start = Date.now();
                clearInterval(t.int);
                t.int = setInterval(() => this.paintTimer(), 100);
                this.paintTimer();
            },

            timerSeconds() {
                const t = this.timer;
                return t.acc + (t.on ? (Date.now() - t.start) / 1000 : 0);
            },

            paintTimer() {
                const total = this.timerSeconds();
                const m = Math.floor(total / 60), s = total - m * 60;
                const display = document.getElementById('timer-display');
                if (display) display.innerHTML = `${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}<small>.${Math.floor((s % 1) * 10)}</small>`;
                const btn = document.getElementById('timer-btn');
                if (btn) btn.innerText = this.timer.on ? 'Pause' : (total > 0 ? 'Resume' : 'Start');
                const hero = document.querySelector('.timer-hero');
                if (hero) { hero.classList.toggle('running', this.timer.on); hero.classList.toggle('paused', !this.timer.on && total > 0); }
            },

            resetTimer() {
                clearInterval(this.timer.int);
                this.timer.int = null;
                this.timer.on = false;
                this.timer.acc = 0;
                this.paintTimer();
            },

            handleCustomFlavorKey(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.addCustomFlavor();
                }
            },

            addCustomFlavor() {
                const input = document.getElementById('custom-flavor-input');
                if (!input) return;
                const flavorName = this.normalizeFlavorName(input.value);
                if (!flavorName) return;

                const options = this.getFlavorOptions().map(item => item.toLowerCase());
                if (options.includes(flavorName.toLowerCase())) {
                    if (!this.selFlavors.includes(flavorName)) this.selFlavors.push(flavorName);
                    this.renderFlavors();
                    input.value = '';
                    return;
                }

                const id = `flavor-${flavorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                this.push({
                    type: 'flavor',
                    id,
                    name: flavorName,
                    user: this.user
                });
                if (!this.selFlavors.includes(flavorName)) this.selFlavors.push(flavorName);
                input.value = '';
                this.renderFlavors();   // v13.4: show it right away
                this.showToast(`${flavorName} added to shared flavor notes.`);
            },

            initFlavors() {
                const container = document.getElementById('flavor-selector');
                container.innerHTML = '';
                this.getFlavorOptions().forEach(flavor => {
                    const chip = document.createElement('div');
                    chip.className = 'flavor-chip';
                    chip.innerText = flavor;
                    chip.onclick = () => {
                        if (this.selFlavors.includes(flavor)) {
                            this.selFlavors = this.selFlavors.filter(item => item !== flavor);
                        } else {
                            this.selFlavors.push(flavor);
                        }
                        this.renderFlavors();
                    };
                    container.appendChild(chip);
                });
            },

            renderFlavors() {
                const selected = this.selFlavors;
                document.querySelectorAll('.flavor-chip').forEach(chip => {
                    chip.classList.toggle('selected', selected.includes(chip.innerText));
                });
                if (document.getElementById('note-wheel')) this.renderNotePicker();
            },
