            // ===================== v19.0: Learn where people already are =====================
            // The coffee page (its tags open Learn; About this coffee), Add a coffee (what the bag's words mean, as you type),
            // Profile › Taste (the passport, in place of the coffee map), the Log screen's coach (a first-shot starting point
            // for a kind; the potato defect) and a roaster's Process bar.

            // ---- kinds of coffee a bean belongs to, most specific first: variety + origin + process, down to one of them
            lxCombos(bean) {
                const t = this.lxTags(bean); if (!t) return [];
                const v = (t.variety || [])[0] || '', o = (t.origin && !t.origin.blend && (t.origin.countries || []).length === 1) ? t.origin.countries[0] : '', p = (t.process || {}).base || '';
                const list = [[v, o, p], [v, o, ''], [v, '', p], ['', o, p], [v, '', ''], ['', o, ''], ['', '', p]]
                    .filter(([a, b, c]) => (a || b || c) && (!a || v) && (!b || o) && (!c || p));
                const seen = new Set(), out = [];
                list.forEach(([a, b, c]) => { const w = {}; if (a) w.variety = a; if (b) w.country = b; if (c) w.process = c; const k = this.lxWantKey(w); if (!seen.has(k)) { seen.add(k); out.push(w); } });
                return out;
            },
            // "Washed Colombian Caturras", "Colombian coffees", "Naturals"
            lxComboTitle(w) {
                const pn = w.process ? this.lxName('process', w.process) : '', c = w.country ? LearnEngine.entry('origin', w.country) : null;
                const vn = w.variety ? this.lxName('variety', w.variety) : '';
                if (!vn && !c && pn) return `${pn}s`.replace(/ss$/, 's').replace(/^Honeys$/, 'Honey coffees').replace(/^Wet-hulleds$/, 'Wet-hulled coffees');
                return [pn, c ? c.adj : '', vn ? `${vn}s` : 'coffees'].filter(Boolean).join(' ').replace(/^(\w)/, x => x.toUpperCase());
            },
            lxPrefetchBean(bean) { if (bean && !this.isTeaBean(bean) && this.lxCommOk() && typeof LearnEngine !== 'undefined') { const w = this.lxCombos(bean); if (w.length) this.lxCommFetch(w).catch(() => {}); } },

            // ===================== C1: the coffee page =====================
            // one chip per tag (each opens its Learn page); what the engine doesn't know stays a plain chip, as typed
            lxDetailChips(bean) {
                const out = [this.lxTagChips(bean, true)];
                const split = s => String(s || '').split(/,|\/|&|\+|;|\band\b/i).map(x => x.trim()).filter(Boolean);
                [['variety', bean.variety], ['origin', bean.origin], ['process', bean.process]].forEach(([k, text]) => {
                    split(text).forEach(part => {
                        const f = LearnEngine.field(k, part, {}), known = (f.chips || []).some(ch => ch.t === 'ok' || ch.t === 'info');
                        if (!known) out.push(`<span class="lx-tag">${this.esc(part)}</span>`);
                    });
                });
                return out.join('');
            },
            learnDecorateDetail(group, brews) {
                if (typeof document === 'undefined') return;
                const view = document.getElementById('detail-view'); if (!view || !view.querySelector) return;
                const bean = group && group.meta, on = !!(bean && this.learnOn() && !this.isTeaBean(bean));
                const ids = ['d-variety', 'd-origin', 'd-process'];
                view.querySelectorAll('.lx-dchips, #lx-about').forEach(n => n.remove());
                if (!on) { ids.forEach(id => { const el = document.getElementById(id); if (el && el.getAttribute('data-lx') === '1') { el.removeAttribute('data-lx'); el.hidden = !String(el.textContent || '').trim() || String(el.textContent).trim() === '-'; } }); return; }
                ids.forEach(id => { const el = document.getElementById(id); if (el) { el.hidden = true; el.setAttribute('data-lx', '1'); } });
                const roast = document.getElementById('d-roast');
                const chips = this.lxDetailChips(bean);
                if (roast && chips) roast.insertAdjacentHTML('beforebegin', `<span class="lx-dchips">${chips}</span>`);
                const top = document.getElementById('d-top-flavors');
                const about = this.lxAboutHtml(bean, brews || []);
                if (top && about) top.insertAdjacentHTML('afterend', about);
            },
            // About this coffee: the bag's words decoded, how it fits what you've tasted, and how that kind tastes here
            lxAboutHtml(bean, brews) {
                const dec = LearnEngine.decode(bean); if (!dec) return '';
                const fit = this.lxFitSentence(bean, brews);
                let crowd = '';
                if (this.lxCommOk()) {
                    const wants = this.lxCombos(bean), hits = wants.map(w => this.lxComm(w));
                    if (wants.length && hits.some(h => !h)) this.lxCommFetch(wants).then(() => this.lxRefresh('comm')).catch(() => {});
                    const pick = wants.findIndex((w, i) => hits[i] && hits[i].ok && this.lxEnough(hits[i].r));
                    // the most specific kind that clears 2 people and 2 coffees, once every finer one has answered
                    if (pick >= 0 && hits.slice(0, pick).every(h => h)) {
                        const r = hits[pick].r, A = r.views.all, D = r.views.dialed || A, cv = this.lxCrowdVals(D);
                        const famKey = this.famOfCoffee(bean);
                        const img = this.lxShapeImg(cv.vals, cv.set, null, famKey, 150, 120, '');
                        const notes = this.lxTopNotes(D, 4).map(n => n.toLowerCase());
                        const s = this.lxTasteSentence(cv);
                        crowd = `<div class="lx-hr"></div><div class="lx-crowd">${img}<div class="lx-cmain"><b>${this.esc(this.lxComboTitle(wants[pick]))} on Dialed In</b><small>${this.esc([s, notes.length ? `Most often ${notes.length > 1 ? `${notes.slice(0, -1).join(', ')} and ${notes[notes.length - 1]}` : notes[0]}.` : ''].filter(Boolean).join(' '))} ${this.lxPlural(A.coffees, 'coffee')} · ${A.people} people</small></div></div>`;
                    }
                }
                // v20.1: the coffee's story (the trees, where it grew, how it was processed, what that tends toward), folded
                // until you open it; its one-line summary says what it is
                const J = this.lxJourney ? this.lxJourney(bean) : null;
                const body = J ? `${this.lxJourneyHtml(J)}${fit ? `<p class="lx-p lx-small2">${this.esc(fit)}</p>` : ''}${crowd}` : `<p class="lx-p">${this.esc(dec)}${fit ? ` ${this.esc(fit)}` : ''}</p>${crowd}`;
                return `<div id="lx-about" class="lx-about">${this.lxSecs([{ key: 'about2', open: false, title: 'About this coffee', teaser: J ? this.lxAboutLine(J) : dec.split('. ')[0].replace(/\.$/, '') + '.', body, cls: 'lx-boxsec', icon: 'i-book' }])}</div>`;
            },
            // C1's own sentence: the notes you've tasted that fit how this kind of coffee is usually described
            lxFitSentence(bean, brews) {
                const mine = (brews || []).filter(b => this.getBrewOwner(b) === this.user);
                if (!mine.length) return '';
                const my = this.lookTopNotes ? this.lookTopNotes(mine, 4).map(([n]) => n) : [];
                if (!my.length) return '';
                const t = this.lxTags(bean), kinds = [];
                (t.variety || []).forEach(id => kinds.push(['variety', id])); if (t.process && t.process.base) kinds.push(['process', t.process.base]); (t.process && t.process.layers || []).forEach(id => kinds.push(['process', id]));
                const famOf = n => this.noteFam(n, 'coffee');
                for (const [k, id] of kinds) {
                    const e = this.lxEntry(k, id); if (!e || !e.taste || !(e.taste.notes || []).length) continue;
                    const want = e.taste.notes.map(n => n.toLowerCase()), wantF = new Set(e.taste.notes.map(famOf).filter(Boolean));
                    const hit = my.filter(n => want.includes(String(n).toLowerCase()) || (famOf(n) && wantF.has(famOf(n)) && famOf(n) !== 'off'));
                    if (!hit.length) continue;
                    const list = hit.slice(0, 2).map(n => String(n).toLowerCase());
                    return `You've tasted ${list.join(' and ')} here, which fits how ${e.kind === 'process' ? `${e.name.toLowerCase()} coffees` : `${e.name}`} ${e.kind === 'process' ? 'are' : 'is'} usually described.`;
                }
                return '';
            },

            // ===================== C2 / C2b: Add a coffee =====================
            // Chips under Variety, Origin and Process as you type: recognized (opens its page over the form), "Not a variety",
            // a typo question (Yes rewrites the text; Keep as typed leaves it and isn't asked again), "Washed or natural?".
            // A friend's entry for an empty field. Nothing anyone typed changes without a tap.
            learnFormInit(bean) {
                const form = this.getBeanForm(); if (!form) return;
                this._lxFormKeep = bean && bean.learnKeep && typeof bean.learnKeep === 'object' ? { ...bean.learnKeep } : {};
                if (!form._lxBound) {
                    form._lxBound = true;
                    let t = 0;
                    ['variety', 'origin', 'process', 'name', 'roaster'].forEach(k => { const el = form.elements[k]; if (el) el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.learnFormPaint(), 140); }); });
                    ['variety', 'origin', 'process'].forEach(k => { const el = form.elements[k]; if (!el) return; const box = document.createElement('div'); box.className = 'lx-recog-wrap'; box.setAttribute('data-for', k); box.setAttribute('aria-live', 'polite'); el.after(box); });
                    const roastWrap = form.querySelector('.coffee-only');
                    if (roastWrap) { const d = document.createElement('div'); d.id = 'lx-decoded'; roastWrap.before(d); }
                }
                this.learnFormPaint();
            },
            learnFormPaint() {
                const form = this.getBeanForm(); if (!form || !form._lxBound) return;
                const on = this.learnOn() && (this.beanFormKind ? this.beanFormKind() : 'coffee') === 'coffee';
                const boxes = [...form.querySelectorAll('.lx-recog-wrap')], dec = document.getElementById('lx-decoded');
                if (!on) { boxes.forEach(b => { b.innerHTML = ''; }); if (dec) dec.innerHTML = ''; return; }
                const val = k => String((form.elements[k] && form.elements[k].value) || '').trim();
                const keep = this._lxFormKeep || {}, kept = k => keep[k] && LearnEngine.squash(keep[k]) === LearnEngine.squash(val(k));
                const o = LearnEngine.readOrigin(val('origin'));
                const friends = this.lxFriendEntries(val('name'), val('roaster'));
                boxes.forEach(box => {
                    const k = box.getAttribute('data-for'), text = val(k);
                    const f = text ? LearnEngine.field(k, text, k === 'process' ? o : { countries: o.countries }) : { chips: [] };
                    const chips = [], hints = [];
                    (f.chips || []).forEach(ch => {
                        if (ch.t === 'ok') { const page = this.lxHasPage(ch.kind === 'decaf' ? 'decaf' : ch.kind, ch.id); const inner = `${this.lxIc('i-check-c', 15)}${this.esc(ch.name)}${ch.meta ? ` <span class="lx-rcm">· ${this.esc(ch.meta)}</span>` : ''}`; chips.push(page ? `<button type="button" class="lx-rc" onclick="${this.lxGo(ch.kind, ch.id)}" aria-label="${this.esc(ch.name)}: read about it">${inner}</button>` : `<span class="lx-rc">${inner}</span>`); }
                        else if (ch.t === 'warn') { chips.push(`<span class="lx-rc warn">${this.lxIc('i-alert', 15)}${this.esc(ch.name)}</span>`); hints.push(ch.hint); if (ch.suggestId && !kept(k)) chips.push(`<span class="lx-rc q">${this.lxIc('i-info', 15)}${this.esc(this.lxName('variety', ch.suggestId))}?</span><button type="button" class="lx-badge" onclick="app.lxFormSet('${app.escJs(k)}', '${app.escJs(this.lxName('variety', ch.suggestId))}')">Yes</button><button type="button" class="lx-badge lx-muted" onclick="app.lxFormKeep('${app.escJs(k)}')">Keep as typed</button>`); }
                        else if (ch.t === 'q' && !kept(k)) chips.push(`<span class="lx-rc q">${this.lxIc('i-info', 15)}${this.esc(ch.name)}?</span><button type="button" class="lx-badge" onclick="app.lxFormFix('${app.escJs(k)}', '${app.escJs(ch.typed || '')}', '${app.escJs(ch.name)}')">Yes</button><button type="button" class="lx-badge lx-muted" onclick="app.lxFormKeep('${app.escJs(k)}')">Keep as typed</button>`);
                        else if (ch.t === 'ask' && !kept(k)) chips.push(`<span class="lx-rc q">${this.lxIc('i-info', 15)}${this.esc(ch.options.map(x => x.name).join(' or '))}?</span>${ch.options.map(x => `<button type="button" class="lx-badge" onclick="app.lxFormAsk('${app.escJs(k)}', '${app.escJs(ch.id)}', '${app.escJs(x.id)}')">${this.esc(x.name)}</button>`).join('')}`);
                        else if (ch.t === 'info') chips.push(`<span class="lx-rc info">${this.esc(ch.name)}</span>`);
                    });
                    if (f.hint) hints.push(f.hint);
                    const HINT = { 'colombia-var': 'In the Variety box, “Colombia” means the variety bred there, not the country.', 'java-var': 'In the Variety box, “Java” means the variety, not the Indonesian island.', 'single-origin': '“Single origin” means it all comes from one place. The variety is the kind of coffee tree, like Gesha or SL28. If the bag doesn’t say, leave this empty.', arabica: '“Arabica” is the coffee species, not a variety. If the bag names no variety, leave this empty.', blend: '“Blend” means several coffees mixed. The variety is the kind of coffee tree, like Gesha or SL28.' };
                    const fr = !text && friends[k] ? `<div class="lx-friend">${this.lxIc('i-users', 20)}<span>${this.esc(friends[k].who)} logged this coffee as <b>${this.esc(friends[k].value)}</b>.</span><button type="button" class="lx-badge lx-use" onclick="app.lxFormSet('${app.escJs(k)}', '${app.escJs(friends[k].value)}')">Use it</button></div>` : '';
                    box.innerHTML = `${chips.length ? `<div class="lx-recog">${chips.join('')}</div>` : ''}${[...new Set(hints)].filter(h => HINT[h]).map(h => `<p class="lx-note lx-hint">${this.esc(HINT[h])}</p>`).join('')}${fr}`;
                });
                if (dec) {
                    const rd = LearnEngine.read({ variety: val('variety'), origin: val('origin'), process: val('process') }), any = rd.variety.length || rd.species || rd.origin.countries.length || rd.process.base || rd.process.layers.length || rd.process.decaf;
                    const d = !any ? '' : LearnEngine.decode({ variety: val('variety'), origin: val('origin'), process: val('process'), roast: form.elements.roast ? form.elements.roast.value : '', learnKeep: keep });
                    dec.innerHTML = d ? this.lxSecs([{ key: 'decoded', open: true, title: 'This coffee, decoded', teaser: d.split('. ')[0].replace(/\.$/, '') + '.', body: `<p class="lx-p">${this.esc(d)}</p><p class="lx-note">Tap a chip to read more. This shows on the coffee’s page once it’s saved.</p>`, cls: 'lx-boxsec lx-decsec', icon: 'i-book' }]) : '';
                }
            },
            // a friend's (you follow each other) entry for the same coffee, for each field: { variety: {who, value}, ... }
            lxFriendEntries(name, roaster) {
                const out = {}; if (!name) return out;
                const fr = new Set(this.friendNames ? this.friendNames() : []); if (!fr.size) return out;
                const n = String(name).trim().toLowerCase(), r = String(roaster || '').trim().toLowerCase();
                this.beans.forEach(b => {
                    if (this.isTeaBean(b)) return;
                    const who = String(b.user || b.owner || ''); if (!fr.has(who) || who === this.user) return;
                    if (String(b.name || '').trim().toLowerCase() !== n || (r && String(b.roaster || '').trim().toLowerCase() !== r)) return;
                    ['variety', 'origin', 'process'].forEach(k => { const v = String(b[k] || '').trim(); if (v && !out[k]) out[k] = { who, value: v }; });
                });
                return out;
            },
            lxFormSet(k, value) { const form = this.getBeanForm(); if (!form || !form.elements[k]) return; form.elements[k].value = value; this.learnFormPaint(); if (this.haptic) this.haptic('light'); },
            // Yes on a typo: the typed word becomes the right one, the rest stays as typed
            lxFormFix(k, typed, name) {
                const form = this.getBeanForm(); if (!form || !form.elements[k]) return;
                const v = String(form.elements[k].value || ''), i = typed ? v.toLowerCase().indexOf(String(typed).toLowerCase()) : -1;
                form.elements[k].value = i >= 0 ? v.slice(0, i) + name + v.slice(i + typed.length) : name;
                this.learnFormPaint(); if (this.haptic) this.haptic('light');
            },
            // "Washed or natural?": the answer replaces the other choice in the text
            lxFormAsk(k, kind, pick) {
                const form = this.getBeanForm(); if (!form || !form.elements[k]) return;
                let v = String(form.elements[k].value || '');
                const name = this.lxName('process', pick);
                if (kind === 'semi-washed') v = /semi[\s-]?washed/i.test(v) ? v.replace(/semi[\s-]?washed/i, name) : name;
                else {
                    const other = { washed: /\b(?:fully\s+)?washed\b/ig, natural: /\bnatural\b/ig }, keepRe = other[pick];
                    Object.entries(other).forEach(([id, re]) => { if (id !== pick) v = v.replace(re, ''); });
                    v = v.replace(/\s*[,/&+]\s*(?=[,/&+]|$)/g, '').replace(/^\s*[,/&+]\s*/, '').replace(/\s{2,}/g, ' ').trim();
                    if (!keepRe || !keepRe.test(v)) v = v ? `${v} ${name}`.trim() : name;
                }
                form.elements[k].value = v.charAt(0).toUpperCase() + v.slice(1);
                this.learnFormPaint(); if (this.haptic) this.haptic('light');
            },
            lxFormKeep(k) {
                const form = this.getBeanForm(); if (!form || !form.elements[k]) return;
                this._lxFormKeep = { ...(this._lxFormKeep || {}), [k]: String(form.elements[k].value || '').trim().slice(0, 80) };
                this.learnFormPaint();
            },
            // what the form sends with the coffee: the person's "Keep as typed" answers (only those that still match the text)
            lxFormKeepOut(form) {
                const keep = this._lxFormKeep || {}, out = {};
                ['variety', 'origin', 'process'].forEach(k => { const v = String((form.elements[k] && form.elements[k].value) || '').trim(); if (keep[k] && v && LearnEngine.squash(keep[k]) === LearnEngine.squash(v)) out[k] = keep[k]; });
                return Object.keys(out).length ? out : null;
            },

            // ===================== C3: your coffee passport (Profile › Taste, in place of the coffee map) =====================
            lxPassport(user) {
                const M = this.lxMine(user), countries = new Map(), varieties = new Map(), processes = new Map(), continents = new Set();
                const add = (m, k, c) => { let x = m.get(k); if (!x) { x = { k, n: 0, coffees: [] }; m.set(k, x); } x.n += c.n; x.coffees.push(c); };
                M.coffees.forEach(c => {
                    const t = c.tags; if (!t) return;
                    (t.origin.countries || []).forEach(code => { add(countries, code, c); const e = LearnEngine.entry('origin', code); if (e && e.continent) continents.add(e.continent); });
                    (t.variety || []).forEach(id => add(varieties, `variety:${id}`, c)); if (t.species && t.species !== 'arabica') add(varieties, `species:${t.species}`, c);
                    if (t.process.base) add(processes, t.process.base, c); (t.process.layers || []).forEach(id => add(processes, id, c));
                });
                return { countries, varieties, processes, continents, total: M.brews.length, first: M.first, mine: M };
            },
            learnPassportHtml(user) {
                if (!user || typeof LearnEngine === 'undefined') return '';
                const P = this.lxPassport(user), own = user === this.user, esc = s => this.esc(s);
                const outside = !own && this.acctOn && this.acctOn() && this.inCircle && !this.inCircle(user);
                const title = own ? 'Your coffee passport' : `${user}'s coffee passport`;
                const since = !outside && Number.isFinite(P.first) ? `since ${new Date(P.first).toLocaleDateString('en-US', { month: 'short', ...(new Date(P.first).getFullYear() !== new Date(Date.now()).getFullYear() ? { year: 'numeric' } : {}) })}` : '';
                const sub = outside ? `From what ${user} shares with Everyone` : since;
                if (!P.total || (!P.countries.size && !P.varieties.size && !P.processes.size)) {
                    const body = `<p class="lx-p lx-small">${own ? 'Log a coffee to get your first stamp.' : `${esc(user)} has no stamps yet.`}</p>`;
                    return `<section class="profile-card lx-pass" id="lx-passport">${this.lxSecs([{ key: 'passport', open: true, title, teaser: sub, body, sub }])}</section>`;
                }
                const st = (this._lxPassSt || (this._lxPassSt = {}))[user] || { tab: 'countries', sel: '' };
                const tab = st.tab;
                const seg = `<div class="lx-seg lx-seg3" role="tablist">${[['countries', 'Countries', P.countries.size], ['varieties', 'Varieties', P.varieties.size], ['processes', 'Processes', P.processes.size]].map(([k, l, n]) => `<button type="button" class="${k === tab ? 'on' : ''}" aria-pressed="${k === tab}" onclick="app.lxPassTab('${app.escJs(user)}', '${app.escJs(k)}')">${l} · ${n}</button>`).join('')}</div>`;
                let view = '';
                const listFor = (x, label, kind, id) => `<div class="cm-list lx-plist"><div class="cm-list-h">${esc(label)} · ${this.lxPlural(x.coffees.length, 'coffee')}</div>${x.coffees.slice().sort((a, b) => (b.rn ? b.rs / b.rn : 0) - (a.rn ? a.rs / a.rn : 0) || b.n - a.n).map(c => `<button type="button" class="cm-row" onclick="app.openFeedTarget('${app.escJs(c.id)}', '', false)"><span><b>${esc(c.bean.name || 'Coffee')}</b><small>${esc(c.bean.roaster || '')}</small></span>${c.rn ? `<em>${this.formatRating(c.rs / c.rn)}★</em>` : ''}</button>`).join('')}${kind && this.lxHasPage(kind, id) ? `<button type="button" class="lx-textbtn" onclick="${this.lxGo(kind, id)}">About ${esc(label)} ›</button>` : ''}</div>`;
                const shy = t => String(t).split(' ').map(w => { if (w.length <= 7) return w; let at = -1, mid = w.length / 2; for (let i = 3; i <= w.length - 3; i++) if (/[aeiouy]/i.test(w[i - 1]) && !/[aeiouy]/i.test(w[i]) && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i; return at > 0 ? w.slice(0, at) + '\u00AD' + w.slice(at) : w; }).join(' ');
                const stamp = (key, label, n, onclick, on) => `<button type="button" class="lx-stamp${on ? ' on' : ''}" onclick="${onclick}" aria-pressed="${!!on}" aria-label="${esc(label)}, ${n} sessions"><span>${esc(shy(label))}</span><b>${n}</b></button>`;
                if (tab === 'countries') {
                    const sel = st.sel && P.countries.has(st.sel) ? st.sel : '';
                    const level = n => n >= 10 ? 3 : n >= 3 ? 2 : 1;
                    const paths = typeof WORLD_MAP !== 'undefined' ? Object.entries(WORLD_MAP.c).map(([c, d]) => { const x = P.countries.get(c); return `<path class="cm-land${x ? ` cm-on cm-l${level(x.n)}` : ''}" d="${d}"${x ? ` data-c="${c}"` : ''}/>`; }).join('') : '';
                    const hi = typeof WORLD_MAP !== 'undefined' && WORLD_MAP.dots ? WORLD_MAP.dots.HI : null, hx = P.countries.get('HI');
                    const dot = hi ? `<circle class="cm-dot${hx ? ` cm-on cm-l${level(hx.n)}` : ''}${sel === 'HI' ? ' cm-sel' : ''}" cx="${hi[0]}" cy="${hi[1]}" r="5"${hx ? ' data-c="HI"' : ''}/>` : '';
                    const selLine = sel && typeof WORLD_MAP !== 'undefined' && WORLD_MAP.c[sel] ? `<path class="cm-selo" d="${WORLD_MAP.c[sel]}"/>` : '';
                    const belt = typeof WORLD_MAP !== 'undefined' ? (WORLD_MAP.belt || []).map(y => `<line class="cm-tropic" x1="0" x2="${WORLD_MAP.w}" y1="${y}" y2="${y}"/>`).join('') : '';
                    const map = typeof WORLD_MAP !== 'undefined' ? `<svg class="cm-svg lx-pmapsvg" viewBox="0 34 ${WORLD_MAP.w} ${WORLD_MAP.h - 70}" role="img" aria-label="Map of the countries ${own ? 'your' : 'their'} coffees came from" onclick="app.lxPassMapTap(event, '${app.escJs(user)}')">${paths}${dot}${belt}${selLine}</svg>` : '';
                    const order = [...P.countries.values()].sort((a, b) => b.n - a.n || this.lxName('origin', a.k).localeCompare(this.lxName('origin', b.k)));
                    const stamps = `<div class="lx-stamps">${order.map(x => stamp(x.k, this.lxName('origin', x.k), x.n, `app.lxPassSel('${app.escJs(user)}', '${app.escJs(x.k)}')`, x.k === sel)).join('')}</div>`;
                    const nC = LearnEngine.allCountries().length, nK = LearnEngine.CONTINENTS.length;
                    const sum = `<div class="lx-hr"></div><div class="lx-psum"><span>${P.countries.size} of ${nC} coffee countries</span><span class="lx-muted">${P.continents.size} of ${nK} continents</span></div><div class="lx-prog"><i style="width:${Math.max(2, Math.round(100 * P.countries.size / nC))}%"></i></div>`;
                    view = `${map}${stamps}${sel ? listFor(P.countries.get(sel), this.lxName('origin', sel), 'origin', sel) : ''}${sum}<p class="lx-note">Numbers are ${own ? 'your' : 'their'} sessions. Tap a stamp, or a country on the map, for ${own ? 'your' : 'their'} coffees from there. A blend counts for each of its countries.</p>`;
                } else {
                    const m = tab === 'varieties' ? P.varieties : P.processes;
                    const sel = st.sel && m.has(st.sel) ? st.sel : '';
                    const order = [...m.values()].sort((a, b) => b.n - a.n);
                    const kOf = x => tab === 'varieties' ? x.k.split(':') : ['process', x.k];
                    const stamps = `<div class="lx-stamps">${order.map(x => { const [kind, id] = kOf(x); const page = this.lxHasPage(kind, id); return stamp(x.k, this.lxName(kind, id), x.n, page ? this.lxGo(kind, id) : `app.lxPassSel('${app.escJs(user)}', '${app.escJs(x.k)}')`, x.k === sel); }).join('')}</div>`;
                    const selX = sel ? m.get(sel) : null, [sk, sid] = selX ? kOf(selX) : ['', ''];
                    view = `${stamps}${selX ? listFor(selX, this.lxName(sk, sid), sk, sid) : ''}<p class="lx-note">Numbers are ${own ? 'your' : 'their'} sessions. Tap a stamp to read about it.</p>`;
                }
                const next = own ? this.lxNextStamps(P) : '';
                const body = `${seg}<div class="lx-pview">${view}</div>${next}`;
                return `<section class="profile-card lx-pass" id="lx-passport">${this.lxSecs([{ key: 'passport', open: true, title, teaser: `${this.lxPlural(P.countries.size, 'country', 'countries')} · ${this.lxPlural(P.varieties.size, 'variety', 'varieties')} · ${this.lxPlural(P.processes.size, 'process', 'processes')}`, body, sub }])}</section>`;
            },
            lxPassTab(user, tab) { const s = this._lxPassSt || (this._lxPassSt = {}); s[user] = { tab, sel: '' }; this.lxPassRepaint(user); },
            lxPassSel(user, k) { const s = this._lxPassSt || (this._lxPassSt = {}), cur = s[user] || { tab: 'countries', sel: '' }; s[user] = { ...cur, sel: cur.sel === k ? '' : k }; this.lxPassRepaint(user); },
            lxPassMapTap(ev, user) { const t = ev && ev.target && ev.target.closest ? ev.target.closest('[data-c]') : null; if (t) this.lxPassSel(user, t.getAttribute('data-c')); },
            lxPassRepaint(user) {
                const el = document.getElementById('lx-passport'); if (!el) return;
                const w = document.createElement('div'); w.innerHTML = this.learnPassportHtml(user);
                if (w.firstElementChild) el.replaceWith(w.firstElementChild);
                if (this.haptic) this.haptic('tick');
            },
            // Next stamps for you: up to three kinds you haven't had (or had once), each with its reason; never a roaster's coffee
            lxNextStamps(P) {
                const c = this.learnContent(); if (!c) return '';
                const pal = this.palateFor ? this.palateFor(this.user, 'coffee') : null;
                const myNotes = (pal && pal.notes ? pal.notes.map(n => String(n.label || '').toLowerCase()) : []).slice(0, 5);
                const famOf = n => this.noteFam(n, 'coffee');
                const cands = [];
                c.entries.forEach(e => {
                    const n = e.kind === 'origin' ? (P.countries.get(e.country) || { n: 0 }).n : e.kind === 'process' ? (P.processes.get(e.id) || { n: 0 }).n : (P.varieties.get(`${e.kind}:${e.id}`) || { n: 0 }).n;
                    if (n > 1) return;
                    const notes = (e.taste && e.taste.notes) || [];
                    const hit = myNotes.find(m => notes.some(x => x.toLowerCase() === m)) || myNotes.find(m => famOf(m) && famOf(m) !== 'off' && notes.some(x => famOf(x) === famOf(m)));
                    const why = hit ? `${hit.charAt(0).toUpperCase() + hit.slice(1)} is one of your most-logged notes, and ${e.name} is described with ${notes.slice(0, 2).map(x => x.toLowerCase()).join(' and ')}.`
                        : n === 1 ? `You've logged it once. ${e.summary}` : `New to you. ${e.summary}`;
                    cands.push({ e, n, why, score: (hit ? 2 : 0) + (n === 1 ? 1 : 0) });
                });
                const pick = [], used = new Set();
                cands.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name)).forEach(x => { if (pick.length < 3 && !used.has(x.e.kind)) { pick.push(x); used.add(x.e.kind); } });
                cands.forEach(x => { if (pick.length < 3 && !pick.includes(x)) pick.push(x); });
                if (!pick.length) return '';
                const icon = { origin: 'i-globe', variety: 'i-tree', species: 'i-tree', process: 'i-drop' };
                const label = e => e.kind === 'origin' ? `A coffee from ${e.name}` : e.kind === 'process' ? `A ${e.name.toLowerCase()} coffee` : `A ${e.name}`;
                return `<div class="lx-hr"></div><div class="lx-flabel">Next stamps for you</div><div class="lx-group lx-next">${pick.map(x => this.lxRow({ thumb: this.lxIc(icon[x.e.kind] || 'i-book', 22), title: label(x.e), sub: x.why, onclick: this.lxGo(x.e.kind === 'origin' ? 'origin' : x.e.kind, x.e.kind === 'origin' ? x.e.country : x.e.id), cls: 'lx-nextrow' }).replace('<button type="button" class="lx-row', `<button type="button" data-fam="${this.esc(x.e.tint || 'app')}" class="lx-row`)).join('')}</div>`;
            },
            // the palate card's Origins, Process and Variety chips open Learn pages
            lxPalateChip(kind, label) {
                const text = String(label || '');
                if (!this.learnOn() || typeof LearnEngine === 'undefined') return `<span class="flavor-mini">${this.esc(text)}</span>`;
                const f = LearnEngine.field(kind === 'Origins' ? 'origin' : kind === 'Variety' ? 'variety' : 'process', text, {});
                const ok = (f.chips || []).find(ch => ch.t === 'ok' && this.lxHasPage(ch.kind, ch.id));
                return ok ? `<button type="button" class="flavor-mini lx-pchip" onclick="${this.lxGo(ok.kind, ok.id)}">${this.esc(text)}${this.lxIc('i-chev-right', 12)}</button>` : `<span class="flavor-mini">${this.esc(text)}</span>`;
            },

            // ===================== the Log screen's coach =====================
            // A first shot on a coffee nobody else here has logged: the kind's numbers (method-matched, from 2 people), read
            // from what Learn has already loaded (never a call while you log). Ratio, time and dose only: never grind.
            learnFirstShotRow(c, k) {
                if (!this.learnOn() || !k || k.ref || !c || !c.method || !c.beanKey) return null;
                if ((k.ctx || []).some(([a]) => a === 'Others on this coffee')) return null;
                const others = [...this.brews.values()].some(b => this.groupKeyOfBrew(b) === c.beanKey && this.getBrewOwner(b) !== c.owner);
                if (others) return null;
                const bean = this.beans.get(String(c.beanId || '')); if (!bean || this.isTeaBean(bean)) return null;
                let m = {}; try { m = JSON.parse(safeGet('dialed_learn_brew') || '{}') || {}; } catch (e) { return null; }
                const mk = String(c.method || '').toLowerCase();
                for (const w of this.lxCombos(bean)) {
                    const x = m[this.lxWantKey(w)]; if (!x || !(x.people >= 2 && x.coffees >= 2)) continue;
                    const b = (x.brew || []).find(y => y.method === mk && (y.people || 0) >= 2 && y.n >= 2); if (!b) continue;
                    const hours = mk === 'cold brew', t = Number(b.time) || 0;
                    const time = !t ? '' : hours ? `${this.fmtNum(t, 0)} h` : t >= 90 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${this.fmtNum(t, 0)} s`;
                    const parts = [b.ratio ? `1:${this.fmtNum(b.ratio, 1)}` : '', time, b.dose ? `${this.fmtNum(b.dose, 1)} g` : ''].filter(Boolean).join(' · ');
                    const shots = mk === 'espresso' ? 'shots' : 'brews';
                    return [`${this.lxComboTitle(w)} here`, `${parts} (${b.n} ${shots} rated 4★ or more, ${b.people} people). Your grind is yours to find.`];
                }
                return null;
            },
            // The potato defect: a known one-bean defect of East and Central African coffees, not a recipe problem
            LX_POTATO: ['RWA', 'BDI', 'COD', 'UGA', 'TZA', 'KEN', 'ETH'],
            lxPotatoText(text, flavors) {
                const t = `${String(text || '')} ${(flavors || []).join(' ')}`.toLowerCase();
                const re = /\b(raw\s+)?potato(e?s)?\b|\bpea(s|\s+shoots?)?\b/g; let mm;
                while ((mm = re.exec(t))) { const before = t.slice(Math.max(0, mm.index - 24), mm.index); if (!/\b(no|not|without|zero|never|wasn['’]?t|isn['’]?t|didn['’]?t)\b[^.,;!?]*$/.test(before)) return true; }
                return false;
            },
            lxPotatoBean(bean) { const t = this.lxTags(bean); return !!(t && t.origin && (t.origin.countries || []).some(c => this.LX_POTATO.includes(c))); },
            learnPotato(c) {
                if (typeof LearnEngine === 'undefined' || !c) return '';
                const bean = this.beans.get(String(c.beanId || '')); if (!bean || this.isTeaBean(bean) || !this.lxPotatoBean(bean)) return '';
                if (!this.lxPotatoText(c.text, c.flavors)) return '';
                const w = this.shotWord ? this.shotWord(c.method) : 'shot';
                return `A raw-potato or pea taste in coffee from this part of Africa is usually the “potato defect”: a few damaged beans, not your recipe. Throw out that dose, grind a few beans to clear the grinder, and grind smaller amounts for a while. It isn’t a health risk, and this ${w} is left out of your best ${w}s.`;
            },
            learnPotatoBrew(b) {
                if (typeof LearnEngine === 'undefined' || !b) return false;
                const bean = this.beans.get(String(b.beanId || '')); if (!bean || this.isTeaBean(bean) || !this.lxPotatoBean(bean)) return false;
                return this.lxPotatoText(this.getBrewNotes(b), this.extractFlavors(b));
            },

            // ===================== a roaster's Process bar =====================
            // its thin segments can't be tapped one by one: the whole bar opens a list of the processes with pages
            LX_ROPROC: { Washed: 'washed', Natural: 'natural', Honey: 'honey', Anaerobic: 'anaerobic' },
            lxRoasterProcess(html, counts) {
                if (!html || !this.learnOn()) return html;
                const rows = Object.entries(counts || {}).filter(([k, v]) => v > 0 && this.LX_ROPROC[k] && this.lxHasPage('process', this.LX_ROPROC[k]));
                if (!rows.length) return html;
                return `<div class="lx-robar" role="button" tabindex="0" aria-expanded="false" aria-label="Process: read about these" onclick="app.lxRoasterToggle(this)">${html}</div><div class="lx-rolist" hidden>${rows.map(([k, v]) => `<button type="button" class="lx-row" onclick="${this.lxGo('process', this.LX_ROPROC[k])}"><span class="lx-rmain"><b>${this.esc(this.lxName('process', this.LX_ROPROC[k]))}</b><small>${this.lxPlural(v, 'session')} here</small></span><span class="lx-chev">${this.lxIc('i-chev-right', 16)}</span></button>`).join('')}</div>`;
            },
            lxRoasterToggle(el) { const list = el && el.nextElementSibling; if (!list) return; list.hidden = !list.hidden; el.setAttribute('aria-expanded', String(!list.hidden)); if (this.haptic) this.haptic('tick'); },
