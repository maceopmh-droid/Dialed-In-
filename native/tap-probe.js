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
        const tapAt = async (x, y) => { await ask(`/tap?x=${x.toFixed(1)}&y=${y.toFixed(1)}`); await sleep(800); };
        const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        // controls: the bottom bar
        for (const [from, to] of [['my', 'profile'], ['profile', 'feed'], ['feed', 'my']]) {
            app.setTab(from); await sleep(800);
            const el = document.querySelector(`.mob-item[data-tab="${to}"]`); if (!el) continue;
            const [x, y] = center(el); const hit = document.elementFromPoint(x, y);
            await tapAt(x, y);
            results.push({ at: `bottom bar ${to} (from ${from})`, x: Math.round(x), y: Math.round(y), was: from, now: app.tab, hit: hit ? (hit.className || hit.tagName).toString().slice(0, 18) : 'none' });
        }
        const reset = async () => { app.setTab('feed'); app.setFeedMode('following'); const m = document.getElementById('main-content'); if (m) m.scrollTop = 0; await sleep(900); };
        const tabs = async label => {
            await reset();
            const btns = [...document.querySelectorAll('.seg-control.feed-mode button')];
            const rects = btns.map(b => { const r = b.getBoundingClientRect(); return { label: b.textContent.trim(), x: r.left, y: r.top, w: r.width, h: r.height }; });
            const com = rects.find(r => r.label === 'Community'), dis = rects.find(r => r.label === 'Discover');
            const points = [];
            if (com) for (const f of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) points.push({ name: `${label}: Community ${Math.round(f * 100)}%`, x: com.x + com.w * f, y: com.y + com.h / 2 });
            if (dis) points.push({ name: `${label}: Discover 20%`, x: dis.x + dis.w * 0.2, y: dis.y + dis.h / 2 });
            for (const pt of points) {
                await reset();
                const before = app.feedMode(), hit = document.elementFromPoint(pt.x, pt.y);
                await tapAt(pt.x, pt.y);
                results.push({ at: pt.name, x: Math.round(pt.x), y: Math.round(pt.y), was: before, now: app.feedMode(), hit: hit ? (hit.textContent || hit.tagName).trim().slice(0, 14) : 'none' });
            }
            await ask('/log?m=' + encodeURIComponent(label + ' tabs ' + JSON.stringify(rects.map(r => ({ l: r.label, x: Math.round(r.x), w: Math.round(r.w) })))));
        };
        await tabs('app');
        // the list scrolled a little, so the tabs sit partly under the see-through top bar: a tap where you see Community
        for (const off of [20, 35, 50]) {
            await reset();
            const m = document.getElementById('main-content'); if (!m) break;
            m.scrollTop = off; await sleep(600);
            const com = [...document.querySelectorAll('.seg-control.feed-mode button')].find(b => b.textContent.trim() === 'Community');
            const r = com.getBoundingClientRect(), head = document.querySelector('.header-sticky').getBoundingClientRect().bottom;
            const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, Math.max(4, (head - r.top) / 2)), before = app.feedMode(), hit = document.elementFromPoint(x, y);
            await ask(`/tap?x=${x.toFixed(1)}&y=${y.toFixed(1)}`); await sleep(900);
            results.push({ at: `list ${off}px down, Community under the top bar's edge (bar ends ${Math.round(head)}, tab ${Math.round(r.top)}-${Math.round(r.bottom)})`, x: Math.round(x), y: Math.round(y), was: before, now: app.feedMode(), hit: hit ? (hit.className || hit.tagName).toString().slice(0, 16) : 'none' });
        }
        // a fling back to the top, then a tap on Community the moment the tabs are back on screen (the list still moving)
        for (let i = 1; i <= 4; i++) {
            await reset();
            const m = document.getElementById('main-content'); if (!m) break;
            m.scrollTop = Math.min(500, m.scrollHeight - m.clientHeight); await sleep(700);
            const start = Math.round(m.scrollTop);
            ask(`/fling?y1=${Math.round(innerHeight * 0.3)}&y2=${Math.round(innerHeight * 0.9)}`);
            let t0 = Date.now(); while (Date.now() - t0 < 2500 && m.scrollTop > 60) await sleep(16);
            const com = [...document.querySelectorAll('.seg-control.feed-mode button')].find(b => b.textContent.trim() === 'Community');
            const r = com.getBoundingClientRect(), at = Math.round(m.scrollTop), before = app.feedMode();
            await ask(`/tap?x=${(r.left + r.width / 2).toFixed(1)}&y=${(r.top + r.height / 2).toFixed(1)}`); await sleep(900);
            results.push({ at: `fling then Community #${i} (list ${start}px, ${at}px at the tap)`, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), was: before, now: app.feedMode(), hit: 'Community' });
        }
        // the same with the home-screen web app's tap haptics (iPhone Safari has them; the app uses the phone's own)
        try { const orig = app.isNative; app.isNative = () => false; app._hxOn = false; app.installTapHaptics(); app.isNative = orig; } catch (e) { await ask('/log?m=' + encodeURIComponent('haptics: ' + e)); }
        await ask('/log?m=' + encodeURIComponent('web-app haptics on: ' + document.documentElement.classList.contains('hx-on') + ', labels: ' + document.querySelectorAll('label.hx').length));
        await tabs('web app');
        await ask('/result?r=' + encodeURIComponent(JSON.stringify(results)));
        await ask('/done');
    };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
