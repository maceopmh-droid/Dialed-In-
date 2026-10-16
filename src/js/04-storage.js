        // v13.4: storage that never throws (blocked in a private window, full because another app on this domain filled it)
        const memStore = new Map();
        function safeGet(k) { try { const v = localStorage.getItem(k); return v === null && memStore.has(k) ? memStore.get(k) : v; } catch (e) { return memStore.has(k) ? memStore.get(k) : null; } }
        function safeSet(k, v) { memStore.set(k, String(v)); try { localStorage.setItem(k, v); } catch (e) {} }
