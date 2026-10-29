            // ===================== v20.1: Learn 2 =====================
            // A page for every variety, species, process, country and region, from the research in learn/atlas.json (each
            // claim with its sources, checked against them). The cup in more depth (why, at its best, when it goes wrong, on
            // different coffees), how a process works (a cut cherry: which layers stay on while it dries), region pages with
            // the region lit on its country's map, a flavor finder, the world map's filters and the coffee page's story.

            LX_CONT_TINT: { 'Africa': 'floral', 'Asia': 'spice', 'Oceania': 'fruity', 'South America': 'nutty', 'North & Central America': 'sweet' },
            lxOne(t) { const m = String(t || '').match(/^(.+?[.!?])(\s|$)/); return m ? m[1] : String(t || ''); },
            lxTwo(t) { const m = String(t || '').match(/^(.+?[.!?])\s+(.+?[.!?])(\s|$)/); return m ? `${m[1]} ${m[2]}` : String(t || ''); },
            lxCap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); },
            lxSlug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
            // every source a record cites, in the order they come
            lxRxSrc(r) {
                const out = new Set(), walk = v => { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) { v.forEach(walk); return; } Object.entries(v).forEach(([k, x]) => { if (/^(src|ledeSrc|layersSrc)$/.test(k) && Array.isArray(x)) x.forEach(s => out.add(s)); else if (k !== 'map') walk(x); }); };
                walk(r); return [...out];
            },
            // a research record as a page entry (the same shape the written pages have, plus rx: the record itself)
            lxFromRx(r, maps) {
                const k = r.kind, x = k === 'region' ? null : k === 'origin' ? LearnEngine.entry('origin', r.id) : LearnEngine.entry(k, r.id);
                const secs = (r.sections || []).map(s => ({ key: `s-${this.lxSlug(s.title)}`, title: s.title, teaser: this.lxOne((s.body || [])[0] || ''), body: s.body || [], dated: s.dated || '' }));
                const cup = r.cup || null;
                const e = { kind: k, id: r.id, name: r.name || (x && x.name) || r.id, also: (r.also || []).slice(0, 4), summary: r.summary || '', lede: r.lede || '', ledeSrc: r.ledeSrc || [], facts: (r.facts || []).slice(0, 4),
                    taste: cup && ((cup.notes || []).length || cup.text) ? { notes: cup.notes || [], text: cup.text || '', src: cup.src || [] } : null, feel: cup && cup.feel && (cup.feel.body || cup.feel.acidity) ? cup.feel : null,
                    sections: secs, sources: this.lxRxSrc(r), updated: '2026-10-28', rx: r, fromRx: true };
                if (k === 'variety') {
                    const fam = (x && x.family) || '';
                    e.tint = this.LX_FAMNF[fam] || 'sweet';
                    e.kicker = typeof LearnTree !== 'undefined' && LearnTree.unsure(r.id) && !(x && x.q && fam === 'landrace') ? 'Variety · family not settled' : fam ? `Variety · ${x && x.q && fam === 'landrace' ? 'Ethiopian roots?' : LearnEngine.FAMILY[fam]}` : 'Variety';
                    e.family = { parents: ((r.family || {}).parents || []).filter(id => LearnEngine.entry('variety', id)) };
                } else if (k === 'species') { e.tint = 'earthy'; e.kicker = 'Species'; }
                else if (k === 'process') { const L = this.LX_LAYER[(x && x.layer) || ''] || ['process', 'fermented']; e.tint = L[1] === 'app' ? 'fermented' : L[1]; e.kicker = `Process · ${L[0]}`; }
                else if (k === 'origin') {
                    const cont = (x && x.continent) || '';
                    Object.assign(e, { country: r.id, continent: cont, tint: this.LX_CONT_TINT[cont] || 'fruity', kicker: `Origin${cont ? ' · ' + cont : ''}`, regions: r.regions || [], regionsNote: r.regionsNote || '' });
                    this.lxRxHarvest(e, r.harvest, r.name);
                    if (r.grows) e.grows = { varieties: (r.grows.varieties || []).filter(id => LearnEngine.entry('variety', id)), processes: (r.grows.processes || []).filter(id => LearnEngine.entry('process', id)), text: r.grows.text || '', species: r.grows.species || '' };
                    const m = maps && maps[r.id];
                    if (m) {   // (provinces the research says grow coffee, the ones with a region below darker; or a town in each coffee area)
                        e.map = r.id;
                        const reg = Object.keys(m.regions || {}), mine = new Set((r.regions || []).flatMap(g => [g.id, this.lxSlug(g.name), this.lxSlug(String(g.name).split(' (')[0])]));
                        const l3 = reg.filter(id => mine.has(id)), l1 = reg.filter(id => !mine.has(id));
                        e.mapTiers = { l3, l1 };
                        e.mapLegend = [l3.length ? ['l3', 'Regions below'] : null, l1.length ? ['l1', l3.length ? 'Other coffee areas' : 'Coffee areas'] : null, (m.dots || []).length ? ['dot', 'A town in a coffee area'] : null].filter(Boolean);
                    }
                } else if (k === 'region') {
                    const c = LearnEngine.entry('origin', r.country);
                    Object.assign(e, { country: r.country, continent: c ? c.continent : '', kicker: `Region · ${c ? c.name : r.country}`, tint: '' });
                    this.lxRxHarvest(e, r.harvest, r.name);
                    if (r.grows) e.grows = { varieties: (r.grows.varieties || []).filter(id => LearnEngine.entry('variety', id)), processes: (r.grows.processes || []).filter(id => LearnEngine.entry('process', id)), text: r.grows.text || '', species: r.grows.species || '' };
                }
                return e;
            },
            // research harvest months -> the calendar rows the origin pages draw (main and fly crops, or by area)
            lxRxHarvest(e, h, name) {
                if (!h || !(h.main || []).length) return;
                e.harvest = (h.areas || []).length ? h.areas.map(a => ({ area: a.area, main: a.main || [] })) : [{ area: name, main: h.main, second: (h.fly || []).length ? h.fly : undefined }];
                if ((h.fly || []).length) e.secondName = 'Smaller second crop';
                if (h.text) e.harvestText = { text: h.text };
            },
            // a region's page wears its country's colors
            lxRegionTint(e) { const c = this.lxEntry('origin', e.country); return (c && c.tint) || this.LX_CONT_TINT[e.continent] || 'fruity'; },
            lxRegionsOf(code) { const c = this.learnContent(); return c ? [...c.entries.values()].filter(e => e.kind === 'region' && e.country === code) : []; },

            // ---- In the cup: notes, what the sources say, body and acidity as ranges, then why / at its best / when it goes
            // wrong, how it shows on different coffees, and (processes) from prized to a fault. Long answers show their first
            // sentence until "More detail".
            lxCupSec(e) {
                const k = e.kind, t = e.taste || null, c = (e.rx && e.rx.cup) || null;
                if (!t && !c) return e.feel && this.lxFeelHtml ? { key: `${k}.feel`, open: true, title: 'Body and acidity', teaser: [e.feel.body, e.feel.acidity].filter(Boolean).join(' · '), body: `<div class="lx-box">${this.lxFeelHtml(e.feel)}</div>` } : null;
                const notes = (t && (t.notes || []).length ? t.notes : c && c.notes) || [], text = (t && t.text) || (c && c.text) || '';
                const feel = e.feel || (c && c.feel && (c.feel.body || c.feel.acidity) ? c.feel : null);
                const sh = s => `<span class="lx-sh">${this.esc(this.lxOne(s))}</span><span class="lx-fu">${this.esc(s)}</span>`;
                const qa = c ? [['Why it tastes this way', c.why], ['At its best', c.prized], ['When it goes wrong', c.watch]].filter(q => q[1]) : [];
                const by = c ? (c.byCoffee || []).filter(b => b && b.what && b.text) : [];
                const SP = { prized: [0, 'Prized'], divisive: [1, 'Divisive'], fault: [2, 'A fault'] };
                const sp = ((e.rx && e.rx.spectrum) || []).filter(x => SP[x.kind]).sort((a, b) => SP[a.kind][0] - SP[b.kind][0]).slice(0, 3);
                const textHtml = this.lxTwo(text) !== text ? sh(text).replace(this.esc(this.lxOne(text)), this.esc(this.lxTwo(text))) : this.esc(text);
                const long = this.lxTwo(text) !== text || qa.some(q => this.lxOne(q[1]) !== q[1]) || by.some(b => this.lxOne(b.text) !== b.text);
                const body = `<div class="lx-box lx-cupb">${notes.length ? `<div class="lx-flabel">Tends toward</div><div class="lx-notes">${notes.map(n => this.lxNote(n)).join('')}</div>` : ''}${text ? `<p class="lx-p">${textHtml}</p>` : ''}`
                    + `${feel && this.lxFeelHtml ? this.lxFeelHtml(feel) : ''}${t && t.label ? `<div class="lx-evrow">${this.lxEv(t.label)}${t.evidence ? `<span class="lx-small">${this.esc(t.evidence)}</span>` : ''}</div>` : ''}`
                    + `${sp.length ? `<div class="lx-hr"></div><div class="lx-flabel">From prized to a fault</div><div class="lx-spec"><div class="lx-sbar"></div><div class="lx-sl3">${sp.map(x => `<div class="lx-s${SP[x.kind][0]}"><b>${SP[x.kind][1]}</b>${this.esc(x.label)}</div>`).join('')}</div></div>` : ''}`
                    + `${qa.length ? `<div class="lx-hr"></div><div class="lx-qa">${qa.map(([q, a]) => `<div><div class="lx-q">${q}</div><p class="lx-p">${sh(a)}</p></div>`).join('')}</div>` : ''}`
                    + `${by.length ? `<div class="lx-hr"></div><div class="lx-flabel">On different coffees</div><div class="lx-by">${by.map(b => `<div><b>${this.esc(b.what)}</b><span>${sh(b.text)}</span></div>`).join('')}</div>` : ''}`
                    + `${long ? `<button type="button" class="lx-more" onclick="app.lxMore(this)" aria-expanded="false">More detail</button>` : ''}`
                    + `<p class="lx-note">${k === 'region' ? 'Region tastes are tendencies: farms, varieties and processing vary a lot within one region.' : 'A tendency, not a promise: ripeness, roast and your recipe move a cup as much.'}</p></div>`;
                return { key: `${k}.cup`, open: true, title: 'In the cup', teaser: notes.length ? notes.join(', ') : this.lxOne(text), body };
            },
            lxMore(btn) { const box = btn && btn.closest ? btn.closest('.lx-cupb') : null; if (!box) return; const on = !box.classList.contains('lx-full'); box.classList.toggle('lx-full', on); btn.textContent = on ? 'Less' : 'More detail'; btn.setAttribute('aria-expanded', String(on)); if (this.haptic) this.haptic('tick'); },

            // ---- the research's other parts
            lxPlantSec(e) {
                const p = e.rx && e.rx.plant; if (!p) return null;
                const rows = [['Height', p.stature], ['Yield', p.yield], ['Leaf rust', p.rust], ['Bean size', p.beanSize], ['Best altitude', p.altitude], ['First crop', p.firstCrop]].filter(q => q[1]);
                if (!rows.length) return null;
                const wcr = (p.src || []).length && (p.src || []).every(s => /^wcr-/.test(s));
                return { key: `${e.kind}.plant`, open: true, title: 'The plant', sub: wcr ? 'From World Coffee Research’s variety catalog' : '', teaser: rows.slice(0, 3).map(q => `${q[0]}: ${q[1]}`).join(' · '), body: `<div class="lx-plant">${rows.map(([kk, v]) => `<div class="lx-tile"><div class="lx-sl">${kk}</div><div class="lx-pv">${this.esc(this.lxCap(v))}</div></div>`).join('')}</div>` };
            },
            lxGrownSec(e) {
                const g = e.rx && e.rx.grownIn; if (!g || !((g.countries || []).length || g.text)) return null;
                const cs = (g.countries || []).filter(c => LearnEngine.entry('origin', c));
                return { key: `${e.kind}.grown`, open: true, title: 'Grown in', teaser: cs.map(c => this.lxName('origin', c)).join(', '), body: `${cs.length ? `<div class="lx-tags">${cs.map(c => this.lxLinkTag('origin', c, this.lxName('origin', c))).join('')}</div>` : ''}${g.text ? `<p class="lx-p lx-small2 lx-gap">${this.esc(g.text)}</p>` : ''}` };
            },
            lxStorySec(e) {
                const s = (e.rx && e.rx.story) || []; if (!s.length) return null;
                return { key: `${e.kind}.story`, open: true, title: 'Story', teaser: s.map(x => x.when).slice(0, 4).join(' · '), body: `<div class="lx-box"><div class="lx-story">${s.map(x => `<div><div class="lx-when">${this.esc(x.when)}</div><p class="lx-p">${this.esc(x.text)}</p></div>`).join('')}</div></div>` };
            },
            // related pages as cards (only the ones that open)
            lxRelatedSec(e, extra) {
                const list = (extra || ((e.rx && e.rx.related) || []).map(k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; }))
                    .filter(([kk, id]) => this.lxHasPage(kk, id) && !(kk === e.kind && id === e.id)).slice(0, 8);
                if (!list.length) return null;
                const cards = list.map(([kk, id]) => { const x = this.lxEntry(kk, id); const fam = x ? (kk === 'region' ? this.lxRegionTint(x) : x.tint || 'app') : 'app'; return `<button type="button" class="lx-rcard" data-fam="${this.esc(fam)}" onclick="${this.lxGo(kk, id)}"><span class="lx-rk">${this.esc(kk === 'origin' ? 'Country' : this.lxKindWord(kk))}</span><span class="lx-rn">${this.esc(this.lxName(kk, id))}</span>${x && x.summary ? `<span class="lx-rs">${this.esc(x.summary)}</span>` : ''}</button>`; });
                return { key: `${e.kind}.related`, open: true, title: e.kind === 'region' ? `More of ${this.lxName('origin', e.country)}` : 'Related', teaser: list.map(([kk, id]) => this.lxName(kk, id)).join(', '), body: `<div class="lx-related">${cards.join('')}</div>` };
            },
            // v20.3: a page with little written about it points to its closest relative that has a full page (for a variety, the
            // nearest parent or grandparent up its line). The relative's notes are labeled as the relative's, not this coffee's.
            lxHasCup(x) { return !!(x && (x.taste || (x.rx && x.rx.cup))); },
            lxHasStory(x) { return !!(x && (((x.rx && x.rx.story) || []).length || (x.sections || []).length >= 2)); },
            lxNearest(e) {
                const parse = k => { const i = String(k || '').indexOf(':'); return i > 0 ? [k.slice(0, i), k.slice(i + 1)] : null; };
                const full = (kk, id) => { const x = this.lxEntry(kk, id); return x && this.lxHasCup(x) && this.lxHasStory(x) ? x : null; };
                const set = parse(e.rx && e.rx.nearest); if (set && full(...set)) return set;
                if (e.kind === 'variety' && typeof LearnTree !== 'undefined' && LearnTree.MAIN) for (let p = LearnTree.MAIN[e.id]; p && p !== 'arabica'; p = LearnTree.MAIN[p]) if (!(LearnTree.GROUP || {})[p] && full('variety', p)) return ['variety', p];
                return null;
            },
            lxNearestSec(e) {
                if (!e || !['variety', 'species', 'process'].includes(e.kind) || (this.lxHasCup(e) && this.lxHasStory(e))) return null;
                const n = this.lxNearest(e); if (!n) return null;
                const [kk, id] = n, x = this.lxEntry(kk, id), name = this.lxName(kk, id), fam = x.tint || 'app';
                const notes = ((x.taste && x.taste.notes) || (x.rx && x.rx.cup && x.rx.cup.notes) || []).slice(0, 4);
                const what = !this.lxHasCup(e) ? `No source we found describes ${e.name}’s cup on its own.` : `Not much has been written about ${e.name}’s history.`;
                const how = kk === 'variety' && e.kind === 'variety' ? (LearnTree.MAIN && LearnTree.MAIN[e.id] === id ? 'its parent' : 'its closest relative with a full page') : 'the closest page with more';
                return { key: `${e.kind}.nearest`, open: true, title: `Closest relative: ${name}`, teaser: what,
                    body: `<div class="lx-box lx-near"><p class="lx-p">${this.esc(what)} ${this.esc(name)}, ${this.esc(how)}, has a full page. What’s said about ${this.esc(name)} may not all hold for ${this.esc(e.name)}.</p>`
                        + `<button type="button" class="lx-rcard lx-nearcard" data-fam="${this.esc(fam)}" onclick="${this.lxGo(kk, id)}"><span class="lx-rk">${this.esc(this.lxKindWord ? this.lxKindWord(kk) : kk)}</span><span class="lx-rn">${this.esc(name)}</span><span class="lx-rs">${this.esc(x.summary || '')}</span>${notes.length ? `<span class="lx-nearn"><em>${this.esc(name)}’s notes:</em> ${notes.map(t => this.esc(t)).join(', ')}</span>` : ''}<span class="lx-rgo">Open ${this.esc(name)} ›</span></button></div>` };
            },
            // a region page's towns
            lxPlacesSec(e) {
                const pl = (e.rx && e.rx.places) || []; if (!pl.length) return null;
                return { key: 'region.places', open: true, title: 'Names on the bag', sub: `Towns and areas you’ll see on ${e.name} coffees`, teaser: pl.join(', '), body: `<div class="lx-tags">${pl.map(n => `<span class="lx-tag">${this.esc(n)}</span>`).join('')}</div>` };
            },

            // ---- maps: an origin's regions open their pages; a region page lights itself up on its country's map
            lxMapLinks(code) {
                // map area or dot -> the region page it belongs to (a region made of several departments lights them all)
                const out = new Map();
                this.lxRegionsOf(code).forEach(r => {
                    const rid = r.id.split(':')[1]; out.set(rid, r.id);
                    ((r.rx && r.rx.map && r.rx.map.adm1) || []).forEach(n => { const s = this.lxSlug(n); if (!out.has(s)) out.set(s, r.id); });
                });
                return out;
            },
            lxRegionMapHtml(e) {
                const c = this.learnContent(), m = c && c.maps[e.country]; if (!m) return '';
                const links = this.lxMapLinks(e.country), mine = new Set([...links].filter(([, id]) => id === e.id).map(([a]) => a));
                const regions = Object.entries(m.regions || {}).map(([id, d]) => { const to = links.get(id); return `<path class="lx-rg${mine.has(id) ? ' on l3' : to ? ' on' : ''}" d="${d}"${to && !mine.has(id) ? ` data-lxr="${this.esc(to)}"` : ''}/>`; }).join('');
                const dots = this.lxDotLabels(m).map(d => { const to = links.get(d.id), me = mine.has(d.id); return `<g class="lx-mdot${me ? ' lx-mme' : ''}"${to && !me ? ` data-lxr="${this.esc(to)}"` : ''}><circle cx="${d.x}" cy="${d.y}" r="${((me ? 5 : 3.2) * this.lxMapZ(m)).toFixed(2)}"/><text x="${d.tx}" y="${d.ty}"${d.left ? ' text-anchor="end"' : ''}>${this.esc(d.label)}</text></g>`; }).join('');
                if (!mine.size) return '';
                const svg = `<svg class="lx-cmap" viewBox="${m.zoom ? m.zoom.join(' ') : `0 0 ${m.w} ${m.h}`}" style="--mz:${this.lxMapZ(m)}" role="img" aria-label="Map of ${this.esc(this.lxName('origin', e.country))} with ${this.esc(e.name)} marked" onclick="app.lxMapTap(event)"><path class="lx-rest" d="${m.rest || ''}"/>${regions}<path class="lx-outline" d="${m.outline}"/>${dots}</svg>`;
                const other = [...new Set(links.values())].filter(id => id !== e.id).length;
                return `<div class="lx-box lx-mapwrap lx-dotmap"><div class="lx-cmapbox">${svg}</div><div class="lx-legend"><span><i class="lx-lg-l3"></i>${this.esc(e.name)}</span>${other ? `<span><i class="lx-lg-l1"></i>Other regions with a page: tap one</span>` : ''}</div></div>`;
            },
            lxMapTap(ev) { const t = ev && ev.target && ev.target.closest ? ev.target.closest('[data-lxr]') : null; if (t) this.learnOpen('region', t.getAttribute('data-lxr')); },

            // ---- How a base method works: the cut cherry with what's still on the seed while it dries (from each method's
            // research: its layers, and its drying step's time)
            LX_METH: { washed: { on: ['parchment'], short: 'Fruit off and fermented away; dries in its parchment.' }, honey: { on: ['mucilage', 'parchment'], short: 'Skin and fruit off; the sticky layer dries on.' }, natural: { on: ['skin', 'fruit', 'mucilage', 'parchment'], short: 'The whole cherry dries around the seed.' }, 'wet-hulled': { on: [], short: 'Parchment off while it’s damp; the bare bean dries.' } },
            LX_LAYERS: [['skin', 'Skin', 'the red outside', '#c12e24'], ['fruit', 'Fruit', 'thin, sweet flesh', '#f2b39b'], ['mucilage', 'Sticky layer', 'the mucilage, sugary and slick', '#f0cf86'], ['parchment', 'Parchment', 'a papery shell', '#e6dbc0'], ['seed', 'Seed', 'the bean, usually two per cherry', '#9fbc86']],
            lxMethOff(m) { const on = new Set((this.LX_METH[m] || { on: [] }).on); return { skin: !on.has('skin'), fruit: !on.has('fruit'), mucilage: !on.has('mucilage'), parchment: !on.has('parchment') }; },
            lxMethLayers(m) { const on = new Set((this.LX_METH[m] || { on: [] }).on); return ['skin', 'fruit', 'mucilage', 'parchment'].map(l => `<span class="${on.has(l) ? 'on' : ''}">${this.LX_LAYERS.find(x => x[0] === l)[1]}</span>`).join(''); },
            lxMethDry(m) {
                const e = this.lxEntry('process', m), st = ((e && e.rx && e.rx.steps) || []).find(s => /^dry/i.test(s.title || '') && s.hours);
                return st ? String(st.hours).split(/[;:]/)[0].trim() : '';
            },
            lxMethNote(m) { const e = this.lxEntry('process', m), lay = e && e.rx && e.rx.layers, d = this.lxMethDry(m); return `${lay || ''}${d ? ` Drying: ${d}; the weather sets the pace.` : ''}`.trim(); },
            lxMethHtml(sel) {
                const ms = Object.keys(this.LX_METH).filter(m => this.lxEntry('process', m));
                return `<div class="lx-box lx-pdiag" id="lx-pdiag"><div class="lx-mseg" role="group" aria-label="Compare the methods">${ms.map(m => `<button type="button" class="${m === sel ? 'on' : ''}" aria-pressed="${m === sel}" onclick="app.lxMethPick('${app.escJs(m)}')">${this.esc(this.lxName('process', m))}</button>`).join('')}</div>`
                    + `<div class="lx-pdrow"><span class="lx-pdpic">${LearnTree.cut({ size: 116, off: this.lxMethOff(sel), label: `A coffee cherry cut in half: what stays on in ${this.lxName('process', sel).toLowerCase()} coffee` })}</span><div><div class="lx-flabel">On the seed while it dries</div><div class="lx-mlay">${this.lxMethLayers(sel)}</div></div></div>`
                    + `<p class="lx-p lx-small2">${this.esc(this.lxMethNote(sel))}</p></div>`;
            },
            lxMethPick(m) { const box = document.getElementById('lx-pdiag'); if (!box || !this.LX_METH[m]) return; box.outerHTML = this.lxMethHtml(m); if (this.haptic) this.haptic('tick'); },
            // a process's steps, from the research (title, how long, what happens)
            lxRxStepsHtml(e) {
                const steps = (e.rx && e.rx.steps) || [];
                return steps.length ? `<div class="lx-box lx-rsteps">${steps.map((s, i) => `<div><span class="lx-sn">${i + 1}</span><span><b>${this.esc(s.title)}</b>${s.hours && !/^none$/i.test(s.hours) ? ` <em>${this.esc(s.hours)}</em>` : ''}<p>${this.esc(s.text)}</p></span></div>`).join('')}</div>` : '';
            },

            // ===================== How it's made (the processes, from the cut cherry up) =====================
            lxMadePage(p) {
                const c = this.learnContent(), pm = c.pmap || { dots: [] }, hl = (p.opts && p.opts.hl) || '';
                const sumOf = id => { const e = this.lxEntry('process', id); if (e && e.summary) return e.summary; const s = LearnEngine.PSAY[id]; return s ? s[0] : ''; };
                const anat = `<div class="lx-box lx-anat"><span class="lx-anatpic">${LearnTree.cut({ size: 146 })}</span><div class="lx-anatkey">${this.LX_LAYERS.map(([, n, d, col]) => `<div><i style="background:${col}"></i><b>${this.esc(n)}</b><span>${this.esc(d)}</span></div>`).join('')}</div></div>`;
                const ms = Object.keys(this.LX_METH).filter(m => this.lxHasPage('process', m));
                const methods = `<div class="lx-group lx-mrows">${ms.map(m => `<button type="button" class="lx-row" onclick="${this.lxGo('process', m)}"><span class="lx-mpic">${LearnTree.cut({ size: 70, off: this.lxMethOff(m), label: this.lxName('process', m) })}</span><span class="lx-rmain"><b>${this.esc(this.lxName('process', m))}</b><small>${this.esc(this.LX_METH[m].short)}</small><span class="lx-mlay">${this.lxMethLayers(m)}</span></span><span class="lx-chev">${this.lxIc('i-chev-right', 16)}</span></button>`).join('')}</div>`;
                const procs = LearnEngine.allProcesses();
                const grid = list => `<div class="lx-ptiles">${list.map(x => this.lxHasPage('process', x.id) ? `<button type="button" onclick="${this.lxGo('process', x.id)}"><b>${this.esc(this.lxName('process', x.id))}</b><span>${this.esc(sumOf(x.id))}</span></button>` : `<div><b>${this.esc(x.name)}</b><span>${this.esc(sumOf(x.id))}</span></div>`).join('')}</div>`;
                const tops = procs.filter(x => ['fermentation', 'microbes', 'ingredients', 'after'].includes(x.layer));
                const dry = procs.filter(x => x.layer === 'drying');
                const decafs = (LearnEngine.knownIds().decaf || []).filter(id => id !== 'decaf');
                const secs = [
                    { key: 'made.cherry', open: true, title: 'Inside a coffee cherry', teaser: 'Skin, fruit, a sticky layer, parchment and the seed', body: anat },
                    { key: 'made.methods', open: true, title: 'Pick a method', sub: 'What stays on the seed while it dries', teaser: ms.map(m => this.lxName('process', m)).join(', '), body: methods },
                    { key: 'made.tops', open: true, title: 'Changes on top', sub: 'Extra steps added to one of the methods above', teaser: tops.map(x => x.name).slice(0, 5).join(', '), body: grid(tops) },
                    dry.length ? { key: 'made.drying', open: true, title: 'Drying', sub: 'Where and how fast it dries matters too', teaser: dry.map(x => x.name).join(', '), body: grid(dry) } : null,
                    { key: 'made.map', open: !!hl, title: 'The process map', teaser: 'How much fruit stays on, and how hands-on the ferment is', body: `<div class="lx-pmapbox">${this.lxProcessMapSvg(pm, hl)}<p class="lx-note">Tap a highlighted dot to open it.${pm.note ? ' ' + this.esc(pm.note) : ''}</p></div>` },
                    { key: 'made.decaf', open: false, title: 'Decaf', teaser: 'Not a process: how the caffeine comes out', body: `<div class="lx-group">${decafs.map(id => this.lxRow({ title: this.lxName('decaf', id), sub: LearnEngine.PSAY[id] ? LearnEngine.PSAY[id][0] : 'A way to take the caffeine out' })).join('')}</div>` },
                    this.lxSourcesObj(pm.sources || [], 'processes.sources')
                ];
                // an opened map (from a process page's "See it on the process map") is open whatever the phone remembers
                const list = secs.filter(Boolean).map(s => s.key === 'made.map' && hl ? { ...s, isOpen: true } : s);
                const html = this.lxHead({ kicker: 'Learn', kickerApp: true, name: 'How it’s made', small: true, lede: 'Every coffee bean is the seed of a fruit. How the fruit comes off, and when, shapes a lot of how the coffee tastes.' }) + this.lxSecs(list);
                return { fam: 'fermented', html };
            },

            // ===================== Find a flavor =====================
            // What the pages say tends to give a flavor (each page's cup notes, which carry their sources), plus where you
            // and the people you follow tasted it. A starting point, not a promise.
            lxWheel() { return (typeof NOTE_WHEEL !== 'undefined' ? NOTE_WHEEL : []).filter(f => (this.NL_WHEEL_FAM || {})[f.fam] !== 'off'); },
            lxFlavorAt(note) {
                const W = this.lxWheel(), key = String(note || '').toLowerCase();
                for (const f of W) for (const [g, ns] of f.groups) { if (g.toLowerCase() === key) return { f, g, note: g, group: true }; const n = ns.find(x => x.toLowerCase() === key); if (n) return { f, g, note: n, group: false }; }
                const f = W[0]; return f ? { f, g: f.groups[0][0], note: f.groups[0][0], group: true } : null;
            },
            // every page with cup notes, scored for a note: 3 = that note (or its group, for a group), 2 = the same group,
            // 1 = the same family
            lxFinder(note) {
                const at = this.lxFlavorAt(note), c = this.learnContent(); if (!at || !c) return [];
                const where = n => { const l = this.noteLocate ? this.noteLocate(n, 'coffee') : null; if (!l || l.wheel !== 'coffee' || l.f < 0) return null; const F = NOTE_WHEEL[l.f], G = l.g >= 0 ? F.groups[l.g][0] : ''; return { fam: F.fam, g: G, n: (l.note || G || F.fam).toLowerCase() }; };
                const want = at.note.toLowerCase(), out = [];
                c.entries.forEach(e => {
                    const notes = ((e.taste && e.taste.notes) || (e.rx && e.rx.cup && e.rx.cup.notes) || []);
                    if (!notes.length || !this.lxHasPage(e.kind, e.kind === 'origin' ? e.country : e.id)) return;
                    let s = 0, exact = 0, pos = 99;
                    notes.forEach((n, i) => { const w = where(n); if (!w) return; let v = 0; if (w.n === want || (at.group && w.g === at.g)) v = 3; else if (w.g && w.g === at.g) v = 2; else if (w.fam === at.f.fam) v = 1; if (v > s || (v === s && v && i < pos)) { s = v; pos = i; } if (w.n === want) exact = 1; });
                    if (s) out.push({ e, s, notes, exact, pos, written: e.fromRx ? 0 : 1 });
                });
                // the strongest match first: the note itself, then early in the page's list, then a written page
                return out.sort((a, b) => b.s - a.s || b.exact - a.exact || a.pos - b.pos || b.written - a.written || a.e.name.localeCompare(b.e.name));
            },
            lxFlavorPage(p) {
                const at = this.lxFlavorAt(p.id || 'Berry'); if (!at) return { fam: 'app', html: '' };
                const fam = this.NL_WHEEL_FAM[at.f.fam] || 'fruity', W = this.lxWheel(), lw = at.note.toLowerCase();
                const tabs = `<div class="lx-chips lx-ftabs" role="tablist" aria-label="Flavor families">${W.map(f => { const fk = this.NL_WHEEL_FAM[f.fam]; return `<button type="button" class="lx-chip${f === at.f ? ' on' : ''}" data-nf="${fk}" aria-pressed="${f === at.f}" onclick="app.lxFlavorPick('${app.escJs(f.groups[0][0])}')">${this.esc(f.fam)}</button>`; }).join('')}</div>`;
                const groups = at.f.groups.map(([g]) => `<button type="button" class="nl-nt lx-pnt lx-big${g === at.g ? ' on' : ''}" data-nf="${fam}" aria-pressed="${g === at.g}" onclick="app.lxFlavorPick('${app.escJs(g)}')">${this.esc(g)}</button>`).join('');
                const ns = (at.f.groups.find(x => x[0] === at.g) || ['', []])[1];
                const notes = ns.map(n => `<button type="button" class="nl-nt lx-pnt${n === at.note ? ' on' : ''}" data-nf="${fam}" aria-pressed="${n === at.note}" onclick="app.lxFlavorPick('${app.escJs(n === at.note ? at.g : n)}')">${this.esc(n)}</button>`).join('');
                const pick = `<div class="lx-pick"><div class="lx-notes">${groups}</div><div><div class="lx-flabel">${this.esc(at.g)}: narrow it down, or keep it broad</div><div class="lx-notes">${notes}</div></div></div>`;
                const res = this.lxFinder(at.note);
                const KW = { process: 'process', origin: 'place', region: 'place', variety: 'variety', species: 'variety' };
                const top = w => res.filter(x => KW[x.e.kind] === w).slice(0, 3);
                const lists = [['process', 'Processes'], ['place', 'Places'], ['variety', 'Varieties']].map(([w, t]) => [w, t, top(w)]).filter(x => x[2].length);
                const odds = s => `<span class="lx-odds" aria-label="${s >= 3 ? 'Often' : s === 2 ? 'Sometimes' : 'Now and then'}"><span>${[1, 2, 3].map(i => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</span><small>${s >= 3 ? 'Often' : s === 2 ? 'Sometimes' : 'Now and then'}</small></span>`;
                const go = x => this.lxGo(x.e.kind, x.e.kind === 'origin' ? x.e.country : x.e.id);
                const kindLabel = x => x.e.kind === 'region' ? `Region · ${this.lxName('origin', x.e.country)}` : x.e.kind === 'origin' ? 'Country' : this.lxKindWord(x.e.kind);
                const row = x => `<button type="button" class="lx-row lx-match" onclick="${go(x)}"><span class="lx-rmain"><b>${this.esc(x.e.name)} <span class="lx-muted">${this.esc(kindLabel(x))}</span></b><small>${this.esc(this.lxOne((x.e.taste && x.e.taste.text) || (x.e.rx && x.e.rx.cup && x.e.rx.cup.text) || x.e.summary || ''))}</small><span class="lx-notes">${x.notes.map(n => this.lxNote(n)).join('')}</span></span>${odds(x.s)}</button>`;
                const best = lists.map(l => l[2][0]).filter(Boolean);
                const secs = [];
                if (best.length) secs.push({ key: 'flavor.best', open: true, title: `Best odds for ${lw}`, sub: 'Where the sources most often describe it', teaser: best.map(x => x.e.name).join(', '), body: `<div class="lx-box"><div class="lx-flabel">Try a coffee that’s</div><div class="lx-tags">${best.map(x => `<button type="button" class="lx-tag lx-link" onclick="${go(x)}">${this.esc(x.e.name)}${this.lxIc('i-chev-right', 14)}</button>`).join('')}</div><p class="lx-p lx-small2 lx-gap">${best.length > 1 ? `Each one leans toward ${this.esc(lw)} on its own, so together they give you the best chance.` : `It leans toward ${this.esc(lw)}.`}</p></div>` });
                lists.forEach(([w, t, l]) => secs.push({ key: `flavor.${w}`, open: true, title: t, teaser: l.map(x => x.e.name).join(', '), body: `<div class="lx-group">${l.map(row).join('')}</div>` }));
                if (!lists.length) secs.push({ raw: `<div class="lx-sec"><p class="lx-note">No page here describes ${this.esc(lw)} yet.</p></div>` });
                const here = this.lxFlavorHere(at); if (here) secs.push(here);
                const you = this.lxFlavorYou(at); if (you) secs.push(you);
                const html = this.lxHead({ kicker: 'Learn', kickerApp: true, name: 'Find a flavor', small: true, lede: 'Pick something you’d love to taste and see where it’s most often found: a starting point, not a promise.' })
                    + `<div class="lx-sec lx-tight lx-fpick" data-fam="${fam}">${tabs}${pick}</div>` + secs.map(s => s.raw ? s.raw : this.lxSecs([s])).join('')
                    + `<p class="lx-note lx-foot">Roast, freshness and your recipe move a cup as much as any of these.</p>`;
                return { fam, html };
            },
            lxFlavorPick(note) { const top = this.lxTop(); if (!top || top.kind !== 'flavor') return; top.id = note; this.learnRender(true); if (this.haptic) this.haptic('tick'); },
            // does a session's notes include the flavor (a group takes all its notes)
            lxBrewHas(b, at) {
                const want = at.note.toLowerCase();
                return this.brewNoteList(b).some(([n]) => { const l = this.noteLocate(n, 'coffee'); if (!l || l.wheel !== 'coffee' || l.f < 0) return false; const F = NOTE_WHEEL[l.f], G = l.g >= 0 ? F.groups[l.g][0] : ''; return String(l.note || '').toLowerCase() === want || (at.group && G === at.g) || (!l.note && G === at.g && at.group); });
            },
            // you and the people you follow: the coffees it was tasted in (what's on this phone), most people first
            lxFlavorHere(at) {
                const by = new Map();
                this.brews.forEach(b => {
                    if (this.isTeaBrew(b) || !this.lxBrewHas(b, at)) return;
                    const bean = this.beans.get(String(b.beanId || '')); if (!bean || this.isTeaBean(bean)) return;
                    const key = this.beanGroupKey(bean); let x = by.get(key); if (!x) { x = { bean, who: new Set(), n: 0 }; by.set(key, x); }
                    x.who.add(this.getBrewOwner(b)); x.n++;
                });
                const list = [...by.values()].sort((a, b) => b.who.size - a.who.size || b.n - a.n).slice(0, 5);
                if (!list.length) return null;
                const rows = list.map(x => { const dec = this.lxTagLine(x.bean); return this.lxRow({ title: x.bean.name || 'Coffee', sub: [x.bean.roaster, dec, x.who.size > 1 ? `${x.who.size} people` : x.who.has(this.user) ? 'you' : '1 person'].filter(Boolean).join(' · '), onclick: `app.learnOpenCoffee('${app.escJs(String(x.bean.id))}')` }); });
                return { key: 'flavor.here', open: true, title: 'Tasted here', sub: `Coffees you and the people you follow tasted ${at.note.toLowerCase()} in`, teaser: list.map(x => x.bean.name).join(', '), body: `<div class="lx-group">${rows.join('')}</div>` };
            },
            lxFlavorYou(at) {
                const mine = (this.brewsOf ? this.brewsOf(this.user) : [...this.brews.values()].filter(b => this.getBrewOwner(b) === this.user)).filter(b => !this.isTeaBrew(b) && this.lxBrewHas(b, at));
                if (!mine.length) return null;
                const procs = new Map(); let best = null;
                mine.forEach(b => {
                    const bean = this.beans.get(String(b.beanId || '')); if (!bean) return;
                    const t = this.lxTags(bean), p = t && t.process && t.process.base; if (p) procs.set(p, (procs.get(p) || 0) + 1);
                    const r = this.normalizeRating(b.rating); if (r > 0 && (!best || r > best.r)) best = { r, bean };
                });
                const topP = [...procs].sort((a, b) => b[1] - a[1])[0];
                const text = `You’ve tasted ${this.esc(at.note.toLowerCase())} in <b>${this.lxPlural(mine.length, 'session')}</b>${topP && topP[1] > 1 ? `, most often in ${this.esc(this.lxName('process', topP[0]).toLowerCase())} coffees (${topP[1]})` : ''}.${best ? ` Your best: ${this.esc(best.bean.name || 'Coffee')}, ${this.fmtNum(best.r, 1)} ★.` : ''}`;
                return { key: 'flavor.you', open: true, title: 'You', teaser: this.lxPlural(mine.length, 'session'), body: `<div class="lx-box"><p class="lx-p">${text}</p></div>` };
            },
            // "Colombia · Washed · Caturra": a coffee's kinds in a few words
            lxTagLine(bean) {
                const t = this.lxTags(bean); if (!t) return '';
                const o = t.origin || {}, p = t.process || {};
                return [(o.countries || []).length === 1 ? this.lxName('origin', o.countries[0]) : '', p.base ? (LearnEngine.processName(p) || this.lxName('process', p.base)) : '', (t.variety || [])[0] ? this.lxName('variety', t.variety[0]) : ''].filter(Boolean).join(' · ');
            },

            // ===================== the World map (Origins), with filters =====================
            lxWorldPage(p) {
                const c = this.learnContent(), ov = this.lxOverview() || {}, st = this.lxState(), f = st.wf || 'all';
                const all = LearnEngine.allCountries(), P = this.lxPassport(this.user), had = new Set([...P.countries.keys()]);
                const fresh = this.lxFreshNow(), freshSet = new Set(fresh.map(x => x.code));
                const AM = ['South America', 'North & Central America'];
                const inF = x => f === 'all' || (f === 'had' && had.has(x.code)) || (f === 'fresh' && freshSet.has(x.code)) || (f === 'Americas' && AM.includes(x.continent)) || x.continent === f;
                const pages = new Set(all.map(x => x.code).filter(code => this.lxHasPage('origin', code)));
                const sel = new Set(all.filter(inF).map(x => x.code));
                const conts = ['Africa', 'Americas', 'Asia', 'Oceania'].filter(k => all.some(x => k === 'Americas' ? AM.includes(x.continent) : x.continent === k));
                const chips = [['all', 'All'], ...(had.size ? [['had', 'You’ve had']] : []), ...(fresh.length ? [['fresh', 'Fresh now']] : []), ...conts.map(k => [k, k])];
                const legend = f === 'had' ? 'Countries you’ve had' : f === 'fresh' ? 'Picked recently enough to be fresh now' : f === 'all' ? 'Grows coffee' : `Grows coffee: ${f}`;
                const mapBody = `<div class="lx-mapbox" data-fam="fruity">${this.lxWorldSvg({ hot: f === 'all' ? null : sel, pages, belt: true })}<div class="lx-legend"><span><i class="lx-lg-on"></i>${this.esc(legend)}</span><span><i class="lx-lg-belt"></i>The coffee belt, between the tropics</span></div></div>`;
                const chipHtml = `<div class="lx-chips" role="tablist" aria-label="Show">${chips.map(([k, l]) => `<button type="button" class="lx-chip${k === f ? ' on' : ''}" aria-pressed="${k === f}" onclick="app.lxSetWorld('${app.escJs(k)}')">${this.esc(l)}</button>`).join('')}</div>`;
                const n = code => { const x = ov[`origin:${code}`]; return x ? x[2] : 0; };
                const mineN = code => (P.countries.get(code) || {}).n || 0;
                const list = all.filter(inF).map(x => ({ x, n: n(x.code), s: f === 'had' ? mineN(x.code) : (ov[`origin:${x.code}`] || [0])[0], page: pages.has(x.code) }))
                    .sort((a, b) => b.s - a.s || (b.page - a.page) || a.x.name.localeCompare(b.x.name));
                const rows = list.map(r => { const e = r.page ? this.lxEntry('origin', r.x.code) : null, nr = this.lxRegionsOf(r.x.code).length; const sub = [e && e.summary ? e.summary.replace(/\.$/, '') : r.x.continent, f === 'had' ? this.lxPlural(mineN(r.x.code), 'session') : r.n ? this.lxPlural(r.n, 'coffee') + ' here' : '', nr ? this.lxPlural(nr, 'region') : ''].filter(Boolean).join(' · '); return this.lxRow({ titleHtml: `${this.esc(r.x.name)}${had.has(r.x.code) && f !== 'had' ? ` <span class="lx-had" aria-label="you’ve had it">${this.lxIc('i-check', 13)}</span>` : ''}`, sub, onclick: r.page ? this.lxGo('origin', r.x.code) : '' }); });
                const nRegions = [...c.entries.values()].filter(e => e.kind === 'region').length;
                const freshNote = f === 'fresh' ? `<p class="lx-note">${this.esc(this.lxMonthWord())}: an estimate from harvest months, plus the few months a crop takes to reach roasters.${fresh.some(x => x.allYear) ? ` ${this.esc(fresh.filter(x => x.allYear).map(x => this.lxName('origin', x.code)).join(', '))}: most of the year.` : ''}</p>` : '';
                const secs = [
                    { key: 'origins.map', open: true, title: 'Where coffee grows', teaser: `${all.length} countries, in a band around the tropics`, body: mapBody, cls: 'lx-mapsec' },
                    { raw: chipHtml },
                    { key: 'origins.list', open: true, title: 'Countries', meta: String(list.length), teaser: list.slice(0, 4).map(r => r.x.name).join(', '), body: `<div class="lx-group">${this.moreHtml(rows, 6, '')}</div>${freshNote}${f === 'all' && Object.keys(ov).length ? `<p class="lx-note">${this.esc(c.origins.note || '')}</p>` : ''}` }
                ];
                const html = this.lxHead({ kicker: 'Learn', kickerApp: true, name: 'World map', small: true, lede: `${all.length} countries and ${nRegions} regions. Tap a country to open it; its regions open from there.` }) + secs.map(s => s.raw ? s.raw : this.lxSecs([s])).join('');
                return { fam: 'app', html };
            },
            lxSetWorld(k) { this.lxState().wf = k; this.learnRender(true); if (this.haptic) this.haptic('tick'); },

            // ===================== the Learn home's doors =====================
            lxWheelArt() {
                const fams = this.lxWheel(), cx = 64, cy = 64, gap = 0.035, total = fams.reduce((n, f) => n + f.groups.length, 0);
                const arc = (a0, a1, r0, r1, fill, op) => { const p = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)], q = v => v.toFixed(1); const [x0, y0] = p(a0, r1), [x1, y1] = p(a1, r1), [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0), lg = a1 - a0 > Math.PI ? 1 : 0; return `<path d="M${q(x0)} ${q(y0)}A${r1} ${r1} 0 ${lg} 1 ${q(x1)} ${q(y1)}L${q(x2)} ${q(y2)}A${r0} ${r0} 0 ${lg} 0 ${q(x3)} ${q(y3)}Z" fill="${fill}" opacity="${op}"/>`; };
                let a = -Math.PI / 2, s = '';
                fams.forEach(f => { const span = f.groups.length / total * 2 * Math.PI; s += arc(a + gap, a + span - gap, 20, 40, f.color, 0.95); let b = a; f.groups.forEach(() => { const sp = span / f.groups.length; s += arc(b + gap, b + sp - gap, 43, 60, f.color, 0.6); b += sp; }); a += span; });
                return `<svg class="lxk lx-dart lx-dwheel" viewBox="0 0 128 128" aria-hidden="true">${s}</svg>`;
            },
            lxDoorsHtml() {
                const nV = LearnEngine.allVarieties().filter(v => v.family !== 'species').length, nC = LearnEngine.allCountries().length, nP = LearnEngine.allProcesses().length;
                const c = this.learnContent(), nR = c ? [...c.entries.values()].filter(e => e.kind === 'region').length : 0;
                if (typeof LearnTree !== 'undefined') this.lxTreeDefs();
                const door = (fam, on, art, name, sub) => `<button type="button" class="lx-door2" data-fam="${fam}" onclick="${on}"><span class="lx-dart-w">${art}</span><span class="lx-dn">${name}</span><span class="lx-dc">${sub}</span></button>`;
                return `<div class="lx-doors2">`
                    + door('vegetal', "app.lxTreeOpen('')", typeof LearnTree !== 'undefined' ? LearnTree.sprig().replace('class="lxk"', 'class="lxk lx-dart lx-dtree"') : '', 'Coffee tree', `${nV} varieties`)
                    + door('fruity', "app.learnOpen('list', 'origins')", this.lxWorldSvg({ mini: true, belt: true }).replace('class="lx-world', 'class="lx-dart lx-dworld lx-world'), 'World map', `${nC} countries`)
                    + door('floral', "app.learnOpen('flavor', 'Berry')", this.lxWheelArt(), 'Find a flavor', 'Berry? Chocolate?')
                    + door('fermented', "app.learnOpen('list', 'processes')", typeof LearnTree !== 'undefined' ? LearnTree.cut({ size: 100 }).replace('class="lxk lx-cut"', 'class="lxk lx-cut lx-dart lx-dcut"') : '', 'How it’s made', `${nP} processes`)
                    + `</div>`;
            },
            // the search bar on the Learn home opens the header's search
            lxSearchBarHtml() { return `<button type="button" class="lx-searchbar" onclick="app.lxSearchFocus()">${this.lxIc('i-search', 18)}<span>Search varieties, places, flavors</span></button>`; },
            lxSearchFocus() {
                const btn = document.getElementById('top-search-btn'), top = document.getElementById('search-input-top');
                if (btn && btn.offsetParent !== null && this.openTopSearch) { this.openTopSearch(); if (top) try { top.focus(); } catch (e) {} return; }
                const d = document.getElementById('search-input') || document.getElementById('search-input-mobile'); if (d) try { d.focus(); } catch (e) {}
            },

            // ===================== the coffee page: About this coffee, as the coffee's story =====================
            // The trees, where it grew, how it was processed, and what that combination tends toward: notes the parts' pages
            // share, pieced together from what's said about each part (not a prediction).
            lxJourney(bean) {
                const t = this.lxTags(bean); if (!t) return null;
                const steps = [], parts = [], meta = {};
                const cupOf = (kind, id) => { const e = this.lxEntry(kind, id); const notes = e ? ((e.taste && e.taste.notes) || (e.rx && e.rx.cup && e.rx.cup.notes) || []) : []; return { e, notes }; };
                const vs = (t.variety || []).filter(id => LearnEngine.entry('variety', id));
                const and = a => a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : (a[0] || '');
                if (vs.length) {
                    const names = vs.map(id => this.lxName('variety', id)), e0 = this.lxEntry('variety', vs[0]); meta.tree = and(names);
                    let sub = e0 && e0.summary ? e0.summary : (LearnEngine.SAY[vs[0]] ? `${names[0]} ${LearnEngine.SAY[vs[0]][0]}.` : '');
                    if (vs.length > 1) {   // (a sentence for each, the ones that say the same thing together, as the bag decoder does)
                        const said = new Map(); vs.forEach(id => { const x = LearnEngine.SAY[id]; if (!x) return; if (!said.has(x[0])) said.set(x[0], []); said.get(x[0]).push(this.lxName('variety', id)); });
                        if (said.size) sub = [...said].map(([x, ns]) => `${and(ns)} ${ns.length > 1 ? x.replace(/^is /, 'are ').replace(/^was /, 'were ').replace(/^comes /, 'come ').replace(/^means /, 'mean ') : x}.`).join(' ');
                    }
                    steps.push({ ic: 'i-tree', k: vs.length > 1 ? 'The trees' : 'The tree', n: and(names), s: sub, go: this.lxHasPage('variety', vs[0]) ? this.lxGo('variety', vs[0]) : '' });
                    vs.forEach(id => parts.push([this.lxName('variety', id), cupOf('variety', id).notes]));
                } else if (t.species && t.species !== 'arabica') {
                    meta.tree = this.lxName('species', t.species);
                    steps.push({ ic: 'i-tree', k: 'The species', n: this.lxName('species', t.species), s: (this.lxEntry('species', t.species) || {}).summary || '', go: this.lxHasPage('species', t.species) ? this.lxGo('species', t.species) : '' });
                    parts.push([this.lxName('species', t.species), cupOf('species', t.species).notes]);
                } else if (t.species === 'arabica') {
                    const eth = (t.origin.countries || []).length === 1 && t.origin.countries[0] === 'ETH';
                    steps.push({ ic: 'i-tree', k: 'The trees', n: 'Arabica', s: eth ? 'The species. The bag doesn’t name the variety, which is fine: in Ethiopia it usually means local landraces or research-station selections.' : 'The species. The bag doesn’t name the variety, which is fine.', go: this.lxHasPage('species', 'arabica') ? this.lxGo('species', 'arabica') : '' });
                }
                const o = t.origin || {}, code = (o.countries || []).length === 1 && !o.blend ? o.countries[0] : '';
                if (code) {
                    const rid = o.region ? `${code}:${o.region}` : '', re = rid ? this.lxEntry('region', rid) : null, ce = this.lxEntry('origin', code);
                    const rname = rid ? (re ? re.name : (LearnEngine.entry('region', rid) || {}).name) : '';
                    const place = [o.placeName, rname, this.lxName('origin', code)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
                    meta.place = rname || this.lxName('origin', code);
                    steps.push({ ic: 'i-pin', k: 'Where it grew', n: place, s: (re && re.summary) || (ce && ce.summary) || '', go: re ? this.lxGo('region', rid) : this.lxHasPage('origin', code) ? this.lxGo('origin', code) : '' });
                    const pc = re ? cupOf('region', rid) : cupOf('origin', code);
                    parts.push([re ? re.name : this.lxName('origin', code), pc.notes, re || ce]);
                } else if ((o.countries || []).length > 1) steps.push({ ic: 'i-pin', k: 'Where it grew', n: and(o.countries.map(cc => this.lxName('origin', cc))), s: 'A blend from more than one country.', go: '' });
                const p = t.process || {};
                if (p.base || (p.layers || []).length) {
                    const ids = [...(p.layers || []), p.base].filter(Boolean), nm = this.lxCap([...(p.layers || []).map(id => this.lxName('process', id).toLowerCase()), p.base ? (LearnEngine.processName(p) || this.lxName('process', p.base)).toLowerCase() : ''].filter(Boolean).join(' '));
                    const first = ids[0], pe = this.lxEntry('process', first); meta.proc = nm;
                    steps.push({ ic: 'i-drop', k: 'How it was processed', n: nm, s: pe && pe.summary ? pe.summary : '', go: this.lxHasPage('process', first) ? this.lxGo('process', first) : '' });
                    ids.forEach(id => parts.push([this.lxName('process', id), cupOf('process', id).notes]));
                }
                if (!steps.length) return null;
                // the notes the parts share, most shared first
                const cnt = new Map(); parts.forEach(([who, notes]) => (notes || []).forEach(n => { const k = String(n); if (!cnt.has(k)) cnt.set(k, []); if (!cnt.get(k).includes(who)) cnt.get(k).push(who); }));
                const ranked = [...cnt].sort((a, b) => b[1].length - a[1].length).slice(0, 4), shared = ranked.filter(x => x[1].length > 1);
                const placePart = parts.find(x => x[2]), feel = placePart && placePart[2] ? (placePart[2].feel || (placePart[2].rx && placePart[2].rx.cup && placePart[2].rx.cup.feel)) : null;
                return { steps, ranked, shared, feel, meta, placeKind: placePart && placePart[2] ? (placePart[2].kind === 'region' ? 'region' : 'country') : '' };
            },
            // "Washed Caturra, Colombia and Tabi from Cauca": About this coffee, folded
            lxAboutLine(J) {
                const m = J.meta || {}, head = m.proc ? `${m.proc}${m.tree ? ' ' + m.tree : ' coffee'}` : (m.tree || 'A coffee');
                return `${this.lxCap(head)}${m.place ? ` from ${m.place}` : ''}`;
            },
            lxJourneyHtml(J) {
                const step = s => { const inner = `<span class="lx-jic">${this.lxIc(s.ic, 20)}</span><span class="lx-rmain"><small class="lx-jk">${this.esc(s.k)}</small><b>${this.esc(s.n)}</b>${s.s ? `<small>${this.esc(s.s)}</small>` : ''}</span>${s.go ? `<span class="lx-chev">${this.lxIc('i-chev-right', 16)}</span>` : ''}`; return s.go ? `<button type="button" class="lx-jstep" onclick="${s.go}">${inner}</button>` : `<div class="lx-jstep">${inner}</div>`; };
                const sharedLine = J.shared.length ? `${this.esc(this.lxCap(J.shared.map(x => x[0].toLowerCase()).join(' and ')))} ${J.shared.length > 1 ? 'come' : 'comes'} up for ${J.shared[0][1].length > 2 ? 'several of its parts' : `both ${this.esc(J.shared[0][1].join(' and '))}`}. ` : '';
                const f = J.feel || {}, feelLine = f.acidity || f.body ? `The ${J.placeKind || 'place'} is described with ${f.acidity ? `${this.esc(f.acidity)} acidity` : ''}${f.acidity && f.body ? ' and ' : ''}${f.body ? `a ${this.esc(f.body)} body` : ''}.` : '';
                const tends = J.ranked.length ? `<div class="lx-jstep lx-jend"><span class="lx-jic">${this.lxIc('i-coffee', 20)}</span><span class="lx-rmain"><small class="lx-jk">This combination tends toward</small><span class="lx-cupbox"><span class="lx-notes">${J.ranked.map(x => this.lxNote(x[0])).join('')}</span>${sharedLine || feelLine ? `<span class="lx-p">${sharedLine}${feelLine}</span>` : ''}<small class="lx-note">Pieced together from what’s said about each part, not a prediction. Roast and your recipe move it a lot.</small></span></span></div>` : '';
                return `<div class="lx-journey">${J.steps.map(step).join('')}${tends}</div>`;
            },
