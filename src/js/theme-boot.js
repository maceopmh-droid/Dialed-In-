    (function () {
        try {
            var pref = 'system';
            try { pref = localStorage.getItem('dialed_theme') || 'system'; } catch (e) {}
            var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
            var apply = function () {
                var dark = pref === 'dark' || (pref === 'system' && !!(mq && mq.matches));
                document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
                var meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', dark ? '#0C100D' : '#F7F6F2');
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
    })();
