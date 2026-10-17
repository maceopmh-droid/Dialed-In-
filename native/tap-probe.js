// Real iPhone taps in the simulator (idb, through iOS's own touch handling), for what a desktop browser can't show.
// Only ever added to the simulator copy of the app by .github/workflows/ios-taps.yml, signed in as the review account.
// v15.0 checks: the bottom bar from Feed (bars showing, bars tucked, a tap while the list is still moving), and posting
// a comment with the keyboard up (the iPhone app, then the home-screen web app's tap haptics). The comment goes on the
// review account's own Only me session and is deleted again at the end. The runner reports the results.
(function () {
    const C = window.__tapProbe;
    if (!C) return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(250); } return false; };
    const ask = async (what, ms = 30000) => { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const r = await fetch(C.url + what, { cache: 'no-store', signal: c.signal }); clearTimeout(t); return await r.text(); } catch (e) { return 'fail ' + e; } };
    const log = m => ask('/log?m=' + encodeURIComponent(m));
    const run = async () => {
        await until(() => typeof app !== 'undefined' && typeof Supa !== 'undefined' && document.readyState === 'complete');
        try { const s = Supa.session && Supa.session(); if (!s || !s.profile) { const p = await Supa.signInWithPassword(C.email, C.pw); app.acctReady(p, null); return; } }
        catch (e) { await log('sign-in failed ' + (e && e.message)); return; }
        await until(() => app.syncedOnce && app.brews.size > 0, 60000);
        try { if (app.endTour) app.endTour(); } catch (e) { /* none */ }
        try { if (app.closeWelcome) app.closeWelcome(); } catch (e) { /* none */ }
        await ask('/hello');
        await log('version ' + ((document.querySelector('meta[name="dialed-in-version"]') || {}).content || '?'));
        const results = [];
        const tapAt = async (x, y, wait = 800) => { await ask(`/tap?x=${x.toFixed(1)}&y=${y.toFixed(1)}`); await sleep(wait); };
        const rect = el => el.getBoundingClientRect();
        const main = () => document.getElementById('main-content');
        const feedTop = async () => { app.setTab('feed'); app.setFeedMode('following'); main().scrollTop = 0; await sleep(900); };
        const navItem = tab => document.querySelector(`#mobile-nav .mob-item[data-tab="${tab}"]`);
        const nav = async (name, to, dy = 0) => {
            const el = navItem(to); const r = rect(el); const x = r.left + r.width / 2, y = r.top + r.height / 2 + dy;
            const hit = document.elementFromPoint(x, y), before = app.tab;
            await tapAt(x, y);
            results.push({ at: name, x: Math.round(x), y: Math.round(y), was: before, now: app.tab, hit: hit ? String(hit.className || hit.tagName).slice(0, 18) : 'none' });
        };
        // 1. from Feed with both bars showing
        await feedTop(); await nav('bottom bar Mine from Feed (bars showing)', 'my');
        await feedTop(); await nav('bottom bar Profiles from Feed (bars showing)', 'profile');
        // 2. from Feed, scrolled down so the top bar is tucked away and the bottom bar is compact
        for (const [to, dy, label] of [['my', 0, 'on the icon'], ['shared', -14, '14 px above the icon'], ['profile', 14, '14 px below the icon']]) {
            await feedTop();
            const m = main(); m.scrollTop = Math.min(900, m.scrollHeight - m.clientHeight); await sleep(150); m.scrollTop += 40; await sleep(700);
            await log(`tucked: ${document.body.classList.contains('bars-tucked')}, bar ${Math.round(rect(document.getElementById('mobile-nav')).height)} px tall`);
            await nav(`compact bar from Feed, ${label} (${to})`, to, dy);
        }
        // 3. a fling, then a tap on the bar while the list is still moving
        for (const to of ['my', 'profile']) {
            await feedTop();
            const m = main(); m.scrollTop = Math.min(1400, m.scrollHeight - m.clientHeight); await sleep(700);
            ask(`/fling?y1=${Math.round(innerHeight * 0.75)}&y2=${Math.round(innerHeight * 0.25)}`);
            await sleep(140);
            const at = Math.round(m.scrollTop);
            await nav(`bottom bar ${to} right after a fling (list at ${at} px)`, to);
        }
        // 4. a comment, typed with the keyboard up, then Post
        const comment = async (label) => {
            const b = [...app.brews.values()].filter(x => app.getBrewOwner(x) === app.user && app.beans.has(String(x.beanId))).sort((x, y) => app.toTime(y.date) - app.toTime(x.date))[0];
            if (!b) { results.push({ at: label + ': no session of its own to comment on', x: 0, y: 0, was: '-', now: '-', hit: 'none' }); return; }
            const id = String(b.id);
            app.openFeedTarget(b.beanId, id, true); await sleep(1500);
            const th = document.getElementById(`comments-${id}`);
            if (!th) { results.push({ at: label + ': the session\'s comments didn\'t show', x: 0, y: 0, was: '-', now: '-', hit: 'none' }); return; }
            if (!th.classList.contains('open')) { th.querySelector('.thread-toggle').click(); await sleep(500); }
            const input = th.querySelector('.comment-input'); input.scrollIntoView({ block: 'center' }); await sleep(500);
            let r = rect(input); await tapAt(r.left + 30, r.top + r.height / 2, 1500);
            const text = `Probe ${label} ${Date.now() % 100000}`;
            await ask('/text?t=' + encodeURIComponent(text)); await sleep(1200);
            const typed = input.value;
            const btn = th.querySelector('.comment-submit'); r = rect(btn);
            const before = (app.brews.get(id).comments || []).length, hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            await tapAt(r.left + r.width / 2, r.top + r.height / 2, 2500);
            const list = app.brews.get(id).comments || [];
            const posted = list.some(c => c && c.text === text);
            results.push({ at: `${label}: typed "${typed === text ? 'ok' : typed.slice(0, 20)}", tapped Post`, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), was: String(before), now: posted ? 'posted' : `not posted (box: "${(th.isConnected ? (th.querySelector('.comment-input') || {}).value : input.value) || ''}")`, hit: hit ? String(hit.className || hit.tagName).slice(0, 18) : 'none' });
            // tidy up: take it off again (the review account's own Only me session)
            const i = list.findIndex(c => c && c.text === text);
            if (i >= 0) { window.confirm = () => true; app.removeComment(id, i); await sleep(1500); }
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            if (app.closeDetail) app.closeDetail();
            await sleep(800);
        };
        await comment('iPhone app');
        try { const orig = app.isNative; app.isNative = () => false; app._hxOn = false; app.installTapHaptics(); app.isNative = orig; } catch (e) { await log('haptics: ' + e); }
        await log('web-app haptics on: ' + document.documentElement.classList.contains('hx-on'));
        await comment('web app haptics');
        await ask('/result?r=' + encodeURIComponent(JSON.stringify(results)));
        await ask('/done');
    };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
