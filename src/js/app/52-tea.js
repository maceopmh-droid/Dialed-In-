            // ===================== v17.0: tea =====================
            // Coffee is still the main thing; tea is a real option next to it. The Coffees title at the top opens a menu
            // (Coffees / Teas). In tea mode the bottom bar's first tab is Teas (a teabag), Roasters is Brands (tea
            // companies, never called roasters), and the shelf, search and filters show teas. The mode is remembered on
            // this phone until it's switched back. Feed and Profile show everything, each card in its own words.
            drinkNow() {
                if (this.drink !== 'tea' && this.drink !== 'coffee') this.drink = safeGet('dialed_drink') === 'tea' ? 'tea' : 'coffee';
                return this.drink;
            },
            teaMode() { return this.drinkNow() === 'tea'; },
            setDrink(kind) {
                const next = kind === 'tea' ? 'tea' : 'coffee';
                this.closeDrinkMenu();
                if (next === this.drinkNow()) return;
                this.drink = next;
                safeSet('dialed_drink', next);
                this.currentMethodFilter = 'all';   // (a coffee method filter means nothing on teas, and back)
                this.roasterFilter = '';
                this._roasterCache = null;
                if (this.haptic) this.haptic('tick');
                this.paintDrinkChrome();
                if (this.tab !== 'my' && this.tab !== 'roasters') { this.setTab('my'); return; }
                this.render();
                const main = document.getElementById('main-content');
                if (main) main.scrollTop = 0;
            },

            // ---- words: the same screens say coffee or tea
            drinkWords(kind) {
                return kind === 'tea'
                    ? { item: 'tea', items: 'teas', Item: 'Tea', Items: 'Teas', company: 'brand', companies: 'brands', Company: 'Brand', Companies: 'Brands', cup: 'cup', session: 'steep', icon: '#i-teabag' }
                    : { item: 'coffee', items: 'coffees', Item: 'Coffee', Items: 'Coffees', company: 'roaster', companies: 'roasters', Company: 'Roaster', Companies: 'Roasters', cup: 'cup', session: 'shot', icon: '#i-bean' };
            },
            isTeaBean(b) { return Boolean(b && b.kind === 'tea'); },
            kindOfBean(b) { return this.isTeaBean(b) ? 'tea' : 'coffee'; },
            isTeaMethod(m) { return TEA_METHODS.includes(String(m || '')); },
            isTeaBrew(brew) {
                if (!brew) return false;
                if (this.isTeaMethod(brew.method)) return true;
                return this.isTeaBean(this.beans && this.beans.get(String(brew.beanId)));
            },
            kindOfBrew(brew) { return this.isTeaBrew(brew) ? 'tea' : 'coffee'; },
            methodsFor(kind) { return kind === 'tea' ? TEA_METHODS : COFFEE_METHODS; },
            methodLabel(m) { return m === 'Aeropress' ? 'AeroPress' : String(m || ''); },
            tasteMetaFor(kind) { return kind === 'tea' ? TEA_TASTE_META : TASTE_META; },
            tasteLabel(k, kind) { const m = this.tasteMetaFor(kind).find(x => x[0] === k); return m ? m[1] : k; },
            wheelFor(kind) { return kind === 'tea' ? TEA_WHEEL : NOTE_WHEEL; },
            teaTypeInfo(t) { return TEA_TYPE_INFO[t] || null; },
            // a brand's page: how its teas split by type (each tea once), and a line in place of a roaster's house style
            teaTypeCounts(r) {
                const out = {};
                (r && r.coffees || []).forEach(c => {
                    const ids = c.beanIds && c.beanIds.length ? c.beanIds : [c.beanId];
                    const t = ids.map(id => (this.beans.get(String(id)) || {}).teaType).find(Boolean);
                    if (t && TEA_TYPE_INFO[t]) out[t.toUpperCase()] = (out[t.toUpperCase()] || 0) + 1;
                });
                return out;
            },
            teaBrandStyle(r) {
                const and = l => l.length < 2 ? (l[0] || '') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
                const order = TEA_TYPES.map(t => t.toUpperCase());
                const types = Object.entries(this.teaTypeCounts(r)).sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
                const total = types.reduce((s, [, v]) => s + v, 0);
                const word = k => (k.charAt(0) + k.slice(1).toLowerCase()).toLowerCase().replace(/^pu-erh$/, 'pu-erh');
                const origins = new Map();
                (r && r.coffees || []).forEach(c => (c.origins || []).forEach(o => origins.set(o, (origins.get(o) || 0) + 1)));
                const where = [...origins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o]) => o);
                let line = '';
                if (types.length === 1) line = `${total > 1 ? 'All' : 'A'} ${word(types[0][0])} tea${total > 1 ? 's' : ''}`;
                else if (types.length && types[0][1] / total > 0.5) line = `Mostly ${word(types[0][0])} teas`;
                else if (types.length) line = `${and(types.slice(0, 3).map(([k]) => word(k))).replace(/^./, ch => ch.toUpperCase())} teas`;
                if (where.length) line = line ? `${line} from ${and(where)}` : `Teas from ${and(where)}`;
                return line ? `${line}.` : 'No type or origin logged yet.';
            },

            // ---- the top of the page and the bars
            paintDrinkChrome() {
                if (typeof document === 'undefined') return;
                const w = this.drinkWords(this.drinkNow());
                document.querySelectorAll('[data-drink-label="items"]').forEach(el => { el.textContent = w.Items; });
                document.querySelectorAll('[data-drink-label="companies"]').forEach(el => { el.textContent = w.Companies; });
                document.querySelectorAll('[data-drink-label="add"]').forEach(el => { el.textContent = `Add ${w.item}`; });
                document.querySelectorAll('use[data-drink-icon]').forEach(el => el.setAttribute('href', w.icon));
                document.body.classList.toggle('tea-mode', w.item === 'tea');
                this.paintViewTitle(this.tab);
                this.paintMethodFilters();
                ['search-input', 'search-input-mobile', 'search-input-top'].forEach(id => { const el = document.getElementById(id); if (el) el.placeholder = this.tab === 'roasters' ? `Search ${w.companies}…` : `Search ${w.items}…`; });
            },
            // the page title: on Coffees (or Teas) it's the menu button; on Roasters it says Brands in tea mode
            paintViewTitle(tab) {
                const h = typeof document !== 'undefined' ? document.getElementById('view-title') : null;
                if (!h) return;
                const w = this.drinkWords(this.drinkNow());
                if (tab === 'my' || tab === 'roasters') {   // both pages switch the same way (Coffees / Teas, Roasters / Brands), and stay in step
                    h.innerHTML = `<button type="button" class="drink-title" id="drink-title" aria-haspopup="menu" aria-expanded="false" aria-controls="drink-menu" onclick="app.toggleDrinkMenu(event)">${tab === 'roasters' ? w.Companies : w.Items}<svg class="icon dt-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>`;
                    return;
                }
                const titles = { feed: 'Feed', profile: 'Profile' };
                h.textContent = titles[tab] || w.Items;
            },
            paintMethodFilters() {
                if (typeof document === 'undefined') return;
                const kind = this.drinkNow(), list = this.methodsFor(kind);
                const row = document.getElementById('filter-row');
                if (row && row.getAttribute('data-kind') !== kind) {
                    row.setAttribute('data-kind', kind);
                    row.innerHTML = [['all', 'All'], ...list.map(m => [m, this.methodLabel(m)])]
                        .map(([v, l]) => `<button class="filter-chip${this.currentMethodFilter === v ? ' active' : ''}" data-method="${this.esc(v)}" onclick="app.setMethodFilter('${this.escJs(v)}')">${this.esc(l)}</button>`).join('');
                }
                const sel = document.getElementById('mobile-method-select');
                if (sel && sel.getAttribute('data-kind') !== kind) {
                    sel.setAttribute('data-kind', kind);
                    sel.innerHTML = [['all', 'All'], ...list.map(m => [m, this.methodLabel(m)])].map(([v, l]) => `<option value="${this.esc(v)}">${this.esc(l)}</option>`).join('');
                    sel.value = this.currentMethodFilter;
                }
            },

            // ---- the Coffees / Teas menu under the title
            toggleDrinkMenu(event) {
                if (event) { event.preventDefault(); event.stopPropagation(); }
                if (document.getElementById('drink-menu')) { this.closeDrinkMenu(); return; }
                const btn = document.getElementById('drink-title');
                if (!btn) return;
                const kind = this.drinkNow();
                const opt = (k, label, icon) => `<button type="button" role="menuitemradio" aria-checked="${kind === k}" class="dm-opt${kind === k ? ' on' : ''}" onclick="app.setDrink('${this.escJs(k)}')">
                    <svg class="icon" aria-hidden="true"><use href="${icon}"/></svg><span>${label}</span><svg class="icon dm-check" aria-hidden="true"><use href="#i-check"/></svg></button>`;
                const menu = document.createElement('div');
                menu.id = 'drink-menu';
                menu.className = 'drink-menu';
                menu.setAttribute('role', 'menu');
                menu.setAttribute('aria-label', 'Coffee or tea');
                const ro = this.tab === 'roasters';
                menu.innerHTML = opt('coffee', ro ? 'Roasters' : 'Coffees', '#i-bean') + opt('tea', ro ? 'Brands' : 'Teas', '#i-teabag');
                const r = btn.getBoundingClientRect();
                menu.style.top = `${Math.round(r.bottom + 8)}px`;
                menu.style.left = `${Math.round(Math.max(12, r.left - 6))}px`;
                document.body.appendChild(menu);
                btn.setAttribute('aria-expanded', 'true');
                requestAnimationFrame(() => menu.classList.add('on'));
                this._drinkAway = e => { if (!menu.contains(e.target) && !btn.contains(e.target)) this.closeDrinkMenu(); };
                this._drinkKey = e => { if (e.key === 'Escape') this.closeDrinkMenu(); };
                setTimeout(() => { document.addEventListener('pointerdown', this._drinkAway, true); document.addEventListener('keydown', this._drinkKey); }, 0);
                const first = menu.querySelector('.dm-opt.on') || menu.querySelector('.dm-opt');
                if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
                if (this.haptic) this.haptic('tap');
            },
            closeDrinkMenu() {
                if (typeof document === 'undefined') return;
                const menu = document.getElementById('drink-menu');
                if (menu) menu.remove();
                const btn = document.getElementById('drink-title');
                if (btn) btn.setAttribute('aria-expanded', 'false');
                if (this._drinkAway) document.removeEventListener('pointerdown', this._drinkAway, true);
                if (this._drinkKey) document.removeEventListener('keydown', this._drinkKey);
                this._drinkAway = this._drinkKey = null;
            },

            // ---- the add form: Coffee / Tea at the very top; tea asks for its type, cultivar, processing and harvest
            beanFormKind() { const f = this.getBeanForm(); return f && f.elements.kind && f.elements.kind.value === 'tea' ? 'tea' : 'coffee'; },
            setBeanKind(kind, keepTitle) {
                const k = kind === 'tea' ? 'tea' : 'coffee', tea = k === 'tea';
                const form = this.getBeanForm(); if (!form) return;
                if (form.elements.kind) form.elements.kind.value = k;
                document.querySelectorAll('#bean-kind [data-kind]').forEach(b => b.setAttribute('aria-checked', String(b.getAttribute('data-kind') === k)));
                const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
                const editing = Boolean(form.elements.id.value);
                if (!keepTitle) set('bean-modal-title', editing ? (tea ? 'Edit Tea' : 'Edit Coffee') : (tea ? 'New Tea' : 'New Coffee'));
                set('lbl-company', tea ? 'Brand' : 'Roaster');
                set('lbl-variety', tea ? 'Cultivar' : 'Variety');
                set('lbl-process', tea ? 'Processing' : 'Process');
                set('lbl-bag-date', tea ? 'Harvested (optional)' : 'Roast date on your bag (optional)');
                set('bean-save-btn', tea ? 'Save Tea' : 'Save Coffee');
                const ph = (name, coffee, teaText) => { const el = form.elements[name]; if (el) el.placeholder = tea ? teaText : coffee; };
                ph('roaster', '', 'e.g., Mountain Leaf Tea Co.');
                ph('name', '', 'e.g., Long Jing, Darjeeling');
                ph('variety', 'e.g., Gesha, SL28, Bourbon...', 'e.g., Longjing #43, Yabukita');
                ph('origin', 'e.g., Ethiopia, Colombia', 'e.g., Zhejiang, China');
                ph('process', 'e.g., Washed, Natural, Honey', 'e.g., Pan-fired, Roasted, Aged');
                form.querySelectorAll('.tea-only').forEach(el => { el.hidden = !tea; });
                form.querySelectorAll('.coffee-only').forEach(el => { el.hidden = tea; });
                this.paintBeanBlend();   // v17.1: your own blend needs no brand
                this.renderBeanIngredients();
                this.fillRoasterSuggestions(k);
                const box = form.querySelector('.cs-list'); if (box) box.hidden = true;
            },

            // ---- a tea's page: its type where the roast goes, harvested where the roast date goes, no sweet spot
            paintDetailKind(group) {
                const meta = (group && group.meta) || {}, tea = this.isTeaBean(meta);
                const view = document.getElementById('detail-view');
                if (view) view.classList.toggle('is-tea', tea);
                const word = tea ? 'tea' : 'coffee';
                const lab = (sel, text) => { const el = document.querySelector(sel); if (el) el.setAttribute('aria-label', text); };
                lab('#detail-view .dh-share', `Share this ${word}`);
                lab('#detail-view .hero-actions .btn-clean:not(.danger)', `Edit ${word}`);
                lab('#detail-view .hero-actions .btn-clean.danger', `Delete ${word}`);
                const ro = document.querySelector('#d-roaster .ro-link');
                if (ro) { if (tea) ro.setAttribute('data-kind', 'tea'); else ro.removeAttribute('data-kind'); }
                const sweet = document.querySelector('[data-detail-tab="sweet"]');
                if (sweet) sweet.hidden = tea;
                if (tea && this.detailTab === 'sweet') this.detailTab = 'timeline';
                const ingBox = document.getElementById('d-ingredients');   // v17.1: what's in a tea
                if (ingBox) { const html = tea ? this.teaIngredientsHtml(meta) : ''; ingBox.innerHTML = html; ingBox.hidden = !html; }
                if (!tea) {   // (back to a coffee after a tea: as coffee pages always were)
                    ['d-roast', 'd-process', 'd-origin'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = false; });
                    const tt = document.getElementById('d-roast'); if (tt) { tt.classList.remove('tea-type-tag'); if (tt.style && tt.style.removeProperty) tt.style.removeProperty('--tt'); }
                    return;
                }
                const tag = (id, v) => { const el = document.getElementById(id); if (!el) return; const t = String(v || '').trim(); el.innerText = t; el.hidden = !t; };
                tag('d-roast', meta.teaType);
                tag('d-process', meta.process);
                tag('d-origin', meta.origin);
                const dr = document.getElementById('d-roaster');
                if (dr && !String(meta.roaster || '').trim()) dr.textContent = this.teaMakerName(meta);   // "Your blend"
                const tt = document.getElementById('d-roast');
                if (tt && tt.style && tt.style.setProperty) { tt.classList.add('tea-type-tag'); tt.style.setProperty('--tt', (this.teaTypeInfo(meta.teaType) || {}).color || '#7FA45B'); }
                const line = document.getElementById('d-roast-date');
                if (line) {
                    const t = this.parseLocalDate(meta.roastDate);
                    line.innerText = t ? `Harvested ${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
                    line.style.display = t ? 'block' : 'none';
                }
            },

            // ---- the Log for a tea: tea methods, no grind or roast date, tea words on the sliders, the tea wheel
            logKindFor(brew) {
                if (brew) return this.kindOfBrew(brew);
                return this.isTeaBean(this.beans && this.beans.get(String(this.activeId))) ? 'tea' : 'coffee';
            },
            applyLogKind(kind, keepMethod) {
                const k = kind === 'tea' ? 'tea' : 'coffee', tea = k === 'tea';
                this.logKind = k;
                const form = this.getBrewForm(); if (!form) return;
                const modal = document.getElementById('brew-modal');
                if (modal) modal.classList.toggle('is-tea', tea);
                const sel = form.method;
                // a tea's methods follow the tea: matcha is whisked, leaf teas are steeped (an older session keeps its own method)
                const list = tea ? this.teaMethodsFor(this.teaTypeOfActive(), keepMethod) : this.methodsFor(k);
                const sig = `${k}|${list.join(',')}`;
                if (sel && sel.getAttribute('data-kind') !== sig) {
                    const keep = sel.value;
                    sel.setAttribute('data-kind', sig);
                    sel.innerHTML = `<option value="">Select Method</option>` + list.map(m => `<option value="${this.esc(m)}">${this.esc(this.methodLabel(m))}</option>`).join('');
                    sel.value = list.includes(keep) ? keep : '';
                }
                if (form.dose) form.dose.required = !tea;   // v17.1: a tea's leaf is optional (a cup of several things, a teabag)
                if (form.grind) {
                    const wrap = form.grind.closest('div');
                    if (wrap) wrap.hidden = tea;
                    form.grind.required = !tea;
                    if (tea) form.grind.value = '';
                }
                const grid = sel && sel.closest('.brew-grid-2'); if (grid) grid.classList.toggle('solo', tea);
                const roast = modal && modal.querySelector('.roast-row'); if (roast) roast.hidden = tea;
                if (modal) modal.querySelectorAll('.ns').forEach(row => {
                    const key = row.getAttribute('data-k'), label = this.tasteLabel(key, k);
                    const name = row.querySelector('.ns-name'); if (name && name.lastChild && name.lastChild.nodeType === 3) name.lastChild.textContent = label;
                    const input = row.querySelector('input'); if (input) input.setAttribute('aria-label', label);
                });
                const p = modal && modal.querySelector('.taste-card .taste-head p');
                if (p) p.textContent = tea ? 'Move only what felt different. The dashed outline and ticks are your best cup of this tea.' : 'Move only what felt different. The dashed outline and ticks are your best shot of this coffee.';
                const hint = document.getElementById('timer-tea-hint');
                if (hint) hint.hidden = true;
                this.wheelFam = null; this.wheelGroup = null;
                if (this.tasteView && this.tasteView.redraw) this.tasteView.redraw();
            },
            // the methods a tea can be made with: matcha only whisked; a leaf tea steeped (Western, Gongfu, Cold Steep);
            // no type set: all four. An older session on another method keeps it in the list.
            teaMethodsFor(type, keep) {
                const list = type === 'Matcha' ? ['Matcha'] : type === 'Herbal' ? HERBAL_TEA_METHODS.slice() : type && TEA_TYPE_INFO[type] ? LEAF_TEA_METHODS.slice() : TEA_METHODS.slice();
                if (keep && this.isTeaMethod(keep) && !list.includes(keep)) list.push(keep);
                return list;
            },
            // a tea's usual method: your last on this tea, else your last tea, else by its type (always one this tea can use)
            defaultTeaMethod() {
                const bean = this.beans.get(String(this.activeId)) || {};
                const key = this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) : this.beanGroupKey(bean);
                const ok = this.teaMethodsFor(this.teaTypeOfActive());
                const mine = this.user ? this.brewsOf(this.user).filter(b => this.isTeaMethod(b.method) && ok.includes(b.method)).sort((a, b) => this.toTime(b.date) - this.toTime(a.date)) : [];
                const here = mine.find(b => this.groupKeyOfBrew(b) === key);
                if (here) return here.method;
                if (ok.length === 1) return ok[0];
                return mine.length ? mine[0].method : 'Western';
            },
            // a new cup of a tea starts as your last cup of it did: teabag or loose, rinsed or not, the matcha style
            teaCarry() {
                const key = this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) : '';
                const last = key && this.user ? this.brewsOf(this.user).filter(b => this.isTeaBrew(b) && this.groupKeyOfBrew(b) === key).sort((a, b) => this.toTime(b.date) - this.toTime(a.date))[0] : null;
                if (!last) { const ing = this.teaIngredientsOfActive(); return ing.length ? { mix: ing.map(it => ({ name: it.name, amount: '', unit: this.mixUnitFor(it), ...(it.ref ? { ref: it.ref } : {}) })) } : {}; }
                const out = {};
                if (last.teabag) { out.teabag = true; out.bags = Number(last.bags) || 1; }
                if (last.rinse) out.rinse = true;
                if (last.style) out.style = String(last.style);
                if (last.milk) out.milk = String(last.milk);
                const mix = this.cleanMix(last.mix);   // v17.1: the same things in the cup, the same amounts
                if (mix.length) out.mix = mix.map(it => ({ ...it, amount: it.amount ?? '' }));
                return out;
            },
            // ---- teabags: the leaf field counts bags instead of weighing grams (saved as bags, with no leaf weight)
            setTeabag(on) {
                this.methodExtras.teabag = !!on;
                const form = this.getBrewForm();
                if (form && form.dose) {
                    const v = Number(form.dose.value);
                    if (on && !(Number.isInteger(v) && v >= 1 && v <= 6)) form.dose.value = String(this.methodExtras.bags || 1);
                    if (!on && Number.isInteger(v) && v >= 1 && v <= 6 && this.methodExtras.bags) form.dose.value = '';
                }
                this.paintTeabag(this.activeMethod);
                this.renderTasteTip && this.renderTasteTip();
            },
            paintTeabag(method) {
                const p = this.methodProfile(method), form = this.getBrewForm(), lbl = document.getElementById('lbl-dose');
                if (!form || !form.dose || !lbl) return;
                const on = !!(p.tea && p.extras.includes('teabag') && this.methodExtras && this.methodExtras.teabag);
                const mix = p.tea && !on ? this.cleanMix(this.methodExtras && this.methodExtras.mix) : [];   // v17.1: a cup of several things: its total
                const grams = this.mixGrams(mix);
                lbl.textContent = on ? 'Teabags' : mix.length >= 2 ? 'Total (g)' : p.dose;
                form.dose.step = on ? '1' : 'any';   // (as the form has it: any decimal, 18.25 g)
                form.dose.placeholder = on ? '1' : mix.length ? (grams ? String(grams) : 'optional') : '';
                if (on && !(Number(form.dose.value) > 0)) form.dose.value = String(this.methodExtras.bags || 1);
            },
            setMatchaStyle(key) {
                this.methodExtras.style = MATCHA_STYLES.some(st => st.key === key) ? key : 'usucha';
                this.renderMethodExtras(this.activeMethod);
                this.renderTasteTip && this.renderTasteTip();
            },
            matchaStyle(b) { return MATCHA_STYLES.find(st => st.key === (b && b.style)) || null; },
            teaRatio(method, style) { const st = method === 'Matcha' ? MATCHA_STYLES.find(v => v.key === (style || 'usucha')) : null; return st ? st.ratio : this.methodProfile(method).ratio; },

            // ===================== v17.1: herbal teas, your own blends, and what went in each cup =====================
            // A tea can list what's in it (ingredients: names, a shelf tea linked by id), and be your own blend (no brand).
            // A cup can list what went in it with amounts (mix: name, amount, unit), e.g. 1 bag of a lemon ginger tea,
            // 2 g of home-grown lemon balm and 1 g of echinacea root, then a teaspoon of honey.
            isBlendTea(bean) { return Boolean(bean && bean.kind === 'tea' && (bean.blend || this.cleanIngredients(bean.ingredients).length >= 2)); },
            cleanIngredients(list) {
                const seen = new Set(), out = [];
                (Array.isArray(list) ? list : []).forEach(it => {
                    const name = String((it && typeof it === 'object' ? it.name : it) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
                    if (!name || seen.has(name.toLowerCase()) || out.length >= 20) return;
                    seen.add(name.toLowerCase());
                    out.push(it && it.ref ? { name, ref: String(it.ref).slice(0, 80) } : { name });
                });
                return out;
            },
            cleanMix(list) {
                const out = [];
                (Array.isArray(list) ? list : []).forEach(it => {
                    const name = String((it && it.name) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
                    if (!name || out.length >= 20) return;
                    const o = { name }, a = Number(it.amount);
                    if (it.amount !== '' && it.amount != null && a > 0 && a <= 5000) { o.amount = Math.round(a * 100) / 100; o.unit = MIX_UNITS.includes(it.unit) ? it.unit : 'g'; }
                    if (it.ref) o.ref = String(it.ref).slice(0, 80);
                    out.push(o);
                });
                return out;
            },
            mixGrams(list) { return Math.round((Array.isArray(list) ? list : []).reduce((s, it) => s + (it && (it.unit || 'g') === 'g' && Number(it.amount) > 0 ? Number(it.amount) : 0), 0) * 10) / 10; },
            mixItemText(it) {
                const a = Number(it.amount);
                if (!(a > 0)) return it.name;
                const plural = { bag: 'bags', slice: 'slices', pinch: 'pinches' }, u = it.unit || 'g';
                return `${it.name} ${this.fmtNum(a, 2)} ${a > 1 && plural[u] ? plural[u] : u}`;
            },
            // the usual unit for an ingredient: what you used last time, a teabag tea in bags, honey in teaspoons...
            mixUnitFor(it) {
                const name = String(it && it.name || '').toLowerCase();
                let last = '';
                this.brewsOf(this.user).forEach(b => (Array.isArray(b.mix) ? b.mix : []).forEach(m => { if (m && String(m.name || '').toLowerCase() === name && m.unit && !last) last = m.unit; }));
                if (last && MIX_UNITS.includes(last)) return last;
                if (it && it.ref) { const used = this.brewsOf(this.user).find(b => String(b.beanId) === String(it.ref) && b.teabag); if (used) return 'bag'; }
                return { honey: 'tsp', sugar: 'tsp', lemon: 'slice', ginger: 'slice', mint: 'pinch', milk: 'ml' }[name] || 'g';
            },
            teaIngredientsOfActive() {
                const g = this.activeGroup && this.activeGroup.meta;
                return this.cleanIngredients((g && g.ingredients) || ((this.beans.get(String(this.activeId)) || {}).ingredients));
            },
            // the company line: the brand, or "Your blend" / "Julian's blend" for your own
            teaMakerName(bean) {
                if (!bean) return '';
                const r = String(bean.roaster || '').trim();
                if (r) return r;
                if (bean.kind === 'tea' && bean.blend) { const o = String(bean.owner || bean.user || ''); return o && o === this.user ? 'Your blend' : `${o || 'Their'}'s blend`.replace("Their's", 'Their'); }
                return '';
            },
            // names to pick from: the teas on the shelf, then everything anyone has put in a tea or a cup
            teaNameSuggestions(skipId) {
                const names = new Map();
                this.beans.forEach(b => { if (this.isTeaBean(b) && String(b.id) !== String(skipId || '') && b.name) names.set(String(b.name).toLowerCase(), String(b.name)); });
                this.beans.forEach(b => this.cleanIngredients(b.ingredients).forEach(it => { if (!names.has(it.name.toLowerCase())) names.set(it.name.toLowerCase(), it.name); }));
                this.brews.forEach(b => this.cleanMix(b.mix).forEach(it => { if (!names.has(it.name.toLowerCase())) names.set(it.name.toLowerCase(), it.name); }));
                return [...names.values()].slice(0, 80);
            },
            shelfTeaNamed(name, skipId) {
                const n = String(name || '').trim().toLowerCase();
                if (!n) return null;
                return [...this.beans.values()].find(b => this.isTeaBean(b) && String(b.id) !== String(skipId || '') && String(b.name || '').trim().toLowerCase() === n) || null;
            },

            // ---- the cup: "In this cup" on the Log
            mixFieldHtml(list) {
                const items = Array.isArray(list) ? list : [];
                const ing = this.teaIngredientsOfActive();
                if (!items.length && !ing.length && !this.mixOpen) return `<div class="mix-field mix-closed"><button type="button" class="mix-open" onclick="app.openMix()">+ What went in <span>(herbs, honey, lemon…)</span></button></div>`;
                const rows = items.map((it, i) => `<div class="mix-row"><span class="mix-name">${this.esc(it.name)}</span><input type="number" inputmode="decimal" min="0" step="any" placeholder="–" value="${this.esc(it.amount ?? '')}" aria-label="How much ${this.esc(it.name)}" oninput="app.setMixAmount(${i}, this.value)"><select aria-label="Unit for ${this.esc(it.name)}" onchange="app.setMixUnit(${i}, this.value)">${MIX_UNITS.map(u => `<option value="${u}"${u === (it.unit || 'g') ? ' selected' : ''}>${u}</option>`).join('')}</select><button type="button" class="mix-x" aria-label="Remove ${this.esc(it.name)}" onclick="app.removeMix(${i})"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button></div>`).join('');
                const have = new Set(items.map(it => it.name.toLowerCase()));
                const sugg = [...ing.map(x => x.name), ...MIX_ADDINS].filter((n, i, a) => !have.has(n.toLowerCase()) && a.findIndex(m => m.toLowerCase() === n.toLowerCase()) === i).slice(0, 8);
                return `<div class="mix-field"><label>In this cup</label>${rows ? `<div class="mix-rows">${rows}</div>` : ''}<div class="mix-add">${sugg.map(n => `<button type="button" class="mix-sugg" onclick="app.addMix('${this.escJs(n)}')">+ ${this.esc(n)}</button>`).join('')}<span class="mix-new"><input type="text" list="mix-names" maxlength="60" placeholder="Something else" aria-label="Add something else to this cup" onkeydown="if (event.key === 'Enter') { event.preventDefault(); app.addMixFromInput(this); }"><button type="button" class="steep-add-btn" onclick="app.addMixFromInput(this.previousElementSibling)">Add</button></span></div><datalist id="mix-names">${this.teaNameSuggestions(this.activeId).map(n => `<option value="${this.esc(n)}"></option>`).join('')}</datalist></div>`;
            },
            openMix() { this.mixOpen = true; this.renderMethodExtras(this.activeMethod); const el = document.querySelector('#method-extras .mix-new input'); if (el) el.focus(); },
            addMix(name) {
                const n = String(name || '').trim().slice(0, 60); if (!n) return;
                this.methodExtras.mix = Array.isArray(this.methodExtras.mix) ? this.methodExtras.mix : [];
                if (this.methodExtras.mix.some(it => it.name.toLowerCase() === n.toLowerCase())) return;
                const shelf = this.shelfTeaNamed(n, this.activeId), ing = this.teaIngredientsOfActive().find(it => it.name.toLowerCase() === n.toLowerCase());
                const ref = (ing && ing.ref) || (shelf ? String(shelf.id) : '');
                const it = { name: shelf ? String(shelf.name) : n, amount: '', ...(ref ? { ref } : {}) };
                it.unit = this.mixUnitFor(it);
                this.methodExtras.mix.push(it);
                this.mixOpen = true;
                this.renderMethodExtras(this.activeMethod);
                const rows = document.querySelectorAll('#method-extras .mix-row input[type="number"]'); if (rows.length) rows[rows.length - 1].focus();
            },
            addMixFromInput(input) { if (!input) return; const v = input.value; input.value = ''; this.addMix(v); },
            removeMix(i) { const l = this.methodExtras.mix || []; l.splice(i, 1); this.renderMethodExtras(this.activeMethod); },
            setMixAmount(i, v) { const it = (this.methodExtras.mix || [])[i]; if (it) it.amount = v; this.paintTeabag(this.activeMethod); },
            setMixUnit(i, u) { const it = (this.methodExtras.mix || [])[i]; if (it) it.unit = MIX_UNITS.includes(u) ? u : 'g'; this.paintTeabag(this.activeMethod); },
            // a tea's leaf weight: counted teabags save none; typed in wins; else the grams of what went in
            teaDoseFor(method, form) {
                const x = this.methodExtras || {}, v = this.asNumber(form && form.dose ? form.dose.value : 0, 0);
                if (x.teabag && this.methodProfile(method).extras.includes('teabag')) return 0;
                return v > 0 ? v : this.mixGrams(x.mix);
            },

            // ---- the add form: your own blend (no brand) and what's in it
            paintBeanBlend() {
                const form = this.getBeanForm(); if (!form || !form.roaster) return;
                const tea = this.beanFormKind() === 'tea', blend = tea && form.elements.blend && form.elements.blend.checked;
                form.roaster.required = !blend;
                form.roaster.disabled = !!blend;
                if (blend) form.roaster.value = '';
                form.roaster.placeholder = blend ? 'Your own blend' : (tea ? 'e.g., Mountain Leaf Tea Co.' : '');
            },
            setBeanBlend(on) { this.paintBeanBlend(); if (on && !this.beanIngredients.length) { const el = document.querySelector('#bean-ingredients input'); if (el) el.focus(); } },
            renderBeanIngredients() {
                const box = document.getElementById('bean-ingredients'); if (!box) return;
                const list = this.beanIngredients = this.cleanIngredients(this.beanIngredients);
                const id = this.getBeanForm() && this.getBeanForm().elements.id ? this.getBeanForm().elements.id.value : '';
                const chips = list.map((it, i) => `<button type="button" class="ing-chip" onclick="app.removeBeanIngredient(${i})" aria-label="Remove ${this.esc(it.name)}">${it.ref ? '<svg class="icon" aria-hidden="true"><use href="#i-teabag"/></svg>' : ''}<b>${this.esc(it.name)}</b><svg class="icon ing-x" aria-hidden="true"><use href="#i-x"/></svg></button>`).join('');
                box.innerHTML = `${chips ? `<div class="ing-chips">${chips}</div>` : ''}<span class="mix-new"><input type="text" list="ing-names" maxlength="60" placeholder="${list.length ? 'Add another' : 'e.g., Lemon balm, Echinacea root'}" aria-label="Add an ingredient" onkeydown="if (event.key === 'Enter') { event.preventDefault(); app.addBeanIngredientFromInput(this); }"><button type="button" class="steep-add-btn" onclick="app.addBeanIngredientFromInput(this.previousElementSibling)">Add</button></span><datalist id="ing-names">${this.teaNameSuggestions(id).map(n => `<option value="${this.esc(n)}"></option>`).join('')}</datalist><p class="steeps-hint">One of your teas counts too: it links to its page.</p>`;
            },
            addBeanIngredientFromInput(input) {
                if (!input) return;
                const n = String(input.value || '').trim(); input.value = '';
                if (!n) return;
                const form = this.getBeanForm(), id = form && form.elements.id ? form.elements.id.value : '';
                const shelf = this.shelfTeaNamed(n, id);
                this.beanIngredients = this.cleanIngredients([...(this.beanIngredients || []), shelf ? { name: String(shelf.name), ref: String(shelf.id) } : { name: n }]);
                this.renderBeanIngredients();
                const el = document.querySelector('#bean-ingredients input'); if (el) el.focus();
            },
            removeBeanIngredient(i) { (this.beanIngredients || []).splice(i, 1); this.renderBeanIngredients(); },
            // the tea page: what's in it, each shelf tea a link to its page
            teaIngredientsHtml(bean) {
                const list = this.cleanIngredients(bean && bean.ingredients);
                if (!list.length) return '';
                return `<div class="tea-ing" aria-label="What's in it"><span>In it</span>${list.map(it => it.ref && this.beans.has(String(it.ref)) ? `<button type="button" class="tea-ing-link" onclick="app.openFeedTarget('${this.escJs(it.ref)}')">${this.esc(it.name)}</button>` : `<b>${this.esc(it.name)}</b>`).join('<i>·</i>')}</div>`;
            },
            teaTypeOfActive() { const g = this.activeGroup && this.activeGroup.meta; return (g && g.teaType) || ((this.beans.get(String(this.activeId)) || {}).teaType) || ''; },
            teaTempHint() { const info = this.teaTypeInfo(this.teaTypeOfActive()); return info ? info.temp : 85; },

            // ---- steeps: each stop of the timer is one steep (Western and Gongfu); they can be typed or removed too
            fmtSteep(sec) { const s = Math.round(Number(sec) || 0); return s >= 60 ? this.clock(s) : `${s}s`; },
            steepsFieldHtml(list) {
                const arr = (Array.isArray(list) ? list : []).map(Number).filter(v => v > 0);
                const chips = arr.map((v, i) => `<button type="button" class="steep-chip" onclick="app.removeSteep(${i})" aria-label="Remove steep ${i + 1} (${this.esc(this.fmtSteep(v))})"><span>${i + 1}</span><b>${this.esc(this.fmtSteep(v))}</b><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>`).join('');
                return `<div class="steeps-field"><label>Steeps${arr.length ? ` · ${arr.length}` : ''}</label><div class="steeps-row">${chips}<span class="steep-add"><input type="number" id="steep-new" min="1" max="3600" step="1" inputmode="numeric" placeholder="sec" aria-label="Next steep, in seconds" onkeydown="if (event.key === 'Enter') { event.preventDefault(); app.addSteepFromInput(); }"><button type="button" class="chip-btn" onclick="app.addSteepFromInput()">Add</button></span></div><p class="steeps-hint">Stop the timer after each steep and it's added here.</p></div>`;
            },
            addSteep(sec) {
                const v = Math.round(Number(sec));
                if (!(v > 0 && v <= 3600)) return;
                this.methodExtras = this.methodExtras || {};
                const list = Array.isArray(this.methodExtras.steeps) ? this.methodExtras.steeps : [];
                if (list.length >= 30) return;
                this.methodExtras.steeps = [...list, v];
                const form = this.getBrewForm();
                if (form && form.time && !form.time.value) form.time.value = String(v);   // (the first steep is the session's time)
                this.renderMethodExtras(this.activeMethod);
            },
            addSteepFromInput() {
                const el = document.getElementById('steep-new');
                if (!el) return;
                this.addSteep(el.value);
                const again = document.getElementById('steep-new'); if (again) again.focus();
            },
            removeSteep(i) {
                const list = Array.isArray(this.methodExtras && this.methodExtras.steeps) ? [...this.methodExtras.steeps] : [];
                list.splice(i, 1);
                this.methodExtras.steeps = list;
                this.renderMethodExtras(this.activeMethod);
            },
            // (toggleTimer) a stop on a tea with steeps: that run is one steep; the next start times from zero
            teaSteepStop(t) {
                if (this.logKind !== 'tea') return false;
                const p = this.methodProfile(this.activeMethod);
                if (!p.tea || !p.extras.includes('steeps')) return false;
                const run = Math.round(t.acc - (t.runFrom || 0));
                if (run > 0) this.addSteep(run);
                t.acc = run; t.teaNext = true;
                return true;
            },

            // ---- a tea session's numbers: Leaf / Water (and its ratio) / Steep (and how many) / Temp
            teaStepsOf(b) { return Array.isArray(b && b.steeps) ? b.steeps.map(Number).filter(v => v > 0) : []; },
            teaTimeText(b) {
                const time = this.num(b.time), p = this.methodProfile(b.method);
                if (!(time > 0)) return '';
                if (p.hours || b.timeUnit === 'h') return `${this.fmtNum(time, 1)} h`;
                if (p.minutes || b.timeUnit === 'm') return `${this.fmtNum(time, 1)} min`;   // v17.1: a simmer
                return this.fmtSteep(time);
            },
            teaStripHtml(b) {
                const dose = this.num(b.dose), yld = this.num(b.yield), time = this.num(b.time), temp = this.num(b.temp);
                const p = this.methodProfile(b.method), steeps = this.teaStepsOf(b);
                const hours = p.hours || b.timeUnit === 'h';
                const ratio = dose > 0 && yld > 0 ? `1:${this.fmtNum(yld / dose, 0)}` : '';
                const cell = (v, label, sub) => `<div class="sc-cell"><b>${v}</b><span>${this.esc(label)}${sub ? ` · <em>${this.esc(sub)}</em>` : ''}</span></div>`;
                const mins = p.minutes || b.timeUnit === 'm';
                const t = !(time > 0) ? '–' : hours ? `${this.esc(this.fmtNum(time, 1))}<small>h</small>` : mins ? `${this.esc(this.fmtNum(time, 1))}<small>min</small>` : time >= 60 ? this.esc(this.clock(time)) : `${this.esc(this.fmtNum(time))}<small>s</small>`;
                const stepLabel = b.method === 'Matcha' ? 'Whisk' : mins ? 'Simmer' : steeps.length > 1 ? `${steeps.length} steeps` : 'Steep';   // (the first steep's time, and how many)
                const bags = b.teabag ? Math.max(1, Number(b.bags) || 1) : 0;
                const blend = this.isBlendTea(this.beans.get(String(b.beanId)));   // v17.1: a blend's leaf is its total
                const leaf = bags ? cell(`${bags}<small>${bags === 1 ? 'bag' : 'bags'}</small>`, 'Teabag') : cell(dose > 0 ? `${this.esc(this.fmtNum(dose, 1))}<small>g</small>` : '–', b.method === 'Matcha' ? 'Matcha' : blend ? 'Blend' : 'Leaf');
                return `<div class="sc-strip feed-card-metrics sc-tea">${leaf}${cell(yld > 0 ? `${this.esc(this.fmtNum(yld, 0))}<small>ml</small>` : '–', 'Water', ratio)}${cell(t, stepLabel, '')}${cell(temp > 0 ? `${this.esc(this.fmtNum(temp, 0))}<small>°C</small>` : '–', 'Temp')}</div>`;
            },
            teaRecipeLine(b) {
                const parts = [], steeps = this.teaStepsOf(b);
                const bags = b.teabag ? Math.max(1, Number(b.bags) || 1) : 0, st = b.method === 'Matcha' ? this.matchaStyle(b) : null;
                if (st) parts.push(st.short);
                // what went in: the teabags (or the leaf), then each thing in the cup, then the water (v17.1)
                const mix = this.cleanMix(b.mix);
                const leaf = bags ? `${bags} ${bags === 1 ? 'bag' : 'bags'}` : !mix.length && this.num(b.dose) > 0 ? `${this.fmtNum(b.dose)} g` : '';
                const what = [leaf, ...mix.map(it => this.mixItemText(it))].filter(Boolean).join(' + ');
                const water = this.num(b.yield) > 0 ? `${this.fmtNum(b.yield, 0)} ml` : '';
                if (what || water) parts.push(what && water ? `${what} in ${water}` : what || water);
                if (this.num(b.milk) > 0 && ((st && st.milk) || this.methodProfile(b.method).minutes)) parts.push(`${this.fmtNum(b.milk, 0)} ml milk`);
                if (this.num(b.temp) > 0) parts.push(`${this.fmtNum(b.temp, 0)}°C`);
                const t = this.teaTimeText(b);
                if (t) parts.push(steeps.length > 1 ? `${t.replace(' ', ' ')}, ${steeps.length} steeps` : t.replace(' ', ' '));
                return parts.join(' · ');
            },

            // ---- next-cup advice for tea: what this cup said (sliders, notes, stars) against your best cup of this tea and
            // what its type usually wants. Water temperature, steep time and leaf only; there's no grind in tea.
            teaFromBrew(b) {
                const bean = this.beans.get(String(b.beanId)) || {};
                return { id: String(b.id), method: b.method || '', dose: this.num(b.dose), water: this.num(b.yield), time: this.num(b.time), temp: this.num(b.temp), steeps: this.teaStepsOf(b),
                    bags: b.teabag ? Math.max(1, Number(b.bags) || 1) : 0, style: b.style || '', milk: this.num(b.milk), mix: this.cleanMix(b.mix), minutes: b.timeUnit === 'm',
                    values: this.shapeValues(b), tasted: this.tastedKeys(b), notes: this.extractFlavors(b), rating: this.normalizeRating(b.rating), type: bean.teaType || '',
                    key: this.groupKeyOfBrew(b), owner: this.getBrewOwner(b), date: b.date };
            },
            teaFromForm() {
                const form = this.getBrewForm(), x = this.methodExtras || {};
                const n = name => (form && form[name] && form[name].value !== '' ? Number(form[name].value) : 0);
                const method = form && form.method ? form.method.value : '', bagsOn = !!(x.teabag && this.methodProfile(method).extras.includes('teabag'));
                return { id: form && form.elements.id ? String(form.elements.id.value || '') : '', method, dose: bagsOn ? 0 : (n('dose') || this.mixGrams(x.mix)), water: n('yield'), time: n('time'), temp: this.tempC(x.temp),
                    bags: bagsOn ? Math.max(1, Math.round(n('dose')) || 1) : 0, style: method === 'Matcha' ? (x.style || 'usucha') : '', milk: Number(x.milk) || 0, mix: this.cleanMix(x.mix),
                    steeps: Array.isArray(x.steeps) ? x.steeps : [], values: this.formTasteValues(), tasted: [...this.tasteTouched], notes: [...this.selFlavors],
                    rating: form && form.rating ? this.normalizeRating(form.rating.value) : 0, type: this.teaTypeOfActive(), key: this.activeGroup ? this.beanGroupKey(this.activeGroup.meta) : '', owner: this.user, date: new Date().toISOString() };
            },
            teaBestFor(c) {
                if (!c.owner || !c.key) return null;
                let best = null;
                this.brewsOf(c.owner).forEach(b => {
                    if (String(b.id) === c.id || this.groupKeyOfBrew(b) !== c.key || !this.isTeaBrew(b)) return;
                    if (c.date && this.toTime(b.date) > this.toTime(c.date)) return;   // (up to that cup)
                    const r = this.normalizeRating(b.rating); if (r <= 0) return;
                    const br = best ? this.normalizeRating(best.rating) : -1;
                    if (r > br || (r === br && this.isEarlier(best, b))) best = b;
                });
                return best;
            },
            teaCoach(c) {
                const p = this.methodProfile(c.method), info = this.teaTypeInfo(c.type), ref = this.teaBestFor(c);
                const on = k => c.tasted.includes(k), v = k => Number(c.values[k]);
                const notes = new Set(c.notes.map(n => String(n).toLowerCase()));
                const ev = [], why = [], ctx = [];
                const over = [], under = [];
                if (on('bitterness') && v('bitterness') >= 7) over.push(`bitterness ${v('bitterness')}`);
                if (on('acidity') && v('acidity') >= 7) over.push(`astringency ${v('acidity')}`);
                ['bitter', 'harsh', 'drying', 'stewed'].forEach(n => { if (notes.has(n)) over.push(`"${n}"`); });
                if (on('body') && v('body') <= 3) under.push(`body ${v('body')}`);
                ['thin', 'watery', 'flat'].forEach(n => { if (notes.has(n)) under.push(`"${n}"`); });
                over.forEach(t => ev.push({ side: 'over', text: t }));
                under.forEach(t => ev.push({ side: 'under', text: t }));
                if (c.rating > 0) ev.push({ side: 'ok', text: `${this.fmtNum(c.rating)}★` });
                const fmtT = s => p.hours ? `${this.fmtNum(s, 1)} h` : p.minutes ? `${this.fmtNum(s, 1)} min` : this.fmtSteep(s);
                const aType = t => `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t.toLowerCase()}`;   // "an oolong", "a green"

                if (ref) ctx.push(['Your best on this tea', `${this.teaRecipeLine(ref)} · ${this.fmtNum(this.normalizeRating(ref.rating))}★`]);
                if (info && c.type !== 'Matcha') ctx.push([`Usual for ${c.type.toLowerCase()} tea`, `${info.temp}°C${c.method === 'Western' && info.steep ? ` · ${this.fmtSteep(info.steep)}` : ''}`]);
                const k = { mode: 'ask', head: '', next: '', why, ev, ctx, conf: '', ref, from: 'tea' };
                if (!c.method) { k.head = 'Pick a method and log the steep: the advice reads it against your best cup of this tea.'; return k; }
                const gongfu = c.method === 'Gongfu', last = c.steeps.length ? c.steeps[c.steeps.length - 1] : c.time;
                if (gongfu && last > 0) why.push(`Gongfu: each next steep a few seconds longer (about ${this.fmtSteep(Math.round(last + 4))} after ${this.fmtSteep(last)}).`);
                if (c.rating >= 4.5 && !over.length && !under.length) {
                    k.mode = 'hold'; k.head = 'Repeat it exactly.'; k.next = this.teaRecipeLine({ ...c, yield: c.water, timeUnit: p.hours ? 'h' : p.minutes ? 'm' : '', teabag: c.bags > 0 });
                    why.unshift('Your notes don\'t flag anything to fix.');
                    k.conf = ref && c.rating > this.normalizeRating(ref.rating) ? 'a new best' : '';
                    return k;
                }
                const matcha = c.method === 'Matcha', st = matcha ? (MATCHA_STYLES.find(v => v.key === (c.style || 'usucha')) || MATCHA_STYLES[0]) : null;
                const target = this.teaRatio(c.method, c.style), blendCup = (c.mix || []).length >= 2;
                const what = matcha ? 'matcha' : blendCup ? 'of the blend' : c.type === 'Herbal' ? 'herbs' : 'leaf', verb = p.minutes ? 'Simmer' : 'Steep';
                const how = matcha ? `${st.short.toLowerCase()} matcha` : c.method.toLowerCase();
                if (matcha) ctx.push([`Usual for ${st.short === 'Usucha' || st.short === 'Koicha' ? st.short.toLowerCase() : `a matcha ${st.short.toLowerCase()}`}`, st.usual]);
                if (over.length) {
                    k.mode = 'fix'; k.conf = 'from your notes';
                    if (matcha && !(c.temp > 0 && c.temp > 80)) {   // matcha isn't steeped: too strong or too hot, not too long
                        const ratio = c.dose > 0 && c.water > 0 ? c.water / c.dose : 0;
                        if (ratio && ratio < target * 0.8) {
                            const w = Math.round(c.dose * target / 5) * 5;
                            k.head = `Use a little more water: about ${this.fmtNum(w, 0)} ml for ${this.fmtNum(c.dose)} g.`; k.next = `${this.fmtNum(w, 0)} ml`;
                            why.unshift(`This was 1:${Math.round(ratio)}; ${how} usually runs nearer 1:${target}.`);
                        } else if (c.dose > 0) {
                            const d = Math.max(0.5, Math.round(c.dose * 0.8 * 2) / 2);
                            k.head = `Use a little less matcha: about ${this.fmtNum(d)} g.`; k.next = `${this.fmtNum(d)} g`;
                            why.unshift('A bitter bowl at a good temperature usually means a little too much powder.');
                        } else k.head = 'Water around 75°C and a little less matcha should soften it.';
                        return k;
                    }
                    if (c.temp > 0 && info && c.temp > info.temp + 3 && !p.hours) {
                        k.head = `Try cooler water: about ${info.temp}°C.`; k.next = `${info.temp}°C`;
                        why.unshift(`Bitter or drying usually means the water was too hot for ${aType(c.type)} tea (${this.fmtNum(c.temp, 0)}°C this time).`);
                    } else if (c.time > 0) {
                        const t = p.hours || p.minutes ? Math.max(p.minutes ? 0.5 : 1, Math.round(c.time * 0.75 * 2) / 2) : Math.max(5, Math.round(c.time * 0.75));
                        k.head = `${verb} shorter: about ${fmtT(t)}.`; k.next = fmtT(t);
                        why.unshift(`Bitterness and astringency build the longer the ${c.type === 'Herbal' ? 'herbs sit' : 'leaf sits'}.`);
                    } else if (c.dose > 0) {
                        const d = Math.max(0.5, Math.round(c.dose * 0.8 * 2) / 2);
                        k.head = `Use a little less leaf: about ${this.fmtNum(d)} g.`; k.next = `${this.fmtNum(d)} g`;
                    } else k.head = p.minutes ? 'A shorter simmer should soften it.' : 'Cooler water or a shorter steep should soften it.';
                    return k;
                }
                if (under.length) {
                    k.mode = 'fix'; k.conf = 'from your notes';
                    const ratio = c.dose > 0 && c.water > 0 ? c.water / c.dose : 0;
                    if (ratio && ratio > target * 1.25) {
                        const d = Math.round((c.water / target) * 2) / 2;
                        k.head = `Use more ${what}: about ${this.fmtNum(d)} g for ${this.fmtNum(c.water, 0)} ml.`; k.next = `${this.fmtNum(d)} g`;
                        why.unshift(`Thin cups usually need more ${what}: this was 1:${Math.round(ratio)}, ${how} usually runs nearer 1:${target}.`);
                    } else if (c.bags && c.water / c.bags > 350) {   // one teabag (about 2 g) suits a 250-300 ml mug
                        const n = Math.ceil(c.water / 300);
                        k.head = `Use ${n} teabags for ${this.fmtNum(c.water, 0)} ml.`; k.next = `${n} bags`;
                        why.unshift('One bag is made for a mug of about 250 ml; more water than that thins it out.');
                    } else if (matcha) {
                        const d = c.dose > 0 ? Math.round(c.dose * 1.25 * 2) / 2 : 0;
                        k.head = d ? `Use a little more matcha: about ${this.fmtNum(d)} g.` : 'A little more matcha should fill it out.'; k.next = d ? `${this.fmtNum(d)} g` : '';
                        if (st.milk && c.milk > 0) why.unshift(`With ${this.fmtNum(c.milk, 0)} ml of milk, a stronger matcha shot keeps the tea from getting lost.`);
                    } else if (c.time > 0) {
                        const t = p.hours || p.minutes ? Math.round(c.time * 1.3 * 2) / 2 : Math.round(c.time * 1.3);
                        k.head = `${verb} longer: about ${fmtT(t)}.`; k.next = fmtT(t);
                        why.unshift(`More time pulls more body and flavor out of the ${c.type === 'Herbal' ? 'herbs' : blendCup ? 'blend' : 'leaf'}.`);
                    } else if (c.temp > 0 && info && c.temp < info.temp - 5) {
                        k.head = `Try hotter water: about ${info.temp}°C.`; k.next = `${info.temp}°C`;
                    } else k.head = `More ${what} or a longer ${verb.toLowerCase()} should fill it out.`;
                    return k;
                }
                if (on('balance') && v('balance') <= 3 && info && ['Oolong', 'Black', 'Pu-erh'].includes(c.type) && c.temp > 0 && c.temp < info.temp - 4) {
                    k.mode = 'fix'; k.head = `Try hotter water: about ${info.temp}°C.`; k.next = `${info.temp}°C`;
                    why.unshift(`A flat ${c.type.toLowerCase()} tea usually opens up closer to boiling.`);
                    return k;
                }
                if (ref && c.rating > 0 && c.rating < this.normalizeRating(ref.rating)) {
                    k.mode = 'toward'; k.head = `Go back toward your best cup of this tea (${this.shortDate(ref.date)}).`;
                    const diffs = [];
                    if (this.num(ref.temp) > 0 && c.temp > 0 && Math.abs(this.num(ref.temp) - c.temp) >= 3) diffs.push(`water ${this.fmtNum(ref.temp, 0)}°C (this time ${this.fmtNum(c.temp, 0)}°C)`);
                    if (this.num(ref.time) > 0 && c.time > 0 && Math.abs(this.num(ref.time) - c.time) / this.num(ref.time) >= 0.15) diffs.push(`steep ${fmtT(this.num(ref.time))} (this time ${fmtT(c.time)})`);
                    if (this.num(ref.dose) > 0 && c.dose > 0 && Math.abs(this.num(ref.dose) - c.dose) >= 0.5) diffs.push(`${this.fmtNum(ref.dose)} g leaf (this time ${this.fmtNum(c.dose)} g)`);
                    if (diffs.length) why.unshift(`It had ${diffs.join(', ')}.`);
                    k.next = this.teaRecipeLine(ref);
                    return k;
                }
                k.head = c.tasted.length || c.notes.length || c.rating ? 'Nothing to fix from your notes. Keep it, or change one thing at a time.' : 'Taste it, then move the sliders that stood out: the advice reads them.';
                return k;
            },
            teaTipHtml() { return this.coachHtml(this.teaCoach(this.teaFromForm()), 'Next cup'); },
            teaTargetHtml(ref) {
                return `<span>Target</span><b>Your best cup · ${this.esc(this.shortDate(ref.date))} · ${this.esc(this.fmtNum(this.normalizeRating(ref.rating)))}★ · ${this.esc(this.teaRecipeLine(ref))}</b>`;
            },

            // ---- monthly awards for tea (only when the month had tea): Cup of the Month, Tea Time, Tea Explorer, Steep Master
            teaAwards(list, owner, top, add) {
                const teas = list.filter(x => this.isTeaBrew(x));
                if (!teas.length) return;
                const tally = fn => { const t = new Map(); teas.forEach(x => { const v = fn(x); if (v) t.set(owner(x), (t.get(owner(x)) || 0) + v); }); return t; };
                const rated = teas.filter(x => this.normalizeRating(x.rating) >= 4);
                if (rated.length) {
                    const likesOf = x => (Array.isArray(x.likes) ? x.likes.length : 0);
                    const bestR = Math.max(...rated.map(x => this.normalizeRating(x.rating)));
                    const cup = rated.filter(x => this.normalizeRating(x.rating) === bestR).sort((u, v) => likesOf(v) - likesOf(u) || this.localTime(u.date) - this.localTime(v.date))[0];
                    const bean = this.beans.get(String(cup.beanId));
                    add('cup', 'Cup of the Month', 'i-teabag', '#6E9E3F', { names: [owner(cup)], value: bestR, runner: null }, v => `${this.fmtNum(v)}★ · ${bean ? (String(bean.name || '').trim() || this.beanLabel(bean)) : 'a tea'}, ${this.shortDate(cup.date)}`, { shotId: String(cup.id) });
                }
                add('teatime', 'Tea Time', 'i-method-gongfu', '#7FA45B', top(tally(() => 1), 3), v => `${v} tea sessions`);
                const kinds = new Map();
                teas.forEach(x => { const p = owner(x); if (!kinds.has(p)) kinds.set(p, new Set()); kinds.get(p).add(this.groupKeyOfBrew(x)); });
                add('tealeaf', 'Tea Explorer', 'i-compass', '#4F8A6B', top(new Map([...kinds].map(([p, set]) => [p, set.size])), 2), v => `${v} different teas`);
                add('steeps', 'Steep Master', 'i-repeat', '#8C9A4B', top(tally(x => this.teaStepsOf(x).length), 8), v => `${v} steeps`);
            },

            // ---- recaps: a month (or year) of tea
            teaRecap(teaBrews, all, inRange) {
                const t = { count: teaBrews.length, leaf: teaBrews.reduce((s, b) => s + this.num(b.dose), 0), steeps: teaBrews.reduce((s, b) => s + Math.max(1, this.teaStepsOf(b).length), 0) };
                const by = new Map(), types = new Map();
                teaBrews.forEach(b => { const k = this.groupKeyOfBrew(b); by.set(k, (by.get(k) || 0) + 1); const bean = this.beans.get(String(b.beanId)); if (bean && bean.teaType) types.set(bean.teaType, (types.get(bean.teaType) || 0) + 1); });
                const top = [...by.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
                if (top) { const sample = teaBrews.find(b => this.groupKeyOfBrew(b) === top[0]); const bean = this.beans.get(String(sample.beanId)); t.top = { name: bean ? String(bean.name || '').trim() || this.beanLabel(bean) : 'a tea', count: top[1] }; }
                const tt = [...types.entries()].sort((a, b) => b[1] - a[1])[0];
                if (tt) t.type = tt[0];
                const first = new Map();
                all.forEach(b => { if (!this.isTeaBrew(b)) return; const k = this.groupKeyOfBrew(b), at = this.toTime(b.date); if (at && (!first.has(k) || at < first.get(k))) first.set(k, at); });
                t.newTeas = [...first.values()].filter(inRange).length;
                return t;
            },
            teaRecapLines(t) {
                const lines = [['Tea sessions', `${t.count} · ${t.steeps} steep${t.steeps === 1 ? '' : 's'}`]];
                if (t.top) lines.push(['Top tea', `${t.top.name} · ${t.top.count}×`]);
                if (t.type) lines.push(['Favorite type', t.type]);
                lines.push(['New teas tried', String(t.newTeas || 0)]);
                return lines;
            },

            // ---- achievements: tea's own group (sessions, different teas, kinds of tea, steeps), shown once there's tea
            trackTea(stats, event, prev) {
                const steeps = Math.max(1, this.teaStepsOf(event).length), before = prev && this.isTeaBrew(prev) ? Math.max(1, this.teaStepsOf(prev).length) : 0;
                stats.steepTotal = Math.max(0, (stats.steepTotal || 0) + steeps - before);
                if (prev) return;
                stats.teaSessions = (stats.teaSessions || 0) + 1;
                const bean = this.beans.get(String(event.beanId));
                if (bean) { stats.teaSet.add(this.beanGroupKey(bean)); if (bean.teaType) stats.teaTypeSet.add(bean.teaType); }
            },
            achievementCatalogFor(user) {
                const st = (this.achievementStatsByUser || {})[user];
                const tea = Boolean(st && st.teaSessions > 0);
                return this.getAchievementCatalog().filter(d => d.group !== 'Tea' || tea);
            },
