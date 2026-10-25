        // Roasters (v13.0): everything about roasters, computed from the logged coffees and sessions each time it's asked for.
        // Plain functions, no DOM: the app calls RoasterEngine.build(app); node tests call it with a small stand-in.
        // ctx needs: beans (Map id -> bean), brews (Map id -> brew), gearByUser (Map user -> gear record),
        //            normalizeRating(v), localTime(v) (ms in the person's local time), getBrewOwner(brew), beanGroupKey(bean)
        const RoasterEngine = (() => {
            // ---- names
            const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
            const keyOf = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
            const GENERIC = new Set(['roasters', 'roaster', 'roastery', 'roasting', 'roastworks', 'coffee', 'coffees', 'tea', 'teas', 'co', 'company', 'collective', 'the', 'and', '&']);   // (v17.0: "tea" too, for brands)
            const words = name => fold(name).toLowerCase().replace(/[()]/g, ' ').split(/[^a-z0-9\u{1F1E6}-\u{1F1FF}]+/u).filter(Boolean);
            const core = name => words(name).filter(w => !GENERIC.has(w)).join(' ');
            const squash = name => fold(name).toLowerCase().replace(/[^a-z0-9]/g, '');
            const initials = name => words(name).map(w => w[0]).join('');

            // ---- countries (coffee-growing), with other spellings and a few well-known regions
            const COUNTRIES = ['Angola', 'Bolivia', 'Brazil', 'Burundi', 'Cameroon', 'Central African Republic', 'China', 'Colombia', 'Costa Rica', 'Cuba', 'DR Congo', 'Dominican Republic', 'Ecuador', 'El Salvador', 'Ethiopia', 'Guatemala', 'Guinea', 'Haiti', 'Hawaii', 'Honduras', 'India', 'Indonesia', 'Ivory Coast', 'Jamaica', 'Kenya', 'Laos', 'Madagascar', 'Malawi', 'Mexico', 'Myanmar', 'Nepal', 'Nicaragua', 'Panama', 'Papua New Guinea', 'Peru', 'Philippines', 'Puerto Rico', 'Rwanda', 'Sierra Leone', 'Sri Lanka', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Uganda', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe', 'Taiwan', 'Australia', 'Paraguay', 'Ghana', 'Nigeria', 'Liberia', 'Gabon', 'Benin', 'Mozambique', 'South Sudan', 'Sudan', 'Congo', 'Equatorial Guinea', 'Saint Helena', 'Galapagos', 'Trinidad and Tobago', 'Malaysia', 'Cambodia', 'Japan', 'United States', 'Belize', 'Guyana', 'Suriname', 'Burkina Faso', 'Mali', 'Senegal', 'Comoros', 'Mauritius', 'Reunion', 'Samoa', 'Fiji', 'Vanuatu', 'Solomon Islands', 'Tonga', 'New Caledonia', 'South Korea', 'Georgia', 'Turkey', 'Iran', 'Argentina'];
            const OTHER = { brasil: 'Brazil', columbia: 'Colombia', 'cote divoire': 'Ivory Coast', 'cote d ivoire': 'Ivory Coast', drc: 'DR Congo', 'dr congo': 'DR Congo', 'democratic republic of the congo': 'DR Congo', 'democratic republic of congo': 'DR Congo', 'east timor': 'Timor-Leste', 'timor leste': 'Timor-Leste', timor: 'Timor-Leste', png: 'Papua New Guinea', 'viet nam': 'Vietnam', burma: 'Myanmar', usa: 'United States', 'u s': 'United States', 'united states of america': 'United States', mejico: 'Mexico', 'el salvadore': 'El Salvador', salvador: 'El Salvador', ethopia: 'Ethiopia', ethiopa: 'Ethiopia', guatamala: 'Guatemala', cameron: 'Cameroon', hondouras: 'Honduras', kenia: 'Kenya', peru: 'Peru',
                // what a coffee from there is called ("Colombian", "Ethiopian") (v13.2)
                bolivian: 'Bolivia', brazilian: 'Brazil', burundian: 'Burundi', burundi: 'Burundi', cameroonian: 'Cameroon', chinese: 'China', colombian: 'Colombia', columbian: 'Colombia', 'costa rican': 'Costa Rica', cuban: 'Cuba', congolese: 'DR Congo', dominican: 'Dominican Republic', ecuadorian: 'Ecuador', ecuadoran: 'Ecuador', salvadoran: 'El Salvador', salvadorian: 'El Salvador', ethiopian: 'Ethiopia', guatemalan: 'Guatemala', haitian: 'Haiti', hawaiian: 'Hawaii', honduran: 'Honduras', indian: 'India', indonesian: 'Indonesia', sumatran: 'Indonesia', javanese: 'Indonesia', jamaican: 'Jamaica', kenyan: 'Kenya', malawian: 'Malawi', mexican: 'Mexico', nicaraguan: 'Nicaragua', panamanian: 'Panama', 'papua new guinean': 'Papua New Guinea', peruvian: 'Peru', filipino: 'Philippines', 'puerto rican': 'Puerto Rico', rwandan: 'Rwanda', tanzanian: 'Tanzania', thai: 'Thailand', ugandan: 'Uganda', venezuelan: 'Venezuela', vietnamese: 'Vietnam', yemeni: 'Yemen', yemenite: 'Yemen', zambian: 'Zambia', zimbabwean: 'Zimbabwe', taiwanese: 'Taiwan', australian: 'Australia', nepalese: 'Nepal', nepali: 'Nepal', laotian: 'Laos', burmese: 'Myanmar',
                // regions people write instead of the country
                sumatra: 'Indonesia', java: 'Indonesia', sulawesi: 'Indonesia', bali: 'Indonesia', flores: 'Indonesia', aceh: 'Indonesia', toraja: 'Indonesia',
                yirgacheffe: 'Ethiopia', yirgachefe: 'Ethiopia', sidamo: 'Ethiopia', sidama: 'Ethiopia', guji: 'Ethiopia', harrar: 'Ethiopia', harar: 'Ethiopia', limu: 'Ethiopia', jimma: 'Ethiopia', gedeo: 'Ethiopia',
                huila: 'Colombia', narino: 'Colombia', cauca: 'Colombia', tolima: 'Colombia', antioquia: 'Colombia', quindio: 'Colombia', santander: 'Colombia',
                huehuetenango: 'Guatemala', acatenango: 'Guatemala', atitlan: 'Guatemala', tarrazu: 'Costa Rica', 'west valley': 'Costa Rica', cerrado: 'Brazil', 'minas gerais': 'Brazil', mogiana: 'Brazil', 'sul de minas': 'Brazil',
                nyeri: 'Kenya', kirinyaga: 'Kenya', embu: 'Kenya', kiambu: 'Kenya', kona: 'Hawaii', 'big island': 'Hawaii', boquete: 'Panama', kivu: 'DR Congo', cajamarca: 'Peru', 'yunnan': 'China', 'chikmagalur': 'India', 'coorg': 'India',
                // v17.0: where teas come from
                korea: 'South Korea', korean: 'South Korea', jeju: 'South Korea', georgian: 'Georgia', turkish: 'Turkey', rize: 'Turkey', iranian: 'Iran', argentinian: 'Argentina', argentine: 'Argentina', misiones: 'Argentina',
                fujian: 'China', zhejiang: 'China', anhui: 'China', hangzhou: 'China', wuyi: 'China', anxi: 'China', guangdong: 'China', 'guizhou': 'China', sichuan: 'China', hunan: 'China',
                uji: 'Japan', shizuoka: 'Japan', kagoshima: 'Japan', yame: 'Japan', nishio: 'Japan', japanese: 'Japan', darjeeling: 'India', assam: 'India', nilgiri: 'India', alishan: 'Taiwan', nantou: 'Taiwan', 'li shan': 'Taiwan', lishan: 'Taiwan',
                ceylon: 'Sri Lanka', 'nuwara eliya': 'Sri Lanka', uva: 'Sri Lanka', 'sri lankan': 'Sri Lanka' };
            const COUNTRY_BY = {};
            COUNTRIES.forEach(c => { COUNTRY_BY[fold(c).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()] = c; });
            Object.entries(OTHER).forEach(([k, v]) => { COUNTRY_BY[k] = v; });
            const COUNTRY_KEYS = Object.keys(COUNTRY_BY).sort((a, b) => b.length - a.length);
            // one written part -> a country, or '' when it names none
            const countryIn = part => {
                const t = ' ' + fold(part).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
                for (const k of COUNTRY_KEYS) if (t.includes(' ' + k + ' ')) return COUNTRY_BY[k];
                return '';
            };
            const tidy = s => String(s || '').trim().replace(/\s+/g, ' ');
            const NOT_PLACE = /^(-+|n\/?a|none|unknown|\?+|tbd|blend|blends|house blend|espresso blend|various|varies|multiple|mixed|multi[- ]?origin|single[- ]?origin|world|several)$/i;
            // "Inzá, Colombia" -> [Colombia]; "Brasil, Guatemala, Ethiopia" -> 3 countries; "South America" -> ["South America"]
            const originsOf = text => {
                if (NOT_PLACE.test(tidy(text))) return [];
                const parts = String(text || '').split(/,|\/|&|\+|;|\band\b/i).map(tidy).filter(p => p && !NOT_PLACE.test(p));
                if (!parts.length) return [];
                const found = parts.map(countryIn);
                const named = found.filter(Boolean);
                if (!named.length) return [...new Set(parts)];          // no country named: as written ("South America")
                if (new Set(named).size === 1) return [named[0]];       // one country: the other parts are its region, farm, etc.
                // several countries: a part right before a country is that country's region ("Inzá, Colombia & Guji, Ethiopia");
                // any other part is kept as written ("Ethiopia, Kenya & Boliva" keeps Boliva)
                const out = parts.map((p, i) => found[i] || (found[i + 1] ? '' : p)).filter(Boolean);
                return [...new Set(out)];
            };

            // ---- roast and process
            const ROASTS = ['Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark'];
            const roastOf = v => {
                const t = fold(v).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
                if (!t) return '';
                if (/\bmedium (to )?light\b|\blight (to )?medium\b|\bmed light\b/.test(t)) return 'Medium-Light';
                if (/\bmedium (to )?dark\b|\bdark (to )?medium\b|\bmed dark\b/.test(t)) return 'Medium-Dark';
                if (/\b(extra |very )?light\b|\bcinnamon\b|\bnordic\b|\bblonde?\b/.test(t)) return 'Light';
                if (/\bdark\b|\bfrench\b|\bitalian\b/.test(t)) return 'Dark';
                if (/\bmedium\b|\bmed\b|\bcity\b/.test(t)) return 'Medium';
                return '';
            };
            const PROCESSES = ['Washed', 'Natural', 'Honey', 'Fermented', 'Anaerobic', 'Mixed'];
            // every process a written process counts toward ("Washed, Fermented" -> both)
            const processesOf = v => {
                const t = ' ' + fold(v).toLowerCase().replace(/[^a-z]+/g, ' ').trim() + ' ';
                if (!t.trim() || /^ (n a|none|unknown) $/.test(t)) return [];
                const out = [];
                if (/ (washed|wet|fully washed|semi washed|wet hulled|giling basah) /.test(t)) out.push('Washed');
                if (/ (natural|naturals|dry|sun dried|dry processed) /.test(t.replace(/ pulped natural /g, ' '))) out.push('Natural');   // v13.2: pulped natural is Honey
                if (/ (honey|honeys|pulped natural|miel) /.test(t)) out.push('Honey');
                if (/ (ferment|fermented|fermentation|co ferment|co fermented|cofermented|carbonic|maceration|macerated|thermal shock|koji|yeast|lactic|extended) /.test(t)) out.push('Fermented');
                if (/ (anaerobic|anaerobically|anoxic) /.test(t)) out.push('Anaerobic');
                if (/ (mixed|blend|various|multiple|assorted) /.test(t)) out.push('Mixed');
                if (out.length) return out;
                return [tidy(v).replace(/\b\w/g, c => c.toUpperCase())];   // unrecognized: as written
            };
            const PROC_WORD = { Washed: ['washed coffees', 'washed'], Natural: ['naturals', 'natural'], Honey: ['honeys', 'honey'], Fermented: ['fermented lots', 'fermented'], Anaerobic: ['anaerobic lots', 'anaerobic'], Mixed: ['mixed-process blends', 'mixed-process'] };
            const procNoun = p => (PROC_WORD[p] || [`${p.toLowerCase()} coffees`])[0];
            const procAdj = p => (PROC_WORD[p] || [null, p.toLowerCase()])[1];

            // ---- small helpers
            const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
            const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
            const fmtStar = n => { const v = Math.round(n * 2) / 2; return `${v % 1 ? v.toFixed(1) : v.toFixed(0)}★`; };
            const listAnd = a => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
            const numWord = n => ['No', 'One', 'Two', 'Three', 'Four'][n] || String(n);
            const hashHue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return [28, 18, 42, 8, 150, 168, 200, 330, 270, 95, 120, 352][h % 12]; };

            // ---- saved roaster records live in each person's gear record: { merged: [[a, b, at]], notSame: [[a, b, at]], fav: [key], local: [[key, at]], info: { key: { location, website, note, at } } }
            const prefsOf = (ctx, user) => { const g = ctx.gearByUser && ctx.gearByUser.get(String(user || '')); const r = g && g.roasters && typeof g.roasters === 'object' ? g.roasters : {}; return { merged: Array.isArray(r.merged) ? r.merged : [], notSame: Array.isArray(r.notSame) ? r.notSame : [], fav: Array.isArray(r.fav) ? r.fav : [], local: Array.isArray(r.local) ? r.local : [], localOff: Array.isArray(r.localOff) ? r.localOff : [], info: r.info && typeof r.info === 'object' ? r.info : {} }; };
            const allPrefs = ctx => [...(ctx.gearByUser ? ctx.gearByUser.keys() : [])].map(u => ({ user: u, ...prefsOf(ctx, u) }));

            function build(ctx) {
                const beans = [...ctx.beans.values()].filter(b => b && keyOf(b.roaster));
                const brews = [...ctx.brews.values()];
                const prefs = allPrefs(ctx);
                // spellings: the same name in any case / spacing is one roaster
                const spell = new Map();   // key -> { key, names: Map(name -> sessions), beans: [] }
                const byBean = new Map();
                beans.forEach(b => { const k = keyOf(b.roaster); if (!spell.has(k)) spell.set(k, { key: k, names: new Map(), beans: [] }); spell.get(k).beans.push(b); byBean.set(String(b.id), k); });
                const brewsOfKey = new Map();
                brews.forEach(br => { const k = byBean.get(String(br.beanId)); if (!k) return; if (!brewsOfKey.has(k)) brewsOfKey.set(k, []); brewsOfKey.get(k).push(br); });
                spell.forEach(s => { s.beans.forEach(b => { const n = tidy(b.roaster); s.names.set(n, (s.names.get(n) || 0) + 0.001); }); (brewsOfKey.get(s.key) || []).forEach(br => { const b = ctx.beans.get(String(br.beanId)); const n = tidy(b.roaster); s.names.set(n, (s.names.get(n) || 0) + 1); }); });
                // merges (anyone's) join spellings into one roaster
                const parent = new Map(); const find = k => { while (parent.has(k) && parent.get(k) !== k) k = parent.get(k); return k; };
                const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(b, a); };
                prefs.forEach(p => p.merged.forEach(m => { if (Array.isArray(m) && m[0] && m[1]) { const a = keyOf(m[0]), b = keyOf(m[1]); if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); union(a, b); } }));
                const clusterOf = k => find(keyOf(k));
                const clusters = new Map();
                spell.forEach(s => { const c = clusterOf(s.key); if (!clusters.has(c)) clusters.set(c, []); clusters.get(c).push(s); });
                const roasters = [...clusters.entries()].map(([ck, parts]) => roasterFrom(ctx, ck, parts, brewsOfKey));
                // the roaster each person brews most (ties: the one brewed more recently)
                const top = {};
                roasters.forEach(r => r.people.forEach(p => { const t = top[p.name]; if (!t || p.sessions > t.sessions || (p.sessions === t.sessions && p.last > t.last)) top[p.name] = { key: r.key, sessions: p.sessions, last: p.last }; }));
                roasters.forEach(r => r.people.forEach(p => { p.top = !!(top[p.name] && top[p.name].key === r.key); }));
                // favorites and details
                const favBy = {}; prefs.forEach(p => { favBy[p.user] = new Set(p.fav.map(clusterOf)); });
                // v15.8: each person's own "Local to me", with when they ticked it ([name, at]; a bare name counts from the start)
                const localSince = {}; prefs.forEach(p => { const m = new Map(); p.local.forEach(e => { const nm = Array.isArray(e) ? e[0] : e; if (!nm) return; const c = clusterOf(nm), at = Array.isArray(e) ? (Date.parse(e[1] || 0) || 0) : 0; m.set(c, m.has(c) ? Math.min(m.get(c), at) : at); }); localSince[p.user] = m; });
                const info = {}; prefs.forEach(p => Object.entries(p.info).forEach(([k, v]) => { if (!v || typeof v !== 'object') return; const c = clusterOf(k); const at = Date.parse(v.at || 0) || 0; if (!info[c] || at >= info[c].atMs) info[c] = { location: tidy(v.location), website: tidy(v.website), note: tidy(v.note), atMs: at }; }));
                roasters.forEach(r => { r.info = info[r.key] || null; r.favBy = Object.keys(favBy).filter(u => favBy[u].has(r.key)); r.localBy = Object.keys(localSince).filter(u => localSince[u].has(r.key)); r.localSince = Object.fromEntries(r.localBy.map(u => [u, localSince[u].get(r.key)])); });
                const byKey = new Map(roasters.map(r => [r.key, r]));
                // look-alike names that nobody has merged or said aren't the same
                const notSame = new Set(); prefs.forEach(p => p.notSame.forEach(m => { if (Array.isArray(m) && m[0] && m[1]) { const a = clusterOf(m[0]), b = clusterOf(m[1]); notSame.add(a < b ? `${a}|${b}` : `${b}|${a}`); } }));
                const suggestions = [];
                for (let i = 0; i < roasters.length; i++) for (let j = i + 1; j < roasters.length; j++) {
                    const a = roasters[i], b = roasters[j];
                    const pair = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
                    if (notSame.has(pair) || !looksSame(a, b)) continue;
                    const [big, small] = a.sessions >= b.sessions ? [a, b] : [b, a];
                    suggestions.push({ a: big, b: small, keys: [big.key, small.key], weight: a.sessions + b.sessions });
                }
                suggestions.sort((x, y) => y.weight - x.weight);
                return { roasters, byKey, clusterOf: name => clusterOf(name), suggestions, keyOfBean: b => b ? clusterOf(b.roaster) : '' };
            }

            // two roasters whose names look like the same roaster
            function looksSame(a, b) {
                const names = r => r.spellings.length ? r.spellings : [r.name];
                for (const x of names(a)) for (const y of names(b)) {
                    const sx = squash(x), sy = squash(y);
                    if (sx && sx === sy) return true;                                   // case, spacing, punctuation
                    const cx = core(x), cy = core(y);
                    if (cx && cy && cx === cy && cx.replace(/\s/g, '').length >= 3) return true;   // "Urbana" vs "Urbana Roasters"
                    const wx = ` ${words(x).join(' ')} `, wy = ` ${words(y).join(' ')} `;
                    const [shortW, longW] = wx.length < wy.length ? [wx, wy] : [wy, wx];
                    if (shortW.trim().length >= 4 && longW.includes(shortW)) return true;          // one name inside the other, whole words
                    const ix = initials(x), iy = initials(y), tx = squash(x), ty = squash(y);       // "DRC" vs "Deeper Roots Coffee"
                    if (words(y).length >= 2 && tx.length >= 2 && tx.length <= 5 && words(x).length === 1 && tx === iy) return true;
                    if (words(x).length >= 2 && ty.length >= 2 && ty.length <= 5 && words(y).length === 1 && ty === ix) return true;
                }
                return false;
            }

            function roasterFrom(ctx, key, parts, brewsOfKey) {
                const beans = parts.flatMap(p => p.beans);
                const brews = parts.flatMap(p => brewsOfKey.get(p.key) || []);
                const nameTally = new Map(); parts.forEach(p => p.names.forEach((n, nm) => nameTally.set(nm, (nameTally.get(nm) || 0) + n)));
                const spellings = [...nameTally.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
                const name = spellings[0] || key;
                const rating = br => ctx.normalizeRating(br.rating);
                const rated = brews.map(rating).filter(r => r > 0);
                const beanOf = br => ctx.beans.get(String(br.beanId));
                const t = br => ctx.localTime(br.date);
                // coffees: the same name from this roaster is one coffee, whoever logged it
                const cof = new Map();
                beans.forEach(b => { const ck = keyOf(b.name) || String(b.id); if (!cof.has(ck)) cof.set(ck, { key: ck, name: tidy(b.name) || 'Coffee', beanIds: [], brews: [], latest: 0, origin: '', process: '', roast: '' }); const c = cof.get(ck); c.beanIds.push(String(b.id)); const bt = ctx.localTime(b.date) || 0; if (bt >= c.latest || !c.origin) { if (tidy(b.origin)) c.origin = tidy(b.origin); if (tidy(b.process)) c.process = tidy(b.process); if (tidy(b.roast)) c.roast = tidy(b.roast); c.latest = Math.max(c.latest, bt); } });
                const cofOfBean = new Map(); cof.forEach(c => c.beanIds.forEach(id => cofOfBean.set(id, c)));
                brews.forEach(br => { const c = cofOfBean.get(String(br.beanId)); if (c) c.brews.push(br); });
                const coffees = [...cof.values()].map(c => { const r = c.brews.map(rating).filter(x => x > 0); const last = c.brews.reduce((m, br) => Math.max(m, t(br) || 0), 0);
                    // open the coffee page on the version people brew most (a coffee logged by two people opens their shared page anyway)
                    const tally = new Map(); c.brews.forEach(br => tally.set(String(br.beanId), (tally.get(String(br.beanId)) || 0) + 1));
                    const beanId = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || c.beanIds[0];
                    return { key: c.key, name: c.name, beanId, beanIds: c.beanIds, sessions: c.brews.length, rated: r.length, avg: mean(r), last, origin: c.origin, process: c.process, roast: c.roast, origins: originsOf(c.origin), processes: processesOf(c.process), roastLevel: roastOf(c.roast) }; });
                // best-rated first (ties: more sessions); coffees nobody rated go last
                coffees.sort((a, b) => (b.rated > 0) - (a.rated > 0) || b.avg - a.avg || b.sessions - a.sessions || a.name.localeCompare(b.name));
                const coffeeById = new Map(); coffees.forEach(c => c.beanIds.forEach(id => coffeeById.set(id, c)));
                const coffeeOfBrew = br => coffeeById.get(String(br.beanId));
                // what a session counts toward comes from its own coffee record, exactly as that person logged it
                const recs = new Map();
                const recOf = br => { const id = String(br.beanId); if (!recs.has(id)) { const b = ctx.beans.get(id) || {}; recs.set(id, { origins: originsOf(b.origin), processes: processesOf(b.process), roastLevel: roastOf(b.roast) }); } return recs.get(id); };
                // people
                const ppl = new Map();
                brews.forEach(br => { const n = ctx.getBrewOwner(br); if (!ppl.has(n)) ppl.set(n, { name: n, sessions: 0, ratings: [], last: 0 }); const p = ppl.get(n); p.sessions++; const r = rating(br); if (r > 0) p.ratings.push(r); p.last = Math.max(p.last, t(br) || 0); });
                const people = [...ppl.values()].map(p => ({ name: p.name, sessions: p.sessions, rated: p.ratings.length, avg: mean(p.ratings), last: p.last })).sort((a, b) => b.sessions - a.sessions || b.last - a.last || a.name.localeCompare(b.name));
                const loggers = [...new Set(beans.map(b => String(b.user || b.owner || '').trim()).filter(Boolean))];
                // roast and process, in sessions
                const roast = {}; const proc = {};
                brews.forEach(br => { const c = recOf(br); if (c.roastLevel) roast[c.roastLevel] = (roast[c.roastLevel] || 0) + 1; c.processes.forEach(p => { proc[p] = (proc[p] || 0) + 1; }); });
                // best shot: highest rated (ties: most recent)
                const best = brews.filter(br => rating(br) > 0).sort((a, b) => rating(b) - rating(a) || (t(b) || 0) - (t(a) || 0))[0] || null;
                // espresso: the group's 4★+ shots
                const shots = brews.filter(br => String(br.method || '') === 'Espresso' && rating(br) >= 4);
                const ratios = shots.map(br => { const d = +br.dose, y = +br.yield; return d > 0 && y > 0 ? y / d : 0; }).filter(Boolean);
                const times = shots.map(br => +br.time).filter(x => x > 0);
                const espresso = shots.length >= 2 && (ratios.length >= 2 || times.length >= 2) ? { shots: shots.length, ratio: ratios.length ? [Math.min(...ratios), Math.max(...ratios)] : null, time: times.length ? [Math.min(...times), Math.max(...times)] : null } : null;
                const last = brews.reduce((m, br) => Math.max(m, t(br) || 0), 0);
                const r = { key, name, spellings, beans, brews, coffees, people, loggers, sessions: brews.length, rated: rated.length, avg: mean(rated), last, roast, proc, best, bestCoffee: best ? coffeeOfBrew(best) : null, espresso, hue: hashHue(key) };
                r.style = houseStyle(r, rating, recOf);
                return r;
            }

            // ---- the three-sentence description, from the data (no AI)
            function houseStyle(r, rating, recOf) {
                const out = [];
                const total = r.sessions;
                // 1. roast + process
                const roastE = ROASTS.map(l => [l, r.roast[l] || 0]).filter(e => e[1] > 0);
                const roastN = roastE.reduce((s, e) => s + e[1], 0);
                let roastAdj = '';
                if (roastN) {
                    const topR = [...roastE].sort((a, b) => b[1] - a[1])[0];
                    const low = s => s.toLowerCase();
                    const cap = s => s.charAt(0).toUpperCase() + low(s).slice(1);
                    if (topR[1] / roastN >= 0.95) roastAdj = cap(topR[0]);
                    else if (topR[1] / roastN >= 0.7) roastAdj = `Mostly ${low(topR[0])}`;
                    else roastAdj = `${cap(roastE[0][0])}-to-${low(roastE[roastE.length - 1][0])}`;
                }
                // processes ranked by sessions x average rating
                const procStats = statsBy(r.brews, br => recOf(br).processes, rating);
                const procTotal = r.brews.filter(br => recOf(br).processes.length).length;   // v13.2: sessions with a process (a "Washed, Fermented" session counts fully toward both)
                const share = p => procTotal ? p.sessions / procTotal : 0;
                const byScore = [...procStats].sort(byRank);
                const bySessions = [...procStats].sort((a, b) => b.sessions - a.sessions || b.score - a.score);
                const originStats = statsBy(r.brews, br => recOf(br).origins, rating);
                const noOrigins = !originStats.length;
                let s1 = '';
                const roastWord = roastAdj ? `${roastAdj} roasts` : 'Roasts';
                if (bySessions.length && share(bySessions[0]) >= 0.9) { const pa = listAnd(bySessions.filter(p => share(p) >= 0.9).map(p => procAdj(p.key))); s1 = roastAdj ? `${roastAdj}, ${pa} coffees` : `${pa.charAt(0).toUpperCase() + pa.slice(1)} coffees`; }
                else if (bySessions.length && share(bySessions[0]) >= 0.6) { const rest = byScore.filter(p => p.key !== bySessions[0].key && share(p) >= 0.1).slice(0, 2).map(p => procAdj(p.key)); const tail = rest.length ? `, with some ${listAnd(rest)} lots` : ''; s1 = roastAdj ? `${roastWord}, mostly ${procAdj(bySessions[0].key)}${tail}` : `Mostly ${procAdj(bySessions[0].key)} coffees${tail}`; }
                else if (byScore.length) { const list = listAnd(byScore.slice(0, 3).map(p => procAdj(p.key))); s1 = roastAdj ? `${roastWord} that range across ${list} lots` : `A mix of ${list} lots`; }
                else if (roastAdj) s1 = roastWord;
                if (s1) out.push(s1 + (noOrigins && total ? '; origins not logged yet.' : '.'));
                else if (noOrigins && total) out.push('Origins not logged yet.');
                // 2. origins, blends split into their countries
                if (!noOrigins) {
                    const ranked = [...originStats].sort(byRank);
                    const blends = r.coffees.filter(c => c.sessions > 0 && c.origins.length > 1);
                    const brewedCoffees = r.coffees.filter(c => c.sessions > 0);
                    if (ranked.length === 1) out.push(s1 ? `All from ${ranked[0].key} so far.` : `All from ${ranked[0].key} so far.`);
                    else if (brewedCoffees.length === 1 && blends.length === 1) out.push(`Blended from ${listAnd(blends[0].origins)}.`);
                    else { const more = ranked.length - 3; const follow = ranked.slice(1, 3).map(x => x.key); out.push(`${ranked[0].key} leads, followed by ${more > 0 ? `${follow.join(', ')} and ${more} more` : listAnd(follow)}.`); }
                }
                // 3. one finding
                out.push(finding(r, rating, procStats, originStats));
                return out.filter(Boolean).join(' ');
            }

            // most brewed AND best rated: score = sessions x average; an exact tie goes to the better-rated one
            const byRank = (a, b) => Math.round(b.score * 1e6) - Math.round(a.score * 1e6) || b.avg - a.avg || b.sessions - a.sessions || a.key.localeCompare(b.key);

            // sessions, rated, average and score (sessions x average) for each value a session counts toward
            function statsBy(brews, keysOf, rating) {
                const m = new Map();
                brews.forEach(br => { [...new Set(keysOf(br))].forEach(k => { if (!m.has(k)) m.set(k, { key: k, sessions: 0, ratings: [] }); const x = m.get(k); x.sessions++; const r = rating(br); if (r > 0) x.ratings.push(r); }); });
                return [...m.values()].map(x => { const avg = mean(x.ratings); return { key: x.key, sessions: x.sessions, rated: x.ratings.length, avg, score: x.sessions * avg }; });
            }

            function finding(r, rating, procStats, originStats) {
                const total = r.sessions;
                if (!total) return 'No sessions yet.';
                if (total < 3) {
                    if (total === 1) { const br = r.brews[0], c = r.coffees.find(x => x.sessions); const rr = rating(br); return `One session so far: ${c ? c.name : 'one coffee'}${rr ? `, ${fmtStar(rr)}` : ''}.`; }
                    return `Two sessions so far${r.rated ? `, averaging ${f1(r.avg)}★` : ''}.`;
                }
                const MIN = 5;
                const cands = [];
                const consider = (stats, kind) => {
                    const base = [...stats].sort((a, b) => b.sessions - a.sessions || b.score - a.score)[0];
                    if (!base || base.rated < MIN || base.sessions < MIN) return;
                    stats.forEach(x => { if (x.key === base.key || x.rated < MIN) return; cands.push({ kind, x, base, gap: x.avg - base.avg }); });
                };
                consider(procStats, 'process'); consider(originStats, 'origin');
                const noun = c => c.kind === 'process' ? procNoun(c.x.key) : `coffees from ${c.x.key}`;
                const adj = c => c.kind === 'process' ? procAdj(c.base.key) : `from ${c.base.key}`;
                const up = cands.filter(c => c.gap >= 0.3 - 1e-9).sort((a, b) => b.gap - a.gap)[0];
                if (up) return `Their ${noun(up)} shine brightest (${f1(up.x.avg)}★ vs ${f1(up.base.avg)}★ ${adj(up)}).`;
                const down = cands.filter(c => c.gap <= -0.5 + 1e-9).sort((a, b) => a.gap - b.gap)[0];
                if (down) return `Their ${noun(down)} trail the rest (${f1(down.x.avg)}★ vs ${f1(down.base.avg)}★ ${adj(down)}).`;
                const brewed = r.coffees.filter(c => c.sessions > 0);
                const solid = brewed.filter(c => c.rated >= MIN).sort((a, b) => b.avg - a.avg || b.sessions - a.sessions);
                if (brewed.length > 1 && solid.length) return `${solid[0].name} is their standout so far (${f1(solid[0].avg)}★ over ${solid[0].sessions} sessions).`;
                const most = [...brewed].sort((a, b) => b.sessions - a.sessions || b.avg - a.avg)[0];
                if (most && most.rated) return `${most.name} averages ${f1(most.avg)}★ over ${most.sessions} session${most.sessions === 1 ? '' : 's'}.`;
                return `${numWord(total)} sessions so far.`;
            }

            return { build, keyOf, originsOf, processesOf, roastOf, looksSame, ROASTS, PROCESSES, fmtStar, f1, hashHue, prefsOf };
        })();


