(function () {
    try {
        var pref = 'system';
        try { pref = localStorage.getItem('dialed_theme') || 'system'; } catch (e) {}
        var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        var apply = function () {
            var dark = pref === 'dark' || (pref === 'system' && !!(mq && mq.matches));
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', dark ? '#0C100D' : '#F3EEE4');
        };
        window.__dialedTheme = {
            get pref() { return pref; },
            set: function (p) { pref = p; try { localStorage.setItem('dialed_theme', p); } catch (e) {} apply(); },
            isDark: function () { return document.documentElement.getAttribute('data-theme') === 'dark'; }
        };
        apply();
        var onChange = function () { if (pref === 'system') { apply(); if (typeof app !== 'undefined' && app.onThemeChange) app.onThemeChange(); } };
        if (mq && mq.addEventListener) mq.addEventListener('change', onChange); else if (mq && mq.addListener) mq.addListener(onChange);
    } catch (e) {}
    // v17.2: the New look; v21.0: the only look (Maceo, Nov 3: "get rid of the old look. new look only"). The classic look,
    // its switch in Settings and its safety net are gone; every phone opens in the New look. __dialedLook stays so older
    // calls keep working, but it can't turn the New look off.
    try {
        try { localStorage.removeItem('dialed_look_boot'); localStorage.removeItem('dialed_look_fell'); } catch (e) {}
        var paint = function () { document.documentElement.setAttribute('data-look', 'new'); };
        window.__dialedLook = {
            get pref() { return 'new'; },
            set: function () { paint(); },
            isNew: function () { return true; }
        };
        paint();
    } catch (e) {}
})();
