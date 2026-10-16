        // *** CONFIGURATION ***
        const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbxwOpOjQr2Um3y_YIddTIsn8yLAEqyQo5BnF001N9E58O4cT9x-7tMM6XGviIGTkNJp-Q/exec';
        // v14.2: the one door to the backend. Every load and save in the app goes through Cloud, so a new backend
        // can be swapped in here without touching the screens. Today it's the Google Sheet (Apps Script).
        const Cloud = {
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
        const safeParse = (raw, fallback) => {
            try {
                const parsed = JSON.parse(raw || '');
                return parsed ?? fallback;
            } catch (err) {
                return fallback;
            }
        };

