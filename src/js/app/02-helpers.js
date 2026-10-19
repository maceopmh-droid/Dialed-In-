            getBeanForm() {
                return document.querySelector('#bean-modal form');
            },

            getBrewForm() {
                return document.querySelector('#brew-modal form');
            },

            getMasterForm() {
                return document.querySelector('#master-modal form');
            },

            normalizeHexColor(value) {
                const raw = String(value || '').trim();
                const full = raw.match(/^#([a-fA-F0-9]{6})$/);
                if (full) return `#${full[1].toLowerCase()}`;
                const short = raw.match(/^#([a-fA-F0-9]{3})$/);
                if (short) {
                    const [r, g, b] = short[1].split('');
                    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
                }
                return '';
            },

            defaultUserColor(name) {
                const palette = ['#586A58', '#4F7699', '#9C6A4F', '#7A5D8F', '#4D8B75', '#A15B71', '#6E7D4E', '#8A6B46'];
                const key = String(name || 'user');
                let hash = 0;
                for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash) + key.charCodeAt(i);
                return palette[Math.abs(hash) % palette.length];
            },

            getUserColor(name, fallback = '') {
                const key = String(name || '').trim();
                if (!key) return fallback || '#586A58';
                const saved = this.normalizeHexColor(this.userColors[key]);
                if (saved) return saved;
                return fallback || this.defaultUserColor(key);
            },

            setUserColor(name, color, persist = true) {
                const key = String(name || '').trim();
                const normalized = this.normalizeHexColor(color);
                if (!key || !normalized) return;
                this.userColors[key] = normalized;
                if (persist) safeSet('dialed_user_colors', JSON.stringify(this.userColors));
            },

            saveUserColor(value) {
                const normalized = this.normalizeHexColor(value) || this.defaultUserColor(this.user);
                this.setUserColor(this.user, normalized, true);
                if (this.acctOn && this.acctOn() && this.user) { this.setColorPending(normalized); this.pushGear(); }   // v15.0: onto your profile now, so every device shows it
                const input = document.getElementById('user-color-input');
                const valEl = document.getElementById('user-color-value'), sw = document.getElementById('user-color-swatch');
                if (input) input.value = normalized;
                if (valEl) valEl.innerText = normalized.toUpperCase();
                if (sw) sw.style.background = normalized;
                this.render();
                this.showToast('Feed color updated.');
            },

            shortText(value, max = 72) {
                const text = String(value || '').trim().replace(/\s+/g, ' ');
                if (text.length <= max) return text;
                return `${text.slice(0, max - 1)}...`;
            },

            formatRelativeDate(value) {
                const ts = this.toTime(value);
                if (!ts) return '';
                const diff = Date.now() - ts;
                const min = 60 * 1000;
                const hour = 60 * min;
                const day = 24 * hour;
                if (diff < min) return 'Just now';
                if (diff < hour) return `${Math.floor(diff / min)}m ago`;
                if (diff < day) return `${Math.floor(diff / hour)}h ago`;
                if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
                return new Date(ts).toLocaleDateString();
            },

            feedInitial(name) {
                const text = String(name || '').trim();
                if (!text) return '?';
                return text.charAt(0).toUpperCase();
            },

            esc(value) {
                return String(value ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            },

            toTime(value) {
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return this.localTime(value);   // v13.4: a bare date is that local day
                const t = new Date(value || 0).getTime();
                return Number.isFinite(t) ? t : 0;
            },

            asNumber(value, fallback = 0) {
                const n = Number(value);
                return Number.isFinite(n) ? n : fallback;
            },

            normalizeRating(value) {
                let n = this.asNumber(value, 0);
                if (n <= 0) return 0;
                if (n > 5) n = n / 2;
                n = Math.round(n * 2) / 2;
                if (n < 0) return 0;
                if (n > 5) return 5;
                return n;
            },

            getBrewOwner(brew) {
                if (!brew) return String(this.user || 'Unknown');
                return String(brew.owner || brew.user || this.user || 'Unknown');
            },

            withBrewOwner(payload, brew = null) {
                const owner = String(
                    (brew && (brew.owner || brew.user)) ||
                    (payload && (payload.owner || payload.user)) ||
                    this.user ||
                    'Unknown'
                );
                return { ...payload, user: owner, owner };
            },

            getBrewNotes(brew) {
                if (!brew || typeof brew !== 'object') return '';
                const fields = ['notes', 'note', 'observations', 'observation', 'tastingNotes'];
                for (const field of fields) {
                    const value = String(brew[field] || '').trim();
                    if (value) return value;
                }
                return '';
            },

            getMasterProfile(brew) {
                const raw = (brew && brew.masterProfile && typeof brew.masterProfile === 'object') ? brew.masterProfile : null;
                if (raw) {
                    return {
                        method: String(raw.method || brew.method || ''),
                        grind: this.grindText(raw.grind) || this.grindText(brew.grind),
                        dose: this.asNumber(raw.dose, this.asNumber(brew.dose, 0)),
                        yield: this.asNumber(raw.yield, this.asNumber(brew.yield, 0)),
                        time: this.asNumber(raw.time, this.asNumber(brew.time, 0)),
                        notes: String(raw.notes || this.getBrewNotes(brew)),
                        equipment: Array.isArray(raw.equipment) ? raw.equipment.map(v => String(v)) : (Array.isArray(brew.equipment) ? brew.equipment.map(v => String(v)) : []),
                        equipmentSnapshot: Array.isArray(raw.equipmentSnapshot) ? raw.equipmentSnapshot.map(v => String(v)) : (Array.isArray(brew.equipmentSnapshot) ? brew.equipmentSnapshot.map(v => String(v)) : [])
                    };
                }
                return {
                    method: String((brew && brew.method) || ''),
                    grind: this.grindText(brew && brew.grind),
                    dose: this.asNumber(brew && brew.dose, 0),
                    yield: this.asNumber(brew && brew.yield, 0),
                    time: this.asNumber(brew && brew.time, 0),
                    notes: this.getBrewNotes(brew),
                    equipment: Array.isArray(brew && brew.equipment) ? brew.equipment.map(v => String(v)) : [],
                    equipmentSnapshot: Array.isArray(brew && brew.equipmentSnapshot) ? brew.equipmentSnapshot.map(v => String(v)) : []
                };
            },

            formatRating(value) {
                const n = this.normalizeRating(value);
                if (!n) return '';
                return `${n.toFixed(1).replace(/\.0$/, '')}`;
            },

            starFrac(value) { const n = this.normalizeRating(value); return Math.round((n - Math.floor(n)) * 100) / 100; },   // v14.0
            starWhole(value) { return Math.floor(this.normalizeRating(value)); },

            starFill(value) {
                const n = this.normalizeRating(value);
                return Math.max(0, Math.min(100, (n / 5) * 100));
            },

            csvEscape(value) {
                const text = String(value ?? '');
                return `"${text.replace(/"/g, '""')}"`;
            },

            getFlavorOptions() {
                const custom = Array.from(this.customFlavors.values()).map(item => item.name);
                return [...new Set([...this.defaultFlavors, ...custom])].sort((a, b) => a.localeCompare(b));
            },

            normalizeFlavorName(value) {
                return String(value || '')
                    .replace(/,/g, ' ')   // v13.4: notes are saved as a comma list; a comma would split this one in two
                    .trim()
                    .replace(/\s+/g, ' ')
                    .split(' ')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                    .join(' ');
            },

            syncSearch(value, source) {
                const query = String(value || '');
                const desktop = document.getElementById('search-input');
                const mobile = document.getElementById('search-input-mobile');
                const top = document.getElementById('search-input-top');   // v15.1: the header's search on a phone
                if (source !== 'top' && top) top.value = query;
                if (source !== 'desktop' && desktop) desktop.value = query;
                if (source !== 'mobile' && mobile) mobile.value = query;
                this.render();
            },

            toggleMobileControls(event) {
                if (event) event.stopPropagation();
                document.body.classList.toggle('mobile-controls-open');
                const btn = document.getElementById('mobile-controls-btn');
                if (btn) btn.classList.toggle('active', document.body.classList.contains('mobile-controls-open'));
            },

            closeMobileControls() {
                document.body.classList.remove('mobile-controls-open');
                const btn = document.getElementById('mobile-controls-btn');
                if (btn) btn.classList.remove('active');
            },

            methodIconUse(method) {
                const map = {
                    'Espresso': '#i-method-espresso',
                    'Pour Over': '#i-method-pour-over',
                    'French Press': '#i-method-french-press',
                    'Moka Pot': '#i-method-moka-pot',
                    'Aeropress': '#i-method-aeropress',
                    'Cold Brew': '#i-method-cold-brew'
                };
                return map[method] || '#i-method-espresso';
            },

            formatNamesInline(names, limit) {
                const arr = [...new Set(names.filter(Boolean))];
                if (!arr.length) return '';
                if (arr.length <= limit) return arr.join(', ');
                return `${arr.slice(0, limit).join(', ')} +${arr.length - limit}`;
            },

            normalizeLikeList(values, owner = '') {
                const out = [];
                const seen = new Set();
                const ownerName = String(owner || '').trim();
                (Array.isArray(values) ? values : []).forEach(item => {
                    const name = String(item || '').trim();
                    if (!name || name === ownerName || seen.has(name)) return;
                    seen.add(name);
                    out.push(name);
                });
                return out.sort((a, b) => a.localeCompare(b));
            },

            // ---- v12.3: who a comment replies to and who liked it, saved beside the comments (the backend drops both
            // from the comments themselves)
            commentMetaOf(list) {
                const meta = {};
                (Array.isArray(list) ? list : []).forEach(c => {
                    if (!c || !c.id) return;
                    const e = {};
                    if (c.parentId) e.p = String(c.parentId);
                    if (Array.isArray(c.likes) && c.likes.length) e.l = c.likes.map(String);
                    if (e.p || e.l) meta[String(c.id)] = e;
                });
                return meta;
            },

            withCommentMeta(list, meta) {
                if (!Array.isArray(list) || !meta || typeof meta !== 'object') return list;
                return list.map(c => {
                    const m = c && c.id !== undefined ? meta[String(c.id)] : null;
                    if (!m) return c;
                    return { ...c, parentId: c.parentId || m.p || '', likes: Array.isArray(c.likes) ? c.likes : (Array.isArray(m.l) ? m.l : []) };
                });
            },

            // ---- v12.3: the recipe a session used (preset or saved), shown across the top of the recipe strip
            recipeBandHtml(b) {
                const name = String(b.recipeName || '').trim();
                if (!name) return '';
                const key = name.toLowerCase();
                const preset = BUILTIN_RECIPES.some(r => String(r.name).toLowerCase() === key);
                const saved = !preset && this.myRecipes(this.getBrewOwner(b)).some(r => String(r.name).toLowerCase() === key);
                const kind = preset ? 'Preset' : saved ? 'Saved recipe' : 'Recipe';
                return `<div class="sc-recipe"><svg class="icon"><use href="#i-recipe"/></svg><b>${this.esc(name)}</b><em>${kind}</em></div>`;
            },

            normalizeCommentList(values, baseId = 'item', fallbackTime = '') {
                const out = [];
                (Array.isArray(values) ? values : []).forEach((item, idx) => {
                    const row = item && typeof item === 'object' ? item : {};
                    const text = String(row.text || '').trim();
                    if (!text) return;
                    const likeSeen = new Set();
                    const likes = (Array.isArray(row.likes) ? row.likes : []).map(n => String(n || '').trim()).filter(n => n && !likeSeen.has(n) && likeSeen.add(n));
                    out.push({
                        id: String(row.id || `legacy-${baseId}-${idx}`),
                        user: String(row.user || 'Unknown'),
                        text,
                        timestamp: row.timestamp || fallbackTime || new Date().toISOString(),
                        parentId: row.parentId ? String(row.parentId) : '',
                        likes,
                        ...(row.audience === 'everyone' || row.audience === 'friends' ? { audience: row.audience } : {})   // v14.2: who sees it (new backend only)
                    });
                });
                return out;
            },

