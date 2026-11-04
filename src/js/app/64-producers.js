            // ===================== v21.4: who grew it, and the steps from farm to cup =====================
            // Maceo (Nov 3): "include not just roasters but the actual producers"; he picked a "Grown by" field with
            // producer pages, and the farm-to-cup chain (Nov 4), and asked what happens when the bag doesn't say: nothing is
            // made up. Every step is optional; a step the bag doesn't name stays gray ("Not on the bag"); a coffee with none
            // shows its owner a small "Who grew it?" link and everyone else nothing; a producer page exists only once
            // someone names a producer, and lists every coffee on Dialed In you can see that names the same one.
            // v21.6: just the farm and the mill (Maceo, Nov 4: "Get rid of exporter importer"); an exporter or importer an
            // older version saved stays on the server but isn't shown, and goes when the coffee is next saved
            CHAIN_KEYS: ['producer', 'mill'],
            cleanChain(c) {
                if (!c || typeof c !== 'object') return null;
                const out = {};
                this.CHAIN_KEYS.forEach(k => { const v = String(c[k] || '').replace(/\s+/g, ' ').trim().slice(0, 80); if (v && !/(https?:\/\/|www\.|<|>)/i.test(v)) out[k] = v; });
                return out;
            },
            chainOf(bean) { const c = this.cleanChain(bean && bean.chain); return c && Object.keys(c).length ? c : null; },
            producerKey(name) { return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); },
            // the form: two fields behind "Where it came from"
            chainFromForm(form) {
                const v = n => (form && form.elements[n] ? form.elements[n].value : '');
                return this.cleanChain({ producer: v('chainProducer'), mill: v('chainMill') }) || {};
            },
            chainFormFill(form, bean) {
                const c = this.chainOf(bean) || {}, set = (n, k) => { if (form && form.elements[n]) form.elements[n].value = c[k] || ''; };
                set('chainProducer', 'producer'); set('chainMill', 'mill');
                const fold = document.getElementById('chain-fold'); if (fold) fold.open = Object.keys(c).length > 0;
                this.chainSuggest();
            },
            // names already on Dialed In, offered as you type (so the same farm links up)
            chainSuggest() {
                const lists = { producer: new Set(), mill: new Set() };
                this.beans.forEach(b => { const c = this.chainOf(b); if (c) Object.entries(c).forEach(([k, v]) => lists[k] && lists[k].add(v)); });
                [['chain-producers', 'producer'], ['chain-mills', 'mill']].forEach(([id, k]) => {
                    const dl = document.getElementById(id); if (dl) dl.innerHTML = [...lists[k]].sort((a, b) => a.localeCompare(b)).slice(0, 200).map(v => `<option value="${this.esc(v)}"></option>`).join('');
                });
            },
            // your own coffee with nothing named: Edit, with the fold open at "Grown by"
            chainAdd() {
                if (this.editBean) this.editBean();
                setTimeout(() => { const f = document.getElementById('chain-fold'); if (f) { f.open = true; const i = f.querySelector('input'); if (i) { f.scrollIntoView({ block: 'center' }); i.focus({ preventScroll: true }); } } }, 120);
            },

            // the coffee page: From farm to cup (folded, like About this coffee)
            nlChainHtml(bean) {
                if (!bean || (this.isTeaBean && this.isTeaBean(bean))) return '';
                const own = this.activeId ? this.beans.get(String(this.activeId)) : null, mine = !!(own && own.user === this.user) || bean.user === this.user;
                const c = (mine && own && this.chainOf(own)) || this.chainOf(bean);   // (yours first; else what another bag of it says)
                if (!c) return mine ? `<button type="button" class="nl-chain-add" onclick="app.chainAdd()"><svg class="icon" aria-hidden="true"><use href="#i-tree"/></svg><span><b>Who grew it?</b><small>The farm or mill on the bag</small></span><svg class="icon nl-spec-ch" aria-hidden="true"><use href="#i-plus"/></svg></button>` : '';
                const ids = new Set(((this.activeGroup && this.activeGroup.ids) || [bean.id]).map(String));
                const mineN = [...this.brews.values()].filter(b => ids.has(String(b.beanId)) && this.getBrewOwner(b) === this.user).length;
                const steps = [
                    ['Farm', c.producer, c.producer ? `app.openProducer(${this.escJsAttr(c.producer)})` : ''],
                    ['Mill', c.mill, ''],
                    ['Roaster', bean.roaster || '', bean.roaster && this.openRoaster && this.roasterKey ? `app.openRoaster(${this.escJsAttr(this.roasterKey(bean.roaster))})` : ''],
                    ['You', mineN ? `${mineN} session${mineN === 1 ? '' : 's'}` : (mine ? 'Your coffee' : ''), '']
                ];
                const known = steps.filter(s => s[1]).length;
                const summary = steps.filter(s => s[1] && s[0] !== 'You').map(s => s[1]).join(' → ');
                const open = safeGet('dialed_chain_open') === '1';
                const rows = steps.map(([k, v, go]) => {
                    const val = v ? (go ? `<button type="button" class="nl-cs-v is-link" onclick="${go}">${this.esc(v)}<svg class="icon" aria-hidden="true"><use href="#i-chev-right"/></svg></button>` : `<span class="nl-cs-v">${this.esc(v)}</span>`) : '<span class="nl-cs-v is-none">Not on the bag</span>';
                    return `<li class="nl-cs${v ? '' : ' is-none'}"><i></i><span class="nl-cs-k">${k}</span>${val}</li>`;
                }).join('');
                return `<section class="nl-chain${open ? ' is-open' : ''}" id="nl-chain"><button type="button" class="nl-chain-head" aria-expanded="${open}" onclick="app.toggleChain()"><svg class="icon" aria-hidden="true"><use href="#i-tree"/></svg><span><b>From farm to cup</b><small>${this.esc(summary || `${known} of 6 steps known`)}</small></span><svg class="icon nl-chain-ch" aria-hidden="true"><use href="#i-chevron-down"/></svg></button><ol class="nl-chain-steps"${open ? '' : ' hidden'}>${rows}</ol></section>`;
            },
            escJsAttr(s) { return `'${this.escJs(String(s))}'`; },
            toggleChain() {
                const el = document.getElementById('nl-chain'); if (!el) return;
                const open = !el.classList.contains('is-open');
                el.classList.toggle('is-open', open);
                const ol = el.querySelector('.nl-chain-steps'); if (ol) ol.hidden = !open;
                const h = el.querySelector('.nl-chain-head'); if (h) h.setAttribute('aria-expanded', String(open));
                safeSet('dialed_chain_open', open ? '1' : '');
                if (this.haptic) this.haptic('tick');
            },
            nlChainPaint(bean) {
                const view = document.getElementById('detail-view'); if (!view) return;
                view.querySelectorAll('#nl-chain, .nl-chain-add').forEach(n => n.remove());
                const html = this.nlChainHtml(bean); if (!html) return;
                const after = view.querySelector('#lx-about') || document.getElementById('d-top-flavors');
                if (after) after.insertAdjacentHTML('afterend', html);
                this.nlTilesPaint();
            },

            // v21.6: About this coffee and Who grew it? (or From farm to cup) side by side, two tiles (Maceo's drawing, Nov 4:
            // the empty right half of About this coffee's card was the place for it). A tile opens its panel full width under
            // the pair; with only one of them (Learn off, a tea, someone else's coffee with nothing named) it stays a full card.
            nlTilesPaint() {
                if (typeof document === 'undefined') return;
                const view = document.getElementById('detail-view'); if (!view) return;
                view.querySelectorAll('#nl-dtiles').forEach(n => n.remove());
                const about = view.querySelector('#lx-about'), chain = view.querySelector('#nl-chain'), add = view.querySelector('.nl-chain-add');
                const on = !!(this.newLook && this.newLook() && about && (chain || add) && about.querySelector('[data-lxf]'));
                view.classList.toggle('nl-tiles-on', on);
                if (!on) { if (about) about.hidden = false; if (chain) chain.hidden = false; return; }
                const sec = about.querySelector('[data-lxf]'), aOpen = sec.getAttribute('data-open') === '1';
                const cOpen = !!(chain && chain.classList.contains('is-open'));
                const ic = id => `<svg class="icon nl-dt-ic" aria-hidden="true"><use href="#${id}"/></svg>`;
                // (Maceo, Nov 4, a few minutes later: "get rid of the subtext and condense it vertically": one line each, an icon
                // and its name; an open one is tinted, and its panel sits under the pair)
                const tile = (t, open, icon, title, cls = '') => `<button type="button" class="nl-dtile${cls}${open ? ' is-on' : ''}" data-t="${t}" aria-expanded="${open}" onclick="app.nlTileTap(this.getAttribute('data-t'))">${ic(icon)}<b>${title}</b></button>`;
                const right = chain ? tile('chain', cOpen, 'i-tree', 'From farm to cup') : tile('add', false, 'i-plus', 'Who grew it?', ' is-add');
                about.insertAdjacentHTML('beforebegin', `<div class="nl-dtiles" id="nl-dtiles">${tile('about', aOpen, 'i-book', this.esc(sec.getAttribute('data-title') || 'About this coffee'))}${right}</div>`);
                about.hidden = !aOpen; if (chain) chain.hidden = !cOpen;
                if (add) add.hidden = true;
            },
            nlTileTap(t) {
                const view = document.getElementById('detail-view'); if (!view) return;
                if (t === 'add') { this.chainAdd(); return; }
                const panel = t === 'about' ? view.querySelector('#lx-about') : view.querySelector('#nl-chain'); if (!panel) return;
                if (t === 'about') { const h = panel.querySelector('[data-lxf] > .lx-fh'); if (h) this.lxFold(h); }
                else this.toggleChain();
                const open = t === 'about' ? (panel.querySelector('[data-lxf]') || { getAttribute: () => '0' }).getAttribute('data-open') === '1' : panel.classList.contains('is-open');
                panel.hidden = !open;
                const btn = view.querySelector(`#nl-dtiles .nl-dtile[data-t="${t}"]`); if (btn) { btn.classList.toggle('is-on', open); btn.setAttribute('aria-expanded', String(open)); }
                if (open && panel.scrollIntoView) setTimeout(() => { const r = panel.getBoundingClientRect(); if (r.bottom > (window.innerHeight || 800) - 20) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
            },

            // v21.6: a page that slides over the app (a session, a share link, a producer) is painted in its own color all the
            // way down, so pulling past its end on an iPhone shows more of the page, not the feed under it (Maceo, Nov 4: "when
            // you scroll past it you can like see under it to the feed")
            nlBackdrop(page) {
                const host = page && page.parentElement; if (!host || !/^(session-view|share-view|producer-view)$/.test(host.id)) return;
                const fam = page.getAttribute('data-fam') || 'app'; if (host.getAttribute('data-fam') !== fam) host.setAttribute('data-fam', fam);
            },

            // ---- a producer's page: every coffee you can see that names them
            producerCoffees(name) {
                const key = this.producerKey(name);
                return [...this.beans.values()].filter(b => { const c = this.chainOf(b); return c && c.producer && this.producerKey(c.producer) === key; });
            },
            openProducer(name) {
                const beans = this.producerCoffees(name);
                if (!beans.length) { this.showToast('No coffee here names that producer.'); return; }
                let v = document.getElementById('producer-view');
                if (!v) {
                    v = document.createElement('div'); v.id = 'producer-view'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Producer');
                    v.innerHTML = '<div class="nls-page" id="pv-page"></div>';
                    document.body.appendChild(v);
                }
                this._producer = String(name);
                const page = document.getElementById('pv-page');
                const ids = new Set(beans.map(b => String(b.id)));
                const brews = [...this.brews.values()].filter(b => ids.has(String(b.beanId)));
                const first = beans.slice().sort((a, b) => brews.filter(x => String(x.beanId) === String(b.id)).length - brews.filter(x => String(x.beanId) === String(a.id)).length)[0];
                const fam = this.famOfCoffee(first);
                const shown = String(name || '').replace(/\s+/g, ' ').trim() || this.chainOf(first).producer;   // (as the coffee you came from writes it)
                const rated = brews.map(b => this.normalizeRating(b.rating)).filter(r => r > 0), avg = rated.length ? rated.reduce((a, r) => a + r, 0) / rated.length : 0;
                // where it is and who carries it (what its coffees say)
                const uniq = list => [...new Set(list.filter(Boolean))];
                const items = beans.map(b => this.nlSpecItems ? this.nlSpecItems(b) : { origin: [], region: [] });
                const merge = k => { const seen = new Map(); items.forEach(it => (it[k] || []).forEach(x => { const key = x.kind ? `${x.kind}:${x.id}` : x.label; if (!seen.has(key)) seen.set(key, x); })); return [...seen.values()]; };
                const chains = beans.map(b => this.chainOf(b) || {});
                const pseudo = { origin: merge('origin'), region: merge('region'), variety: merge('variety'), process: merge('process'), roast: [] };
                const mills = uniq(chains.map(c => c.mill));
                const specs = this.nlSpecRowsFromItems ? this.nlSpecRowsFromItems({ ...pseudo, mill: mills.map(label => ({ label })) }) : '';
                // what its coffees taste like, across every session here
                const pool = brews.filter(b => this.tastedKeys(b).length);
                const vals = {}, set = [];
                TASTE_KEYS.forEach(k => { const xs = pool.map(b => this.tasteValue(b, k)).filter(x => x !== null); vals[k] = xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 5; if (xs.length) set.push(k); });
                const fc = this.flavorCounts(brews, 'coffee');
                const words = set.length ? this.describeCup(vals, set, fc.notes.slice(0, 4).map(x => x.n), Object.fromEntries(fc.notes.map(x => [x.n, x.strength])), 'coffee') : '';
                const profile = set.length || fc.notes.length ? `<section class="nls-sec"><h3 class="nl-h3">What it tastes like</h3><div class="nl-box shv-flavor"><p class="shv-sub">${brews.length} session${brews.length === 1 ? '' : 's'} on Dialed In</p>${set.length ? '<div id="pv-shape"></div>' : ''}${fc.notes.length ? `<div class="flv-notes">${this.noteChipsHtml(fc.notes.slice(0, 10), true)}</div>` : ''}${words ? `<p class="nls-desc">${this.esc(words)}</p>` : ''}</div></section>` : '';
                const rows = beans.map(b => {
                    const n = brews.filter(x => String(x.beanId) === String(b.id)), r = n.map(x => this.normalizeRating(x.rating)).filter(x => x > 0), ra = r.length ? r.reduce((a, x) => a + x, 0) / r.length : 0;
                    const who = b.user && b.user !== this.user ? ` · ${this.esc(b.user)}'s` : '';
                    return `<button type="button" class="pv-coffee" data-fam="${this.famOfCoffee(b)}" onclick="app.producerOpenCoffee('${this.escJs(String(b.id))}')">${this.nlCoverHtml(b, 'nl-cover pv-cover')}<span class="pv-cmain"><small>${this.esc(b.roaster || '')}</small><b>${this.esc(b.name || 'Coffee')}</b><span>${n.length} session${n.length === 1 ? '' : 's'}${ra > 0 ? ` · ${this.esc(this.formatRating(ra))}★` : ''}${who}</span></span><svg class="icon nl-spec-ch" aria-hidden="true"><use href="#i-chev-right"/></svg></button>`;
                }).join('');
                page.setAttribute('data-fam', fam); this.nlBackdrop(page);
                page.innerHTML = `<div class="pv-bar"><button type="button" class="nl-glass" onclick="app.closeProducer()" aria-label="Back"><svg class="nl-ic"><use href="#i-arrow-left"/></svg></button></div>
                    <div class="nls-wrap">
                        <div class="nls-hero is-flat shv-chero"><div class="nls-id">
                            ${this.nlCoverHtml({ ...first, name: shown, roaster: '' }, 'nl-cover shv-cover')}
                            <div class="nl-roast nls-roast pv-kicker">Grown by</div>
                            <h1 class="nl-name nls-name" data-nl-fit="56,36,3" style="font-size:${this.nlNameSize(shown, 354, 56, 36, 3)}px">${this.esc(shown)}</h1>
                            <div class="nls-rate">${avg > 0 ? `${this.nlStarsHtml(avg, 20)}<b>${this.esc(this.formatRating(avg))}</b>` : ''}<span class="pv-count">${beans.length} coffee${beans.length === 1 ? '' : 's'} · ${brews.length} session${brews.length === 1 ? '' : 's'}</span></div>
                        </div></div>
                        ${specs ? `<section class="nls-sec nls-first">${specs}</section>` : ''}
                        ${profile}
                        <section class="nls-sec"><h3 class="nl-h3">Coffees <span>· ${beans.length}</span></h3><div class="pv-list">${rows}</div></section>
                    </div>`;
                v.hidden = false; v.classList.add('active'); v.setAttribute('aria-hidden', 'false'); v.scrollTop = 0;
                document.body.classList.add('pv-open');
                if (set.length && this.nlSpinMount) this.nlSpinMount(document.getElementById('pv-shape'), { id: `producer|${this.producerKey(shown)}`, values: () => vals, isSet: k => set.includes(k) });
                if (this.nlFitNames) this.nlFitNames(page);
                if (this.haptic) this.haptic('tick');
            },
            producerOpenCoffee(id) {
                // v21.6: the coffee's Back comes back to this producer's page
                const from = this.snapPage ? this.snapPage() : null;
                this.closeProducer();
                if (from) { if (!from.over) this.navStack = []; this.navStack = this.navStack || []; this.navStack.push(from); }
                this._navKeep = true;
                try { this.openFeedTarget(String(id), '', false); } finally { this._navKeep = false; }
                this.setDetailBackLabel();
                const d = document.getElementById('detail-view'); if (d) d.scrollTop = 0;
            },
            closeProducer() {
                const v = document.getElementById('producer-view');
                if (v) { v.classList.remove('active'); v.hidden = true; v.setAttribute('aria-hidden', 'true'); }
                document.body.classList.remove('pv-open');
                this._producer = null;
            },
