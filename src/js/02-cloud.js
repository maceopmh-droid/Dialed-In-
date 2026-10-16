        // *** CONFIGURATION ***
        const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbxwOpOjQr2Um3y_YIddTIsn8yLAEqyQo5BnF001N9E58O4cT9x-7tMM6XGviIGTkNJp-Q/exec';
        const safeParse = (raw, fallback) => {
            try {
                const parsed = JSON.parse(raw || '');
                return parsed ?? fallback;
            } catch (err) {
                return fallback;
            }
        };

