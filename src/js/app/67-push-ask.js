            // ===================== v21.12: asking to turn on notifications =====================
            // Maceo, Nov 16: "tell people to turn on notifications when they first get the app and send to everyone with
            // notifs off rn". Once per phone, anyone signed in whose notifications are off on this phone (and who can turn
            // them on here: the iPhone app, the Home Screen web app or a computer's browser) gets a small sheet once
            // nothing else is on screen: someone new after the welcome and the tour, everyone else the next time they open
            // the app. "Turn on notifications" asks the phone (it has to come from the tap); if they were turned off in the
            // phone's own settings before, it says where to turn them back on instead. Answered either way, it's not asked
            // again on this phone; Settings, Notifications still has the switch.
            pushAskKey: 'dialed_push_ask',
            async maybeAskPush() {
                if (this._pushAskChecked) return;
                this._pushAskChecked = true;
                if (window.__storeShots || window.__tapProbe) return;   // (the simulator's screenshot and tap runs)
                if (safeGet(this.pushAskKey) || !(this.acctOn && this.acctOn()) || !Supa.ready() || !this.pushSupported()) return;
                await this.loadPushState(true);
                const st = this.pushState();
                if (!st.key || st.on) return;
                // wait until the screen is free: not during the welcome, the tour, or any other sheet (up to 10 minutes)
                const free = () => !this.welcomeOpen && !this.tour && !document.querySelector('.modal.active, .photo-sheet.active');
                let calm = 0;
                for (let i = 0; i < 400; i++) {
                    await new Promise(r => setTimeout(r, 1500));
                    if (safeGet(this.pushAskKey) || this.pushState().on) return;
                    calm = free() ? calm + 1 : 0;
                    if (calm >= 2) { this.openPushAsk(); return; }
                }
            },
            pushAskDenied() {
                const st = this.pushState();
                return this.isNative && this.isNative() ? Boolean(st.denied) : (typeof Notification !== 'undefined' && Notification.permission === 'denied');
            },
            openPushAsk() {
                const box = document.getElementById('push-ask-body'); if (!box) return;
                safeSet(this.pushAskKey, String(Date.now()));   // shown once, whatever they answer
                const apple = (this.isNative && this.isNative()) || /iPhone|iPad|iPod/.test(navigator.userAgent || '');
                const why = 'Know when friends like or comment on your sessions, follow you, or answer when you ask for help.';
                const icon = '<span class="pa-icon" aria-hidden="true"><svg class="icon"><use href="#i-bell"/></svg></span>';
                box.innerHTML = this.pushAskDenied()
                    ? `${icon}<h2 class="pa-h">Notifications are off</h2><p class="pa-p">${why} To turn them on: ${apple ? 'your iPhone\'s <b>Settings</b>, then <b>Notifications</b>, then <b>Dialed In</b>' : 'your browser\'s settings for this site'}.</p>
                       <div class="pa-actions"><button type="button" class="btn-primary" onclick="app.closePushAsk()">OK</button></div>`
                    : `${icon}<h2 class="pa-h">Turn on notifications?</h2><p class="pa-p">${why} You choose which ones in Settings.</p>
                       <div class="pa-actions"><button type="button" class="btn-primary" id="pa-yes" onclick="app.pushAskYes()">Turn on notifications</button><button type="button" class="pa-later" onclick="app.closePushAsk()">Not now</button></div>`;
                this.openModal('push-ask-modal');
            },
            async pushAskYes() {
                const b = document.getElementById('pa-yes'); if (b) { b.disabled = true; b.textContent = 'Turning on…'; }
                try { await this.setPush(true); } finally { this.closePushAsk(); }
            },
            closePushAsk() { const m = document.getElementById('push-ask-modal'); if (m) m.classList.remove('active'); },
