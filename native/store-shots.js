// App Store screenshots. Only ever added to the simulator copy of the app by .github/workflows/store-shots.yml (never
// to the website or the TestFlight/App Store build). The app there talks to the runner's own stand-in backend
// (supabase/dev_server.js) holding the review account's sample coffees plus a made-up circle of friends and a community
// (native/appstore/store_world.sql): no real person's data. It signs in as the review account, walks through the screens
// below, and after each one asks the runner to take a screenshot (window.__storeShots.shotUrl + "/shot?name=..."; the
// runner answers once the picture is taken). Every screen is taken in dark; the coffee page also in light (the
// light-and-dark screenshot). The phone's look decides which pass this is.
(function () {
    const C = window.__storeShots;
    if (!C || window.top !== window) return;   // the app itself, not a page shown inside it
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(250); } return false; };
    const say = m => console.log('DIALED-' + m);
    const ask = async (what, ms = 25000) => {
        try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); await fetch(C.shotUrl + what, { cache: 'no-store', signal: c.signal }); clearTimeout(t); return true; }
        catch (e) { say('SHOT-FAIL ' + what + ' ' + e); return false; }
    };
    // check: the runner compares two quick screenshots for a passing notification banner (off where the page itself
    // keeps moving at the top, like the log sheet over the spinning flavor shape)
    const shot = async (name, check = true) => {
        await sleep(C.settle || 1500); say('SHOT ' + name);
        const t0 = Date.now(), ok = await ask('/shot?name=' + encodeURIComponent(name) + (check ? '' : '&check=0'), 240000), took = Date.now() - t0;
        fetch(C.shotUrl + '/log?m=' + encodeURIComponent(`${name}: ${ok ? 'answered' : 'failed'} after ${took} ms`)).catch(() => {});
        if (!ok) await sleep(8000);
    };
    // the phone's status bar area: things scrolled to the top of the screen go just below it (the app's --safe-top is
    // the phone's own safe area; a desktop test can set it)
    const safeTop = () => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:var(--safe-top, env(safe-area-inset-top));visibility:hidden'; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h; };
    const scroller = el => { for (let n = el && el.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return n; } return document.scrollingElement; };
    const bringUp = (el, gap = 10) => { if (!el) return; const sc = scroller(el); sc.scrollTop += el.getBoundingClientRect().top - safeTop() - gap; };
    const top = () => { const m = document.getElementById('main-content'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); };
    const byText = (sel, re) => [...document.querySelectorAll(sel)].find(el => re.test(el.textContent));
    const latest = (beanId, method) => [...app.brews.values()].filter(b => b.beanId === beanId && (!method || b.method === method)).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const closeAll = () => { try { app.closeModals(); } catch (e) { /* none open */ } try { if (app.closeWrapped) app.closeWrapped(true); } catch (e) { /* none */ } try { app.hideRoasterView(); app.roasterOpen = ''; app.navStack = []; } catch (e) { /* none */ } for (let i = 0; i < 4; i++) { const d = document.getElementById('detail-view'); if (!d || !d.classList.contains('active')) break; app.closeDetail(); } };
    const card = id => document.querySelector(`[data-card-brew="${id}"]`);
    const historyLabel = () => [...document.querySelectorAll('#d-timeline-pane > label')].find(l => /session history/i.test(l.textContent));
    const feed = async mode => { closeAll(); app.setTab('feed'); await sleep(300); app.setFeedMode(mode); top(); await sleep(1500); };
    const dark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    // v21.6: the new look. A session opens on its own page (session-view), a coffee on the coffee page (detail-view),
    // Learn's pages over both; closeAll() closes them all.
    const closeAll2 = () => { closeAll(); try { if (app.closeSession) app.closeSession(true); } catch (e) { /* none */ } try { if (app.learnActive && app.learnActive()) app.learnClose(); } catch (e) { /* none */ }
        try { if (app.closeProducer) app.closeProducer(); } catch (e) { /* none */ } try { app.navStack = []; const d = document.getElementById('detail-view'); if (d) d.classList.remove('active'); } catch (e) { /* none */ } };
    const sv = () => document.getElementById('session-view');
    // [name, steps, also in light]
    const plan = [
        // a throwaway first screenshot (the runner drops names starting 00_): the first one after the app opens can come out late
        ['00_warm', async () => { closeAll2(); app.setTab('my'); app.openFeedTarget('review-c1'); await sleep(1500); }, true],
        // a friend's espresso on its own page: the photo, the shape, the numbers
        ['01_session', async () => { closeAll2(); app.setTab('feed'); app.openSession('world-s1'); await sleep(1500); const v = sv(); if (v) v.scrollTop = 0; }],
        // the quick, sour espresso: the coach says what to change
        ['02_next_shot', async () => {
            const b = latest('review-c2', 'Espresso');
            closeAll2(); app.openSession(b.id); await sleep(1500);
            const box = sv() && sv().querySelector('.nls-next'); bringUp(box, 150);
        }],
        // Following: a friend's espresso with its photo, the likes and the comments
        ['03_feed', async () => {
            closeAll2(); await feed('following'); await sleep(800);
            const c = document.querySelector('[data-card-brew="world-s1"]'); bringUp(c, 10); await sleep(700); bringUp(c, 10);
        }],
        // the community: its goal and its members' sessions
        ['04_community', async () => { closeAll2(); await feed('groups'); await sleep(1500); top(); }],
        // Discover's Help filter: someone stuck, with answers
        ['05_help', async () => { closeAll2(); await feed('discover'); app.setCommFilter('help'); await sleep(2500); top(); }],
        // Learn: what a coffee in the bag is (a variety's page)
        ['06_learn', async () => { closeAll2(); app.setTab('my'); await sleep(300); app.learnOpen('variety', 'pink-bourbon'); await sleep(2500); const v = document.getElementById('learn-view'); if (v) v.scrollTop = 0; }],
        // a coffee's page: its specs, notes and your sessions on it (also in light: the light-and-dark screenshot)
        ['07_coffee', async () => { closeAll2(); app.setTab('my'); app.openFeedTarget('review-c1'); await sleep(1500); top(); const v = document.getElementById('detail-view'); if (v) v.scrollTop = 0; }, true],
        ['08_dialin', async () => {
            closeAll2(); app.setTab('my'); app.openFeedTarget('review-c1'); await sleep(900); app.setDetailTab('dialin'); await sleep(1200);
            const t = document.querySelector('#detail-view .insight-tabs'); bringUp(t, 8);
            const cmp = t && [...t.querySelectorAll('.insight-tab')].find(b => /Compare/.test(b.textContent)); if (t && cmp) t.scrollLeft = cmp.offsetLeft - 16;   // (the tabs start at a whole one)
        }],
        ['09_log_taste', async () => {
            closeAll2(); app.openFeedTarget('review-c3'); await sleep(600);
            const m = latest('review-c3', 'Pour Over');
            app.openBrewModal({ method: m.method, grind: m.grind, dose: m.dose, yield: m.yield, time: '', acidity: m.acidity, sweetness: m.sweetness, body: m.body,
                finish: m.finish, balance: m.balance, bitterness: m.bitterness, tasted: m.tasted, flavorNotes: m.flavorNotes, isMaster: false, notes: '', flavors: app.extractFlavors(m), equipment: [] });
            await sleep(900);
            const h = byText('#brew-modal h3, #brew-modal h2, #brew-modal *', /^How did it taste\?$/); if (h) h.scrollIntoView({ block: 'start' });
        }],
    ];

    const run = async () => {
        await until(() => typeof app !== 'undefined' && typeof Supa !== 'undefined' && document.readyState === 'complete');
        try {
            const s = Supa.session && Supa.session();
            if (!s || !s.profile) { say('SIGNING-IN'); const p = await Supa.signInWithPassword(C.email, C.pw); app.acctReady(p, null); return; }   // the app reloads; this starts over then
        } catch (e) { say('SIGN-IN-FAIL ' + (e && e.message)); await ask('/done?ok=0'); return; }
        const synced = await until(() => app.syncedOnce && /Synced/.test((document.getElementById('sync-text') || {}).textContent || '') && app.brews.size > 0, 60000);
        if (!synced) { say('SYNC-FAIL'); await ask('/done?ok=0'); return; }
        try { if (app.endTour) app.endTour(); } catch (e) { /* no tour */ }
        try { if (app.closeWelcome) app.closeWelcome(); } catch (e) { /* no welcome */ }
        await ask('/hello', 40000);   // the first request to the runner can be slow; not on a screenshot
        await sleep(1500);
        // cleaner: no achievement lines inside the session cards
        const st = document.createElement('style'); st.textContent = '.achievement-inline, .nl-ach { display: none !important; }'; document.head.appendChild(st);
        const isDark = dark();
        for (const [name, go, light] of plan) {
            if (!isDark && !light) continue;
            try { await go(); await shot(name, !/log_taste/.test(name)); } catch (e) { say('STEP-FAIL ' + name + ' ' + (e && e.message)); }
        }
        say('DONE'); await ask('/done?ok=1');
    };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
