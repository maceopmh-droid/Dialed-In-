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
                const last = 'Open Dialed In from your Home Screen and sign in there.';
                let steps, browser;
                if (android) { browser = 'Chrome'; steps = ['Tap <b>⋮</b> at the top right of Chrome.', 'Choose <b>Add to Home screen</b> (or <b>Install app</b>).', last]; }
                else if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) { browser = 'this browser'; steps = [`Tap the Share button ${share} in your browser.`, 'Choose <b>Add to Home Screen</b>.', last]; }
                else { browser = 'Safari'; steps = [`Tap the Share button ${share}. In newer Safari it's under <b>•••</b>.`, 'Choose <b>Add to Home Screen</b>. Scroll down if you don\'t see it.', last]; }
                // an iPhone keeps a Home Screen web app's storage apart from the browser's (only cookies are copied, and
                // the sign-in is in local storage), so signing in here would mean signing in again there
                const lead = iphone ? `It opens full screen, like an app. Do it before you sign in: your iPhone keeps the Home Screen copy separate from ${browser === 'Safari' ? 'Safari' : 'the browser'}, so you'd have to sign in again.` : 'It opens full screen, like an app, with no browser bars.';
                return { browser, lead, list: `<ol class="wl-hs">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` };
            },
            // the first screen's two buttons: on a phone's browser, the Home Screen comes first (once)
            wlIntro(which) {
                const s = this.wl; if (!s) return;
                if (!s.homeOk && this.homeScreenTip()) { s.after = which; s.step = 'home'; this.renderWelcome(); return; }
                if (this.acctOn()) this.wlStart(which); else this.wlGo(which === 'new' ? 'name' : 'returning');
            },
            wlHomeContinue() { const s = this.wl; if (!s) return; s.homeOk = true; this.wlIntro(s.after || 'new'); },
            wlHomeHtml() {
                const t = this.homeScreenTip() || { browser: 'the browser', lead: '', list: '' };
                return `<div class="wl-step wl-home">
                        <div class="wl-top"><button type="button" class="wl-back" onclick="app.wlGo('intro')"><svg class="icon"><use href="#i-arrow-left"/></svg>Back</button></div>
                        <h2 class="wl-h2">Add it to your Home Screen first</h2>
                        <p class="wl-sub">${t.lead}</p>
                        ${t.list}
                        <div class="wl-actions"><button type="button" class="btn-outline wl-second" onclick="app.wlHomeContinue()">Continue in ${this.esc(t.browser)} instead</button></div>
                    </div>`;
            },
