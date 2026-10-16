// App Store screenshots. Only ever added to the simulator copy of the app by .github/workflows/store-shots.yml (never
// to the website or the TestFlight/App Store build). It signs in as the App Review account (its own sample coffees,
// no real person's data), walks through the screens below, and after each one asks the runner to take a screenshot
// (window.__storeShots.shotUrl + "/shot?name=..."; the runner answers once the picture is taken).
(function () {
    const C = window.__storeShots;
    if (!C) return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(250); } return false; };
    const say = m => console.log('DIALED-' + m);
    const ask = async (what, ms = 25000) => {
        try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); await fetch(C.shotUrl + what, { cache: 'no-store', signal: c.signal }); clearTimeout(t); return true; }
        catch (e) { say('SHOT-FAIL ' + what + ' ' + e); return false; }
    };
    const shot = async name => { await sleep(C.settle || 1500); say('SHOT ' + name); if (!(await ask('/shot?name=' + encodeURIComponent(name)))) await sleep(8000); };
    const top = () => { const m = document.getElementById('main-content'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); };
    const byText = (sel, re) => [...document.querySelectorAll(sel)].find(el => re.test(el.textContent));
    const latest = (beanId, method) => [...app.brews.values()].filter(b => b.beanId === beanId && (!method || b.method === method)).sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    const closeAll = () => { try { app.closeModals(); } catch (e) { /* none open */ } for (let i = 0; i < 4; i++) { const d = document.getElementById('detail-view'); if (!d || !d.classList.contains('active')) break; app.closeDetail(); } };
    const card = id => document.querySelector(`[data-card-brew="${id}"]`);
    const plan = [
        ['01_coffee', async () => { closeAll(); app.setTab('my'); app.openFeedTarget('review-c1'); await sleep(700); top(); }],
        ['02_next_shot', async () => {
            const b = latest('review-c1', 'Espresso');
            closeAll(); app.openFeedTarget('review-c1', b.id); await sleep(600); app.setDetailTab('timeline'); await sleep(300);
            app.setCardTab(b.id, 'next'); await sleep(400);
            const c = card(b.id); if (c) c.scrollIntoView({ block: 'start' });
        }],
        ['03_vs_last', async () => {
            const b = latest('review-c1', 'Espresso'); app.setCardTab(b.id, 'vs'); await sleep(400);
            const c = card(b.id); if (c) c.scrollIntoView({ block: 'start' });
        }],
        ['04_dialin', async () => {
            closeAll(); app.openFeedTarget('review-c1'); await sleep(600); app.setDetailTab('dialin'); await sleep(900);
            const t = document.querySelector('.insight-tab[data-detail-tab="timeline"]'); if (t) t.scrollIntoView({ block: 'start' });
            const v = document.getElementById('detail-view'); if (v) v.scrollTop -= 24;
        }],
        ['05_log', async () => {
            closeAll(); app.openFeedTarget('review-c3'); await sleep(600);
            const m = latest('review-c3', 'Pour Over');
            app.openBrewModal({ method: m.method, grind: m.grind, dose: m.dose, yield: m.yield, time: '', acidity: m.acidity, sweetness: m.sweetness, body: m.body,
                finish: m.finish, balance: m.balance, bitterness: m.bitterness, tasted: m.tasted, flavorNotes: m.flavorNotes, isMaster: false, notes: '', flavors: app.extractFlavors(m), equipment: [] });
            await sleep(900);
        }],
        ['06_log_taste', async () => { const h = byText('#brew-modal h3, #brew-modal h2, #brew-modal .taste-head, #brew-modal *', /^How did it taste\?$/); if (h) h.scrollIntoView({ block: 'start' }); }],
        ['07_profile', async () => { closeAll(); app.setTab('profile'); await sleep(400); app.setProfileSection('overview'); top(); }],
        ['08_taste', async () => { app.setProfileSection('taste'); top(); }],
        ['09_collection', async () => { closeAll(); app.setTab('my'); top(); }],
    ];

    const run = async () => {
        await until(() => typeof app !== 'undefined' && typeof Supa !== 'undefined' && document.readyState === 'complete');
        try {
            const s = Supa.session && Supa.session();
            if (!s || !s.profile) { say('SIGNING-IN'); const p = await Supa.signInWithPassword(C.email, C.pw); app.acctReady(p, null); }
        } catch (e) { say('SIGN-IN-FAIL ' + (e && e.message)); await ask('/done?ok=0'); return; }
        const synced = await until(() => app.syncedOnce && /Synced/.test((document.getElementById('sync-text') || {}).textContent || '') && app.brews.size > 0, 60000);
        if (!synced) { say('SYNC-FAIL'); await ask('/done?ok=0'); return; }
        try { if (app.endTour) app.endTour(); } catch (e) { /* no tour */ }
        try { if (app.closeWelcome) app.closeWelcome(); } catch (e) { /* no welcome */ }
        await sleep(1500);
        for (const [name, go] of plan) {
            try { await go(); await shot(name); } catch (e) { say('STEP-FAIL ' + name + ' ' + (e && e.message)); }
        }
        say('DONE'); await ask('/done?ok=1');
    };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
