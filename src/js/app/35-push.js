            // ---- v14.5: notifications on this phone (Web Push). Settings shows the switch only once the sender is set up
            // (push_key() isn't empty) and only where the phone can do it: on an iPhone, the Home Screen app (iOS 16.4
            // or later). Turning it on asks the phone first (it has to come from the tap), then saves the phone's
            // subscription; the database sends each new notification to it. sw.js only shows them (no offline caching).
            pushState() { return this._push || (this._push = { key: null, at: 0, on: false, loading: false, busy: false }); },

            pushSupported() {
                if (this.isNative && this.isNative()) return Boolean(this.nativePlugin('PushNotifications'));   // v14.6: the iPhone app (Apple's push service)
                return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
            },

            // an iPhone or iPad in Safari (not the Home Screen app): notifications need the app on the Home Screen
            pushNeedsHomeScreen() {
                if (typeof navigator === 'undefined') return false;
                const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                const standalone = navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
                return ios && !standalone;
            },

            async loadPushState(force) {
                const st = this.pushState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                if (!force && st.at && Date.now() - st.at < 10 * 60000) return;
                st.loading = true;
                try {
                    if (this.isNative && this.isNative()) {   // v14.6: the iPhone app: is Apple's push service set up?
                        const ready = await Supa.rpc('push_ready', {});
                        st.key = ready && ready.apns ? 'apns' : null;
                        if (st.key) { const ns = await this.nativePushState(); st.on = ns.on; st.denied = ns.denied; }
                    } else {
                        const key = await Supa.rpc('push_key', {});
                        st.key = typeof key === 'string' && key ? key : null;
                    }
                    if (st.key && this.pushSupported() && !(this.isNative && this.isNative())) {
                        const reg = await navigator.serviceWorker.getRegistration();
                        const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
                        st.on = Boolean(sub) && Notification.permission === 'granted';
                    }
                    st.at = Date.now();
                } catch (e) { st.at = Date.now(); }
                finally { st.loading = false; }
                const m = document.getElementById('settings-modal');
                if (m && m.classList.contains('active')) this.openSettings();
            },

            pushRowHtml() {
                if (!this.acctOn()) return '';
                const st = this.pushState();
                if (!st.loading && (!st.at || Date.now() - st.at > 10 * 60000)) setTimeout(() => this.loadPushState(), 0);
                if (!st.key) return '';
                if (!this.pushSupported()) {
                    return this.pushNeedsHomeScreen()
                        ? '<div class="pp-private"><span><b>Notifications on this phone</b><small>Add Dialed In to your Home Screen (Share, then Add to Home Screen) and open it from there to turn them on.</small></span></div>'
                        : '';
                }
                const denied = this.isNative && this.isNative() ? Boolean(st.denied) : Notification.permission === 'denied';
                return `<div class="pp-private push-row"><span><b>Notifications on this phone</b><small>${denied ? 'They\'re turned off for Dialed In in your phone\'s settings.' : 'Likes, comments, follows and answers, on your lock screen.'}</small></span><button type="button" class="goal-sw" role="switch" aria-checked="${st.on ? 'true' : 'false'}" aria-label="Notifications on this phone"${denied || st.busy ? ' disabled' : ''} onclick="app.setPush(this.getAttribute('aria-checked') !== 'true')"></button></div>`;
            },

            async setPush(on) {
                const st = this.pushState();
                if (st.busy || !st.key || !this.pushSupported()) return;
                st.busy = true;
                try {
                    if (this.isNative && this.isNative()) {   // v14.6: the iPhone app
                        if (on) { if (!(await this.nativePushOn())) { this.showToast('Notifications stay off. You can allow them in Settings, Notifications, Dialed In.'); return; } st.on = true; this.showToast('Notifications are on for this phone.'); }
                        else { await this.nativePushOff(); st.on = false; this.showToast('Notifications are off for this phone.'); }
                        return;
                    }
                    if (on) {
                        const perm = await Notification.requestPermission();   // first, while it's still the tap (iPhone needs that)
                        if (perm !== 'granted') { this.showToast('Notifications stay off. You can allow them in your phone\'s settings.'); return; }
                        const reg = await navigator.serviceWorker.register('sw.js');
                        await navigator.serviceWorker.ready;
                        let sub = await reg.pushManager.getSubscription();
                        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.pushKeyBytes(st.key) });
                        await Supa.rpc('save_push', { sub: sub.toJSON() });
                        st.on = true;
                        this.showToast('Notifications are on for this phone.');
                    } else {
                        const reg = await navigator.serviceWorker.getRegistration();
                        const sub = reg ? await reg.pushManager.getSubscription() : null;
                        if (sub) { await Supa.rpc('remove_push', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
                        st.on = false;
                        this.showToast('Notifications are off for this phone.');
                    }
                } catch (e) {
                    this.showToast(on ? 'Couldn\'t turn notifications on. Try again.' : 'Couldn\'t turn notifications off. Try again.');
                } finally {
                    st.busy = false;
                    const m = document.getElementById('settings-modal');
                    if (m && m.classList.contains('active')) this.openSettings();
                }
            },

            // v14.6: signing out: this phone stops getting that account's notifications (a shared phone, a friend's phone)
            async pushForget() {
                try {
                    if (this.isNative && this.isNative()) { if (safeGet('dialed_apns_token')) await this.nativePushOff(); return; }
                    if (!this.pushSupported() || !navigator.serviceWorker.getRegistration) return;
                    const reg = await navigator.serviceWorker.getRegistration();
                    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
                    if (sub) { await Supa.rpc('remove_push', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
                } catch (e) { /* signing out goes on */ }
            },

            pushKeyBytes(b64) {
                const pad = '='.repeat((4 - (b64.length % 4)) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
                const out = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
                return out;
            },

            // tapping a notification opens the app on the bell (sw.js adds ?notifications=1, or tells an open app)
            notePushOpen() {
                try {
                    if (new URLSearchParams(location.search).get('notifications') === '1') {
                        this._openBellAfterSync = true;
                        const u = new URL(location.href); u.searchParams.delete('notifications'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
                    }
                    if (this.pushSupported() && !(this.isNative && this.isNative())) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open-notifications') this.openBellFromPush(); });
                } catch (e) {}
            },

            checkPushOpen() {
                if (!this._openBellAfterSync || !this.acctOn() || !this.user) return;
                this._openBellAfterSync = false;
                this.openBellFromPush();
            },

            // v15.0: a tapped notification opens the bell once the app is back on screen, signed in and loaded (not in
            // the middle of waking up), and only once however many ways the tap arrives
            openBellFromPush() {
                if (!this.acctOn() || !this.user || !this.syncedOnce) { this._openBellAfterSync = true; return; }
                if (this._bellPending) return;
                this._bellPending = true;
                const go = () => {
                    this._bellPending = false;
                    if (this.tab !== 'feed') this.setTab('feed');
                    const m = document.getElementById('notif-modal');
                    if (m && m.classList.contains('active')) { this.loadNotifications(50).then(() => this.renderNotifications()).catch(() => {}); return; }
                    this.openNotifications();
                };
                const later = () => setTimeout(go, 250);
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                    const on = () => { if (document.visibilityState !== 'visible') return; document.removeEventListener('visibilitychange', on); later(); };
                    document.addEventListener('visibilitychange', on);
                } else later();
            },
