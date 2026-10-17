// Real iPhone taps on the Feed tabs (Following / Community / Discover), to find where a tap doesn't land. Only ever
// added to the simulator copy of the app by .github/workflows/ios-taps.yml. Signed in as the review account, it puts
// Feed on Following, then for each point asks the runner to tap there for real (idb, through iOS's own touch handling)
// and notes which tab is selected afterwards. The runner reports the results.
(function () {
    const C = window.__tapProbe;
    if (!C) return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(250); } return false; };
    const ask = async (what, ms = 30000) => { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const r = await fetch(C.url + what, { cache: 'no-store', signal: c.signal }); clearTimeout(t); return await r.text(); } catch (e) { return 'fail ' + e; } };
    const run = async () => {
        await until(() => typeof app !== 'undefined' && typeof Supa !== 'undefined' && document.readyState === 'complete');
        try { const s = Supa.session && Supa.session(); if (!s || !s.profile) { const p = await Supa.signInWithPassword(C.email, C.pw); app.acctReady(p, null); return; } }
        catch (e) { await ask('/log?m=' + encodeURIComponent('sign-in failed ' + (e && e.message))); return; }
        await until(() => app.syncedOnce && app.brews.size > 0, 60000);
        try { if (app.endTour) app.endTour(); } catch (e) { /* none */ }
        try { if (app.closeWelcome) app.closeWelcome(); } catch (e) { /* none */ }
        await ask('/hello');
        const results = [];
        const reset = async () => { app.setTab('feed'); app.setFeedMode('following'); const m = document.getElementById('main-content'); if (m) m.scrollTop = 0; await sleep(900); };
        await reset();
        const btns = () => [...document.querySelectorAll('.seg-control.feed-mode button')];
        const rects = btns().map(b => { const r = b.getBoundingClientRect(); return { label: b.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
        await ask('/log?m=' + encodeURIComponent('tabs ' + JSON.stringify(rects) + ' screen ' + innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio));
        const com = rects.find(r => r.label === 'Community'), fol = rects.find(r => r.label === 'Following'), dis = rects.find(r => r.label === 'Discover');
        const points = [];
        if (com) {
            for (let f = 0.06; f < 1; f += 0.11) points.push({ name: `Community ${Math.round(f * 100)}% across`, x: com.x + com.w * f, y: com.y + com.h / 2 });
            points.push({ name: 'Community top edge', x: com.x + com.w / 2, y: com.y + 4 }, { name: 'Community bottom edge', x: com.x + com.w / 2, y: com.y + com.h - 4 });
        }
        if (dis) points.push({ name: 'Discover middle', x: dis.x + dis.w / 2, y: dis.y + dis.h / 2 }, { name: 'Discover 15% across', x: dis.x + dis.w * 0.15, y: dis.y + dis.h / 2 });
        for (const pt of points) {
            await reset();
            const before = app.feedMode();
            const hit = document.elementFromPoint(pt.x, pt.y);
            await ask(`/tap?x=${pt.x.toFixed(1)}&y=${pt.y.toFixed(1)}`);
            await sleep(700);
            results.push({ at: pt.name, x: Math.round(pt.x), y: Math.round(pt.y), was: before, now: app.feedMode(), hit: hit ? (hit.textContent || hit.tagName).trim().slice(0, 14) : 'none' });
        }
        await ask('/result?r=' + encodeURIComponent(JSON.stringify(results)));
        await ask('/done');
    };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
