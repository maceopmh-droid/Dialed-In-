            // ===================== v15.7: each grinder has its own memory =====================
            // A grind number only means something on the grinder that made it. A shot's grinder is the one ticked in its
            // gear when it was logged (by id, or by the saved name if that gear was deleted); a shot logged with no grinder
            // ticked belongs to the last grinder used for that method before it (the first shots: the first one used after).
            // The coach learns which way is finer and the usual step, spots an aging coffee and quotes grind numbers only
            // within one grinder; a person with no grinder ticked anywhere keeps one memory, as before.
            grinderLooksLike(name) {
                return /grinder|baratza|sette|encore|virtuoso|vario\b|forte|niche|varia|\bdf ?(54|64|83)\b|turin|eureka|mignon|urbanic|comandante|1zpresso|timemore|kingrinder|fellow ode|\bode\b|opus|lagom|option[- ]?o|mazzer|rancilio rocky|wilfa|skerton|porlex|zassenhaus|ceado|mahlk|\bek ?43\b|zerno|\bkinu\b|\bj-?max\b|\bk-?ultra\b|\bzp6\b|\bx-?ultra\b|sculptor|\bp(64|100)\b|lido|weber key/i.test(String(name || ''));
            },

            grinderKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); },

            // this person's grinders from their gear (typed Grinder, or named like one: some are saved as Machine or Other)
            gearOfPerson(owner) {
                const own = String(owner || '') === String(this.user || '') && Array.isArray(this.equipment) && this.equipment.length ? this.equipment : null;
                const rec = !own && this.gearByUser ? this.gearByUser.get(String(owner || '')) : null;
                return this.gearItemsFor(own || (rec && rec.items) || []);
            },

            grinderItems(owner) {
                const all = this.gearOfPerson(owner);
                const items = all.filter(i => /grinder/i.test(i.type) || this.grinderLooksLike(i.name));
                items.other = all.filter(i => !items.includes(i)).map(i => this.grinderKey(i.name));   // the machine, a kettle...
                return items;
            },

            // a name saved on an older shot, matched to a grinder in the gear: the same name, a longer or shorter one
            // ("Baratza Sette" / "Baratza Sette 720"), or a word only one of the grinders has ("Sette", "Barraza sette")
            grinderMatch(nm, items) {
                const k = this.grinderKey(nm);
                if (!k) return null;
                const exact = items.find(i => this.grinderKey(i.name) === k);
                if (exact) return exact;
                const pre = items.filter(i => { const ik = this.grinderKey(i.name); return Math.min(ik.length, k.length) >= 5 && (ik.startsWith(k) || k.startsWith(ik)); });
                if (pre.length === 1) return pre[0];
                const plain = /^(grinder|burrs?|coffee|espresso|electric|manual|hand|the|my|new|old|and|with|pro|plus|mini|max|series|edition|black|white|matte|gen)$/;
                const words = x => String(x || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !plain.test(w));
                const mine = words(nm);
                const hits = items.filter(i => words(i.name).some(w => mine.includes(w) && items.filter(j => words(j.name).includes(w)).length === 1));
                return hits.length === 1 ? hits[0] : null;
            },

            // the grinder ticked on a shot (null when none was)
            grinderTicked(b, items) {
                const ids = Array.isArray(b && b.equipment) ? b.equipment.map(String) : [];
                for (const id of ids) { const it = items.find(i => i.id === id); if (it) return { key: this.grinderKey(it.name), name: it.name }; }
                const snap = Array.isArray(b && b.equipmentSnapshot) ? b.equipmentSnapshot : [];
                for (const n of snap) {
                    const nm = String(n || '').trim(); if (!nm) continue;
                    if ((items.other || []).includes(this.grinderKey(nm))) continue;   // the machine, a kettle...
                    const it = this.grinderMatch(nm, items);
                    if (it || this.grinderLooksLike(nm)) return { key: this.grinderKey(it ? it.name : nm), name: it ? it.name : nm };
                }
                return null;
            },

            // every shot's grinder for one person and method, oldest first, with the gaps filled in
            grinderMap(owner, method) {
                const items = this.grinderItems(owner);
                const sig = `${owner}|${method}|${this._dataRev || 0}|${this.brews.size}|${items.map(i => `${i.id}:${i.name}`).join(',')}`;
                this._grMemo = this._grMemo || new Map();
                if (this._grMemo.has(sig)) return this._grMemo.get(sig);
                const when = b => { const t = this.localTime(b.date); return Number.isFinite(t) ? t : 0; };
                const list = this.brewsOf(owner).filter(b => (b.method || '') === method).sort((a, b) => when(a) - when(b) || (String(a.id) < String(b.id) ? -1 : 1));
                const map = new Map(); let last = null; const lead = [];
                list.forEach(b => {
                    const id = String(b.id), g = this.grinderTicked(b, items);
                    if (g) { last = g; lead.splice(0).forEach(x => map.set(x, g)); map.set(id, g); }
                    else if (last) map.set(id, last);
                    else lead.push(id);
                });
                map.latest = last;
                if (this._grMemo.size > 300) this._grMemo.clear();
                this._grMemo.set(sig, map);
                return map;
            },

            grinderFor(b) { return b ? (this.grinderMap(this.getBrewOwner(b), b.method || '').get(String(b.id)) || null) : null; },

            // the shot being logged: the grinder ticked in the form's gear, else the last one used for this method
            formGrinder(method) {
                if (!method) return null;
                const boxes = typeof document !== 'undefined' ? Array.from(document.querySelectorAll('#equipment-selector .equipment-checkbox:checked')) : [];
                const g = this.grinderTicked({ equipment: boxes.map(cb => cb.value) }, this.grinderItems(this.user));
                if (g) return g;
                const form = this.getBrewForm && this.getBrewForm();
                const editing = form && form.elements && form.elements.id ? this.brews.get(String(form.elements.id.value || '')) : null;
                return (editing && this.grinderFor(editing)) || this.grinderMap(this.user, method).latest || null;
            },

            // unknown on either side counts as the same grinder (one memory, as before grinders were told apart)
            sameGrinder(a, b) { return !a || !b || a.key === b.key; },
