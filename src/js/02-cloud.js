        // *** CONFIGURATION ***
        const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbxwOpOjQr2Um3y_YIddTIsn8yLAEqyQo5BnF001N9E58O4cT9x-7tMM6XGviIGTkNJp-Q/exec';
        // v14.2 (phase 2): the Supabase project. `live` stays false until everyone moves over together; a phone can try
        // it early when 'dialed_supabase' in local storage holds { url, anonKey }. The key is the project's publishable
        // key, which is meant to be public (the database's privacy rules do the protecting): it goes on the apikey
        // header only, never as the Authorization token.
        // v14.6: the App Review account signs in with a password (Apple's reviewer can't receive our emailed codes)
const REVIEW_EMAILS = ['appreview@dialed-in.app'];
const SUPPORT_EMAIL = 'dialedincoffeeapp@gmail.com';   // v14.6: in the guidelines, the terms and the privacy policy
const SUPABASE = { url: 'https://glombusdjwlrgjihnylk.supabase.co', anonKey: 'sb_publishable_nunu5PQVtCf8OuAhyt_hXw_xK3A4-8i', live: true };
        // to try it on one phone before everyone moves: open the app once with ?backend=supabase (and ?backend=sheet to go back)
        try {
            const pick = new URLSearchParams(location.search).get('backend');
            if (pick === 'supabase' && SUPABASE.url && SUPABASE.anonKey) localStorage.setItem('dialed_supabase', JSON.stringify({ url: SUPABASE.url, anonKey: SUPABASE.anonKey }));
            else if (pick === 'sheet') localStorage.removeItem('dialed_supabase');
        } catch (e) {}

        // v14.2: the one door to the backend. Every load and save in the app goes through Cloud, so a new backend
        // can be swapped in here without touching the screens.
        // Today it's the Google Sheet (Apps Script).
        const SheetCloud = {
            // names this backend in the on-device copy of the log and in the outbox (a different backend starts fresh)
            id: CLOUD_URL,
            // everything newer than `since`; resolves to the reply's text (JSON)
            async pull({ since = 0, version = '', anchor = '' } = {}, { signal } = {}) {
                const params = new URLSearchParams({ v: '2', since: String(since || 0), ver: version || '', anchor: anchor || '', t: String(Date.now()) });
                const res = await fetch(CLOUD_URL + '?' + params.toString(), signal ? { signal } : undefined);
                return res.text();
            },
            // one event; the Sheet's reply can't be read (no-cors), so a later pull is what confirms it landed
            send(ev, { signal } = {}) {
                return fetch(CLOUD_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(ev), ...(signal ? { signal } : {}) });
            }
        };

        // Supabase: sign in by email code, then the same two calls as database functions (pull_events, push_event).
        // The database decides what each person may see and change; the phone only keeps its sign-in.
        const Supa = {
            CFG: 'dialed_supabase', SESSION: 'dialed_supabase_session',
            store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} return null; },
            cfg() {
                const o = this.store(this.CFG);
                if (o && o.url && o.anonKey) return o;
                return SUPABASE.live && SUPABASE.url && SUPABASE.anonKey ? SUPABASE : null;
            },
            on() { return Boolean(this.cfg()); },
            session() { return this.store(this.SESSION); },
            base() { return String(this.cfg().url).replace(/\/+$/, ''); },
            // signed in, with a profile (a claimed Sheet-era name or a new one)
            ready() { const s = this.session(); return Boolean(s && s.refresh_token && s.profile && s.profile.name); },
            async call(path, body, { auth = true, signal, raw = false, headers = {}, method = 'POST', retried = false } = {}) {
                const c = this.cfg();
                if (!c) throw new Error('No backend is set up.');
                const h = { apikey: c.anonKey, ...headers };
                if (body !== undefined && !(body instanceof Blob)) h['Content-Type'] = 'application/json';
                if (auth) h.Authorization = 'Bearer ' + await this.token();
                const res = await fetch(this.base() + path, { method, headers: h, ...(body !== undefined ? { body: body instanceof Blob ? body : JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
                const text = await res.text();
                // the token ran out on the way (or the phone's clock is off): renew it once and try again. (v18.3: photo storage
                // says so with a 400 "InvalidJWT", not a 401; unanswered, that failed the whole sync.)
                if ((res.status === 401 || (res.status === 400 && /InvalidJWT|"exp" claim|jwt expired/i.test(text))) && auth && !retried) {
                    const s = this.session(); if (s && s.refresh_token) this.store(this.SESSION, { ...s, expires_at: 0 });
                    return this.call(path, body, { auth, signal, raw, headers, method, retried: true });
                }
                if (!res.ok) {
                    let j = {}; try { j = JSON.parse(text); } catch (e) {}
                    const err = new Error(j.message || j.msg || j.error_description || j.error || ('Error ' + res.status));
                    err.status = res.status;
                    err.refused = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;   // the server said no: retrying won't help
                    if (res.status === 401) err.signedOut = true;
                    throw err;
                }
                return raw ? text : (text ? JSON.parse(text) : null);
            },
            rpc(name, args = {}, opts = {}) { return this.call('/rest/v1/rpc/' + name, args, opts); },
            // what's kept on the phone after signing in or refreshing
            keep(j, extra = {}) {
                const prev = this.session() || {};
                const s = { ...prev, access_token: j.access_token, refresh_token: j.refresh_token || prev.refresh_token,
                    expires_at: Number(j.expires_at) || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600),
                    user: j.user ? { id: j.user.id, email: j.user.email || '' } : prev.user, ...extra };
                this.store(this.SESSION, s);
                return s;
            },
            async token() {
                const s = this.session();
                if (!s || !s.refresh_token) throw Object.assign(new Error('Sign in to sync.'), { refused: true, signedOut: true });
                if (s.access_token && Number(s.expires_at) - 60 > Date.now() / 1000) return s.access_token;
                if (!this._refreshing) {
                    this._refreshing = this.call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }, { auth: false })
                        .then(j => this.keep(j).access_token)
                        .catch(e => {
                            // the sign-in ran out or was revoked: keep the profile (so the phone stays on this backend) and ask to sign in again
                            if (e.status === 400 || e.status === 401 || e.status === 403) { this.store(this.SESSION, { ...s, access_token: '', refresh_token: '' }); e.signedOut = true; e.refused = true; }
                            throw e;
                        })
                        .finally(() => { this._refreshing = null; });
                }
                return this._refreshing;
            },
            sendCode(email) { return this.call('/auth/v1/otp', { email: String(email || '').trim(), create_user: true }, { auth: false }); },
            // resolves to the profile ({ id, name, handle }) or null when this account has none yet
            async verify(email, code) {
                const j = await this.call('/auth/v1/verify', { type: 'email', email: String(email || '').trim(), token: String(code || '').replace(/\s+/g, '') }, { auth: false });
                const prev = this.session() || {};
                const same = prev.user && j.user && prev.user.id === j.user.id;
                this.store(this.SESSION, null);
                this.keep(j, { profile: same ? prev.profile || null : null });
                const p = await this.rpc('my_profile');
                this.store(this.SESSION, { ...this.session(), profile: p || null });
                return p || null;
            },
            // v14.6: a password instead of an emailed code (only accounts that have one: Apple's reviewer)
            async signInWithPassword(email, password) {
                const j = await this.call('/auth/v1/token?grant_type=password', { email: String(email || '').trim(), password: String(password || '') }, { auth: false });
                this.store(this.SESSION, null);
                this.keep(j, { profile: null });
                const p = await this.rpc('my_profile');
                this.store(this.SESSION, { ...this.session(), profile: p || null });
                return p || null;
            },
            async claim(code) { const p = await this.rpc('claim_name', { code }); this.store(this.SESSION, { ...this.session(), profile: p }); return p; },
            async createProfile(name, color) { const p = await this.rpc('create_profile', { name, color: color || null }); this.store(this.SESSION, { ...this.session(), profile: p }); return p; },
            signOut() {
                const s = this.session();
                this.store(this.SESSION, null);
                if (s && s.access_token) { try { fetch(this.base() + '/auth/v1/logout', { method: 'POST', headers: { apikey: this.cfg().anonKey, Authorization: 'Bearer ' + s.access_token } }).catch(() => {}); } catch (e) {} }
            },

            // ---- photos: uploaded to your own folder; read through links that expire (asked for in one batch per pull)
            links: new Map(),   // stored path -> { url, until }
            fingerprint(text) { let h = 5381; for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + text.length.toString(36); },
            async uploadPhoto(dataUrl, sessionId, { signal } = {}) {
                const s = this.session();
                const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(String(dataUrl || ''));
                if (!m || !s || !s.user) throw Object.assign(new Error('That photo can\'t be uploaded.'), { refused: true });
                const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
                const ext = (m[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
                // the same photo always gets the same name, so a retry overwrites instead of leaving copies
                const name = `${s.user.id}/${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '')}-${this.fingerprint(m[2])}.${ext}`;
                await this.call('/storage/v1/object/photos/' + name, new Blob([bytes], { type: m[1] }), { signal, headers: { 'Content-Type': m[1], 'x-upsert': 'true' } });
                return 'sb:' + name;
            },
            // v15.1: your profile pictures too (the "avatars" bucket), when you delete your account
            async removeMyAvatars() {
                const s = this.session(); if (!s || !s.user) return 0;
                const list = await this.call('/storage/v1/object/list/avatars', { prefix: s.user.id, limit: 100, offset: 0 });
                const names = (Array.isArray(list) ? list : []).map(o => o && o.id !== null && o.name).filter(Boolean).map(n => `${s.user.id}/${n}`);
                if (!names.length) return 0;
                const out = await this.call('/storage/v1/object/avatars', { prefixes: names }, { method: 'DELETE' });
                return Array.isArray(out) ? out.length : names.length;
            },
            // v14.6: deleting your account: your photos go first (files in storage can't be removed from the database)
            async removeMyPhotos() {
                const s = this.session(); if (!s || !s.user) return 0;
                let gone = 0;
                for (let round = 0; round < 100; round++) {
                    const list = await this.call('/storage/v1/object/list/photos', { prefix: s.user.id, limit: 100, offset: 0 });
                    const names = (Array.isArray(list) ? list : []).map(o => o && o.id !== null && o.name).filter(Boolean).map(n => `${s.user.id}/${n}`);
                    if (!names.length) break;
                    const out = await this.call('/storage/v1/object/photos', { prefixes: names }, { method: 'DELETE' });
                    const n = Array.isArray(out) ? out.length : names.length;
                    gone += n; if (!n) break;   // nothing went (not allowed): don't keep asking
                }
                return gone;
            },
            async linkPhotos(events, { signal } = {}) {
                const now = Date.now();
                const want = [...new Set(events.filter(e => e && e.type === 'brew' && e.photo && /^sb:/.test(String(e.photo.path || ''))).map(e => e.photo.path))]
                    .filter(p => !(this.links.get(p) && this.links.get(p).until > now));
                let failed = 0;
                for (let i = 0; i < want.length; i += 100) {
                    const batch = want.slice(i, i + 100);
                    let out;
                    // v18.3: links that can't be had right now don't stop the sync (comments and the rest still come in);
                    // those photos wait for the next sync
                    try { out = await this.call('/storage/v1/object/sign/photos', { expiresIn: 7200, paths: batch.map(p => p.slice(3)) }, { signal }); }
                    catch (e) {
                        if ((signal && signal.aborted) || e.signedOut) throw e;
                        failed++; console.error('Photo links:', e);
                        // v18.5: they still get an address (one that shows nothing), so the app keeps knowing they have a photo:
                        // without one, the owner's next save of that session sent "no photo" and the photo was deleted
                        batch.forEach(p => { if (!this.links.get(p)) this.links.set(p, { url: this.base() + '/storage/v1/object/missing', until: 0 }); });
                        continue;
                    }
                    // a link is reused for an hour, so it always has at least an hour left (and the reply text stays the same between syncs)
                    (Array.isArray(out) ? out : []).forEach((r, k) => {
                        const p = 'sb:' + (r && r.path ? r.path : batch[k].slice(3));
                        const url = r && r.signedURL ? this.base() + '/storage/v1' + (r.signedURL[0] === '/' ? '' : '/') + r.signedURL : this.base() + '/storage/v1/object/missing';
                        this.links.set(p, { url, until: now + 3600000 });
                    });
                }
                events.forEach(e => { if (e && e.type === 'brew' && e.photo && this.links.get(e.photo.path)) e.photo = { ...e.photo, url: this.links.get(e.photo.path).url }; });
                return Object.assign(events, { linksFailed: failed });
            }
        };

        const SupaCloud = {
            get id() { const s = Supa.session(); return 'supabase:' + Supa.base() + '#' + ((s && s.user && s.user.id) || 'signed-out'); },
            confirms: true,   // a save that returns without an error is in: nothing to watch for afterwards
            // Everything you may see, in the app's "full reply" format. A tiny version number is checked first, and
            // everything is downloaded again only when it moved (or the photo links are getting old), so an idle phone
            // costs a few bytes a sync instead of every coffee and session every 30 seconds.
            async pull(position, { signal } = {}) {
                const v = await Supa.rpc('data_version', {}, { signal });
                const last = this._last;
                if (last && last.v === v && last.who === this.id && Date.now() - last.at < 45 * 60000) return last.text;
                const events = await Supa.rpc('pull_events', {}, { signal });
                if (!Array.isArray(events)) throw new Error('Unexpected sync response.');
                await Supa.linkPhotos(events, { signal });
                const text = JSON.stringify(events);
                // (a save between the two calls just means one extra download next time; photos still without a link mean
                // the next sync asks again)
                this._last = events.linksFailed ? null : { v, text, at: Date.now(), who: this.id };
                return text;
            },
            async send(ev, { signal } = {}) {
                let out = ev;
                if (ev && ev.type === 'brew' && ev.photo && /^data:image\//i.test(String(ev.photo.url || ''))) {
                    out = { ...ev, photo: { path: await Supa.uploadPhoto(ev.photo.url, ev.id, { signal }), source: ev.photo.source || 'library', addedAt: ev.photo.addedAt || new Date().toISOString() } };
                }
                await Supa.rpc('push_event', { ev: out }, { signal });
                this._last = null;   // your own save: the next sync downloads fresh
                return { landed: true, ev: out };
            }
        };

        const Cloud = {
            backend() { return Supa.on() ? SupaCloud : SheetCloud; },
            get id() { return this.backend().id; },
            get confirms() { return Boolean(this.backend().confirms); },
            pull(position, opts) { return this.backend().pull(position, opts); },
            send(ev, opts) { return this.backend().send(ev, opts); },
            // the signed-in person's name on Supabase (null on the Sheet, where you pick who you are)
            who() { const s = Supa.on() && Supa.session(); return s && s.profile && s.profile.name ? String(s.profile.name) : null; }
        };
        const safeParse = (raw, fallback) => {
            try {
                const parsed = JSON.parse(raw || '');
                return parsed ?? fallback;
            } catch (err) {
                return fallback;
            }
        };
