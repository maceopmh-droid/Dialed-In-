            // ===================== v20.0: Learn, coffee's family tree =====================
            // The tree screen (Learn › Varieties › The coffee tree): every variety grows from the one it came from; tap a name and
            // its line lights up from the roots. Each variety's page gets its family line (the same family, as a list), and body
            // and acidity draw as ranges. The drawing and the family live in LearnTree (src/js/08-learn-tree.js).

            // ---- what you've logged, as variety ids (red cherries on the tree, "Yours" on a family line)
            lxMineVarieties() { const M = this.lxMine(this.user), s = new Set(); M.kinds.forEach((v, k) => { if (k.startsWith('variety:')) s.add(k.slice(8)); }); return s; },
            lxVName(id) { const v = LearnEngine.allVarieties().find(x => x.id === id); return v ? v.name : id; },
            // the tree's colors and cherries, once per page
            lxTreeDefs() { if (typeof document === 'undefined' || document.getElementById('lx-kit-defs')) return; const d = document.createElement('div'); d.innerHTML = `<svg id="lx-kit-defs" width="0" height="0" style="display:block;position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${LearnTree.defs()}</svg>`; document.body.appendChild(d.firstChild); },

            // ---- a variety's family line, with its children and a way onto the tree
            lxFamilySec(id) {
                if (typeof LearnTree === 'undefined' || !LearnTree.has(id)) return null;
                this.lxTreeDefs();
                const ctx = { name: x => this.lxVName(x), esc: s => this.esc(s), mine: this.lxMineVarieties(), world: typeof WORLD_MAP !== 'undefined' ? WORLD_MAP : null,
                    open: x => this.lxHasPage('variety', x) ? this.lxGo('variety', x) : '', openKind: (k, x) => this.lxHasPage(k, x) ? this.lxGo(k, x) : '', tree: `app.lxTreeOpen('')` };
                const line = LearnTree.line(id, ctx); if (!line) return null;
                const kids = LearnTree.children(id).filter(k => LearnEngine.allVarieties().some(v => v.id === k));
                const unsure = LearnTree.unsure(id);
                const body = `<div class="lx-box lx-flbox">${line}${kids.length ? `<div class="lx-hr"></div><div class="lx-flabel">Its children</div><div class="lx-tags">${kids.slice(0, 16).map(k => this.lxLinkTag('variety', k, this.lxVName(k))).join('')}</div>` : ''}${LearnTree.onTree(id) ? `<button type="button" class="lx-flbtn" onclick="app.lxTreeOpen('${app.escJs(id)}')">${this.lxIc('i-tree', 18)}<span>See it on the coffee tree</span></button>` : ''}</div>`;
                const path = LearnTree.path(id, x => this.lxVName(x));
                return { key: 'variety.familyline', open: true, title: 'Its family line', sub: unsure ? 'Not settled: the dotted lines are the possibilities' : '', teaser: path.join(' › '), body };
            },

            // ---- body and acidity as ranges: where a description lands on a scale, read from its words. The words stay above
            // the bar, since a bar can't say "often" or "in some lots".
            LX_BODYW: [[/tea-like|thin|lighter|\blight\b|delicate/, 0.04], [/soft/, 0.24], [/silky/, 0.24], [/medium|moderate|good|balanced|smooth|round/, 0.33], [/juicy/, 0.42], [/velvety|creamy|dense/, 0.5], [/full|deep|rich|strong|heavier/, 0.67], [/heavy/, 0.84], [/syrupy|thick/, 0.96]],
            LX_ACIDW: [[/\blow|understated|restrained|\bquiet\b/, 0.04], [/soft|mild|mellow|gentle/, 0.16], [/delicate|\blight/, 0.28], [/round/, 0.36], [/medium|moderate|balanced|refined/, 0.5], [/marked|lively|tang|tart|juicy|crisp/, 0.64], [/win(e|y)|citr|sparkl|complex|fruity|berry/, 0.74], [/pronounced|bright|persistent/, 0.88], [/\bhigh|intense/, 0.96]],
            lxFeelPos(text, W) {
                const s = String(text || '').toLowerCase();
                // a comparison only says which way it leans from the usual cup ("heavier than washed"); "bright but gentle" is in between
                if (/\bthan\b/.test(s)) { if (/light|lean/.test(s)) return [0.18, 0.4]; if (/heav|full/.test(s)) return [0.58, 0.82]; if (/soft|round|mild/.test(s)) return [0.25, 0.5]; if (/bright/.test(s)) return [0.62, 0.9]; }
                if (/bright but gentle|gently bright/.test(s)) return [0.55, 0.78];
                const hits = W.filter(([re]) => re.test(s)).map(([, v]) => v);
                return hits.length ? [Math.min(...hits), Math.max(...hits)] : null;
            },
            lxAcidKind(t) { const s = String(t || '').toLowerCase(); return /citr|crisp|sparkl|lemon/.test(s) ? 'citrus' : /win(e|y)|tang|tart|lactic|juic|berry|fruity/.test(s) ? 'fruit' : /round|soft|mellow|gentle|mild|smooth/.test(s) && !/bright|high|pronounced/.test(s) ? 'round' : ''; },
            lxFeelBar(name, text, W, ends, cls, kind) {
                const p = this.lxFeelPos(text, W), lo = p ? p[0] : 0, hi = p ? p[1] : 0;
                const col = cls === 'body' ? `;background:color-mix(in srgb, #6b4128 ${Math.round((lo + hi) / 2 * 100)}%, #d8bb92)` : '';
                return `<div class="lx-fb ${cls}${kind ? ' k-' + kind : ''}"><div class="lx-fb-h"><span>${name}</span><b>${this.esc(text)}</b></div>${p ? `<div class="lx-fb-tr" aria-hidden="true"><i class="lx-fb-r" style="left:calc(${(lo * 100).toFixed(1)}% - 8px);width:calc(${((hi - lo) * 100).toFixed(1)}% + 16px)${col}"></i></div><div class="lx-fb-e" aria-hidden="true">${ends.map(e => `<span>${e}</span>`).join('')}</div>` : ''}</div>`;
            },
            lxFeelHtml(f) {
                if (!f || (!f.body && !f.acidity)) return '';
                const k = this.lxAcidKind(f.acidity), KN = { citrus: 'citrus-like', fruit: 'fruity, wine-like', round: 'round, soft' };
                return `<div class="lx-feel">${f.body ? this.lxFeelBar('Body', f.body, this.LX_BODYW, ['Light', 'Medium', 'Full', 'Syrupy'], 'body') : ''}${f.acidity ? this.lxFeelBar('Acidity', f.acidity, this.LX_ACIDW, ['Low', 'Medium', 'Bright'], 'acid', k) : ''}${f.acidity && k ? `<div class="lx-fb-k"><i class="k-${k}"></i>${KN[k]} acidity</div>` : ''}</div>`;
            },

            // ---- the tree screen
            lxTreeOpen(focus) { if (focus && typeof LearnTree !== 'undefined' && !LearnTree.simple(focus)) this.lxTreeState().mode = 'every'; this.learnOpen('tree', focus || ''); },
            lxTreeState() { const st = this.lxState(); return st.tree || (st.tree = { mode: 'simple' }); },
            lxTreeData(mode) {
                const mine = this.lxMineVarieties(), fam = this.lxTreeFam(), key = `${mode}|${fam}|${[...mine].sort().join(',')}`;
                this._lxTreeCache = this._lxTreeCache || {};
                if (!this._lxTreeCache[key]) this._lxTreeCache[key] = LearnTree.draw(mode, { name: id => this.lxVName(id), mine, fam });
                return this._lxTreeCache[key];
            },
            // v20.3: the families' colors, the same ones the branches are tinted with (the chips are the tree's key)
            LX_TCHIP: { W: ['Wild Ethiopia', '#c98bbb'], AB: ['Ethiopians abroad', '#e8a7c8'], Y: ['Yemen', '#e0915a'], typica: ['Typica family', '#86a9d9'], bourbon: ['Bourbon family', '#e3b94a'], 'timor-hybrid': ['Timor Hybrid', '#5fbfa8'], catimor: ['Catimors', '#5fbfa8'], sarchimor: ['Sarchimors', '#5fbfa8'], f1: ['New hybrids', '#9cc97a'], species: ['Species', '#9b8d80'] },
            lxTreeFam() { return this._lxTreeFam || 'dots'; },   // (Maceo picked colored branches plus a dot by each name, Oct 29)
            LX_TABOUT: {
                W: 'Arabica began in the forests of southwestern Ethiopia (and the Boma Plateau just over the border in South Sudan), which still hold most of its genetic variety. These grow straight from the wild trees: landraces, Gesha, Rume Sudan and picks from Ethiopia’s research center.',
                AB: 'Types grown abroad under names like Java and Pink Bourbon, which DNA ties back to Ethiopian landraces. For some the evidence is still early.',
                Y: 'Coffee from Ethiopia reached Yemen and was first farmed there. A small number of trees taken out of Yemen are the basis of most Arabica grown elsewhere, mainly through two lines: Typica and Bourbon.',
                typica: 'One of the two old lines that left Yemen: seed sent to Java in the 1690s, then on to the Americas.',
                bourbon: 'The other old line, taken to Bourbon Island (now Réunion), then to Brazil. Caturra, Pacas and Villa Sarchi are its dwarf mutations.',
                'timor-hybrid': 'A natural cross of Arabica and Robusta, found on the island of Timor in a field of Typica. It brought Robusta’s resistance to leaf rust into Arabica; everything on this branch has a little Robusta in it.',
                catimor: 'Caturra × Timor Hybrid. Bred for leaf-rust resistance; national programs selected many varieties from these crosses.',
                sarchimor: 'Villa Sarchi × Timor Hybrid. The same idea as the Catimors, from a different Bourbon dwarf.',
                f1: 'First-generation crosses of two distant parents, mostly a rust-resistant line with an Ethiopian or Sudanese type (Ruiru 11 uses a Kenyan mix instead). Vigorous; their seed doesn’t grow true, so they’re cloned or made fresh from hybrid seed.',
                species: 'Species are different coffee plants. Arabica began as a wild cross of Robusta and Eugenioides, hundreds of thousands of years ago (the date is uncertain). Robusta is its own species with its own types, like Brazil’s Conilon; this tree follows Arabica.'
            },
            lxTreePage(p) {
                this.lxTreeDefs();
                const ts = this.lxTreeState(), mode = ts.mode, nAll = LearnEngine.allVarieties().filter(v => v.family !== 'species').length;
                const F = this.lxTreeData(mode);
                const order = ['W', 'AB', 'Y', 'typica', 'bourbon', 'timor-hybrid', 'catimor', 'sarchimor', 'f1', 'species'].filter(g => F.BOX[g]);
                const html = this.lxHead({ kicker: 'Varieties', name: 'The coffee tree', small: true })
                    + `<div class="lx-tmode"><div class="lx-seg2" role="group" aria-label="How many varieties"><button type="button" class="${mode === 'simple' ? 'on' : ''}" aria-pressed="${mode === 'simple'}" onclick="app.lxTreeMode('simple')">On most bags</button><button type="button" class="${mode === 'every' ? 'on' : ''}" aria-pressed="${mode === 'every'}" onclick="app.lxTreeMode('every')">Every variety · ${nAll}</button></div></div>`
                    + `<div class="lx-twrap" id="lx-tw"><div class="lx-tstage" id="lx-tstage"><svg class="lx-tsvg lxk" id="lx-tsvg" role="img" aria-label="Coffee’s family tree"></svg></div><div class="lx-tlab" id="lx-tlab"></div>`
                    + `<button type="button" class="lx-tmine" onclick="app.lxTreeMineToggle(this)" aria-pressed="true"><i></i>Yours</button><div class="lx-tctrl"><button type="button" class="lx-tglass" onclick="app.lxTreeStep(1.6)" aria-label="Zoom in">${this.lxIc('i-plus', 18)}</button><button type="button" class="lx-tglass lx-tminus" onclick="app.lxTreeStep(1 / 1.6)" aria-label="Zoom out"><i></i></button><button type="button" class="lx-tglass lx-tfit" onclick="app.lxTreeFit(true)" aria-label="Show the whole tree"><i></i></button></div><div class="lx-tfocus" id="lx-tfocus"></div></div>`
                    + `<div class="lx-tclusters">${order.map(g => `<button type="button" onclick="app.lxTreeZoom('${app.escJs(g)}')"><i style="background:${(this.LX_TCHIP[g] || [])[1] || '#9b8d80'}"></i>${this.esc((this.LX_TCHIP[g] || [g])[0])}</button>`).join('')}</div>`
                    + `<p class="lx-tcap" id="lx-tcap">A family tree: each variety grows from the one it came from, and a dashed line joins a second parent. Tap a name to light up its line; pale branches with a ? aren’t settled. Pinch to zoom for more names. Red cherries are the ones you’ve logged.</p>`
                    + (this.lxVarListSecs ? `<div class="lx-tlist">${this.lxSecs(this.lxVarListSecs())}</div>` : '');   // v20.1: every variety, A to Z, under the tree
                return { fam: 'app', html };
            },
            lxTreeMode(m) { const ts = this.lxTreeState(); if (ts.mode === m) return; ts.mode = m; const top = this.lxTop(); if (top) top.id = ''; this.learnRender(true); },
            // after the page is drawn: size the tree to the screen, its names, and the touch handling
            lxTreeInit(p) {
                const wrap = document.getElementById('lx-tw'), svg = document.getElementById('lx-tsvg'), view = document.getElementById('learn-view');
                if (!wrap || !svg || typeof LearnTree === 'undefined') return;
                const ts = this.lxTreeState(), F = this.lxTreeData(ts.mode);
                const top = wrap.getBoundingClientRect().top - (view ? view.getBoundingClientRect().top : 0);
                const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;height:env(safe-area-inset-bottom, 0px)'; document.body.appendChild(probe); const safeB = probe.offsetHeight || 0; probe.remove();
                wrap.style.height = Math.max(380, Math.min(720, (view ? view.clientHeight : window.innerHeight) - top - 12 - safeB - 50)) + 'px';   // (v20.1: the group chips peek out below, so the page scrolls on)
                const T = this._lxT = { F, W: wrap.clientWidth, H: wrap.clientHeight, TZ: { k: 1, x: 0, y: 0 }, R: null, FOC: new Set(), LBL: [], pad: 0.3 };
                svg.innerHTML = `<g class="lx-tall">${F.svg}</g><g id="lx-thl"></g>`;
                this.lxTreeLabels();
                this.lxTreeFit(false);
                // fingers: one moves the tree, two pinch it; a tap near a fork lights that variety's line. Names are buttons over the
                // tree, so a gesture may start on one: it only becomes a drag once the finger has moved.
                const P = new Map(); let last = null, moved = 0, downAt = 0, lastTap = 0, dragging = false, startEl = null;
                const pt = e => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
                const skip = el => el && el.closest && el.closest('.lx-tctrl, .lx-tmine, .lx-tfocus');
                wrap.addEventListener('pointerdown', e => { if (skip(e.target)) return; P.set(e.pointerId, pt(e)); if (P.size === 1) { moved = 0; downAt = Date.now(); dragging = false; startEl = e.target; } last = null; if (P.size === 2) { dragging = true; P.forEach((v, id) => { try { wrap.setPointerCapture(id); } catch (err) {} }); } });
                wrap.addEventListener('pointermove', e => {
                    if (!P.has(e.pointerId)) return; const prev = P.get(e.pointerId), cur = pt(e); P.set(e.pointerId, cur); const Z = T.TZ;
                    if (P.size === 1) {
                        moved += Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1]);
                        if (!dragging && moved > 6) { dragging = true; try { wrap.setPointerCapture(e.pointerId); } catch (err) {} }
                        if (dragging) { Z.x += cur[0] - prev[0]; Z.y += cur[1] - prev[1]; this.lxTreeClamp(); this.lxTreeApply(false); }
                    } else if (P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (last) { const f = d / last.d; Z.x = c[0] - (last.c[0] - Z.x) * f + (c[0] - last.c[0]); Z.y = c[1] - (last.c[1] - Z.y) * f + (c[1] - last.c[1]); Z.k *= f; this.lxTreeClamp(); this.lxTreeApply(false); } last = { d, c }; moved += 99; }
                });
                const up = e => {
                    if (!P.has(e.pointerId)) return; const q = P.get(e.pointerId); P.delete(e.pointerId); if (P.size < 2) last = null;
                    if (P.size) return;
                    if (dragging) { dragging = false; this.lxTreeSettle(); return; }
                    if (moved >= 8 || Date.now() - downAt > 500) return;
                    if (startEl && startEl.closest && startEl.closest('button')) return;   // (a name: its own tap opens it)
                    const now = Date.now(), Z = T.TZ;
                    if (now - lastTap < 280) { Z.x = q[0] - (q[0] - Z.x) * 2; Z.y = q[1] - (q[1] - Z.y) * 2; Z.k *= 2; this.lxTreeClamp(); this.lxTreeApply(true); lastTap = 0; return; }
                    lastTap = now;
                    const u = (q[0] - Z.x) / Z.k, v = (q[1] - Z.y) / Z.k, near = Object.entries(T.F.nodes).filter(([id]) => LearnTree.onTree(id)).map(([id, n]) => [id, Math.hypot(n.x - u, n.y - v)]).sort((a, b) => a[1] - b[1])[0];
                    if (near && near[1] * Z.k < 26) this.lxTreeFocus(near[0]); else if (T.FOC.size) this.lxTreeUnfocus();
                };
                wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
                let wt = 0;
                wrap.addEventListener('wheel', e => { e.preventDefault(); const q = pt(e), f = Math.exp(-e.deltaY * 0.0015), Z = T.TZ; Z.x = q[0] - (q[0] - Z.x) * f; Z.y = q[1] - (q[1] - Z.y) * f; Z.k *= f; this.lxTreeClamp(); this.lxTreeApply(false); clearTimeout(wt); wt = setTimeout(() => this.lxTreeSettle(), 160); }, { passive: false });
                if (p && p.id && F.nodes[p.id]) setTimeout(() => this.lxTreeFocus(p.id), 30);
            },
            // the label layer: names stay about 13 px whatever the zoom; higher-priority names win a spot, the rest wait
            lxTreeLabels() {
                const T = this._lxT, host = document.getElementById('lx-tlab'); if (!T || !host) return;
                const fam = this.lxTreeFam();   // v20.3: the families are colors, so their big name plates are gone and the species names are small
                host.innerHTML = T.F.labels.map((l, i) => l.kind === 'group' && fam ? '' : l.kind === 'species' && fam ? `<button type="button" class="lx-tl v sp" data-i="${i}" onclick="${this.lxHasPage('species', l.id) ? this.lxGo('species', l.id) : `app.lxTreeZoom('species')`}">${this.esc(l.id === 'arabica' ? 'Arabica' : l.text)}</button>` : l.kind === 'variety'
                    ? `<button type="button" class="lx-tl v${l.own ? ' own' : ''}${l.f1 ? ' f1' : ''}${l.q ? ' q' : ''}" data-i="${i}" onclick="app.lxTreeFocus('${app.escJs(l.id)}')">${l.own ? '<i></i>' : fam === 'dots' && l.fc ? `<i class="fcd" style="background:${l.fc}"></i>` : ''}${this.esc(l.text)}</button>`
                    : `<button type="button" class="lx-tl ${l.kind === 'species' ? 's' : 'g'}" data-i="${i}" onclick="${l.kind === 'group' ? `app.lxTreeZoom('${app.escJs(l.id)}')` : this.lxHasPage('species', l.id) ? this.lxGo('species', l.id) : `app.lxTreeZoom('species')`}">${l.col ? `<i style="background:${l.col}"></i>` : ''}<b>${this.esc(l.text)}</b>${l.desc ? `<small>${this.esc(l.desc)}</small>` : ''}</button>`).join('');
                T.LBL = [...host.children].map(el => { const l = T.F.labels[+el.dataset.i]; const o = { el, l, w: el.offsetWidth, h: el.offsetHeight }; if (l.kind !== 'variety' && !el.classList.contains('sp')) { el.classList.add('mini'); o.mw = el.offsetWidth; o.mh = el.offsetHeight; el.classList.remove('mini'); } return o; }).sort((a, b) => b.l.prio - a.l.prio);
            },
            // v20.3: names hold still. While a finger is down the names showing just ride along with the tree; when you let go
            // they're placed again, the ones you could already see first and on the same side, so few appear or vanish.
            lxTreeRide() {
                const T = this._lxT; if (!T || !T.LBL.length) return; const Z = T.TZ;
                T.LBL.forEach(o => { if (!o.at) return; o.el.style.transform = `translate(${(Z.x + Z.k * o.l.x + o.at[0]).toFixed(1)}px, ${(Z.y + Z.k * o.l.y + o.at[1]).toFixed(1)}px)`; });
            },
            lxTreePlace() {
                const T = this._lxT; if (!T || !T.LBL.length) return;
                const W = T.W, H = T.H, Z = T.TZ, taken = [], b = T.F.bounds, atFit = !T.kFit || Z.k <= T.kFit * 1.01;
                const card = document.getElementById('lx-tfocus'); if (card && card.classList.contains('on')) taken.push([0, H - card.offsetHeight - 16, W, H]);
                taken.push([W - 56, 0, W, 150], [0, 0, 96, 50]);   // (the zoom buttons and Yours)
                const mini = Z.k * (b[2] - b[0]) < 700;
                const free = r => r[0] > 2 && r[2] < W - 2 && r[1] > -20 && r[3] < H + 20 && !taken.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
                const first = o => T.FOC.has(o.l.id) ? 0 : !atFit && o.at ? 1 : 2;   // (all the way out, the same names every time)
                [...T.LBL].sort((p, q) => first(p) - first(q)).forEach(o => {
                    const sm = mini && o.mw && !o.l.wide; o.el.classList.toggle('mini', !!sm); o.el.classList.toggle('on', T.FOC.has(o.l.id));
                    const sx = Z.x + Z.k * o.l.x, sy = Z.y + Z.k * o.l.y, w = sm ? o.mw : o.w, h = sm ? o.mh : o.h; let spot = null;
                    const upc = [sx - w / 2, sy - h - 8], rt = [sx + 10, sy - h / 2], lt = [sx - w - 10, sy - h / 2], dn = [sx - w / 2, sy + 10];
                    const cands = o.l.kind === 'variety' ? (o.l.side === 'l' ? [lt, upc, dn, rt] : o.l.side === 'r' ? [rt, upc, dn, lt] : [upc, rt, lt, dn]) : [[sx - w / 2, sy - h - 12], [sx - w / 2, sy + 12], [sx + 14, sy - h / 2], [sx - w - 14, sy - h / 2]];
                    const order = [0, 1, 2, 3]; if (o.ci && !atFit) order.unshift(order.splice(o.ci, 1)[0]);   // (the side it was on first)
                    let ci = 0;
                    for (const i of order) { const [x0, y] = cands[i], x = o.l.kind === 'variety' ? x0 : Math.max(6, Math.min(W - w - 6, x0)), r = [x - 3, y - 2, x + w + 3, y + h + 2]; if (free(r)) { spot = [x, y]; ci = i; taken.push(r); break; } }
                    if (spot) { o.el.style.transform = `translate(${spot[0].toFixed(1)}px, ${spot[1].toFixed(1)}px)`; o.el.style.visibility = 'visible'; o.at = [spot[0] - sx, spot[1] - sy]; o.ci = ci; }
                    else { o.el.style.visibility = 'hidden'; o.at = null; }
                });
            },
            // drawing: the svg covers the screen plus a margin, showing the part of the tree in view; while you pan or pinch the
            // last drawing is moved and scaled (smooth), and once you let go it's drawn again, sharp, for the new view
            lxTreeRender() {
                const T = this._lxT, svg = document.getElementById('lx-tsvg'), stage = document.getElementById('lx-tstage'); if (!T || !svg || !stage) return;
                const Z = T.TZ, ox = T.W * T.pad, oy = T.H * T.pad, w = T.W + 2 * ox, h = T.H + 2 * oy;
                stage.style.transition = 'none'; stage.style.transform = 'none';
                stage.style.left = `${-ox}px`; stage.style.top = `${-oy}px`; stage.style.width = `${w}px`; stage.style.height = `${h}px`; stage.style.transformOrigin = `${ox}px ${oy}px`;
                svg.setAttribute('viewBox', `${((-ox - Z.x) / Z.k).toFixed(2)} ${((-oy - Z.y) / Z.k).toFixed(2)} ${(w / Z.k).toFixed(2)} ${(h / Z.k).toFixed(2)}`);
                T.R = { ...Z };
            },
            lxTreeApply(anim) {
                const T = this._lxT, stage = document.getElementById('lx-tstage'); if (!T || !stage) return;
                if (!T.R) { this.lxTreeRender(); this.lxTreePlace(); return; }
                const Z = T.TZ, s = Z.k / T.R.k, tx = Z.x - s * T.R.x, ty = Z.y - s * T.R.y;
                stage.style.transition = anim ? 'transform .45s cubic-bezier(.2,.8,.2,1)' : 'none';
                stage.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
                const lab = document.getElementById('lx-tlab');
                clearTimeout(T.at);
                if (anim) { if (lab) lab.classList.add('moving'); T.at = setTimeout(() => { if (lab) lab.classList.remove('moving'); this.lxTreeSettle(); }, 470); }
                else { if (!T.raf) T.raf = requestAnimationFrame(() => { T.raf = 0; this.lxTreeRide(); }); }
            },
            lxTreeSettle() { const T = this._lxT; if (!T) return; this.lxTreeRender(); this.lxTreePlace(); },
            // v20.3: you move around a tree that stays put: zoomed all the way out it fits the box exactly, and you can't drag
            // past its edges. Zoomed in, a sideways swipe in the box looks around instead of going back (the box says no-swipe).
            lxTreeClamp() {
                const T = this._lxT; if (!T) return; const Z = T.TZ, b = T.F.bounds, x0 = b[0] - 10, y0 = b[1] - 10, x1 = b[2] + 10, y1 = b[3] + 10;
                const kFit = Math.min(T.W / (x1 - x0), T.H / (y1 - y0)) * 0.94; T.kFit = kFit;
                Z.k = Math.max(kFit, Math.min(Math.max(1.6, kFit * 1.5), Z.k));
                const ax = (lo, hi, size, off) => (hi - lo) * Z.k <= size ? size / 2 - Z.k * (lo + hi) / 2 : Math.min(-Z.k * lo, Math.max(size - Z.k * hi, off));
                Z.x = ax(x0, x1, T.W, Z.x); Z.y = ax(y0, y1, T.H, Z.y);
                const wrap = document.getElementById('lx-tw'); if (wrap) wrap.classList.toggle('no-swipe', Z.k > kFit * 1.01);
            },
            lxTreeBox(bx, anim, maxK) { const T = this._lxT; if (!T) return; const [x0, y0, x1, y1] = bx; let k = Math.min(T.W / (x1 - x0), T.H / (y1 - y0)) * 0.94; if (maxK) k = Math.min(k, maxK); T.TZ = { k, x: T.W / 2 - k * (x0 + x1) / 2, y: T.H / 2 - k * (y0 + y1) / 2 }; this.lxTreeClamp(); this.lxTreeApply(anim); },
            lxTreeFit(anim) { const T = this._lxT; if (!T) return; const b = T.F.bounds; if (anim) this.lxTreeUnfocus(true); this.lxTreeBox([b[0] - 10, b[1] - 10, b[2] + 10, b[3] + 10], anim); },
            lxTreeStep(f) { const T = this._lxT; if (!T) return; const Z = T.TZ; Z.x = T.W / 2 - (T.W / 2 - Z.x) * f; Z.y = T.H / 2 - (T.H / 2 - Z.y) * f; Z.k *= f; this.lxTreeClamp(); this.lxTreeApply(true); },
            lxTreeMineToggle(b) { const off = b.classList.toggle('off'); b.setAttribute('aria-pressed', String(!off)); const g = document.querySelector('#lx-tsvg .t-fruit'); if (g) g.style.opacity = off ? 0 : 1; },
            lxTreeZoom(g) {
                const T = this._lxT; if (!T) return; this.lxTreeUnfocus(true);
                if (T.F.BOX[g]) this.lxTreeBox(T.F.BOX[g], true);
                const cap = document.getElementById('lx-tcap'), about = this.LX_TABOUT[g];
                const isVar = LearnEngine.allVarieties().some(v => v.id === g) && this.lxHasPage('variety', g);
                if (cap && about) cap.innerHTML = `<b>${this.esc((this.LX_TCHIP[g] || ['Species'])[0])}</b> ${this.esc(about)}${isVar ? ` <button type="button" class="lx-tlnk" onclick="${this.lxGo('variety', g)}">Open ${this.esc(this.lxVName(g))} ›</button>` : ''}`;
            },
            // tap a variety: its line lights up from the roots to its tip, and a card says where it came from
            lxTreeFocus(id) {
                const T = this._lxT; if (!T || !T.F.nodes[id]) return;
                const F = T.F, chain = LearnTree.chain(id).filter(x => F.paths[x]), two = LearnTree.second(id), chain2 = two && F.nodes[two] ? LearnTree.chain(two).filter(x => F.paths[x] && !chain.includes(x)) : [];
                const seg = (p, cls) => `<path d="M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}" class="${cls}"/>`;
                const r = F.nodes.arabica, n = F.nodes[id];
                let s = `<path d="M${Math.round(F.trunkX)} ${Math.round(F.ground)}L${r.x} ${r.y}" class="hl"/>` + chain.map(x => seg(F.paths[x], 'hl')).join('') + chain2.map(x => seg(F.paths[x], 'hl hl2')).join('');
                if (chain2.length) { const m = F.nodes[two]; s += `<path d="M${m.x} ${m.y}L${n.x} ${n.y}" class="hl hl2 dash"/>`; }
                s += `<circle cx="${n.x}" cy="${n.y}" r="34" class="hlc"/>`;
                const hl = document.getElementById('lx-thl'); if (hl) hl.innerHTML = s;
                const svg = document.getElementById('lx-tsvg'); if (svg) svg.classList.add('focus');
                T.FOC = new Set([...chain, ...chain2, id]);
                const pts = [...chain, ...chain2, id].map(x => F.nodes[x]).filter(Boolean);
                const names = LearnTree.path(id, x => this.lxVName(x)), twoName = two === 'ET' ? 'a wild Ethiopian tree' : two === 'robusta' ? 'Robusta' : two ? this.lxVName(two) : '';
                const card = document.getElementById('lx-tfocus');
                if (card) {
                    card.innerHTML = `<div class="lx-tf-t"><b>${this.esc(this.lxVName(id))}</b><span>${names.map(x => this.esc(x)).join(' › ')}${two ? ` <em>× ${this.esc(twoName)}</em>` : ''}${LearnTree.unsure(id) ? ' <em>· not settled</em>' : ''}</span></div>${this.lxHasPage('variety', id) ? `<button type="button" class="lx-tf-go" onclick="${this.lxGo('variety', id)}">Open</button>` : ''}<button type="button" class="lx-tf-x" onclick="app.lxTreeUnfocus()" aria-label="Close">${this.lxIc('i-x', 16)}</button>`;
                    card.classList.add('on');
                }
                this.lxTreeBox([Math.min(...pts.map(q => q.x)) - 260, Math.min(...pts.map(q => q.y)) - 220, Math.max(...pts.map(q => q.x)) + 260, Math.max(...pts.map(q => q.y)) + 420], true, 0.5);
                if (this.haptic) this.haptic('light');
            },
            lxTreeUnfocus(quiet) {
                const T = this._lxT; if (T) T.FOC = new Set();
                const hl = document.getElementById('lx-thl'); if (hl) hl.innerHTML = '';
                const svg = document.getElementById('lx-tsvg'); if (svg) svg.classList.remove('focus');
                const c = document.getElementById('lx-tfocus'); if (c) c.classList.remove('on');
                if (!quiet) this.lxTreePlace();
            },
