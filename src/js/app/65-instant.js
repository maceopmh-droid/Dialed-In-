            // ===================== v21.10: Instant =====================
            // Maceo, Nov 11: "add instant as a brew type". Instant coffee is stirred into water: there's no grind and no brew
            // time, so the next cup's advice is about strength (coffee to water) and the water's heat, read from the notes, tags,
            // sliders and rating, against the person's best cup of it on that coffee (hot against hot, iced against iced).
            INSTANT_RATIO: 90,   // about 2 g to 180 g, the usual jar's spoonful to a mug
            instantLine(b) {
                const dose = this.num(b.dose), water = this.num(b.yield), temp = this.num(b.temp);
                const parts = [];
                if (dose > 0 && water > 0) parts.push(`${this.fmtNum(dose)} g in ${this.fmtNum(water, 0)} g (1:${Math.round(water / dose)})`);
                else if (dose > 0) parts.push(`${this.fmtNum(dose)} g`);
                if (temp > 0) parts.push(`${this.fmtNum(temp, 0)}°C`);
                if (b.sub === 'Iced') parts.push('iced');
                return parts.join(' · ');
            },
            instantCoach(c) {
                const rate = b => this.normalizeRating(b.rating);
                let ref = null;
                this.coachPast(c).forEach(b => { const r = rate(b); if (r > 0 && (!ref || r >= rate(ref))) ref = b; });
                const read = this.coachRead(c.text, { rating: c.rating });
                const tags = (c.flavors || []).map(f => String(f).toLowerCase());
                const v = k => (c.tasted || []).includes(k) ? Number(c.values[k]) : null;
                const ev = [], why = [], ctx = [];
                const weakBits = [], strongBits = [];
                if (read.weak > 0) weakBits.push('your notes say weak');
                ['thin', 'watery', 'weak', 'flat'].forEach(t => { if (tags.includes(t)) weakBits.push(`"${t}"`); });
                if (v('body') !== null && v('body') <= 3) weakBits.push(`body ${v('body')}`);
                if (read.strong > 0 || read.over > 0) strongBits.push('your notes say too strong or bitter');
                ['bitter', 'harsh', 'burnt', 'ashy', 'drying'].forEach(t => { if (tags.includes(t)) strongBits.push(`"${t}"`); });
                if (v('bitterness') !== null && v('bitterness') >= 7) strongBits.push(`bitterness ${v('bitterness')}`);
                weakBits.forEach(t => ev.push({ side: 'under', text: t }));
                strongBits.forEach(t => ev.push({ side: 'over', text: t }));
                if (c.rating > 0) ev.push({ side: 'ok', text: `${this.fmtNum(c.rating)}★` });
                if (ref) ctx.push(['Your best on this coffee', `${this.instantLine(ref)} · ${this.fmtNum(rate(ref))}★`]);
                const k = { mode: 'ask', head: '', next: '', why, ev, ctx, conf: '', ref, from: 'instant' };
                const dose = this.num(c.dose), water = this.num(c.yield), ratio = dose > 0 && water > 0 ? water / dose : 0;
                if (!ratio) { k.head = 'Log the coffee and the water: the advice reads the strength against your best cup of this coffee.'; return k; }
                if (c.rating >= 4.5 && !weakBits.length && !strongBits.length) {
                    k.mode = 'hold'; k.head = 'Repeat it exactly.'; k.next = this.instantLine(c);
                    why.unshift('Your notes don\'t flag anything to fix.');
                    k.conf = ref && c.rating > rate(ref) ? 'a new best' : '';
                    return k;
                }
                const refRatio = ref && this.num(ref.dose) > 0 && this.num(ref.yield) > 0 ? this.num(ref.yield) / this.num(ref.dose) : 0;
                const round = g => Math.round(g * 2) / 2;
                if (weakBits.length > strongBits.length) {
                    // stronger: back toward your best cup's strength if it was stronger, else about a quarter more coffee
                    const target = refRatio && refRatio < ratio * 0.95 ? refRatio : ratio / 1.25;
                    const d = Math.max(round(water / target), round(dose + 0.5));
                    k.mode = 'fix'; k.conf = 'from your notes';
                    k.head = `Use a little more coffee: about ${this.fmtNum(d)} g in ${this.fmtNum(water, 0)} g.`; k.next = `${this.fmtNum(d)} g`;
                    why.unshift(refRatio && refRatio < ratio * 0.95 ? `Your best cup of it ran 1:${Math.round(refRatio)}; this one was 1:${Math.round(ratio)}.` : `This was 1:${Math.round(ratio)}: more coffee in the same water fills it out.`);
                    return k;
                }
                if (strongBits.length) {
                    const temp = this.num(c.temp);
                    k.mode = 'fix'; k.conf = 'from your notes';
                    if (temp >= 96 && c.sub !== 'Iced') {
                        k.head = 'Let the kettle sit a moment off the boil: about 90°C.'; k.next = '90°C';
                        why.unshift(`Boiling water (${this.fmtNum(temp, 0)}°C) can taste scorched on instant; many jars suggest water just off the boil.`);
                        return k;
                    }
                    const target = refRatio && refRatio > ratio * 1.05 ? refRatio : ratio * 1.25;
                    const d = Math.max(0.5, Math.min(round(water / target), round(dose - 0.5)));
                    k.head = `Use a little less coffee: about ${this.fmtNum(d)} g in ${this.fmtNum(water, 0)} g.`; k.next = `${this.fmtNum(d)} g`;
                    why.unshift(refRatio && refRatio > ratio * 1.05 ? `Your best cup of it ran 1:${Math.round(refRatio)}; this one was 1:${Math.round(ratio)}.` : `This was 1:${Math.round(ratio)}: a little less coffee in the same water softens it.`);
                    return k;
                }
                // nothing flagged and not a top cup: steer toward your best cup's recipe, if it differs
                if (ref && refRatio && Math.abs(refRatio - ratio) / ratio > 0.1) {
                    const d = round(water / refRatio);
                    k.mode = 'toward'; k.conf = 'your best cup';
                    k.head = `Try your best cup's strength: about ${this.fmtNum(d)} g in ${this.fmtNum(water, 0)} g.`; k.next = `${this.fmtNum(d)} g`;
                    why.unshift(`Your best cup of it (${this.fmtNum(rate(ref))}★) ran 1:${Math.round(refRatio)}.`);
                    return k;
                }
                k.head = 'Say how it tasted (too weak, too strong, bitter) and the next cup gets a change to try.';
                return k;
            },
