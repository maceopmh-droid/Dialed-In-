            // ---- v14.6: inside the iPhone app (Capacitor). The same app, with its files built in (it opens offline with the
            // last synced data; saves wait in the outbox), plus what a website can't do: notifications from Apple's push
            // service, real haptics, and updates through the App Store instead of reloading. Everything here is skipped on
            // the website.
            isNative() {
                try { return typeof window !== 'undefined' && !!window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform(); } catch (e) { return false; }
            },
            nativePlugin(name) { try { return this.isNative() && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] || null : null; } catch (e) { return null; } },

            // saving a file (your data, an export): the iPhone app can't download, so it opens the share sheet (Save to
            // Files, AirDrop, Mail); the website downloads as before
            async saveFile(blob, name, title) {
                if (this.isNative()) {
                    try {
                        const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: title || name }); return 'shared'; }
                    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
                }
                const url = URL.createObjectURL(blob), a = document.createElement('a');
                a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
                return 'downloaded';
            },

            // haptics: the phone's own engine (light taps, a success pattern) when it's there
            nativeHaptic(kind) {
                const H = this.nativePlugin('Haptics'); if (!H) return false;
                try {
                    if (kind === 'success' || kind === 'finish') H.notification({ type: 'SUCCESS' });
                    else if (kind === 'warn') H.notification({ type: 'WARNING' });
                    else if (kind === 'tick') H.selectionChanged ? H.selectionChanged() : H.impact({ style: 'LIGHT' });
                    else H.impact({ style: kind === 'cue' ? 'MEDIUM' : 'LIGHT' });
                    return true;
                } catch (e) { return false; }
            },

            // notifications from Apple's push service: asks the phone, registers, saves the device token for this account
            async nativePushOn() {
                const P = this.nativePlugin('PushNotifications'); if (!P) throw new Error('no push');
                let perm = await P.checkPermissions();
                if (perm.receive !== 'granted') perm = await P.requestPermissions();
                if (perm.receive !== 'granted') return false;
                const token = await new Promise((resolve, reject) => {
                    let done = false; const hs = [];
                    const finish = (fn, v) => { if (done) return; done = true; hs.forEach(h => h && h.remove && h.remove()); fn(v); };
                    Promise.resolve(P.addListener('registration', t => finish(resolve, t && t.value))).then(h => hs.push(h));
                    Promise.resolve(P.addListener('registrationError', e => finish(reject, new Error(e && e.error || 'registration failed')))).then(h => hs.push(h));
                    P.register();
                    setTimeout(() => finish(reject, new Error('no answer from Apple')), 20000);
                });
                await Supa.rpc('save_push', { sub: { kind: 'apns', token } });
                safeSet('dialed_apns_token', token);
                return true;
            },

            async nativePushOff() {
                const P = this.nativePlugin('PushNotifications');
                const token = safeGet('dialed_apns_token');
                if (token) await Supa.rpc('remove_push', { endpoint: 'apns:' + String(token).toLowerCase() }).catch(() => {});
                safeSet('dialed_apns_token', '');
                if (P && P.unregister) await P.unregister().catch(() => {});
            },

            // Apple can change a phone's token (a restore, a reinstall): each launch, if notifications are on, check it's current
            async nativePushRefresh() {
                const P = this.nativePlugin('PushNotifications'), old = safeGet('dialed_apns_token');
                if (!P || !old || !this.acctOn() || !Supa.ready()) return;
                try {
                    const perm = await P.checkPermissions();
                    if (perm.receive !== 'granted') return;
                    const token = await new Promise(resolve => {
                        let h = null, done = false;
                        const finish = v => { if (done) return; done = true; if (h && h.remove) h.remove(); resolve(v); };
                        Promise.resolve(P.addListener('registration', t => finish(t && t.value))).then(x => { h = x; if (done && x && x.remove) x.remove(); });
                        P.register();
                        setTimeout(() => finish(null), 20000);
                    });
                    if (!token || String(token).toLowerCase() === String(old).toLowerCase()) return;
                    await Supa.rpc('save_push', { sub: { kind: 'apns', token } });
                    await Supa.rpc('remove_push', { endpoint: 'apns:' + String(old).toLowerCase() }).catch(() => {});
                    safeSet('dialed_apns_token', token);
                } catch (e) { /* next launch */ }
            },

            async nativePushState() {
                const P = this.nativePlugin('PushNotifications'); if (!P) return { on: false, denied: false };
                const perm = await P.checkPermissions().catch(() => ({ receive: 'prompt' }));
                return { on: perm.receive === 'granted' && Boolean(safeGet('dialed_apns_token')), denied: perm.receive === 'denied' };
            },

            // the clock and battery at the top follow the app's theme (light text on dark), not just the phone's
            nativeStatusBar() {
                const S = this.nativePlugin('StatusBar'); if (!S || !S.setStyle) return;
                const dark = window.__dialedTheme ? window.__dialedTheme.isDark() : false;
                try { Promise.resolve(S.setStyle({ style: dark ? 'DARK' : 'LIGHT' })).catch(() => {}); } catch (e) { /* older phones: the default */ }
            },

            // tapping a notification opens the bell; coming back to the app syncs
            bindNative() {
                if (this._nativeBound || !this.isNative()) return;
                this._nativeBound = true;
                document.documentElement.classList.add('is-native');
                this.nativeStatusBar();
                const P = this.nativePlugin('PushNotifications');
                if (P && P.addListener) P.addListener('pushNotificationActionPerformed', a => this.openBellFromPush(String((a && a.notification && a.notification.data && a.notification.data.tag) || '')));   // v15.0; v15.1: straight to what it's about
                setTimeout(() => this.nativePushRefresh(), 4000);
                const A = this.nativePlugin('App');
                if (A && A.addListener) A.addListener('appStateChange', s => { if (s && s.isActive && this.acctOn() && this.user) this.sync({ silent: true }); });
            },
