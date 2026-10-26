            // ===================== v17.4: the New look's colors, without limits =====================
            // Every tasting note has its own hue (Lemon yellow, Blueberry blue-violet, Cocoa brown, Peppermint mint...), taken
            // from a real color of that thing. A session wears the blend of its notes, weighted by how strong each was; a coffee
            // wears its picture's color (chosen when it's added, or in the coffee editor, so it never changes on its own); a
            // roaster its own color; a person theirs. Any hue gets a whole palette for dark and light (worked out in OKLCH, the
            // text kept readable), written once into a style sheet the first time it's used. Keys look like "t125q6"
            // (hue in steps of 5°, how colorful from 1 to 9): hundreds of them, where there used to be ten.
            NL_HUES: {
                n: {"Blueberry":[269,0.17],"Raspberry":[12,0.202],"Strawberry":[21,0.201],"Blackberry":[315,0.121],"Blackcurrant":[324,0.128],"Lemon":[99,0.16],"Lime":[124,0.164],"Orange":[59,0.162],"Grapefruit":[29,0.167],"Bergamot":[106,0.14],"Peach":[51,0.115],"Apricot":[67,0.144],"Cherry":[19,0.182],"Plum":[339,0.112],"Mango":[73,0.159],"Pineapple":[93,0.151],"Passion fruit":[80,0.138],"Lychee":[12,0.086],"Raisin":[358,0.088],"Date":[54,0.078],"Fig":[340,0.079],"Prune":[345,0.074],"Apple":[128,0.151],"Pear":[111,0.137],"Grape":[310,0.132],"Jasmine":[98,0.067],"Rose":[3,0.141],"Orange blossom":[77,0.124],"Lavender":[299,0.105],"Black tea":[58,0.11],"Earl Grey":[263,0.055],"Chamomile":[94,0.141],"Hibiscus":[9,0.195],"Brown sugar":[67,0.102],"Caramel":[63,0.122],"Honey":[82,0.143],"Maple":[55,0.126],"Molasses":[47,0.084],"Vanilla":[94,0.075],"Toffee":[62,0.111],"Marshmallow":[18,0.045],"Candy":[356,0.178],"Almond":[71,0.08],"Hazelnut":[65,0.096],"Peanut":[74,0.098],"Walnut":[59,0.077],"Milk chocolate":[54,0.078],"Dark chocolate":[43,0.061],"Cocoa nib":[45,0.069],"Cinnamon":[48,0.12],"Clove":[35,0.093],"Nutmeg":[64,0.089],"Cardamom":[118,0.104],"Black pepper":[78,0.011],"Anise":[150,0.052],"Ginger":[78,0.129],"Malt":[80,0.101],"Toast":[66,0.086],"Cereal":[86,0.099],"Tobacco":[66,0.063],"Smoke":[286,0.009],"Cedar":[47,0.096],"Earthy":[69,0.049],"Forest floor":[126,0.066],"Mushroom":[78,0.04],"Red wine":[7,0.127],"Rum":[55,0.105],"Whiskey":[67,0.121],"Fermented fruit":[352,0.138],"Yogurt":[107,0.021],"Boozy":[13,0.151],"Orchid":[327,0.112],"Osmanthus":[78,0.144],"Honeysuckle":[96,0.12],"Lilac":[306,0.093],"Gardenia":[96,0.043],"Magnolia":[5,0.047],"Yuzu":[96,0.155],"Muscatel":[95,0.118],"Fresh grass":[137,0.154],"Spinach":[143,0.115],"Sweet pea":[133,0.139],"Bamboo":[118,0.115],"Seaweed":[141,0.061],"Nori":[158,0.044],"Umami":[109,0.068],"Hay":[93,0.104],"Straw":[93,0.104],"Artichoke":[121,0.09],"Cocoa":[45,0.069],"Chestnut":[46,0.098],"Toasted rice":[78,0.095],"Biscuit":[78,0.094],"Roasted grain":[78,0.097],"Bread":[74,0.098],"Sandalwood":[56,0.073],"Camphor":[154,0.033],"Wet earth":[67,0.033],"Leather":[50,0.077],"Pine smoke":[145,0.032],"Charcoal":[286,0.003],"Wet stone":[256,0.014],"Slate":[253,0.023],"Salty":[229,0.022],"Peppermint":[167,0.117],"Spearmint":[166,0.111],"Lemon balm":[124,0.136],"Lemongrass":[117,0.131],"Licorice":[354,0.026],"Rosehip":[30,0.181],"Tangy":[87,0.146]},
                g: {"Berry":[11,0.184],"Citrus":[83,0.147],"Stone fruit":[39,0.15],"Tropical":[75,0.151],"Dried fruit":[2,0.092],"Orchard":[119,0.143],"Blossom":[351,0.096],"Tea":[65,0.099],"Sugars":[67,0.121],"Confection":[35,0.078],"Nuts":[66,0.086],"Cocoa":[45,0.069],"Warm spice":[48,0.12],"Savory":[84,0.05],"Grain":[80,0.101],"Smoky":[48,0.018],"Earthy":[69,0.049],"Winey":[9,0.126],"Funky":[352,0.116],"Fresh flowers":[326,0.072],"Green":[135,0.131],"Marine":[151,0.049],"Dry":[97,0.095],"Toasted":[71,0.094],"Spice":[48,0.12],"Wood":[56,0.078],"Mineral":[253,0.022],"Minty":[166,0.111],"Herby":[127,0.113],"Tart":[19,0.18]},
                f: {"fruity":[28,0.165],"floral":[332,0.092],"sweet":[79,0.122],"nutty":[51,0.069],"spice":[47,0.107],"earthy":[63,0.03],"fermented":[333,0.113],"vegetal":[134,0.122],"herbal":[175,0.084]}
            },

            // ---- color math (OKLab / OKLCH, sRGB)
            nlOk2Rgb(L, C, h) {
                const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
                const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
                return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
            },
            // a color as hex; a chroma the screen can't show is eased down until it can (the hue and lightness stay)
            nlOkHex(L, C, h) {
                let c = C, rgb = this.nlOk2Rgb(L, c, h);
                for (let i = 0; i < 24 && rgb.some(v => v < -0.0005 || v > 1.0005); i++) { c *= 0.88; rgb = this.nlOk2Rgb(L, c, h); }
                const g = v => { v = Math.min(1, Math.max(0, v)); v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(v * 255).toString(16).padStart(2, '0'); };
                return '#' + rgb.map(g).join('').toUpperCase();
            },
            nlHexOk(hex) {
                const s = String(this.normalizeHexColor ? (this.normalizeHexColor(hex) || '#808080') : hex).replace('#', '');
                const lin = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
                const [r, g, b] = lin;
                const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
                const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
                return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360 };
            },

            // ---- keys: a hue (steps of 5°) and how colorful (1 dull to 9 vivid), from a chroma
            nlToneKey(h, C) {
                if (!(C >= 0)) return 'app';
                const q = Math.max(1, Math.min(9, Math.round(Math.max(0.1, Math.min(1, (C - 0.012) / 0.12)) * 8) + 1));
                const hh = ((Math.round(h / 5) * 5) % 360 + 360) % 360;
                const key = `t${hh}q${q}`;
                this.nlEnsureTone(key);
                return key;
            },
            nlToneParts(key) { const m = /^t(\d+)q(\d)$/.exec(String(key || '')); return m ? { h: Number(m[1]), q: (Number(m[2]) - 1) / 8 } : null; },
            nlToneOfHex(hex) { const o = this.nlHexOk(hex); return this.nlToneKey(o.h, Math.max(0.03, o.C)); },

            // the palette of a key in one theme: c card, t text, k accent, n names, l muted, ph placeholder, send / sendfg
            // (a primary button), chip bg / fg (a note's pill), and the two ends of a picture tile's gradient
            nlTonePal(key, dark) {
                const p = this.nlToneParts(key);
                if (!p) return null;
                const cache = this._nlTonePal || (this._nlTonePal = new Map()), ck = key + (dark ? 'd' : 'l');
                if (cache.has(ck)) return cache.get(ck);
                const { h, q } = p, hx = (L, C, hh = h) => this.nlOkHex(L, C, hh);
                const out = dark
                    ? { c: hx(0.225, 0.010 + 0.026 * q), t: hx(0.90, 0.010 + 0.026 * q), k: hx(0.76, 0.03 + 0.085 * q), n: hx(0.89, 0.015 + 0.045 * q), l: hx(0.71, 0.014 + 0.042 * q), ph: hx(0.645, 0.018 + 0.05 * q) }
                    : { c: hx(0.905, 0.012 + 0.034 * q), t: hx(0.30, 0.015 + 0.04 * q), k: hx(0.47, 0.03 + 0.085 * q), n: hx(0.37, 0.03 + 0.09 * q), l: hx(0.48, 0.018 + 0.045 * q), ph: hx(0.555, 0.015 + 0.04 * q), send: hx(0.47, 0.035 + 0.095 * q), sendfg: hx(0.965, 0.008 + 0.01 * q) };
                // readable: the muted and accent colors move away from the card until they clear 4.5:1 (names and text already do)
                ['l', 'k', 'n', 't'].forEach(r => { let L = { l: dark ? 0.71 : 0.48, k: dark ? 0.76 : 0.47, n: dark ? 0.89 : 0.37, t: dark ? 0.90 : 0.30 }[r]; const C0 = { l: 0.014 + 0.042 * q, k: 0.03 + 0.085 * q, n: 0.015 + 0.045 * q, t: 0.010 + 0.026 * q }[r]; for (let i = 0; i < 12 && this.nlContrast(out[r], out.c) < 4.5; i++) { L += dark ? 0.02 : -0.02; out[r] = hx(L, C0); } });
                out.chipBg = hx(0.95, 0.02 + 0.03 * q); out.chipFg = hx(0.45, 0.05 + 0.09 * q);
                out.tileA = hx(0.80, 0.03 + 0.11 * q); out.tileB = hx(0.56, 0.035 + 0.12 * q, (h + 16) % 360);
                out.dark = dark;
                cache.set(ck, out);
                return out;
            },

            // the style sheet: each key's palette for both themes (and its note pill), written the first time it's used
            nlEnsureTone(key) {
                if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') return;
                const done = this._nlTones || (this._nlTones = new Set());
                if (done.has(key) || !this.nlToneParts(key)) return;
                done.add(key);
                let st = document.getElementById('nl-tones');
                if (!st) { st = document.createElement('style'); st.id = 'nl-tones'; document.head.appendChild(st); }
                const D = this.nlTonePal(key, true), Lt = this.nlTonePal(key, false), sel = `[data-fam="${key}"]`;
                const rules = [
                    `html[data-look="new"][data-theme="dark"] ${sel} { --c: ${D.c}; --t: ${D.t}; --k: ${D.k}; --n: ${D.n}; --l: ${D.l}; --ph: ${D.ph}; ${this.nlClassicTokens(D)} }`,
                    `html[data-look="new"][data-theme="light"] ${sel} { --c: ${Lt.c}; --t: ${Lt.t}; --k: ${Lt.k}; --n: ${Lt.n}; --l: ${Lt.l}; --ph: ${Lt.ph}; --send: ${Lt.send}; --sendfg: ${Lt.sendfg}; ${this.nlClassicTokens(Lt)} }`,
                    `html[data-look="new"] [data-nf="${key}"] { --fbg: ${D.chipBg}; --ffg: ${D.chipFg}; }`
                ];
                try { rules.forEach(r => st.sheet.insertRule(r, st.sheet.cssRules.length)); } catch (e) { st.textContent += '\n' + rules.join('\n'); }
            },

            // the classic look's own color names, in this palette: the app's older parts (Compare, Dial-in, the Sweet spot, the
            // log form's fields...) inside a page or card of one color take its colors instead of the app's green
            nlClassicTokens(P) {
                const mix = (a, b, t) => this.hexMix(a, b, t), rgb = h => { const s = String(h).slice(1); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)).join(', '); };
                const pg = P.dark ? mix(P.c, '#000000', 0.18) : mix(P.c, '#ffffff', 0.45);
                const box = P.dark ? mix(P.c, '#ffffff', 0.03) : mix(P.c, '#ffffff', 0.88), s2 = P.dark ? mix(P.c, P.t, 0.08) : mix(P.c, '#ffffff', 0.6);
                const t = {
                    '--paper': pg, '--paper-rgb': rgb(pg), '--surface': box, '--surface-2': s2, '--line': mix(P.c, P.t, P.dark ? 0.16 : 0.14), '--linen': P.dark ? mix(P.c, '#000000', 0.25) : mix(P.c, '#ffffff', 0.35),
                    '--ink': P.t, '--ink-2': mix(P.t, P.c, 0.18), '--text-muted': P.l, '--text-faint': mix(P.l, P.c, 0.35),
                    '--matcha': P.k, '--matcha-rgb': rgb(P.k), '--matcha-2': mix(P.k, '#ffffff', 0.3), '--matcha-ink': P.dark ? mix(P.k, '#ffffff', 0.2) : mix(P.k, '#000000', 0.2), '--matcha-dim': `rgba(${rgb(P.k)}, 0.12)`, '--on-matcha': P.dark ? P.c : '#FFFFFF',
                    '--glass-rgb': rgb(P.dark ? mix(P.c, P.t, 0.04) : mix(P.c, '#ffffff', 0.7)), '--hair-rgb': rgb(P.dark ? P.n : P.t), '--glass': `rgba(${rgb(box)}, 0.7)`, '--glass-strong': `rgba(${rgb(box)}, 0.88)`
                };
                return Object.entries(t).map(([k, v]) => `${k}: ${v};`).join(' ');
            },

            // ---- a note's own color (null for "Tastes off" and notes that aren't on a wheel): its hue, how colorful, its family
            noteColor(name, kind) {
                const at = this.noteLocate(name, kind);
                if (!at || at.f < 0) return null;
                const W = at.wheel === 'tea' ? TEA_WHEEL : NOTE_WHEEL, fam = W[at.f], famKey = fam && this.NL_WHEEL_FAM[fam.fam];
                if (!famKey || famKey === 'off') return null;
                const hc = (at.note && this.NL_HUES.n[at.note]) || (at.g >= 0 && this.NL_HUES.g[fam.groups[at.g][0]]) || this.NL_HUES.f[famKey] || null;
                return hc ? { h: hc[0], C: hc[1], fam: famKey } : null;
            },
            noteHue(name, kind) { const c = this.noteColor(name, kind); return c ? [c.h, c.C] : null; },
            noteToneKey(name, kind) { const hc = this.noteHue(name, kind); return hc ? this.nlToneKey(hc[0], hc[1]) : 'off'; },
            // v17.6: how much a family's notes lead a cup's color. Nearly every coffee has some chocolate, caramel or nuts, so
            // those lead a little less; flowers, greens and herbs a little more. (Fixed, so everyone's phone shows the same.)
            NL_FAM_WEIGHT: { sweet: 0.7, nutty: 0.7, earthy: 0.7, spice: 0.8, fruity: 1, fermented: 1.05, vegetal: 1.15, herbal: 1.15, floral: 1.3 },
            // the color of a set of notes ([[name, strength, kind]]). v17.6, less muddy: the plain average of a cup's notes is
            // nearly always a brown, so the hue comes from its leading group of notes (those within 45° of each other on the
            // color wheel, weighed by strength, how colorful each is and its family) instead of averaging across the wheel.
            // How colorful it is stays as quiet as before (all the notes averaged by strength; Maceo: "more muted like it was
            // before"), a tea a little brighter. (null when no note has a color)
            toneOfNotes(notes) {
                const pts = [];
                let tea = false;
                (notes || []).forEach(([name, s, kind]) => {
                    const c = this.noteColor(name, kind);
                    if (kind === 'tea') tea = true;
                    if (!c) return;
                    const st = Number(s) >= 1 && Number(s) <= 3 ? Number(s) : 2;
                    const quiet = c.h >= 30 && c.h <= 80 && c.C < 0.11 ? 0.6 : 1;   // (the browns)
                    pts.push({ h: c.h, C: c.C, st, w: st * Math.max(0.15, c.C / 0.12) * quiet * (this.NL_FAM_WEIGHT[c.fam] || 1) });
                });
                if (!pts.length) return null;
                const apart = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
                let best = null;
                pts.forEach(c => { const near = pts.filter(q => apart(q.h, c.h) <= 45), w = near.reduce((t, q) => t + q.w, 0); if (!best || w > best.w + 1e-9) best = { w, near }; });
                let A = 0, B = 0;
                best.near.forEach(q => { A += q.w * Math.cos(q.h * Math.PI / 180); B += q.w * Math.sin(q.h * Math.PI / 180); });
                const h = ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360;
                let a = 0, b = 0, S = 0;   // (how colorful: as before, every note's color averaged by its strength)
                pts.forEach(q => { a += q.st * q.C * Math.cos(q.h * Math.PI / 180); b += q.st * q.C * Math.sin(q.h * Math.PI / 180); S += q.st; });
                return this.nlToneKey(h, Math.max(0.035, Math.hypot(a, b) / S) * (tea ? 1.2 : 1));
            },

            // ---- a coffee's picture: { hue, tone (0-100), photo (a path in your folder of public pictures) } saved on the
            // coffee. A coffee from before pictures wears the colors of its first session (that never changes either), or
            // one from its name.
            coverOf(bean) {
                if (!bean) return null;
                const c = bean.cover && typeof bean.cover === 'object' ? bean.cover : null;
                if (c && (Number.isFinite(Number(c.hue)) || c.photo)) return { hue: Number.isFinite(Number(c.hue)) ? Number(c.hue) : null, tone: Number.isFinite(Number(c.tone)) ? Number(c.tone) : 60, photo: c.photo ? String(c.photo) : '' };
                return null;
            },
            // the coffee's group: the first bag added that has a picture (everyone sees the same one), else the first bag
            coverBean(bean) {
                if (!bean) return null;
                if (this.coverOf(bean)) return bean;
                const key = this.beanGroupKey(bean);
                const cache = this.nlFamCache(), ck = `cb:${key}`;
                if (!cache.has(ck)) {
                    const bags = [...this.beans.values()].filter(b => this.beanGroupKey(b) === key).sort((a, b) => this.toTime(a.date) - this.toTime(b.date));
                    cache.set(ck, bags.find(b => this.coverOf(b)) || null);
                }
                return cache.get(ck) || bean;
            },
            nlNameHue(text) { let h = 0; for (const ch of String(text || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 360; },
            coffeeToneKey(bean) {
                if (!bean) return 'app';
                const cb = this.coverBean(bean), cov = this.coverOf(cb);
                const teaB = !!(this.isTeaBean && this.isTeaBean(bean));
                if (cov && cov.hue !== null) return this.nlToneKey(cov.hue, (0.012 + 0.12 * Math.max(0.1, Math.min(1, cov.tone / 100))) * (teaB ? 1.2 : 1));   // (v17.6: a tea a little brighter)
                const key = this.beanGroupKey(bean);
                return this.nlFamOf(`ct:${key}`, () => {
                    const first = [...this.brews.values()].filter(b => { const bn = this.beans.get(String(b.beanId)); return bn && this.beanGroupKey(bn) === key; }).sort((a, b) => this.toTime(a.date) - this.toTime(b.date))
                        .find(b => this.toneOfNotes(this.brewNoteList(b)));
                    return (first && this.toneOfNotes(this.brewNoteList(first))) || this.nlToneKey(this.nlNameHue(`${bean.roaster || ''}|${bean.name || ''}`), teaB ? 0.12 : 0.09);
                });
            },
            // a coffee's picture: its color (a gradient), the name's first letters, and its photo if it has one
            nlCoverArt(bean) {
                const cb = this.coverBean(bean) || bean, cov = this.coverOf(cb), key = this.coffeeToneKey(bean);
                const P = this.nlTonePal(key, this.nlDark());
                const words = String(bean && bean.name || '').replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter(w => w && w !== '&');
                const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 1)).toUpperCase();
                return { key, bg: `linear-gradient(145deg, ${P ? P.tileA : '#99AA99'}, ${P ? P.tileB : '#557755'})`, initials, img: cov && cov.photo && this.faceUrl ? this.faceUrl(cov.photo) : '' };
            },
            // ...as a tile (like a roaster's)
            nlCoverHtml(bean, cls = 'nl-cover') {
                const a = this.nlCoverArt(bean);
                return `<span class="${cls}" data-fam="${a.key}" style="background:${a.bg}" aria-hidden="true">${a.img ? `<img src="${this.esc(a.img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}<b>${this.esc(a.initials)}</b></span>`;
            },
            // the colors the coffee editor offers (and the one a new coffee starts on: from its name, so it's settled at once)
            NL_COVER_HUES: [12, 28, 45, 62, 80, 98, 118, 140, 165, 190, 215, 240, 262, 285, 305, 325, 345],

            // ---- the coffee editor's Picture: a color (one of the swatches) and, if you like, a photo. A new coffee starts on
            // a color from its name (it follows the name as you type until you pick one), and keeps whatever is chosen.
            beanCoverInit(bean) {
                const cov = bean ? this.coverOf(bean) : null;
                this._bcv = cov ? { hue: cov.hue !== null ? cov.hue : this.NL_COVER_HUES[this.nlNameHue(`${bean.roaster || ''}|${bean.name || ''}`) % this.NL_COVER_HUES.length], tone: cov.tone, photo: cov.photo, picked: true }
                    : bean ? { hue: this.nlBeanHueGuess(bean), tone: 60, photo: '', picked: false }
                    : { hue: null, tone: 60, photo: '', picked: false };
                const form = this.getBeanForm && this.getBeanForm();
                if (form && !form._bcvBound) {   // the name and roaster steer a new coffee's color until one is picked
                    form._bcvBound = true;
                    ['name', 'roaster'].forEach(n => { const el = form.elements[n]; if (el) el.addEventListener('input', () => { if (this._bcv && !this._bcv.picked) this.paintBeanCover(); }); });
                }
                this.paintBeanCover();
            },
            // a coffee from before pictures: the color it already wears (its first session's), so editing doesn't change it
            nlBeanHueGuess(bean) { const p = this.nlToneParts(this.coffeeToneKey(bean)); return p ? p.h : 28; },
            // v17.5: the same Picture editor serves the coffee editor ('bean', #bcv-…) and the roaster editor ('roaster', #rcv-…)
            cvIds(ctx) { const p = ctx === 'roaster' ? 'rcv' : 'bcv'; return { tile: `${p}-tile`, sw: `${p}-swatches`, photo: `${p}-photo`, rm: `${p}-remove`, input: `${p}-input` }; },
            cvState(ctx) { return ctx === 'roaster' ? this._rcv : this._bcv; },
            cvName(ctx) {
                if (ctx === 'roaster') return this._rcvName || '';
                const form = this.getBeanForm && this.getBeanForm();
                return form && form.elements.name ? form.elements.name.value : '';
            },
            beanCoverNow(ctx = 'bean') {
                const c = this.cvState(ctx) || { hue: null, tone: 60, photo: '' };
                let hue = c.hue;
                if (hue === null || hue === undefined) {
                    let nm = '';
                    if (ctx === 'roaster') nm = this._rcvName || '';
                    else { const form = this.getBeanForm && this.getBeanForm(); nm = form ? `${(form.elements.roaster || {}).value || ''}|${(form.elements.name || {}).value || ''}` : ''; }
                    hue = this.NL_COVER_HUES[this.nlNameHue(nm) % this.NL_COVER_HUES.length];
                }
                return { hue: Math.round(hue) % 360, tone: Math.max(0, Math.min(100, Math.round(c.tone ?? 60))), photo: c.photo || '' };
            },
            beanCoverOut(ctx = 'bean') { const c = this.beanCoverNow(ctx); return c.photo ? c : { hue: c.hue, tone: c.tone }; },
            paintBeanCover(ctx = 'bean') {
                if (typeof document === 'undefined') return;
                const ids = this.cvIds(ctx), tile = document.getElementById(ids.tile), sw = document.getElementById(ids.sw);
                if (!tile || !sw) return;
                const c = this.beanCoverNow(ctx), name = this.cvName(ctx);
                const key = this.nlToneKey(c.hue, 0.012 + 0.12 * Math.max(0.1, c.tone / 100)), P = this.nlTonePal(key, this.nlDark());
                const words = String(name || '').replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter(w => w && w !== '&');
                const ini = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 1)).toUpperCase();
                tile.className = `${ids.tile.slice(0, 3)}-tile bcv-tile nl-cover`;
                tile.style.background = `linear-gradient(145deg, ${P.tileA}, ${P.tileB})`;
                tile.innerHTML = `${c.photo && this.faceUrl ? `<img src="${this.esc(this.faceUrl(c.photo))}" alt="">` : ''}${words.length ? `<b>${this.esc(ini)}</b>` : '<svg class="icon nl-ic"><use href="#i-bean"/></svg>'}`;
                const near = this.NL_COVER_HUES.reduce((a, h) => (Math.abs(((h - c.hue + 540) % 360) - 180) < Math.abs(((a - c.hue + 540) % 360) - 180) ? h : a), this.NL_COVER_HUES[0]);
                sw.innerHTML = this.NL_COVER_HUES.map(h => { const k = this.nlToneKey(h, 0.084), q = this.nlTonePal(k, this.nlDark()); return `<button type="button" role="radio" aria-checked="${h === near}" aria-label="Color ${h}" style="background:linear-gradient(145deg, ${q.tileA}, ${q.tileB})" onclick="app.pickCoverHue(${h}, '${app.escJs(ctx)}')"></button>`; }).join('');
                const photoBtn = document.getElementById(ids.photo), rm = document.getElementById(ids.rm);
                const canPhoto = !!(typeof Supa !== 'undefined' && Supa.ready && Supa.ready() && this.acctOn && this.acctOn());
                const busy = ctx === 'roaster' ? this._rcvBusy : this._bcvBusy;
                if (photoBtn) { photoBtn.hidden = !canPhoto; photoBtn.textContent = c.photo ? 'Change photo' : 'Add a photo'; photoBtn.disabled = !!busy; }
                if (rm) rm.hidden = !c.photo;
            },
            pickCoverHue(h, ctx = 'bean') {
                const key = ctx === 'roaster' ? '_rcv' : '_bcv';
                if (!this[key]) this[key] = { tone: 60, photo: '' };
                this[key].hue = h; this[key].tone = 60; this[key].picked = true;
                if (this.haptic) this.haptic('tick');
                this.paintBeanCover(ctx);
            },
            pickCoverPhoto(ctx = 'bean') { const i = document.getElementById(this.cvIds(ctx).input); if (i) { i.value = ''; i.click(); } },
            removeCoverPhoto(ctx = 'bean') { const st = this.cvState(ctx); if (st) { st.photo = ''; this.paintBeanCover(ctx); } },
            // the roaster editor's Picture (v17.5): starts on the roaster's saved picture, or the color its tile wears now
            roasterCoverInit(r) {
                const cov = r && r.info && r.info.cover;
                this._rcvName = r ? r.name : '';
                const guess = r ? (this.nlToneParts(this.famOfRoaster(r.name)) || {}).h : null;
                this._rcv = cov ? { hue: cov.hue, tone: cov.tone ?? 60, photo: cov.photo || '', picked: true } : { hue: guess ?? null, tone: 60, photo: '', picked: false };
                this._rcvStart = JSON.stringify(this.beanCoverOut('roaster'));
                this.paintBeanCover('roaster');
            },
            // a picked photo: the middle square, 480 px, as a JPEG, into your folder of public pictures; its main color becomes
            // the coffee's color (pick a swatch after to change it)
            async coverPhotoPicked(input, ctx = 'bean') {
                const file = input && input.files && input.files[0];
                if (input) input.value = '';
                if (!file) return;
                const s = typeof Supa !== 'undefined' ? Supa.session() : null;
                if (!s || !s.user) { this.showToast('Sign in first.'); return; }
                const stKey = ctx === 'roaster' ? '_rcv' : '_bcv', busyKey = ctx === 'roaster' ? '_rcvBusy' : '_bcvBusy';
                this[busyKey] = true; this.paintBeanCover(ctx);
                const btn = document.getElementById(this.cvIds(ctx).photo); if (btn) btn.textContent = 'Uploading…';
                try {
                    const img = await new Promise((ok, no) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('not a picture')); }; i.src = u; });
                    const side = Math.min(img.naturalWidth, img.naturalHeight), N = 480;
                    const c = document.createElement('canvas'); c.width = N; c.height = N;
                    const x = c.getContext('2d'); x.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, N, N);
                    const hue = this.nlPhotoHue(c);
                    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.86));
                    if (!blob) throw new Error('no picture');
                    const rand = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('');
                    const path = `${s.user.id}/c${rand}.jpg`;
                    await Supa.call('/storage/v1/object/avatars/' + path, blob, { headers: { 'Content-Type': 'image/jpeg' } });
                    if (!this[stKey]) this[stKey] = { tone: 60 };
                    this[stKey].photo = path;
                    if (hue) { this[stKey].hue = hue.h; this[stKey].tone = hue.tone; this[stKey].picked = true; }
                    this.showToast('Photo added. Save to keep it.');
                } catch (e) {
                    this.showToast(/not a picture|no picture/.test(String(e && e.message)) ? 'That file isn\'t a picture.' : 'Couldn\'t upload the photo. Check your connection.');
                } finally { this[busyKey] = false; this.paintBeanCover(ctx); }
            },
            // a photo's main color: the average of its more colorful pixels in OKLab (a grey photo gives a quiet color)
            nlPhotoHue(canvas) {
                try {
                    const n = 24, t = document.createElement('canvas'); t.width = n; t.height = n;
                    const x = t.getContext('2d'); x.drawImage(canvas, 0, 0, n, n);
                    const d = x.getImageData(0, 0, n, n).data;
                    let A = 0, B = 0, W = 0;
                    for (let i = 0; i < d.length; i += 4) { const hx = '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); const o = this.nlHexOk(hx); if (o.L < 0.15 || o.L > 0.97) continue; const w = o.C; A += w * o.C * Math.cos(o.h * Math.PI / 180); B += w * o.C * Math.sin(o.h * Math.PI / 180); W += w; }
                    if (!W) return null;
                    const h = ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360, C = Math.hypot(A, B) / W;
                    return { h: Math.round(h), tone: Math.round(Math.max(25, Math.min(90, (C - 0.012) / 0.12 * 100))) };
                } catch (e) { return null; }
            },
