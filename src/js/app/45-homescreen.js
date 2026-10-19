            // ===================== v15.4: add it to your Home Screen =====================
            // On a phone's web browser (not the iPhone app, not already opened from the Home Screen) the walkthrough ends
            // with how to put Dialed In on the Home Screen, where it fills the screen like an app instead of sitting
            // between the browser's bars. The steps follow the browser: Safari (Share is under ••• in newer Safari),
            // another iPhone browser, or Chrome on Android.
            homeScreenTip() {
                if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
                if (this.isNative && this.isNative()) return null;
                let standalone = navigator.standalone === true;
                try { standalone = standalone || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches; } catch (e) { /* older browsers */ }
                if (standalone) return null;
                const ua = String(navigator.userAgent || '');
                const iphone = /iPhone|iPod/.test(ua), android = /Android/.test(ua) && /Mobile/.test(ua);
                if (!iphone && !android) return null;
                const share = '<svg class="hs-glyph" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16"/></svg>';
                const last = 'Open Dialed In from your Home Screen. It fills the screen, like an app.';
                let steps;
                if (android) steps = ['Tap <b>⋮</b> at the top right of Chrome.', 'Choose <b>Add to Home screen</b> (or <b>Install app</b>).', last];
                else if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) steps = [`Tap the Share button ${share} in your browser.`, 'Choose <b>Add to Home Screen</b>.', last];
                else steps = [`Tap the Share button ${share}. In newer Safari it's under <b>•••</b>.`, 'Choose <b>Add to Home Screen</b>. Scroll down if you don\'t see it.', last];
                return { title: 'Add it to your Home Screen', html: `<p>Dialed In works best from your Home Screen: full screen, with no browser bars.</p><ol class="wl-hs">${steps.map(s => `<li>${s}</li>`).join('')}</ol>` };
            },
