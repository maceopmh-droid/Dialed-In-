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

    // [name, steps, also in light]
    const plan = [
        // a throwaway first screenshot (the runner drops names starting 00_): the first one after the app opens can come out late
        ['00_warm', async () => { closeAll(); app.setTab('my'); app.openFeedTarget('review-c1'); await sleep(1500); }, true],
        ['01_coffee', async () => { closeAll(); app.setTab('my'); app.openFeedTarget('review-c1'); await sleep(700); top(); const v = document.getElementById('detail-view'); if (v) v.scrollTop = 0; }, true],
        // the quick, sour espresso: the coach says what to change
        ['02_next_shot', async () => {
            const b = latest('review-c2', 'Espresso');
            closeAll(); app.openFeedTarget('review-c2', b.id); await sleep(600); app.setDetailTab('timeline'); await sleep(300);
            app.setCardTab(b.id, 'next'); await sleep(500); bringUp(historyLabel() || card(b.id), 14);
            await sleep(1200); bringUp(historyLabel() || card(b.id), 14);   // (again, after friends' sessions have come in)
        }],
        // Following: a friend's espresso with its photo, the likes and the comments open
        ['03_feed', async () => {
            await feed('following');
            const id = 'world-s1';
            try { app.toggleThread('brew', id); } catch (e) { /* no thread */ }
            await sleep(900);
            // cleaner: no achievement line between the photo and the comments
            const tidy = () => { const c = card(id); if (c) c.querySelectorAll('.achievement-inline').forEach(el => { el.style.display = 'none'; }); };
            tidy(); bringUp(card(id), 10); await sleep(600); tidy(); bringUp(card(id), 10);
        }],
        // the community: its goal and its members' sessions
        ['04_community', async () => { await feed('groups'); await sleep(1500); top(); }],
        // Discover's Help filter: someone stuck, with answers (the most helpful one marked)
        ['05_help', async () => {
            await feed('discover'); app.setCommFilter('help'); await sleep(2500);
            try { app.toggleThread('brew', 'world-s6'); } catch (e) { /* no thread */ }
            await sleep(900); top();
        }],
        // a roaster's page (Maya notes where it's from, as anyone can)
        ['06_roaster', async () => {
            closeAll(); app.setTab('roasters'); await sleep(300);   // (from the Roasters tab, so Back says Roasters)
            const info = (app.roasterPrefsOf(app.user) || {}).info || {};
            if (!(info['Field Lantern Coffee'] || {}).location) { app.saveRoasterPrefs(p => { p.info['Field Lantern Coffee'] = { location: 'Denver, CO', website: '', note: '', at: new Date().toISOString() }; }); await sleep(2500); }
            app.openRoaster(app.roasterKey('Field Lantern Coffee')); await sleep(1500);
            const v = document.getElementById('roaster-view'); if (v) v.scrollTop = 0;
        }],
        ['07_dialin', async () => {
            closeAll(); app.openFeedTarget('review-c1'); await sleep(600); app.setDetailTab('dialin'); await sleep(900);
            // the chart at the bottom of the screen, with the coffee's flavor wheel and notes above it (from the shape's
            // buttons down, so the screen is full and nothing sits under the clock)
            const btns = byText('#d-flavor button', /^Top view$/);
            bringUp(btns ? btns.parentElement : document.querySelector('.insight-tab[data-detail-tab="timeline"]'), 8);
        }],
        ['08_log_taste', async () => {
            closeAll(); app.openFeedTarget('review-c3'); await sleep(600);
            const m = latest('review-c3', 'Pour Over');
            app.openBrewModal({ method: m.method, grind: m.grind, dose: m.dose, yield: m.yield, time: '', acidity: m.acidity, sweetness: m.sweetness, body: m.body,
                finish: m.finish, balance: m.balance, bitterness: m.bitterness, tasted: m.tasted, flavorNotes: m.flavorNotes, isMaster: false, notes: '', flavors: app.extractFlavors(m), equipment: [] });
            await sleep(900);
            const h = byText('#brew-modal h3, #brew-modal h2, #brew-modal *', /^How did it taste\?$/); if (h) h.scrollIntoView({ block: 'start' });
        }],
        ['09_palate', async () => {
            closeAll(); app.setTab('profile'); await sleep(400); app.setProfileSection('taste'); top(); await sleep(300);
            // only the palate shows: what comes after it would peek out under the bottom bar
            const pal = byText('.profile-view .profile-card', /^\s*Your palate/);
            for (let el = pal; el && !el.classList.contains('profile-view'); el = el.parentElement) for (let n = el.nextElementSibling; n; n = n.nextElementSibling) n.style.visibility = 'hidden';
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
        const st = document.createElement('style'); st.textContent = '.achievement-inline { display: none !important; }'; document.head.appendChild(st);
        const isDark = dark();
        for (const [name, go, light] of plan) {
            if (!isDark && !light) continue;
            try { await go(); await shot(name, !/log_taste/.test(name)); } catch (e) { say('STEP-FAIL ' + name + ' ' + (e && e.message)); }
        }
        say('DONE'); await ask('/done?ok=1');
    };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
