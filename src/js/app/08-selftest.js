            // ===================== self-test (v10) =====================
            // Runs thousands of checks against whatever data is loaded. Read-only: nothing is saved.
            async runSelfTest(onProgress) {
                const res = { passed: 0, failed: 0, failures: [], sections: {}, ms: 0 };
                const t0 = performance.now();
                let section = 'setup';
                const check = (cond, label) => { res.sections[section] = (res.sections[section] || 0) + 1; if (cond) res.passed++; else { res.failed++; if (res.failures.length < 80) res.failures.push(`${section}: ${label}`); } };
                const safe = (label, fn) => { try { return fn(); } catch (err) { check(false, `${label} threw: ${err && err.message}`); return undefined; } };
                const bad = s => typeof s !== 'string' || /\bundefined\b|\bNaN\b|\[object Object\]|>null</.test(s);
                const tick = () => new Promise(r => setTimeout(r, 0));
                const keep = { section: this.profileSection, tab: this.tab, theme: window.__dialedTheme ? window.__dialedTheme.pref : 'system', look: window.__dialedLook ? window.__dialedLook.pref : 'classic', profileUser: this.profileUser, threads: new Set(this.openThreads), cardTabs: new Map(this.cardTabs || []), replyTo: this.replyTo, activeId: this.activeId };
                const realPush = this.push;
                let pushes = 0;
                this.push = function () { pushes++; return Promise.resolve(); };
                const brews = Array.from(this.brews.values()), beans = Array.from(this.beans.values());
                const fingerprint = () => JSON.stringify([brews.map(b => [b.id, b.comments, b.likes, b.flavors, b.grind, b.rating]), beans.map(b => [b.id, b.comments, b.likes, b.wantToTry])]);
                const before = fingerprint();
                const rnd = (() => { let x = 20261005; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; })();
                const pick = arr => arr[Math.floor(rnd() * arr.length)];
                try {
                    // 1. every session's data
                    section = 'session data';
                    brews.forEach(b => {
                        const sv = safe('shapeValues', () => this.shapeValues(b)) || {};
                        check(TASTE_KEYS.every(k => Number.isFinite(sv[k]) && sv[k] >= 0 && sv[k] <= 10), `${b.id} shape values in range`);
                        const tk = safe('tastedKeys', () => this.tastedKeys(b)) || [];
                        check(tk.every(k => TASTE_KEYS.includes(k)), `${b.id} tasted keys valid`);
                        const ni = safe('noteIntensities', () => this.noteIntensities(b)) || {};
                        check(Object.values(ni).every(v => v === 1 || v === 2 || v === 3), `${b.id} note strengths 1-3`);
                        const g = safe('grindText', () => this.grindText(b.grind));
                        check(typeof g === 'string' && g.length <= 24 && !/NaN|undefined/.test(g), `${b.id} grind text "${g}"`);
                        const rl = safe('recipeLine', () => this.recipeLine(b, true));
                        check(!bad(rl), `${b.id} recipe line`);
                        const words = safe('describeCup', () => this.describeCup(sv, tk, this.extractFlavors(b), ni));
                        check(typeof words === 'string' && !bad(words), `${b.id} cup in words`);
                    });
                    if (onProgress) onProgress('sessions'); await tick();
                    // 2. every session card, pane and thread
                    section = 'session cards';
                    brews.forEach(b => {
                        const card = safe('card', () => this.renderFeedSessionCard({ brewId: b.id, beanId: b.beanId }));
                        check(typeof card === 'string' && !bad(card) && card.includes(`data-card-brew="${this.esc(b.id)}"`), `${b.id} feed card`);
                        check(!bad(safe('flavor', () => this.renderFlavorPane(b))), `${b.id} flavor tab`);
                        check(!bad(safe('vs', () => this.renderVsPane(b))), `${b.id} vs last time`);
                        check(!bad(safe('next', () => this.renderNextPane(b))), `${b.id} next shot`);
                        const adv = safe('advice', () => this.nextShotAdvice(b));
                        check(adv && typeof adv.headline === 'string' && adv.headline.length > 0 && !bad(adv.headline) && (adv.detail || []).every(d => !bad(d)), `${b.id} next-shot advice text`);
                        const th = safe('thread', () => this.renderThread('brew', b, { inputId: `st-${b.id}` }));
                        check(typeof th === 'string' && !bad(th) && th.includes('data-thread'), `${b.id} comment thread`);
                    });
                    section = 'bean cards';
                    beans.forEach(bn => {
                        check(!bad(safe('bean card', () => this.renderFeedBeanCard({ beanId: bn.id }))), `${bn.id} bean card`);
                        check(!bad(safe('bean thread', () => this.renderThread('bean', bn, { inputId: `st-b-${bn.id}` }))), `${bn.id} bean thread`);
                    });
                    if (onProgress) onProgress('cards'); await tick();
                    // 3. every screen, every person, both themes
                    section = 'screens';
                    const noOverflow = () => document.documentElement.scrollWidth <= window.innerWidth + 2;
                    const blockers = () => {
                        const hits = new Set();
                        for (let x = 16; x < window.innerWidth; x += Math.max(36, window.innerWidth / 9)) for (let y = 70; y < window.innerHeight - 8; y += 48) {
                            const el = document.elementFromPoint(x, y);
                            for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.opacity === '0' || cs.visibility === 'hidden') { hits.add(n.id || String(n.className)); break; } }
                        }
                        return [...hits];
                    };
                    // v17.2: both looks (classic and New) in both themes
                    for (const look of ['classic', 'new']) for (const theme0 of ['light', 'dark']) {
                        if (window.__dialedLook) { window.__dialedLook.set(look); this._nlFam = null; }
                        const theme = theme0, lk = look === 'new' ? 'new look ' : '';
                        safe('theme', () => this.setThemePref(theme));
                        check(document.documentElement.getAttribute('data-theme') === theme, `${lk}theme switches to ${theme}`);
                        check(document.documentElement.getAttribute('data-look') === look && this.newLook() === (look === 'new'), `the look is ${look}`);
                        for (const tab of ['feed', 'my', 'roasters', 'profile']) {
                            safe('tab', () => this.setTab(tab));
                            const grid = document.getElementById('grid');
                            check(grid && !bad(grid.innerText), `${lk}${theme} ${tab}: no undefined/NaN text`);
                            check(noOverflow(), `${lk}${theme} ${tab}: nothing spills sideways`);
                            const hidden = blockers();
                            check(!hidden.length, `${lk}${theme} ${tab}: no invisible layer blocks taps ${hidden.join(', ')}`);
                            if (look === 'classic') check(!grid.querySelector('.nl-card, .nl-lcard, [data-fam], [data-nf]') && !document.body.hasAttribute('data-nltab'), `classic ${theme} ${tab}: nothing of the new look`);
                            else if (tab === 'feed' || tab === 'my') check([...grid.querySelectorAll('.nl-card, .nl-lcard')].every(c => /^(app|nutty|fruity|floral|sweet|spice|earthy|fermented|vegetal|herbal)$/.test(c.getAttribute('data-fam') || '')), `new look ${theme} ${tab}: every card has a family`);
                        }
                        for (const name of this.users) {
                            for (const sec of ['overview', 'taste', 'activity']) {
                                this.profileSection = sec;
                                safe('profile', () => this.setProfileUser(name));
                                const grid = document.getElementById('grid');
                                check(grid && grid.querySelector('.profile-tabs') && grid.querySelector(`.profile-section[data-section="${sec}"]`) && !bad(grid.innerText), `${theme} profile ${name} ${sec}`);
                            }
                        }
                        this.profileSection = keep.section || 'overview';
                        await tick();
                    }
                    if (window.__dialedLook) window.__dialedLook.set('classic');
                    safe('theme', () => this.setThemePref('system'));
                    // v17.2: the New look's own checks
                    section = 'new look';
                    {
                        let stored = ''; try { window.__dialedLook.set('new'); stored = localStorage.getItem('dialed_look'); } catch (e) {}
                        check(stored === 'new' && document.documentElement.getAttribute('data-look') === 'new', 'the New look switch is saved and sets data-look');
                        this._nlFam = null;
                        check(this.lookFamily([['Sour', 3, 'coffee'], ['Thin', 2, 'coffee']]) === null, 'notes that only taste off give no family');
                        check(this.lookFamily([['Peach', 1, 'coffee'], ['Cocoa', 3, 'coffee']]) === 'nutty' && this.lookFamily([['Peach', 2, 'coffee'], ['Cocoa', 2, 'coffee']]) === 'fruity', 'the strongest family wins, a tie goes to the first note');
                        const bn0 = beans[0];
                        if (bn0) { const fake = { id: 'st-off', beanId: bn0.id, flavors: 'Sour,Thin', method: 'Espresso' }; check(this.famOfBrew(fake) === this.famOfCoffee(bn0), 'a session that only tastes off wears its coffee\'s family'); }
                        for (const dark of [false, true]) {
                            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
                            const cards = Object.values(this.NL_PAL[dark ? 'dark' : 'light']).map(p => p[0]);
                            (this.users || []).concat(this.knownPeople()).forEach(n => cards.forEach(bg => check(this.nlContrast(this.nameColor(n, bg), bg) >= 4.5, `${n}'s name reads on ${bg} (${dark ? 'dark' : 'light'})`)));
                        }
                        safe('theme', () => this.setThemePref(keep.theme === 'dark' ? 'dark' : 'light'));
                        const sb = brews.find(b => this.beans.has(String(b.beanId))) || brews[0];
                        if (sb) {
                            safe('feed', () => this.setTab('feed'));
                            const card = safe('card', () => this.renderFeedSessionCardNew({ brewId: sb.id, date: sb.date }));
                            check(typeof card === 'string' && card.includes('nl-card') && card.includes(`onclick="app.openSession('${this.escJs(sb.id)}')"`) && !bad(card), 'a feed card opens the Session screen');
                            safe('open session', () => this.openSession(sb.id));
                            const sv = document.getElementById('session-view');
                            check(this.sessionViewActive() && sv && !bad(sv.innerText), 'the Session screen opens from a card, with no undefined/NaN');
                            const thCard = (card.match(/data-thread="([^"]+)"/) || [])[1], thSess = sv && sv.querySelector('[data-thread]') ? sv.querySelector('[data-thread]').getAttribute('data-thread') : '';
                            check(thCard && thCard === thSess, 'the card and the Session screen share one comment thread');
                            check(noOverflow() && sv.scrollWidth <= window.innerWidth + 2, 'the Session screen fits the screen');
                            check(this.swipeBack() === true && !this.sessionViewActive(), 'the edge swipe (Back) closes the Session screen');
                            safe('open from link', () => this.openFeedTarget(sb.beanId, sb.id, true));
                            check(this.sessionViewActive(), 'a link or notification to a session opens the Session screen');
                            safe('close', () => this.closeSession(true));
                            check(!this.sessionViewActive(), 'Back closes it');
                            safe('coffee page', () => this.openFeedTarget(sb.beanId, '', false));
                            const row = document.querySelector('#d-logs .nl-logrow');
                            check(row && /openSession/.test(row.getAttribute('onclick') || ''), 'a session row on the coffee page opens the Session screen');
                            check(document.getElementById('detail-view').getAttribute('data-fam'), 'the coffee page wears its coffee\'s family');
                            safe('close', () => this.closeDetail());
                        }
                        window.__dialedLook.set('classic'); this.onThemeChange();
                        safe('classic coffee page', () => sb && this.openFeedTarget(sb.beanId, '', false));
                        const dv = document.getElementById('detail-view');
                        check(!dv.hasAttribute('data-fam') && !dv.querySelector('.nl-dphoto, .nl-logrow, [data-nf]'), 'with the switch off, the coffee page is classic again');
                        safe('close', () => this.closeDetail());
                    }
                    if (onProgress) onProgress('screens');
                    // 4. every bean page
                    section = 'bean pages';
                    const seen = new Set();
                    for (const bn of beans) {
                        const key = this.beanGroupKey(bn);
                        if (seen.has(key)) continue;
                        seen.add(key);
                        safe('open', () => this.openFeedTarget(bn.id, '', false));
                        const view = document.getElementById('detail-view');
                        check(!!this.activeGroup, `${bn.id} opens`);
                        check(view && !bad(view.innerText), `${bn.id} page has no undefined/NaN text`);
                        const fl = document.getElementById('d-flavor');
                        check(fl && fl.innerHTML.length > 0 && !bad(fl.innerText), `${bn.id} flavor profile renders`);
                        check(!bad(safe('side', () => { this.renderSidePanel(); return document.getElementById('d-side-pane') ? document.getElementById('d-side-pane').innerText : ''; }) || ''), `${bn.id} side by side`);
                        check(Array.isArray(safe('dialin', () => this.dialinSeries())) || true, `${bn.id} dial-in curve`);
                        check(noOverflow(), `${bn.id} page fits the screen`);
                        safe('close', () => this.closeDetail());
                        if (seen.size % 8 === 0) await tick();
                    }
                    if (onProgress) onProgress('pages');
                    // 4b. roasters (v13.0): the list and every roaster's page
                    section = 'roasters';
                    safe('roaster list', () => { this.setTab('roasters'); });
                    const rg = document.getElementById('grid');
                    check(rg && rg.querySelector('.ro-sorts') && !bad(rg.innerText), 'roaster list renders');
                    check(noOverflow(), 'roaster list fits the screen');
                    const roD = safe('roaster data', () => this.roasterData());
                    for (const r of (roD ? roD.roasters : [])) {
                        safe('roaster page', () => this.openRoaster(r.key));
                        const page = document.getElementById('ro-page'), rv = document.getElementById('roaster-view');
                        check(this.roasterViewActive() && page && page.querySelector('.ro-hero') && !bad(page.innerText), `roaster ${r.key} page`);
                        check(typeof r.style === 'string' && r.style.length > 8 && !bad(r.style) && !/ {2}|\.\.|\. \./.test(r.style), `roaster ${r.key} description reads cleanly`);
                        check(!/\bgrind\b(?! numbers differ)/i.test(page.innerText), `roaster ${r.key} shows no grind`);
                        check(rv && rv.scrollWidth <= rv.clientWidth + 2, `roaster ${r.key} page fits the screen`);
                        safe('roaster back', () => this.goBackPage());
                    }
                    check(!this.roasterViewActive(), 'roaster pages close');
                    await tick();
                    // 5. tip engine, thousands of random shots
                    section = 'tips';
                    const rated = brews.filter(b => this.normalizeRating(b.rating) > 0);
                    const grinds = ['10.4', '11', '3B', 'Click 18', '', '0', '7.25', 'A12', '  9 ', 'fine'];
                    const methods = ['Espresso', 'Pour Over', 'French Press', 'AeroPress', 'Moka Pot', 'Cold Brew'];
                    for (let i = 0; i < 1500; i++) {
                        const values = {}; TASTE_KEYS.forEach(k => { values[k] = 1 + Math.floor(rnd() * 10); });
                        const tasted = TASTE_KEYS.filter(() => rnd() < 0.6);
                        const cur = { values, tasted, notes: rnd() < 0.2 ? [pick(['Sour', 'Bitter', 'Jasmine', 'Harsh'])] : [], method: pick(methods), grind: pick(grinds), dose: 14 + Math.floor(rnd() * 8), yield: 25 + Math.floor(rnd() * 30), time: rnd() < 0.1 ? null : Math.floor(rnd() * 70) };
                        const ref = rated.length ? pick(rated) : { rating: 4, time: 28, dose: 18, yield: 40, grind: '10', acidity: 6, sweetness: 7, body: 6, finish: 6, balance: 6 };
                        const a = safe('adviseAgainst', () => this.adviseAgainst(cur, ref));
                        check(a && typeof a.head === 'string' && !bad(a.head) && (!a.detail || !bad(a.detail)) && (a.evidence || []).every(e => !bad(e.text)), `random shot ${i} vs best`);
                        const f = safe('adviseFirstShot', () => this.adviseFirstShot(cur, { baseline: { bitterness: 3, acidity: 6 }, friend: rated[0] || null, bean: { roast: pick(['Light', 'Dark', '']) } }));
                        check(f && typeof f.head === 'string' && !bad(f.head) && (!f.detail || !bad(f.detail)) && (!f.note || !bad(f.note)), `random first shot ${i}`);
                    }
                    // targeted: clear signals must give the right direction
                    const R = { rating: 4.5, time: 28, dose: 18, yield: 40, grind: '10.4', acidity: 6, sweetness: 7, body: 6, finish: 6, bitterness: 3, balance: 6, tasted: TASTE_KEYS };
                    for (let i = 0; i < 150; i++) {
                        const sour = this.adviseAgainst({ values: { acidity: 9, sweetness: 4, body: 5, finish: 5, bitterness: 3, balance: 6 }, tasted: ['acidity', 'sweetness'], notes: [], method: 'Espresso', grind: pick(['11', '3B', '']), dose: 18, yield: 40, time: 18 + Math.floor(rnd() * 4) }, R);
                        check(/finer/.test(sour.head), `sour + fast reads under-extracted (${sour.head})`);
                        const bitter = this.adviseAgainst({ values: { acidity: 6, sweetness: 5, body: 6, finish: 6, bitterness: 8, balance: 6 }, tasted: ['bitterness'], notes: [], method: 'Espresso', grind: pick(['9.5', '2A', '']), dose: 18, yield: 40, time: 36 + Math.floor(rnd() * 6) }, R);
                        check(/coarser/.test(bitter.head), `bitter + slow reads over-extracted (${bitter.head})`);
                        const first = this.adviseFirstShot({ values: { bitterness: 9, sweetness: 3, acidity: 4, body: 6, finish: 6, balance: 5 }, tasted: ['bitterness', 'sweetness'], notes: [], method: 'Espresso', grind: '12', dose: 18, yield: 40, time: 38 + Math.floor(rnd() * 5) }, { baseline: {}, bean: { roast: 'Light' } });
                        check(/coarser/.test(first.head), `first shot, way too bitter and slow -> coarser (${first.head})`);
                        const firstSour = this.adviseFirstShot({ values: { acidity: 9, sweetness: 3, bitterness: 2, body: 4, finish: 4, balance: 5 }, tasted: ['acidity', 'sweetness'], notes: [], method: 'Espresso', grind: 'B4', dose: 18, yield: 40, time: 16 + Math.floor(rnd() * 4) }, { baseline: {}, bean: {} });
                        check(/finer/.test(firstSour.head), `first shot, sour and fast -> finer (${firstSour.head})`);
                    }
                    if (onProgress) onProgress('tips'); await tick();
                    // 6. grind settings with letters
                    section = 'grind';
                    const chars = 'ABCabc0123456789 .,-#';
                    for (let i = 0; i < 400; i++) {
                        const len = Math.floor(rnd() * 8);
                        let g = ''; for (let j = 0; j < len; j++) g += chars[Math.floor(rnd() * chars.length)];
                        if (i % 5 === 0) g = String(Math.round(rnd() * 400) / 10);
                        const t = this.grindText(g), n = this.grindNum(g);
                        check(typeof t === 'string' && t.length <= 24, `grind "${g}" -> "${t}"`);
                        check(n === null || (Number.isFinite(n) && (n === 0 ? t === '' : t === this.fmtNum(n, 2))), `grind "${g}" number consistent`);
                        check(this.sameGrind(g, g), `grind "${g}" equals itself`);
                        const line = this.recipeLine({ grind: g, dose: 18, yield: 36, time: 28, method: 'Espresso' }, true);
                        check(!t || line.includes(t), `recipe line shows grind "${t}"`);
                        check(this.normalizeGrindInput(g).length <= 24, `grind input "${g}" trimmed`);
                    }
                    // 7. comments: likes, replies, merging
                    section = 'comments';
                    const names = ['Maceo', 'Julian', 'Aidan'];
                    for (let i = 0; i < 300; i++) {
                        const raw = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, j) => ({ id: `c${j}`, user: pick(names), text: rnd() < 0.1 ? '' : `hi ${j}`, timestamp: '2026-10-01T10:00:00Z', likes: [pick(names), pick(names), rnd() < 0.2 ? '' : pick(names)], parentId: j && rnd() < 0.4 ? 'c0' : undefined }));
                        const n = this.normalizeCommentList(raw, 'st', '2026-10-01T00:00:00Z');
                        check(n.every(c => typeof c.id === 'string' && typeof c.parentId === 'string' && Array.isArray(c.likes) && new Set(c.likes).size === c.likes.length && c.likes.every(Boolean) && c.text), `normalize ${i}`);
                        const base = [{ id: 'k', user: 'Maceo', text: 'x', timestamp: 't', likes: [] }];
                        const mine = [{ ...base[0], likes: ['Julian'] }], theirs = [{ ...base[0], likes: ['Aidan'] }];
                        const m = this.mergeCommentLists(base, mine, theirs);
                        check(m.length === 1 && m[0].likes.includes('Julian') && m[0].likes.includes('Aidan'), `two people liking at once both count (${i})`);
                        const del = this.mergeCommentLists(base, base, []);
                        check(del.length === 0, `a comment deleted elsewhere stays deleted (${i})`);
                        const added = this.mergeCommentLists(base, base.concat([{ id: `new${i}`, user: 'Julian', text: 'reply', timestamp: 't', parentId: 'k', likes: [] }]), base);
                        check(added.some(c => c.id === `new${i}` && c.parentId === 'k'), `a new reply survives the merge (${i})`);
                    }
                    // 8. nothing typed can become live HTML
                    section = 'safety';
                    const evil = '<img src=x onerror=alert(1)><scr' + 'ipt>alert(2)</scr' + 'ipt>';
                    const fake = { id: 'evil"\'<', beanId: 'nope', user: evil, owner: evil, comments: [{ id: 'c', user: evil, text: evil, timestamp: '2026-10-01T00:00:00Z', likes: [evil] }], flavors: evil, notes: evil, grind: evil, acidity: 5, tasted: ['acidity'] };
                    [() => this.renderThread('brew', fake, { inputId: 'x' }), () => this.renderFlavorPane(fake), () => this.renderTipHtml(this.adviseFirstShot({ values: { bitterness: 9 }, tasted: ['bitterness'], notes: [], method: 'Espresso', grind: evil, time: 40 }, { friend: { ...fake, rating: 4, dose: 18, yield: 40, time: 28 }, baseline: {} })), () => this.noteChipsHtml(this.flavorCounts([fake]).notes, true), () => this.wheelSvgStatic(this.flavorCounts([fake]))].forEach((fn, i) => {
                        const out = safe(`safety ${i}`, fn) || '';
                        check(!/<script|<img src=x/i.test(out) && /&lt;/.test(out), `typed text is escaped (${i})`);
                    });
                    // 9. wheel taxonomy
                    section = 'wheel';
                    NOTE_WHEEL.forEach((fam, f) => fam.groups.forEach(([g, notes], gi) => {
                        check((this.noteLocate(g) || {}).g === gi, `group ${g} found`);
                        notes.forEach(n => { const at = this.noteLocate(n); check(at && at.f === f && at.note === n, `note ${n} found`); });
                    }));
                    Object.keys(LEGACY_NOTES).forEach(k => check(!!this.noteLocate(k), `old descriptor ${k} lands on the wheel`));
                    // 10. 3D shapes
                    section = 'shapes';
                    const tastedBrews = brews.filter(b => this.tastedKeys(b).length).slice(0, 24);
                    tastedBrews.forEach(b => {
                        const url = safe('snapshot', () => FlavorShape.snapshot(this.shapeValues(b), null, { width: 320, height: 240, zoom: 1.12 }));
                        check(typeof url === 'string' && (url === '' || url.startsWith('data:image/png')), `${b.id} shape image`);
                    });
                    // 11. crew features
                    section = 'crew';
                    const owners = new Set(brews.map(b => this.getBrewOwner(b)));
                    const W7 = 7 * 864e5;
                    for (let i = 0; i < 26; i++) {
                        const q = safe('quest', () => this.crewQuest(Date.now() - i * W7));
                        check(q && !bad(q.title) && Number.isInteger(q.target) && q.target >= 1 && q.progress >= 0 && q.progress <= q.target && q.done === (q.raw >= q.target) && !bad(q.detail || ''), `quest ${i} weeks ago`);
                    }
                    ['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods', 'days', 'high', 'levelup', 'roasters', 'newcoffee', 'comments', 'photos', 'early', 'fresh', 'swap', 'local'].forEach(t => {
                        const q = safe('quest type', () => this.crewQuest(Date.now(), t));
                        check(q && q.type === t && !bad(q.title) && q.target >= 1, `quest type ${t}`);
                    });
                    check(!bad(safe('quest card', () => this.renderCrewQuest()) || ''), 'quest card text');
                    const nowD = new Date();
                    for (let i = 0; i < 12; i++) {
                        const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
                        const aw = safe('awards', () => this.crewAwards(d.getFullYear(), d.getMonth())) || [];
                        check(Array.isArray(aw), `awards ${d.getFullYear()}-${d.getMonth() + 1}`);
                        aw.forEach(a => check(!bad(a.title) && !bad(a.stat) && a.winners.length >= 1 && a.winners.length <= 2 && a.winners.every(n => owners.has(n) || this.users.includes(n)), `award ${a.key} ${d.getMonth() + 1}`));
                    }
                    check(!bad(safe('awards card', () => this.renderCrewAwardsCard()) || ''), 'awards card text');
                    check(!bad(safe('teaser', () => this.renderAwardsTeaser()) || ''), 'awards teaser text');
                    const groupsSeen = new Set();
                    beans.forEach(bn => {
                        const key = this.beanGroupKey(bn);
                        if (groupsSeen.has(key)) return; groupsSeen.add(key);
                        const pts = this.sweetPoints(brews.filter(b => this.groupKeyOfBrew(b) === key));
                        check(pts.every(p => Number.isFinite(p.ratio) && p.ratio > 0 && Number.isFinite(p.time) && p.time > 0), `${bn.id} sweet-spot points`);
                        const z = this.sweetZone(pts);
                        check(z === null || (z.r0 <= z.r1 && z.t0 <= z.t1 && z.n >= 2), `${bn.id} sweet zone`);
                        if (pts.length) check(!bad(safe('sweet svg', () => this.sweetSvg(pts, z)) || ''), `${bn.id} sweet chart`);
                    });
                    this.users.forEach(u => {
                        check(this.fabFourOf(u).length === 4, `${u} has four slots`);
                        check(!bad(safe('fab', () => this.renderFabFour(u)) || ''), `${u} favorites`);
                    });
                    const evilBean = { id: 'evil', name: evil, roaster: evil, origin: evil, roast: 'Dark' };
                    check(!/<script|<img src=x/i.test(this.awardTilesHtml([{ key: 'x', title: evil, icon: 'i-star', color: '#123456', winners: [evil], stat: evil }])), 'award text escaped');
                    check(typeof this.coverArt(evilBean).initials === 'string' && !/</.test(this.esc(this.coverArt(evilBean).initials)), 'cover art escaped');
                    // 12. per-method logging, recipes, lock math
                    section = 'methods';
                    Object.keys(METHOD_PROFILES).forEach(m => { const p = this.methodProfile(m); check(p && p.dose && p.yld && p.time && Array.isArray(p.extras), `${m} profile`); });
                    BUILTIN_RECIPES.forEach(r => {
                        const plan = this.stepPlan(r.steps, r.water);
                        const pours = plan.filter(s => s.k === 'pour');
                        check(r.dose > 0 && r.water > 0 && METHOD_PROFILES[r.method], `${r.name} basics`);
                        check(pours.every((s, i) => i === 0 || s.to >= pours[i - 1].to) && (!pours.length || pours[pours.length - 1].to === Math.round(r.water)), `${r.name} pours climb to the full water`);
                        check(plan.every((s, i) => s.end > s.start && (i === 0 || s.start === plan[i - 1].end)), `${r.name} steps are back to back`);
                    });
                    for (let i = 0; i < 600; i++) {
                        const c = 5 + rnd() * 60, r = 1.5 + rnd() * 20, w = c * r;
                        const lock = pick(['ratio', 'water', 'coffee']), field = pick(['dose', 'yield', 'ratio']);
                        const nv = field === 'dose' ? 5 + rnd() * 60 : field === 'yield' ? 20 + rnd() * 1000 : 1.5 + rnd() * 20;
                        const out = this.lockMath(field, field === 'dose' ? nv : c, field === 'yield' ? nv : w, field === 'ratio' ? nv : r, lock);
                        const kept = lock === 'ratio' ? (field === 'ratio' || Math.abs(out.r - r) < 1e-9) : lock === 'water' ? (field === 'yield' || Math.abs(out.w - w) < 1e-9) : (field === 'dose' || Math.abs(out.c - c) < 1e-9);
                        check(kept && Math.abs(out.w / out.c - out.r) < 1e-6, `lock ${lock}, edit ${field}: locked value kept and ratio consistent`);
                    }
                    brews.forEach(b => check(!bad(safe('metric', () => this.metricLine(b)) || ''), `${b.id} recipe line`));
                    [0, 5, 44, 61, 179, 400].forEach(t => { const plan = this.stepPlan(BUILTIN_RECIPES[0].steps, 250); const i = this.guideStepAt(plan, t); check(i >= 0 && i <= plan.length && (i === plan.length || (t < plan[i].end)), `brew-along step at ${t} s`); });
                    // 13. barista coach
                    section = 'coach';
                    const bag = ['sour', 'still really sour', 'bitter', 'not bitter', 'harsh', 'sweet', 'balanced', 'thin', 'watery', 'too strong', 'I over extracted to see if it helps', 'cooked it', 'less sour', 'astringent', 'perfect', 'yuck', 'instead of bitter', 'can at times be sour', ''];
                    const coachOwners = [...new Set(brews.map(b => this.getBrewOwner(b)))];
                    for (let i = 0; i < 400; i++) {
                        const base = pick(brews.length ? brews : [{ id: 'x', beanId: '', method: 'Espresso', date: '2026-10-01' }]);
                        const c = { ...this.coachFromBrew(base), id: `st-coach-${i}`, text: [pick(bag), pick(bag)].join('. '), rating: pick([0, 2, 3, 3.5, 4, 4.5, 5]), dose: 14 + Math.floor(rnd() * 8), yield: 20 + Math.floor(rnd() * 40), time: rnd() < 0.1 ? 0 : Math.floor(10 + rnd() * 70), grind: pick(['14', '2.5', '3B', '', '8A', '1.9']), method: pick(['Espresso', 'Pour Over', 'Moka Pot', base.method || 'Espresso']) };
                        const k = safe('coach', () => this.coach(c));
                        check(k && k.head && !bad(k.head) && !bad(k.next || '') && k.why.every(x => !bad(x)) && k.ctx.every(x => !bad(x[1])) && k.ev.every(e => !bad(e.text)), `random coach ${i}`);
                        if (k && coachOwners.length > 1) { const others = brews.filter(b => this.getBrewOwner(b) !== c.owner && /[a-z]/i.test(this.grindText(b.grind))).map(b => this.grindText(b.grind)); check(!others.some(g => g && g !== this.grindText(c.grind) && !this.coachPast(c).some(x => this.grindText(x.grind) === g) && (k.next || '').includes(`grind ${g}`)), `coach ${i} never borrows another person's grind`); }
                    }
                    check(this.coachRead('still really sour').under > 1.5 && this.coachRead('not bitter').over === 0 && this.coachRead('less sour').under < 0 && this.coachRead('I over extracted to see if that would help').over < 0.5, 'notes reader: intensity, negation, improvement, intent');
                    // 13b. barista coach v11.6
                    section = 'coach';
                    check(this.coachRead('because I COOKED! super sweet and tasty', { rating: 5 }).over === 0 && this.coachRead('because I COOKED!', { rating: 4.5 }).good > 0 && this.coachRead('we cooked. so good').over === 0, 'slang: "I cooked" on a great shot or next to praise is praise');
                    check(this.coachRead('cooked it again', { rating: 5 }).over >= 1 && this.coachRead('I overcooked it', { rating: 5 }).over >= 1 && this.coachRead('we cooked again', { rating: 4 }).over >= 1, 'slang: "cooked it", "overcooked", "cooked again" mean over-extracted');
                    check(this.coachRead('we cooked', { rating: 2 }).over > 0 && this.coachRead('over cooked').over < 1.5, 'slang: bare "we cooked" on a weak shot stays a mild over read; "over cooked" counts once');
                    check(this.grindOrd('8e') > this.grindOrd('8A') && this.grindOrd('8A') > this.grindOrd('6E') && this.grindOrd('14') === 14 && this.grindOrd('Click 18') === null, 'letter grinds order by number, then letter');
                    for (let i = 0; i < 60 && brews.length; i++) {
                        const b = pick(brews);
                        const k = safe('coach under 4', () => this.coach({ ...this.coachFromBrew(b), id: `st-c4-${i}`, rating: pick([0.5, 1, 2, 2.5, 3, 3.5]) }));
                        check(k && k.mode !== 'refine' && !/best yet|Perfect score/i.test(k.head), `coach ${i}: no "best yet" under 4 stars`);
                    }
                    // 13c. barista coach v11.7
                    section = 'coach';
                    {
                        const any = brews.find(b => b.method === 'Espresso') || brews[0];
                        if (any) {
                            const blank = safe('blank form', () => this.coach({ ...this.coachFromBrew(any), id: 'st-blank', dose: 0, yield: 0, time: 0, rating: 0, text: '', tasted: [], flavors: [], verdict: '' }));
                            check(blank && blank.mode === 'ask' && !/0 g|Stay at :/.test([blank.head, blank.next, ...blank.why].join(' ')), 'blank log form asks instead of comparing empty fields');
                        }
                    }
                    for (let i = 0; i < 60 && brews.length; i++) {
                        const b = pick(brews);
                        const k = safe('coach progress', () => this.coach(this.coachFromBrew(b)));
                        const refR = k && k.ref ? this.normalizeRating(k.ref.rating) : 0, r = this.normalizeRating(b.rating);
                        check(k && !(r > 0 && refR > 0 && r >= refR && /Head back to your/.test(k.head)) && !(/^Close\./.test(k.head) && r > 0 && refR - r > 1), `coach ${i}: never steers back to a worse best, "Close." only when close`);
                    }
                    // 14b. tea (v17.0): words, numbers and the next-cup advice, on made-up cups (nothing is saved)
                    section = 'tea';
                    {
                        const drink0 = this.drinkNow();
                        check(TEA_METHODS.every(m => this.isTeaMethod(m) && METHOD_PROFILES[m] && METHOD_PROFILES[m].tea) && COFFEE_METHODS.every(m => !this.isTeaMethod(m)) && !TEA_METHODS.some(m => COFFEE_METHODS.includes(m)), 'tea methods are their own (no name shared with coffee)');
                        check(this.tasteLabel('acidity', 'tea') === 'Astringency' && this.tasteLabel('acidity', 'coffee') === 'Acidity' && this.tasteMetaFor('tea').map(x => x[0]).join() === TASTE_META.map(x => x[0]).join(), 'tea sliders keep coffee\'s places, in tea words');
                        check(this.drinkWords('tea').company === 'brand' && this.drinkWords('coffee').company === 'roaster', 'a tea company is a brand, never a roaster');
                        const notesT = TEA_WHEEL.flatMap(f => f.groups.flatMap(g => g[1]));
                        check(notesT.length > 60 && notesT.every(n => { const at = this.noteLocate(n, 'tea'); return at && at.f >= 0 && at.color; }), 'every tea note is on the tea wheel, with a color');
                        const words = ['sour', 'bitter', 'harsh', 'drying', 'thin', 'watery', 'sweet', 'great', 'stewed', 'flat'];
                        const types = [...TEA_TYPES, ''];
                        for (let i = 0; i < 160; i++) {
                            const m = pick(TEA_METHODS), tp = pick(types), steepsN = m === 'Gongfu' ? Math.floor(rnd() * 7) : m === 'Western' ? Math.floor(rnd() * 3) : 0;
                            const vals = {}, tasted = [];
                            TASTE_KEYS.forEach(k => { vals[k] = 1 + Math.floor(rnd() * 10); if (rnd() < 0.6) tasted.push(k); });
                            const c = { id: `st-tea-${i}`, method: pick([m, m, m, '']), dose: pick([0, 2, 3, 4.5, 5, 7]), water: pick([0, 80, 100, 250, 350, 500]), time: m === 'Cold Steep' ? pick([0, 6, 8, 12]) : pick([0, 10, 20, 45, 120, 180, 300]),
                                temp: pick([0, 70, 80, 85, 90, 95, 100]), steeps: Array.from({ length: steepsN }, (_, j) => 10 + j * 5), values: vals, tasted, notes: [pick(words), pick(words)].filter(() => rnd() < 0.6), rating: pick([0, 2, 3, 4, 4.5, 5]), type: tp,
                                key: 'tea|st', owner: 'st-tea-nobody', date: '2026-10-01', bags: m === 'Western' && rnd() < 0.4 ? pick([1, 2]) : 0, style: m === 'Matcha' ? pick(['usucha', 'koicha', 'latte', 'iced', '']) : '', milk: pick([0, 0, 120, 200]),
                                mix: rnd() < 0.4 ? [{ name: 'Lemon balm', amount: pick(['', 1, 2.5]), unit: pick(MIX_UNITS) }, { name: pick(['Echinacea root', 'Honey', 'Lemon ginger tea']), amount: pick(['', 1]), unit: pick(MIX_UNITS) }].slice(0, pick([1, 2])) : [] };
                            if (c.bags) c.dose = 0;
                            const k = safe('tea coach', () => this.teaCoach(c));
                            const text = k ? [k.head, k.next || '', ...k.why, ...k.ctx.map(x => x.join(' ')), ...k.ev.map(e => e.text)].join(' ') : '';
                            check(k && k.head && !bad(text) && !/grind|finer|coarser|click/i.test(text), `tea coach ${i}: tea advice only (no grind)`);
                            const b = { id: c.id, method: c.method || 'Western', dose: c.dose, yield: c.water, time: c.time, temp: c.temp, steeps: c.steeps, rating: c.rating, teabag: c.bags > 0, bags: c.bags, style: c.style, milk: c.milk, mix: c.mix, timeUnit: c.method === 'Simmered' ? 'm' : c.method === 'Cold Steep' ? 'h' : '' };
                            const strip = safe('tea strip', () => this.teaStripHtml(b)) || '', line = safe('tea line', () => this.teaRecipeLine(b)), extras = safe('tea extras', () => this.sessionExtras(b).join(' ')) || '';
                            check(!bad(strip) && !bad(line || '') && !bad(extras) && (c.bags ? /Teabag/.test(strip) && /bag/.test(line) : /Leaf|Matcha/.test(strip)) && /Water/.test(strip) && !/Grind|Pull/.test(strip), `tea card ${i}: Leaf (or teabags) / Water / Steep / Temp`);
                        }
                        check(this.tempC(175) === 79 && this.tempC(212) === 100 && this.tempC(80) === 80 && this.tempC('') === 0 && this.tempC(300) === 300, 'water temperature: °F is turned into °C, °C left alone');
                        check(this.teaMethodsFor('Matcha').join() === 'Matcha' && this.teaMethodsFor('Green').join() === 'Western,Gongfu,Simmered,Cold Steep' && this.teaMethodsFor('').length === 5 && this.teaMethodsFor('Green', 'Matcha').includes('Matcha'), 'matcha is whisked, leaf teas are steeped; an older session keeps its method');
                        check(this.teaMethodsFor('Herbal').join() === 'Western,Simmered,Cold Steep' && this.teaTypeInfo('Herbal') && TEA_TYPES.includes('Herbal'), 'herbal teas: steeped, simmered or cold, never whisked or gongfu');
                        check(JSON.stringify(this.cleanMix([{ name: ' Lemon balm ', amount: '2', unit: 'g' }, { name: '' }, { name: 'Honey', amount: '', unit: 'tsp' }, { name: 'X', amount: -1 }])) === '[{"name":"Lemon balm","amount":2,"unit":"g"},{"name":"Honey"},{"name":"X"}]' && this.mixGrams([{ amount: 2, unit: 'g' }, { amount: 1, unit: 'tsp' }, { amount: 1.5 }]) === 3.5, 'a cup\'s mix keeps names, amounts with units, and adds up its grams');
                        check(this.mixItemText({ name: 'Lemon ginger tea', amount: 2, unit: 'bag' }) === 'Lemon ginger tea 2\u00a0bags' && this.teaMakerName({ kind: 'tea', blend: true, owner: 'Someone' }) === "Someone's blend", 'a blend has no brand: it says whose blend it is');
                        check(this.teaRatio('Matcha', 'koicha') === 10 && this.teaRatio('Matcha', '') === 35 && this.teaRatio('Western') === 80, 'each matcha style has its own ratio');
                        const fakeBrand = { coffees: [] };
                        check(this.teaBrandStyle(fakeBrand) === 'No type or origin logged yet.' && JSON.stringify(this.teaTypeCounts(fakeBrand)) === '{}', 'a brand with nothing logged says so');
                        check(this.drinkNow() === drink0, 'the Coffees / Teas choice is left as it was');
                    }
                    // 15. polish (v11.8)
                    section = 'screens';
                    check(this.coverArt({ roaster: '\u{1F1E8}\u{1F1F2}', name: 'Mystery' }).initials === '\u{1F1E8}\u{1F1F2}' && this.coverArt({ roaster: 'Urbana Roasters' }).initials === 'UR' && this.coverArt({ name: 'x' }).initials === 'X', 'cover tiles: whole flag emoji, letters otherwise');
                    if (onProgress) onProgress('done');
                } finally {
                    this.push = realPush;
                    try { this.closeDetail(); } catch (e) {}
                    if (window.__dialedTheme) window.__dialedTheme.set(keep.theme);
                    if (window.__dialedLook) window.__dialedLook.set(keep.look);   // v17.2
                    try { this.closeSession(true); } catch (e) {}
                    this.profileUser = keep.profileUser;
                    this.openThreads = keep.threads; this.cardTabs = keep.cardTabs; this.replyTo = keep.replyTo;
                    try { this.setTab(keep.tab); } catch (e) {}
                }
                section = 'read-only';
                check(pushes === 0, `the test saved nothing (${pushes} writes)`);
                check(fingerprint() === before, 'no session or bean changed');
                res.ms = Math.round(performance.now() - t0);
                return res;
            },

