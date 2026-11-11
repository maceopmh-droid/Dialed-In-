            // ===================== v21.3: a coffee's specs, one row each =====================
            // Maceo (Nov 3): "make the specs of the bean more clear like origin, variety, process separation because right now
            // it's all together"; he picked labeled rows (Nov 4) and asked what happens with more than one origin or process
            // (Urrao's Anaerobic Natural, Alchemy's three origins). One row per kind of spec, each with its icon and label; a
            // row with one value opens its Learn page; a row with several shows each as its own small button; anything Learn
            // doesn't know is plain text. The Coffees list gets the same icons on one line instead of "Colombia · Washed".
            nlSpecItems(bean) {
                const out = { producer: [], origin: [], region: [], variety: [], process: [], roast: [] };
                if (!bean) return out;
                const ch = this.chainOf ? this.chainOf(bean) : null;   // v21.4: who grew it (opens their page)
                if (ch && ch.producer) out.producer.push({ kind: 'producer', id: ch.producer, label: ch.producer, page: true });
                const split = s => String(s || '').split(/,|\/|&|\+|;|\band\b/i).map(x => x.trim()).filter(Boolean);
                const learn = typeof LearnEngine !== 'undefined' && this.learnOn && this.learnOn() && this.lxTags;
                const it = (kind, id, label) => ({ kind, id, label, page: !!(learn && this.lxHasPage(kind, id)) });
                const t = learn ? this.lxTags(bean) : null;
                if (t) {
                    const o = t.origin || {}, cs = o.countries || [], rid = cs.length === 1 && o.region ? `${cs[0]}:${o.region}` : '';
                    if (rid && this.lxEntry('region', rid)) { const rn = this.lxName('region', rid); out.region.push(it('region', rid, o.placeName && o.placeName !== rn ? `${o.placeName}, ${rn}` : rn)); }
                    else if (cs.length === 1 && o.placeName) out.region.push({ label: o.placeName });
                    cs.forEach(cc => out.origin.push(it('origin', cc, this.lxName('origin', cc))));
                    const cn = cs.length === 1 ? this.lxName('origin', cs[0]) : '';
                    (t.variety || []).forEach(id => { const n = this.lxName('variety', id); out.variety.push(it('variety', id, n === cn ? `${n} (variety)` : n)); });
                    if (t.species && t.species !== 'arabica') out.variety.push(it('species', t.species, this.lxName('species', t.species)));
                    else if (t.species === 'arabica' && !(t.variety || []).length) out.variety.push(it('species', 'arabica', 'Arabica'));
                    const p = t.process || {};
                    (p.bases && p.bases.length > 1 ? p.bases : (p.base ? [p.base] : [])).forEach(b => out.process.push(it('process', b, LearnEngine.processName({ ...p, base: b, variant: b === p.base ? p.variant : '', honey: b === 'honey' ? p.honey : '' }) || this.lxName('process', b))));   // (v21.6: several processes)
                    (p.layers || []).forEach(id => out.process.push(it('process', id, this.lxName('process', id))));
                    if (p.decaf) out.process.push({ label: p.decaf === 'decaf' ? 'Decaf' : 'Decaf · ' + this.lxName('decaf', p.decaf) });
                    // what Learn didn't recognize stays, as it was written
                    [['origin', bean.origin], ['variety', bean.variety], ['process', bean.process]].forEach(([k, text]) => split(text).forEach(part => {
                        const f = LearnEngine.field(k, part, {}), known = (f.chips || []).some(ch => ch.t === 'ok' || ch.t === 'info');
                        if (!known && !out[k].some(x => String(x.label).toLowerCase() === part.toLowerCase())) out[k].push({ label: part });
                    }));
                } else {
                    split(bean.origin).forEach(x => out.origin.push({ label: x }));
                    split(bean.variety).forEach(x => out.variety.push({ label: x }));
                    split(bean.process).forEach(x => out.process.push({ label: x }));
                }
                if (String(bean.roast || '').trim()) out.roast.push({ label: String(bean.roast).trim() });
                return out;
            },
            NL_SPEC_ROWS: [['producer', 'i-users', 'Grown by', 'Grown by'], ['origin', 'i-pin', 'Origin', 'Origins'], ['region', 'i-globe', 'Region', 'Regions'], ['variety', 'i-leaf-line', 'Variety', 'Varieties'], ['process', 'i-drop', 'Process', 'Process'], ['roast', 'i-flame', 'Roast', 'Roast'], ['mill', 'i-gear', 'Mill', 'Mills']],
            nlSpecRowsHtml(bean, o = {}) { return this.nlSpecRowsFromItems(this.nlSpecItems(bean), { ...o, tea: this.isTeaBean && this.isTeaBean(bean), fold: o.fold && bean ? this.beanGroupKey(bean) : '' }); },
            // v21.10 (Maceo, Nov 11: "make the tab on the bean page with variety origin etc collapsible? Always start
            // uncollapsed but if a user collapses that specific one then it stays collapsed until they undo it"): each coffee
            // you've folded, remembered on this phone
            nlSpecsClosed() { try { const v = JSON.parse(safeGet('dialed_specs_closed') || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch (e) { return []; } },
            nlSpecsToggle(btn) {
                const box = btn && btn.closest('.nl-specs'), key = box && box.getAttribute('data-fold'); if (!key) return;
                const closed = !box.classList.contains('is-closed');
                box.classList.toggle('is-closed', closed);
                btn.setAttribute('aria-expanded', closed ? 'false' : 'true');
                const list = this.nlSpecsClosed().filter(k => k !== key);
                if (closed) list.push(key);
                try { safeSet('dialed_specs_closed', JSON.stringify(list.slice(-300))); } catch (e) { /* full: open again next time */ }
                if (this.haptic) this.haptic('tick');
            },
            nlSpecGo(x) { return x.kind === 'producer' ? `app.openProducer('${this.escJs(String(x.id))}')` : this.lxGo(x.kind, x.id); },
            nlSpecRowsFromItems(items, o = {}) {   // (o.links false: no buttons, e.g. on a share link's page)
                if (o.links === false) Object.values(items).forEach(list => (list || []).forEach(x => { x.page = false; }));
                const ic = id => `<svg class="icon nl-spec-ic" aria-hidden="true"><use href="#${id}"/></svg>`, chev = (c = '') => `<svg class="icon nl-spec-ch${c}" aria-hidden="true"><use href="#i-chev-right"/></svg>`;
                const rows = this.NL_SPEC_ROWS.map(([k, icon, one, many]) => {
                    const list = items[k] || []; if (!list.length) return '';
                    if (list.length === 1) {
                        const x = list[0], inner = `${ic(icon)}<span class="nl-spec-k">${one}</span><span class="nl-spec-v">${this.esc(x.label)}</span>`;
                        return x.page ? `<button type="button" class="nl-spec" onclick="${this.nlSpecGo(x)}">${inner}${chev()}</button>` : `<div class="nl-spec">${inner}</div>`;
                    }
                    // (v21.6, condensed: the first stays first, the rest shortest first, so more of them share a line)
                    const packed = [list[0], ...list.slice(1).sort((a, b) => String(a.label).length - String(b.label).length)];
                    const pills = packed.map(x => x.page ? `<button type="button" class="nl-spec-pill" onclick="${this.nlSpecGo(x)}">${this.esc(x.label)}${chev(' sm')}</button>` : `<span class="nl-spec-pill is-plain">${this.esc(x.label)}</span>`).join('');
                    return `<div class="nl-spec nl-spec-multi">${ic(icon)}<span class="nl-spec-k">${many}</span><span class="nl-spec-v">${pills}</span></div>`;
                }).filter(Boolean);
                if (!rows.length) return '';
                if (!o.fold || rows.length < 2) return `<div class="nl-specs" role="list" aria-label="About this ${o.tea ? 'tea' : 'coffee'}">${rows.join('')}</div>`;
                // v21.10: a "Details" header that folds the rows (open unless you folded this coffee); folded, it shows a short line
                const closed = this.nlSpecsClosed().includes(String(o.fold));
                const sum = ['origin', 'variety', 'process'].map(k => (items[k] || [])[0]).filter(Boolean).map(x => this.esc(x.label)).join(' · ');
                return `<div class="nl-specs is-fold${closed ? ' is-closed' : ''}" data-fold="${this.esc(String(o.fold))}"><button type="button" class="nl-specs-head" aria-expanded="${closed ? 'false' : 'true'}" onclick="app.nlSpecsToggle(this)"><span class="nl-specs-t">Details</span><span class="nl-specs-sum">${sum}</span><svg class="icon nl-specs-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></button><div class="nl-specs-rows" role="list" aria-label="About this ${o.tea ? 'tea' : 'coffee'}">${rows.join('')}</div></div>`;
            },
            // the Coffees list: one line, an icon for each (origin, variety, process)
            nlSpecLineHtml(bean) {   // (as written on the bag: "Anaerobic Natural", not Learn's "Natural, Anaerobic")
                const tidy = s => String(s || '').split(/\s*[,/;]\s*/).map(x => x.trim()).filter(Boolean).join(', ');
                const bits = [[bean && bean.origin, 'i-pin'], [bean && bean.variety, 'i-leaf-line'], [bean && bean.process, 'i-drop']].map(([v, icon]) => tidy(v) ? `<span class="nl-sl"><svg class="icon" aria-hidden="true"><use href="#${icon}"/></svg>${this.esc(tidy(v))}</span>` : '').filter(Boolean);
                return bits.length ? `<span class="nl-specline">${bits.join('')}</span>` : '';
            },
            // the coffee page's rows again (Learn's pages arrived after the page was drawn)
            nlSpecsRefresh() {
                const old = document.querySelector('#detail-view .nl-specs'), bean = this.activeGroup && this.activeGroup.meta;
                if (!old || !bean) return;
                const html = this.nlSpecRowsHtml(bean, { fold: true });
                if (html && old.outerHTML !== html) old.outerHTML = html;
            },
