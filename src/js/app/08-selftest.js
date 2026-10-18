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
                const keep = { section: this.profileSection, tab: this.tab, theme: window.__dialedTheme ? window.__dialedTheme.pref : 'system', profileUser: this.profileUser, threads: new Set(this.openThreads), cardTabs: new Map(this.cardTabs || []), replyTo: this.replyTo, activeId: this.activeId };
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
                    for (const theme of ['light', 'dark']) {
                        safe('theme', () => this.setThemePref(theme));
                        check(document.documentElement.getAttribute('data-theme') === theme, `theme switches to ${theme}`);
                        for (const tab of ['feed', 'my', 'roasters', 'profile']) {
                            safe('tab', () => this.setTab(tab));
                            const grid = document.getElementById('grid');
                            check(grid && !bad(grid.innerText), `${theme} ${tab}: no undefined/NaN text`);
                            check(noOverflow(), `${theme} ${tab}: nothing spills sideways`);
                            const hidden = blockers();
                            check(!hidden.length, `${theme} ${tab}: no invisible layer blocks taps ${hidden.join(', ')}`);
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
                    safe('theme', () => this.setThemePref('system'));
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
                    ['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'].forEach(t => {
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
                    // 15. polish (v11.8)
                    section = 'screens';
                    check(this.coverArt({ roaster: '\u{1F1E8}\u{1F1F2}', name: 'Mystery' }).initials === '\u{1F1E8}\u{1F1F2}' && this.coverArt({ roaster: 'Urbana Roasters' }).initials === 'UR' && this.coverArt({ name: 'x' }).initials === 'X', 'cover tiles: whole flag emoji, letters otherwise');
                    if (onProgress) onProgress('done');
                } finally {
                    this.push = realPush;
                    try { this.closeDetail(); } catch (e) {}
                    if (window.__dialedTheme) window.__dialedTheme.set(keep.theme);
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

