            toggleLike(brewId, event) {
                if (event) event.stopPropagation();
                const brew = this.brews.get(brewId);
                if (!brew) return;
                const owner = this.getBrewOwner(brew);
                if (owner === this.user) {
                    this.showToast('Only other users can like this session.');
                    return;
                }

                const likes = [...new Set((brew.likes || []).map(v => String(v)).filter(Boolean).filter(v => v !== owner))];
                const liked = likes.includes(this.user);
                const updatedLikes = liked ? likes.filter(name => name !== this.user) : [...likes, this.user];
                const updated = this.withBrewOwner({ ...brew, likes: updatedLikes }, brew);
                if (!liked) this.likePopStart('brew', brewId);
                this.push({ type: 'brew', ...updated }, { quiet: true });   // (v15.0: no toast; the heart shows it)
            },

            // v11.10: the like burst. Remember which heart was just liked; its clock starts on the first frame it's on screen
            // (so a slow first draw never skips the start), and a re-draw after that keeps going from the same point
            // (negative animation delay) instead of starting over.
            likePopStart(kind, id) {
                const key = `${kind}:${String(id)}`;
                this._likePop = { key, at: 0, t0: Date.now() };
                const mark = () => { const p = this._likePop; if (p && p.key === key && !p.at) p.at = Date.now(); };
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(mark); else setTimeout(mark, 16);
            },

            likePopElapsed(kind, id) {
                const p = this._likePop;
                if (!p || p.key !== `${kind}:${String(id)}`) return -1;
                const now = Date.now();
                if (!p.at) return now - p.t0 < 1500 ? 0 : -1;
                const t = Math.round(now - p.at);
                return t < 760 ? t : -1;
            },

            likePopClass(kind, id) {
                return this.likePopElapsed(kind, id) >= 0 ? ' pop' : '';
            },

            likePopStyle(kind, id) {
                const t = this.likePopElapsed(kind, id);
                return t > 0 ? ` style="--pop-at:-${t}ms"` : '';
            },

            toggleComments(brewId, event) {
                this.toggleThread('brew', brewId, event);
            },

            handleCommentKey(event, brewId) {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    this.addComment(brewId, event);
                }
            },

            // v16.0: the box you typed in. The same session can be drawn twice (a coffee page stays in the page after you
            // leave it, under the feed), and reading the first box with that id read the hidden, empty one: Post did nothing
            // until the app was reopened. The Post button and Enter both know their own box.
            commentBoxFor(event, ...ids) {
                const t = event && event.target;
                if (t && t.classList && t.classList.contains('comment-input')) return t;
                const row = t && t.closest ? t.closest('.cmt-input-row') : null;
                const own = row && row.querySelector('.comment-input');
                if (own) return own;
                const boxes = [...document.querySelectorAll('input, textarea')], all = ids.flatMap(id => boxes.filter(i => i.id === id));
                const seen = i => i.getClientRects().length > 0;
                return all.find(i => i.value.trim() && seen(i)) || all.find(i => i.value.trim()) || all.find(seen) || all[0] || null;
            },

            addComment(brewId, event) {
                if (event) event.stopPropagation();
                const input = this.commentBoxFor(event, `comment-input-${brewId}`, `feed-comment-input-brew-${brewId}`);
                if (!input) return;
                const text = input.value.trim();
                if (!text) return;
                const brew = this.brews.get(brewId);
                if (!brew) return;

                const comments = Array.isArray(brew.comments) ? [...brew.comments] : [];
                comments.push({
                    id: `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    user: this.user,
                    text,
                    timestamp: new Date().toISOString(),
                    parentId: this.takeReplyParent('brew', brewId),
                    likes: [],
                    ...(this.cmtAudienceFor ? this.cmtAudienceFor('brew', brew) : {})   // v14.2: who sees it (new backend)
                });
                this.openThreads.add(this.threadKey('brew', brewId));

                input.value = '';
                const updated = this.withBrewOwner({ ...brew, comments }, brew);
                this.push({ type: 'brew', ...updated });
                this.openCommentId = brewId;
                // (v15.0: no toast; the comment shows in the thread)
            },

            editComment(brewId, index, event) {
                if (event) event.stopPropagation();
                const brew = this.brews.get(brewId);
                if (!brew) return;
                const comments = Array.isArray(brew.comments) ? [...brew.comments] : [];
                if (index < 0 || index >= comments.length) return;
                const target = comments[index];
                if (target.user !== this.user) {
                    this.showToast('Only the comment author can edit this comment.');
                    return;
                }

                const next = prompt('Edit comment', target.text);
                if (next === null) return;
                const text = next.trim();
                if (!text) {
                    this.showToast('Comment cannot be empty.');
                    return;
                }

                comments[index] = {
                    ...target,
                    text,
                    editedAt: new Date().toISOString()
                };

                const updated = this.withBrewOwner({ ...brew, comments }, brew);
                this.push({ type: 'brew', ...updated });
                this.openCommentId = brewId;
                this.showToast('Comment updated.');
            },

            removeComment(brewId, index, event) {
                if (event) event.stopPropagation();
                const brew = this.brews.get(brewId);
                if (!brew) return;
                const comments = Array.isArray(brew.comments) ? [...brew.comments] : [];
                if (index < 0 || index >= comments.length) return;
                const target = comments[index];
                if (target.user !== this.user && this.getBrewOwner(brew) !== this.user) {
                    this.showToast('Only the comment author or session owner can delete this comment.');
                    return;
                }
                comments.splice(index, 1);
                const kept = comments.filter(c => !(c && c.parentId && String(c.parentId) === String(target.id)));
                comments.length = 0; comments.push(...kept);
                const updated = this.withBrewOwner({ ...brew, comments }, brew);
                this.push({ type: 'brew', ...updated });
                this.openCommentId = brewId;
                this.showToast('Comment deleted.');
            },

            buildBeanPayload(bean, overrides = {}) {
                if (!bean) return null;
                const owner = String(bean.owner || bean.user || this.user || 'Unknown');
                const tea = (overrides.kind ?? bean.kind) === 'tea';   // v17.0: a tea (it says so on every save, so a like never turns it back into a coffee)
                const payload = {
                    type: 'bean',
                    kind: tea ? 'tea' : 'coffee',
                    ...(tea ? { teaType: String((overrides.teaType ?? bean.teaType ?? '')).trim() } : {}),
                    ...(tea && (overrides.blend ?? bean.blend) ? { blend: true } : {}),   // v17.1: your own blend (no brand), and what's in a tea
                    ...(tea ? { ingredients: this.cleanIngredients(overrides.ingredients ?? bean.ingredients) } : {}),
                    id: String(bean.id || overrides.id || `${Date.now()}`),
                    user: owner,
                    owner,
                    date: overrides.date || bean.date || new Date().toISOString(),
                    roaster: String((overrides.roaster ?? bean.roaster ?? '')).trim() || (tea && (overrides.blend ?? bean.blend) ? '' : tea ? 'Unknown Brand' : 'Unknown Roaster'),
                    name: String((overrides.name ?? bean.name ?? '')).trim() || (tea ? 'Untitled Tea' : 'Untitled Bean'),
                    variety: String((overrides.variety ?? bean.variety ?? '')).trim(),
                    origin: String((overrides.origin ?? bean.origin ?? '')).trim(),
                    process: String((overrides.process ?? bean.process ?? '')).trim(),
                    roast: tea ? '' : String((overrides.roast ?? bean.roast ?? 'Light')).trim(),
                    likes: this.normalizeLikeList(overrides.likes ?? bean.likes, owner),
                    comments: this.normalizeCommentList(overrides.comments ?? bean.comments, `bean-${bean.id || overrides.id || ''}`, overrides.date || bean.date || new Date().toISOString()),
                    roastDate: String((overrides.roastDate ?? bean.roastDate ?? '')).trim(),
                    wantToTry: this.normalizeLikeList(overrides.wantToTry ?? bean.wantToTry, owner)
                };
                return payload;
            },

            toggleBeanLike(beanId, event) {
                if (event) event.stopPropagation();
                const bean = this.beans.get(String(beanId || ''));
                if (!bean) return;
                const owner = String(bean.user || bean.owner || 'Unknown');
                if (owner === this.user) {
                    this.showToast('Only other users can like this bean.');
                    return;
                }
                const likes = this.normalizeLikeList(bean.likes, owner);
                const liked = likes.includes(this.user);
                const updatedLikes = liked ? likes.filter(name => name !== this.user) : [...likes, this.user];
                const payload = this.buildBeanPayload(bean, { likes: updatedLikes });
                if (!payload) return;
                if (!liked) this.likePopStart('bean', beanId);
                this.push(payload);
                // (v15.0: no toast; the heart shows it)
            },

            addBeanComment(beanId, event) {
                if (event) event.stopPropagation();
                const bean = this.beans.get(String(beanId || ''));
                if (!bean) return;
                const input = this.commentBoxFor(event, `feed-comment-input-bean-${beanId}`);
                if (!input) return;
                const text = input.value.trim();
                if (!text) return;
                const comments = this.normalizeCommentList(bean.comments, `bean-${beanId}`, bean.date);
                comments.push({
                    id: `bc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    user: this.user,
                    text,
                    timestamp: new Date().toISOString(),
                    parentId: this.takeReplyParent('bean', beanId),
                    likes: [],
                    ...(this.cmtAudienceFor ? this.cmtAudienceFor('bean', bean) : {})   // v14.2: who sees it (new backend)
                });
                this.openThreads.add(this.threadKey('bean', beanId));
                input.value = '';
                const payload = this.buildBeanPayload(bean, { comments });
                if (!payload) return;
                this.push(payload);
                // (v15.0: no toast; the comment shows in the thread)
            },

            editBeanComment(beanId, index, event) {
                if (event) event.stopPropagation();
                const bean = this.beans.get(String(beanId || ''));
                if (!bean) return;
                const comments = this.normalizeCommentList(bean.comments, `bean-${beanId}`, bean.date);
                if (index < 0 || index >= comments.length) return;
                const target = comments[index];
                if (target.user !== this.user) {
                    this.showToast('Only the comment author can edit this comment.');
                    return;
                }
                const next = prompt('Edit comment', target.text);
                if (next === null) return;
                const text = next.trim();
                if (!text) {
                    this.showToast('Comment cannot be empty.');
                    return;
                }
                comments[index] = { ...target, text, editedAt: new Date().toISOString() };
                const payload = this.buildBeanPayload(bean, { comments });
                if (!payload) return;
                this.push(payload);
                this.showToast('Comment updated.');
            },

            removeBeanComment(beanId, index, event) {
                if (event) event.stopPropagation();
                const bean = this.beans.get(String(beanId || ''));
                if (!bean) return;
                const comments = this.normalizeCommentList(bean.comments, `bean-${beanId}`, bean.date);
                if (index < 0 || index >= comments.length) return;
                const target = comments[index];
                const owner = String(bean.user || bean.owner || 'Unknown');
                if (target.user !== this.user && owner !== this.user) {
                    this.showToast('Only the comment author or bean owner can delete this comment.');
                    return;
                }
                comments.splice(index, 1);
                const keptBean = comments.filter(c => !(c.parentId && c.parentId === target.id));
                const payload = this.buildBeanPayload(bean, { comments: keptBean });
                if (!payload) return;
                this.push(payload);
                this.showToast('Comment deleted.');
            },

            showToast(message) {
                const toast = document.getElementById('toast');
                toast.innerText = message;
                toast.classList.add('show');
                clearTimeout(this.toastTimer);
                this.toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
            },

            handleBeanSubmit(event) {
                event.preventDefault();
                const form = event.target;
                const id = form.elements.id.value || `${Date.now()}`;
                const existing = this.beans.get(id);
                const kind = form.elements.kind && form.elements.kind.value === 'tea' ? 'tea' : 'coffee';   // v17.0
                if (existing && existing.user !== this.user) {
                    alert(`Only the owner can edit this ${this.kindOfBean(existing) === 'tea' ? 'tea' : 'coffee'}.`);
                    return;
                }
                const now = new Date().toISOString();
                const baseBean = existing || {
                    id,
                    user: this.user,
                    owner: this.user,
                    date: now,
                    roaster: '',
                    name: '',
                    variety: '',
                    origin: '',
                    process: '',
                    roast: 'Light',
                    likes: [],
                    comments: []
                };
                const payload = this.buildBeanPayload(baseBean, {
                    id,
                    date: existing ? existing.date : now,
                    roaster: form.roaster.value.trim(),
                    name: form.name.value.trim(),
                    variety: form.variety.value.trim(),
                    origin: form.origin.value.trim(),
                    process: form.process.value.trim(),
                    roast: kind === 'tea' ? '' : form.roast.value,
                    roastDate: form.roastDate ? form.roastDate.value : '',
                    kind,
                    teaType: kind === 'tea' && form.elements.teaType ? form.elements.teaType.value : '',
                    blend: kind === 'tea' && form.elements.blend ? form.elements.blend.checked : false,   // v17.1
                    ingredients: kind === 'tea' ? this.cleanIngredients(this.beanIngredients) : []
                });
                if (!payload) return;
                if (!existing && kind !== this.drinkNow()) { this.drink = kind; safeSet('dialed_drink', kind); this.paintDrinkChrome(); }   // (a new tea from coffee mode: you land where it is)
                this.push(payload);
                this.closeModals();
            },

            handleBrewSubmit(event) {
                event.preventDefault();
                const form = event.target;
                const id = form.elements.id.value || `${Date.now()}`;
                const existing = this.brews.get(id);

                if (existing && this.getBrewOwner(existing) !== this.user) {
                    alert('Only the owner can edit this session.');
                    return;
                }

                const selectedEquipment = Array.from(
                    document.querySelectorAll('#equipment-selector .equipment-checkbox:checked')
                ).map(cb => cb.value);
                const method = form.method.value;
                if (this.photoBusy) { this.showToast('The photo is still processing. Try again in a moment.'); return; }
                // v13.4: an edit keeps the session's gear unless you changed it, and doesn't touch your saved setup
                const keepGear = !!existing && this._eqAtOpen !== null && this._eqAtOpen === [...selectedEquipment].sort().join('|') && method === existing.method;
                if (!existing) {
                    this.lastEquipment[method] = selectedEquipment;
                    safeSet('dialed_last_equipment', JSON.stringify(this.lastEquipment));
                    this.queueGearPush();
                }

                const equipmentSnapshot = keepGear ? (Array.isArray(existing.equipmentSnapshot) ? existing.equipmentSnapshot : []) : selectedEquipment.map(eqId => {
                    const match = this.equipment.find(eq => eq.id === eqId);
                    return match ? match.name : '';
                }).filter(Boolean);

                const flavors = this.selFlavors.filter(Boolean).join(',');
                const now = new Date().toISOString();
                const isMaster = document.getElementById('isMasterInput').checked;
                const existingMaster = existing && existing.masterProfile && typeof existing.masterProfile === 'object'
                    ? existing.masterProfile
                    : null;
                const seedMaster = isMaster && !existingMaster ? {
                    method,
                    grind: this.logKind === 'tea' ? '' : this.normalizeGrindInput(form.grind.value),
                    dose: this.asNumber(form.dose.value, 0),
                    yield: this.asNumber(form.yield.value, 0),
                    time: this.asNumber(form.time.value, 0),
                    notes: form.notes.value.trim(),
                    equipment: selectedEquipment,
                    equipmentSnapshot
                } : (isMaster ? existingMaster : null);

                const payload = this.withBrewOwner({
                    type: 'brew',
                    id,
                    beanId: existing ? existing.beanId : this.activeId,
                    date: existing ? existing.date : now,
                    method,
                    grind: this.logKind === 'tea' ? '' : this.normalizeGrindInput(form.grind.value),
                    dose: this.logKind === 'tea' ? this.teaDoseFor(method, form) : this.asNumber(form.dose.value, 0),   // (v17.0: teabags are counted in bags, not weighed; v17.1: a cup of several things weighs what went in)
                    yield: this.asNumber(form.yield.value, 0),
                    time: this.asNumber(form.time.value, 0),
                    acidity: this.asNumber(form.acidity.value, 5),
                    sweetness: this.asNumber(form.sweetness.value, 5),
                    body: this.asNumber(form.body.value, 5),
                    finish: this.asNumber(form.finish.value, 5),
                    balance: this.asNumber(form.balance.value, 5),
                    bitterness: this.asNumber(form.bitterness.value, 5),
                    tasted: TASTE_KEYS.filter(k => this.tasteTouched.has(k)),
                    ...this.collectMethodExtras(form.method.value),
                    flavorNotes: Object.fromEntries(this.selFlavors.filter(Boolean).map(n => [n, this.noteIntensity[n] || 2])),
                    isMaster,
                    masterProfile: seedMaster,
                    notes: form.notes.value.trim(),
                    roastDate: this.logKind === 'tea' ? '' : form.roastDate ? String(form.roastDate.value || '').slice(0, 10) : (existing ? String(existing.roastDate || '') : ''),   // v15.1: the bag's (v17.0: a tea has none)
                    verdict: form.verdict ? form.verdict.value : (existing ? String(existing.verdict || '') : ''),
                    flavors,
                    rating: this.normalizeRating(form.rating.value),
                    photo: this.normalizePhoto(this.draftPhoto),
                    ...(this.acctOn() && this.share ? { audience: this.share.audience, noteAudience: this.share.noteAudience, photoAudience: this.share.photoAudience, helpWanted: Boolean(this.share.helpWanted) } : {}),   // v14.2: who sees it (new backend); v14.5: asking for help
                    equipment: keepGear ? (Array.isArray(existing.equipment) ? existing.equipment : []) : selectedEquipment,
                    equipmentSnapshot,
                    likes: existing ? (existing.likes || []) : [],
                    comments: existing ? (existing.comments || []) : [],
                    ...(seedMaster ? { masterGrind: String(seedMaster.grind || '') } : {})
                }, existing);
                if (existing) {   // fields this form doesn't show (and ones future versions add) stay as they were
                    const managed = new Set([...Object.keys(payload), 'temp', 'brewer', 'inverted', 'heat', 'preheated', 'recipeName', 'timeUnit', 'steeps', 'teabag', 'bags', 'rinse', 'style', 'milk', 'mix', 'actor', 'actorColor', 'eventAt', 'commentMeta']);   // (v17.0: a tea's steeps, teabags, rinse, matcha style and milk too)
                    Object.keys(existing).forEach(k => { if (!managed.has(k) && existing[k] !== undefined) payload[k] = existing[k]; });
                }

                if (this.applyShotForm) this.applyShotForm(payload, id, existing);   // v16.9: a shot from the espresso machine
                this.push(payload);
                this.resetTimer();
                this.closeModals();
            },

            openMasterModal(id) {
                const brew = this.brews.get(id);
                if (!brew) return;
                if (this.getBrewOwner(brew) !== this.user) {
                    this.showToast('Only the owner can edit this master recipe.');
                    return;
                }

                const form = this.getMasterForm();
                const profile = this.getMasterProfile(brew);
                form.elements.id.value = brew.id;
                // v17.0: a tea's master recipe: the tea methods, and no grind
                const tea = this.isTeaBrew(brew), methods = this.methodsFor(tea ? 'tea' : 'coffee');
                form.method.innerHTML = methods.map(m => `<option value="${this.esc(m)}">${this.esc(this.methodLabel(m))}</option>`).join('');
                form.method.value = methods.includes(profile.method) ? profile.method : methods.includes(brew.method) ? brew.method : methods[0];
                const gf = document.getElementById('master-grind-field'), row = document.getElementById('master-row-1');
                if (gf) gf.style.display = tea ? 'none' : '';
                if (row) row.style.gridTemplateColumns = tea ? '1fr' : '1fr 1fr';
                form.grind.required = !tea;
                this.masterLabels(form.method.value);
                form.grind.value = profile.grind ?? '';
                form.dose.value = profile.dose ?? '';
                form.yield.value = profile.yield ?? '';
                form.time.value = profile.time ?? '';
                form.notes.value = profile.notes || '';
                this.renderMasterEquipmentSelector(profile.equipment || []);
                this.openModal('master-modal');
            },

            renderMasterEquipmentSelector(selectedIds = []) {
                const box = document.getElementById('master-equipment-selector');
                const empty = document.getElementById('master-equipment-empty');
                if (!box || !empty) return;
                box.innerHTML = '';

                if (!this.equipment.length) {
                    empty.style.display = 'block';
                    return;
                }
                empty.style.display = 'none';

                const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(v => String(v)));
                this.equipment.forEach(eq => {
                    const item = document.createElement('div');
                    item.className = 'equipment-select-item';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'equipment-checkbox master-equipment-checkbox';
                    checkbox.value = eq.id;
                    checkbox.checked = selected.has(eq.id);

                    const label = document.createElement('label');
                    label.className = 'equipment-select-label';
                    label.innerHTML = `<strong>${this.esc(eq.name)}</strong> <span style="color:#999; font-size:0.75rem;">(${this.esc(eq.type)})</span>`;

                    item.appendChild(checkbox);
                    item.appendChild(label);
                    item.addEventListener('click', (evt) => {
                        if (evt.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
                    });
                    box.appendChild(item);
                });
            },

            handleMasterSubmit(event) {
                event.preventDefault();
                const form = event.target;
                const id = form.elements.id.value;
                const brew = this.brews.get(id);
                if (!brew) return;
                if (this.getBrewOwner(brew) !== this.user) {
                    this.showToast('Only the owner can save this master recipe.');
                    return;
                }

                const selectedEquipment = Array.from(
                    document.querySelectorAll('#master-equipment-selector .master-equipment-checkbox:checked')
                ).map(cb => cb.value);
                const equipmentSnapshot = selectedEquipment.map(eqId => {
                    const match = this.equipment.find(eq => eq.id === eqId);
                    return match ? match.name : '';
                }).filter(Boolean);

                const masterProfile = {
                    method: form.method.value,
                    grind: this.isTeaBrew(brew) ? '' : this.normalizeGrindInput(form.grind.value),
                    dose: this.asNumber(form.dose.value, 0),
                    yield: this.asNumber(form.yield.value, 0),
                    time: this.asNumber(form.time.value, 0),
                    notes: form.notes.value.trim(),
                    equipment: selectedEquipment,
                    equipmentSnapshot
                };

                const updated = this.withBrewOwner({
                    ...brew,
                    isMaster: true,
                    masterProfile,
                    masterGrind: String(masterProfile.grind || '')
                }, brew);
                this.push({ type: 'brew', ...updated });
                this.closeModals();
                this.showToast('Master recipe saved.');
            },

            unpinMaster(id) {
                const brew = this.brews.get(id);
                if (!brew) return;
                if (this.getBrewOwner(brew) !== this.user) {
                    this.showToast('Only the owner can remove this master recipe.');
                    return;
                }
                if (!confirm('Remove this master recipe? The session will stay in history.')) return;
                const updated = this.withBrewOwner({
                    ...brew,
                    isMaster: false,
                    masterProfile: null
                }, brew);
                this.push({ type: 'brew', ...updated });
                this.showToast('Master recipe removed.');
            },

            editBean() {
                const bean = this.beans.get(this.activeId);
                if (!bean) return;
                const kind = this.kindOfBean(bean);
                if (bean.user !== this.user) {
                    alert(`Only the owner can edit this ${kind}.`);
                    return;
                }

                const form = this.getBeanForm();
                form.elements.id.value = bean.id;
                if (form.elements.blend) form.elements.blend.checked = !!bean.blend;   // v17.1
                this.beanIngredients = this.cleanIngredients(bean.ingredients);
                this.setBeanKind(kind, true);   // v17.0
                if (form.elements.teaType) form.elements.teaType.value = TEA_TYPES.includes(bean.teaType) ? bean.teaType : '';
                form.roaster.value = bean.roaster || '';
                if (this.fillRoasterSuggestions) this.fillRoasterSuggestions(kind);   // v13.4
                form.name.value = bean.name || '';
                form.variety.value = bean.variety || '';
                form.origin.value = bean.origin || '';
                form.process.value = bean.process || '';
                form.roast.value = bean.roast || 'Light';
                if (form.roastDate) form.roastDate.value = bean.roastDate || '';
                document.getElementById('bean-modal-title').innerText = kind === 'tea' ? 'Edit Tea' : 'Edit Coffee';
                this.openModal('bean-modal');
            },

            editBrew(id) {
                const brew = this.brews.get(id);
                if (!brew) return;
                if (this.getBrewOwner(brew) !== this.user) {
                    alert('Only the owner can edit this session.');
                    return;
                }

                const form = this.getBrewForm();
                this._shotForm = null; if (this.clearShotLogHead) this.clearShotLogHead();   // v16.9
                if (this.applyLogKind) this.applyLogKind(this.kindOfBrew(brew), brew.method);   // v17.0
                this.recipeTyped = new Set(['dose', 'yield']); this._brewFormGen = (this._brewFormGen || 0) + 1;   // an old session's numbers are measurements
                form.elements.id.value = brew.id;
                form.method.value = brew.method || '';
                form.grind.value = brew.grind ?? '';
                form.dose.value = brew.dose ?? '';
                form.yield.value = brew.yield ?? '';
                form.time.value = brew.time ?? '';
                form.acidity.value = this.asNumber(brew.acidity, 5);
                form.sweetness.value = this.asNumber(brew.sweetness, 5);
                form.body.value = this.asNumber(brew.body, 5);
                form.finish.value = this.asNumber(brew.finish, 5);
                form.balance.value = this.asNumber(brew.balance, 5);
                document.getElementById('isMasterInput').checked = (brew.isMaster === true || brew.isMaster === 'true');
                form.notes.value = this.getBrewNotes(brew);
                if (form.roastDate) { form.roastDate.value = String(brew.roastDate || '').slice(0, 10); this._roastWhen = brew.date; this.paintRoastDays(brew.date); }   // v15.1
                const verdictInput = document.getElementById('verdict-input');
                if (verdictInput) verdictInput.value = brew.verdict || '';
                this.renderVerdict();
                this.updateNextShotHint();
                this.selFlavors = this.extractFlavors(brew);
                this.resetTasteForm(brew);
                this.methodExtras = this.extrasFrom(brew); this.recipeName = brew.recipeName || ''; this.recipeId = ''; this.recipeSteps = null;
                this.applyMethodProfile(brew.method);
                this.bindTasteSliders();
                this.renderTasteSection();
                this.renderNotePicker();
                form.rating.value = this.normalizeRating(brew.rating);
                this.updateRatingDisplay(form.rating.value);
                this.draftPhoto = this.normalizePhoto(brew.photo);
                this.shareOpen(brew);   // v14.2
                this.renderDraftPhoto();
                this.loadEquipmentForMethod(brew.method, brew.equipment || []);
                this._eqAtOpen = Array.from(document.querySelectorAll('#equipment-selector .equipment-checkbox:checked')).map(cb => cb.value).sort().join('|');
                document.getElementById('brew-modal-title').innerText = 'Edit Session';
                this.openModal('brew-modal');
            },

            deleteBean() {
                const bean = this.beans.get(this.activeId);
                if (!bean) return;
                if (bean.user !== this.user) {
                    alert('Only the owner can delete this coffee.');
                    return;
                }
                const others = [...new Set([...this.brews.values()].filter(b => String(b.beanId) === String(bean.id) && this.getBrewOwner(b) !== this.user).map(b => this.getBrewOwner(b)))];
                if (others.length) {   // v13.4: deleting it would delete their sessions too
                    const who = others.length <= 2 ? others.join(' and ') : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`;
                    alert(`${who} ${others.length === 1 ? 'has' : 'have'} sessions on this coffee, so it can't be deleted. Deleting it would delete their sessions too.`);
                    return;
                }
                if (confirm('Permanently remove coffee and all its sessions?')) {
                    this.push({ type: 'delete', targetType: 'bean', id: bean.id, user: this.user });
                    this.closeDetail();
                }
            },

            delete(type, id) {
                if (type === 'brew') {
                    const brew = this.brews.get(id);
                    if (!brew) return;
                    if (this.getBrewOwner(brew) !== this.user) {
                        alert('Only the owner can delete this session.');
                        return;
                    }
                }
                if (confirm(type === 'brew' ? 'Remove session?' : 'Remove item?')) {
                    this.push({ type: 'delete', targetType: type, id, user: this.user });
                    if (this.openCommentId === id) this.openCommentId = null;
                }
            },

            openBeanModal(kind) {
                const form = this.getBeanForm();
                form.reset();
                form.elements.id.value = '';
                this.beanIngredients = [];   // v17.1
                if (form.roaster) form.roaster.disabled = false;
                this.setBeanKind(kind === 'tea' || kind === 'coffee' ? kind : this.drinkNow());   // v17.0: starts on what's on screen
                if (this.bindCoffeeSuggest) { this.bindCoffeeSuggest(); const box = form.querySelector('.cs-list'); if (box) box.hidden = true; }   // v15.1
                this.openModal('bean-modal');
            },

            openBrewModal(prefill = null) {
                if (!this.activeId) {
                    this.showToast('Open a coffee first to log a session.');
                    return;
                }
                if (this.nlTint) this.nlTint('#brew-modal .modal-card', this.famOfCoffee(this.beans.get(this.activeId)));   // v17.2: the coffee's colors (the New look)
                const form = this.getBrewForm();
                form.reset();
                this.recipeTyped = new Set(); this._brewFormGen = (this._brewFormGen || 0) + 1;
                form.elements.id.value = '';
                this._eqAtOpen = null; this._shotForm = null; if (this.clearShotLogHead) this.clearShotLogHead();
                this.selFlavors = [];
                this.resetTasteForm(null);
                this.methodExtras = {}; this.recipeId = ''; this.recipeName = ''; this.recipeSteps = null; this.stepsOpen = false; this.mixOpen = false;
                if (this.applyLogKind) this.applyLogKind(this.logKindFor(null));   // v17.0: a tea's Log (its methods, no grind)
                if (!this.timer.on) this.resetTimer(); else this.paintTimer();
                form.rating.value = 0;
                this.updateRatingDisplay(0);
                this.draftPhoto = null;
                this.shareOpen(null);   // v14.2
                this.renderDraftPhoto();
                document.getElementById('brew-modal-title').innerText = 'Log a session';
                const verdictReset = document.getElementById('verdict-input');
                if (verdictReset) verdictReset.value = '';
                this.renderVerdict();
                document.getElementById('equipment-container').style.display = 'none';
                document.getElementById('equipment-selector-wrap').classList.add('collapsed');
                document.getElementById('equipment-toggle-btn').innerText = 'Switch Equipment';
                document.getElementById('equipment-summary').innerText = 'Using saved setup for this brew method.';

                if (prefill && typeof prefill === 'object') {
                    if (prefill.method) {
                        form.method.value = prefill.method;
                        this.loadEquipmentForMethod(prefill.method, prefill.equipment || []);
                    }
                    form.grind.value = prefill.grind ?? '';
                    form.dose.value = prefill.dose ?? '';
                    form.yield.value = prefill.yield ?? '';
                    form.time.value = prefill.time ?? '';
                    form.acidity.value = this.asNumber(prefill.acidity, 5);
                    form.sweetness.value = this.asNumber(prefill.sweetness, 5);
                    form.body.value = this.asNumber(prefill.body, 5);
                    form.finish.value = this.asNumber(prefill.finish, 5);
                    form.balance.value = this.asNumber(prefill.balance, 5);
                    document.getElementById('isMasterInput').checked = Boolean(prefill.isMaster);
                    form.notes.value = prefill.notes || '';
                    this.selFlavors = Array.isArray(prefill.flavors) ? [...prefill.flavors] : this.extractFlavors(prefill);
                    this.resetTasteForm(prefill);
                    this.methodExtras = this.extrasFrom(prefill); this.recipeName = prefill.recipeName || ''; this.recipeId = '';
                    this.draftPhoto = this.normalizePhoto(prefill.photo);
                    this.renderDraftPhoto();
                }

                if (form.roastDate) form.roastDate.value = (prefill && prefill.roastDate && (!prefill.owner || prefill.owner === this.user || prefill.user === this.user)) ? String(prefill.roastDate).slice(0, 10) : this.bagRoastDate();   // v15.1: your bag's, from your last session
                if (this.logKind === 'tea') {   // v17.0: a tea has no roast date; it starts on its usual method
                    if (form.roastDate) form.roastDate.value = '';
                    if (!form.method.value) { form.method.value = this.defaultTeaMethod(); this.loadEquipmentForMethod(form.method.value); }
                    if (!prefill) this.methodExtras = this.teaCarry();   // teabag or loose, rinse, matcha style: as your last cup of this tea
                }
                this._roastWhen = null; this.paintRoastDays();
                this.openModal('brew-modal');
                this.applyMethodProfile(this.getBrewForm() && this.getBrewForm().method ? this.getBrewForm().method.value : '');
                this.bindTasteSliders();
                this.renderTasteSection();
                this.renderNotePicker();
            },

            openModal(id) {
                document.getElementById(id).classList.add('active');
                if (id === 'brew-modal') { this._brewSnap = undefined; setTimeout(() => { this._brewSnap = this.brewFormSnap(); }, 0); }
            },

            closeModals() {
                document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
                this.closePhotoSourcePicker();
                clearInterval(this.guideTick);
            },

