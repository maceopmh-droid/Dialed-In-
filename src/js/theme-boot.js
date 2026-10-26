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
    // v17.2: the New look (Settings, Appearance), saved per phone; classic unless it's switched on
    try {
        var look = 'classic';
        try { look = localStorage.getItem('dialed_look') === 'new' ? 'new' : 'classic'; } catch (e) {}
        // v17.3: a safety net. Each start in the New look is counted until the app has been up a few seconds; after two starts
        // in a row that never got that far (a phone that couldn't draw it), this one opens in the classic look and says so
        if (look === 'new') {
            try {
                var tries = Number(localStorage.getItem('dialed_look_boot')) || 0;
                if (tries >= 2) { look = 'classic'; localStorage.setItem('dialed_look', 'classic'); localStorage.setItem('dialed_look_boot', '0'); localStorage.setItem('dialed_look_fell', '1'); }
                else localStorage.setItem('dialed_look_boot', String(tries + 1));
            } catch (e) {}
        }
        var paint = function () { document.documentElement.setAttribute('data-look', look); };
        window.__dialedLook = {
            get pref() { return look; },
            set: function (p) { look = p === 'new' ? 'new' : 'classic'; try { localStorage.setItem('dialed_look', look); localStorage.setItem('dialed_look_boot', '0'); } catch (e) {} paint(); },
            isNew: function () { return document.documentElement.getAttribute('data-look') === 'new'; }
        };
        paint();
    } catch (e) {}
})();
