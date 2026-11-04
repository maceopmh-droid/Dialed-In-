            // ===================== v21.3: a coffee's specs, one row each =====================
            // Maceo (Nov 3): "make the specs of the bean more clear like origin, variety, process separation because right now
            // it's all together"; he picked labeled rows (Nov 4) and asked what happens with more than one origin or process
            // (Urrao's Anaerobic Natural, Alchemy's three origins). One row per kind of spec, each with its icon and label; a
            // row with one value opens its Learn page; a row with several shows each as its own small button; anything Learn
            // doesn't know is plain text. The Coffees list gets the same icons on one line instead of "Colombia · Washed".
            nlSpecItems(bean) {
                const out = { origin: [], region: [], variety: [], process: [], roast: [] };
                if (!bean) return out;
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
                    if (p.base) out.process.push(it('process', p.base, LearnEngine.processName(p) || this.lxName('process', p.base)));
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
            NL_SPEC_ROWS: [['origin', 'i-pin', 'Origin', 'Origins'], ['region', 'i-globe', 'Region', 'Regions'], ['variety', 'i-leaf-line', 'Variety', 'Varieties'], ['process', 'i-drop', 'Process', 'Process'], ['roast', 'i-flame', 'Roast', 'Roast']],
            nlSpecRowsHtml(bean, o = {}) {   // (o.links false: no Learn buttons, e.g. on a share link's page)
                const items = this.nlSpecItems(bean);
                if (o.links === false) Object.values(items).forEach(list => list.forEach(x => { x.page = false; }));
                const ic = id => `<svg class="icon nl-spec-ic" aria-hidden="true"><use href="#${id}"/></svg>`, chev = (c = '') => `<svg class="icon nl-spec-ch${c}" aria-hidden="true"><use href="#i-chev-right"/></svg>`;
                const rows = this.NL_SPEC_ROWS.map(([k, icon, one, many]) => {
                    const list = items[k]; if (!list.length) return '';
                    if (list.length === 1) {
                        const x = list[0], inner = `${ic(icon)}<span class="nl-spec-k">${one}</span><span class="nl-spec-v">${this.esc(x.label)}</span>`;
                        return x.page ? `<button type="button" class="nl-spec" onclick="${this.lxGo(x.kind, x.id)}">${inner}${chev()}</button>` : `<div class="nl-spec">${inner}</div>`;
                    }
                    const pills = list.map(x => x.page ? `<button type="button" class="nl-spec-pill" onclick="${this.lxGo(x.kind, x.id)}">${this.esc(x.label)}${chev(' sm')}</button>` : `<span class="nl-spec-pill is-plain">${this.esc(x.label)}</span>`).join('');
                    return `<div class="nl-spec nl-spec-multi">${ic(icon)}<span class="nl-spec-k">${many}</span><span class="nl-spec-v">${pills}</span></div>`;
                }).filter(Boolean);
                return rows.length ? `<div class="nl-specs" role="list" aria-label="About this ${this.isTeaBean && this.isTeaBean(bean) ? 'tea' : 'coffee'}">${rows.join('')}</div>` : '';
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
                const html = this.nlSpecRowsHtml(bean);
                if (html && old.outerHTML !== html) old.outerHTML = html;
            },
