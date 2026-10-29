        // Learn (v20.0): coffee's family tree, and each variety's family line. Plain functions that return SVG and HTML
        // strings: no DOM and no app state (the app passes in names, what you've logged and what has a page).
        //   LearnTree.draw(mode, ctx)  -> { svg, bounds, BOX, labels, paths, nodes } for 'simple' (the names on most bags) or 'every'
        //   LearnTree.line(id, ctx)    -> a variety's family line, Wild Ethiopia down to it, with "maybe" forks where it isn't settled
        //   LearnTree.defs()           -> the gradients the drawings use (put once in the page)
        // The family (who grows from whom) follows the research in claude/learn-page-status.md, fact-checked Oct 28 2026.
        const LearnTree = (function () {
            // ================= the drawing kit: coffee leaves, cherries, blossoms, grass, branches =================
            // Kept light for a phone: a leaf is two shapes (the two halves either side of the midrib, one a shade darker).
            let rnd = 1;
            const R = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };
            const seed = s => { rnd = 1 + (s * 7919) % 2147483646; };
            const i0 = v => String(Math.round(v)), f1 = v => (Math.round(v * 10) / 10).toString();
            // a coffee leaf, 100 long: widest a little before the middle, a drawn-out tip; three widths
            const RATIOS = [0.15, 0.19, 0.24];
            const UP = RATIOS.map(r => { const W = 100 * r; return `M0 0C15 ${f1(-W)} 45 ${f1(-W * 1.05)} 70 ${f1(-W * 0.7)}C85 ${f1(-W * 0.42)} 96 ${f1(-W * 0.1)} 100 0Z`; });
            const DN = RATIOS.map(r => { const W = 100 * r * 0.92; return `M0 0C15 ${f1(W)} 45 ${f1(W * 1.05)} 70 ${f1(W * 0.7)}C85 ${f1(W * 0.42)} 96 ${f1(W * 0.1)} 100 0Z`; });
            const WHOLE = RATIOS.map(r => { const W = 100 * r; return `M0 0C15 ${f1(-W)} 45 ${f1(-W * 1.05)} 70 ${f1(-W * 0.7)}C85 ${f1(-W * 0.42)} 96 ${f1(-W * 0.1)} 100 0C96 ${f1(W * 0.09)} 85 ${f1(W * 0.39)} 70 ${f1(W * 0.64)}C45 ${f1(W * 0.97)} 15 ${f1(W * 0.92)} 0 0Z`; });
            const ri = ratio => ratio < 0.17 ? 0 : ratio < 0.215 ? 1 : 2;
            function leaf(x, y, ang, L, o = {}) {
                const tone = o.tone == null ? Math.floor(R() * 3) : o.tone, a = ang + (o.bend == null ? (R() - 0.5) * 10 : o.bend), k = ri(o.ratio || 0.19);
                const t = `translate(${i0(x)} ${i0(y)})rotate(${i0(a)})scale(${(L / 100).toFixed(2)})`;
                return `<path d="${UP[k]}" transform="${t}" class="lu${tone}"/><path d="${DN[k]}" transform="${t}" class="ld${tone}"/>`;
            }
            // a background leaf: the whole shape in one flat tone, cheap to draw in hundreds
            function leafLite(x, y, ang, L, tone = 'd', ratio = 0.19) {
                return `<path d="${WHOLE[ri(ratio)]}" transform="translate(${i0(x)} ${i0(y)})rotate(${i0(ang)})scale(${(L / 100).toFixed(2)})" class="lb${tone}"/>`;
            }
            // cherries grow in tight clusters where the leaves meet the branch
            function cherries(x, y, n = 4, r = 9, o = {}) {
                let s = ''; const ripe = o.ripe || 'r';
                const spots = [[0, 0], [-1.5, -0.9], [1.4, -1], [-0.2, -1.9], [1.9, 0.6], [-1.9, 0.5]].slice(0, n);
                spots.sort((a, b) => a[1] - b[1]).forEach(([dx, dy]) => { const cx = x + dx * r, cy = y + dy * r, rr = r * (0.92 + R() * 0.16); s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr)}" fill="url(#lxchg${ripe})"/><circle cx="${f1(cx - rr * 0.35)}" cy="${f1(cy - rr * 0.38)}" r="${f1(rr * 0.22)}" class="chl"/>`; });
                return s;
            }
            function blossom(x, y, r = 7, n = 4) {
                let s = '';
                for (let i = 0; i < n; i++) {
                    const cx = x + (R() - 0.5) * r * 3.2, cy = y + (R() - 0.5) * r * 2.2, rot = R() * 72;
                    let pet = ''; for (let j = 0; j < 5; j++) pet += `<ellipse cy="${f1(-r * 0.62)}" rx="${f1(r * 0.3)}" ry="${f1(r * 0.62)}" transform="rotate(${j * 72})"/>`;
                    s += `<g class="bl" transform="translate(${i0(cx)} ${i0(cy)})rotate(${i0(rot)})">${pet}<circle r="${f1(r * 0.2)}" class="blc"/></g>`;
                }
                return s;
            }
            function grass(x, y, h = 30, n = 5) { let s = 'M'; const parts = []; for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.32 + (R() - 0.5) * 0.2, hh = h * (0.6 + R() * 0.6); parts.push(`${i0(x + i * 3)} ${i0(y)}Q${i0(x + i * 3 + Math.sin(a) * hh * 0.5)} ${i0(y - hh * 0.6)} ${i0(x + i * 3 + Math.sin(a) * hh)} ${i0(y - hh)}`); } return `<path d="${s}${parts.join('M')}" class="gr"/>`; }
            const bez = (p, t) => { const m = 1 - t; return [m * m * m * p[0] + 3 * m * m * t * p[2] + 3 * m * t * t * p[4] + t * t * t * p[6], m * m * m * p[1] + 3 * m * m * t * p[3] + 3 * m * t * t * p[5] + t * t * t * p[7]]; };
            const bezd = (p, t) => { const m = 1 - t; return [3 * m * m * (p[2] - p[0]) + 6 * m * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]), 3 * m * m * (p[3] - p[1]) + 6 * m * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5])]; };
            // a branch: a tapering shape along a curve, with a lighter line down its lit side
            function stem(p, w0, w1, cls = 'bark', fc = '') {
                const N = 18, L = [], Rr = [], hl = [];
                for (let i = 0; i <= N; i++) { const t = i / N, [x, y] = bez(p, t), [dx, dy] = bezd(p, t), l = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2, nx = -dy / l * w, ny = dx / l * w; L.push([x + nx, y + ny]); Rr.push([x - nx, y - ny]); if (i > 1 && i < N - 1) hl.push([x - nx * 0.45, y - ny * 0.45]); }
                const d = 'M' + L.map(q => q.map(i0).join(' ')).join('L') + 'L' + Rr.reverse().map(q => q.map(i0).join(' ')).join('L') + 'Z';
                return `<path d="${d}" class="${cls}${fc ? ' fc" style="--fc:' + fc : ''}"/><path d="M${hl.map(q => q.map(i0).join(' ')).join('L')}" class="barkhl" style="stroke-width:${f1(Math.max(1, Math.min(w0, 30) * 0.18))}"/>`;
            }
            function defs() {
                const g = (id, a, b, c) => `<radialGradient id="${id}" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
                return `<defs>${g('lxchgr', '#f06a55', '#c82e24', '#7d1612')}${g('lxchgy', '#ffe07a', '#e2ad2a', '#9a6a0e')}${g('lxchgg', '#b8d88a', '#7aa548', '#4b6c29')}${g('lxchgp', '#f7a6b4', '#d9687f', '#93364b')}${g('lxchgo', '#ffb46a', '#e57a2a', '#9a4a0e')}</defs>`;
            }

            // ================= the family: who grows from whom =================
            // the branch each variety grows from (its main parent). Groups: W wild Ethiopia, SEL research picks, AB Ethiopians abroad, Y Yemen
            const MAIN = {
                W: 'arabica', Y: 'arabica',
                'ethiopian-landrace': 'W', kurume: 'ethiopian-landrace', wolisho: 'ethiopian-landrace', 'wush-wush': 'ethiopian-landrace',
                SEL: 'W', 74110: 'SEL', 74112: 'SEL', 74140: 'SEL', 74148: 'SEL', 74158: 'SEL', 74165: 'SEL', 75227: 'SEL',
                gesha: 'W', 'gesha-1931': 'W', 'gori-gesha': 'W', 'rume-sudan': 'W',
                AB: 'W', java: 'AB', 'pink-bourbon': 'AB', sidra: 'AB', 'bourbon-aji': 'AB', chiroso: 'AB', papayo: 'AB', 'orange-bourbon': 'AB', 'typica-mejorado': 'AB',
                yemenia: 'Y', udaini: 'yemenia', tufahi: 'yemenia', dawairi: 'yemenia', jaadi: 'yemenia',
                bourbon: 'Y', 'yellow-bourbon': 'bourbon', 'french-mission': 'bourbon', k7: 'french-mission', sl28: 'bourbon', batian: 'sl28', jackson: 'bourbon', bm139: 'bourbon', laurina: 'bourbon', tekisic: 'bourbon', kent: 'bourbon', s795: 'kent',
                caturra: 'bourbon', pacas: 'bourbon', 'villa-sarchi': 'bourbon', villalobos: 'villa-sarchi', 'mundo-novo': 'bourbon', icatu: 'bourbon',
                catuai: 'caturra', casiopea: 'caturra', h3: 'caturra', catucai: 'catuai', pacamara: 'pacas',
                typica: 'Y', 'blue-mountain': 'typica', maragogipe: 'typica', pache: 'typica', mibirizi: 'typica', sl14: 'typica', sl34: 'typica',
                'timor-hybrid': 'typica', catimor: 'timor-hybrid', sarchimor: 'timor-hybrid', tabi: 'timor-hybrid', 'sigarar-utang': 'timor-hybrid', 'sln-9': 'timor-hybrid', paraiso: 'timor-hybrid', catigua: 'timor-hybrid',
                'colombia-var': 'catimor', castillo: 'catimor', 'cenicafe-1': 'catimor', 'costa-rica-95': 'catimor', lempira: 'catimor', 'ihcafe-90': 'catimor', catisic: 'catimor', 'oro-azteca': 'catimor', 'anacafe-14': 'catimor', ateng: 'catimor', andungsari: 'catimor', evaluna: 'catimor', nayarita: 'catimor', mundomex: 'catimor', 'ruiru-11': 'catimor',
                parainema: 'sarchimor', marsellesa: 'sarchimor', starmaya: 'marsellesa', cuscatleco: 'sarchimor', obata: 'sarchimor', arara: 'obata', tupi: 'sarchimor', 'iapar-59': 'sarchimor', 'ipr-107': 'iapar-59', limani: 'sarchimor', chandragiri: 'sarchimor', centroamericano: 'sarchimor', 'mundo-maya': 'sarchimor', milenio: 'sarchimor', esperanza: 'sarchimor',
            };
            // a second parent, for crosses. ET is a wild Ethiopian tree from a research collection.
            const SECOND = { 'timor-hybrid': 'robusta', icatu: 'robusta', catimor: 'caturra', sarchimor: 'villa-sarchi', catuai: 'mundo-novo', 'mundo-novo': 'typica', pacamara: 'maragogipe', paraiso: 'catuai', catigua: 'catuai', arara: 'catuai', catucai: 'icatu', 'ipr-107': 'mundo-novo', 'anacafe-14': 'pacamara', tabi: 'bourbon', batian: 'timor-hybrid', 'ruiru-11': 'sl28', 'sln-9': 'ethiopian-landrace', s795: 'S288', centroamericano: 'rume-sudan', milenio: 'rume-sudan', 'mundo-maya': 'ET', esperanza: 'ETL', evaluna: 'ETL', nayarita: 'ET', mundomex: 'ET', casiopea: 'ET', h3: 'ETL', starmaya: 'ET' };
            const ALSO = { 'sigarar-utang': 'the other parent may be Typica or Bourbon', 'ruiru-11': 'with K7, Rume Sudan and others', icatu: 'then crossed back to Mundo Novo', tabi: 'also Typica', s795: 'S288 has some Liberica in it', arara: 'some sources say Icatu, not Catuaí', 'yellow-bourbon': 'or a cross with a yellow Typica, Amarelo de Botucatu' };
            // where the family isn't settled: the possible parents, each with why
            const ALT = {
                kent: [{ id: 'bourbon', note: 'WCR: Bourbon-related' }, { id: 'typica', note: 'other sources: a Typica' }],
                villalobos: [{ id: 'villa-sarchi', note: 'WCR: another name for it' }, { id: 'typica', note: 'Cafe Imports: a dwarf Typica mutation' }],
                'typica-mejorado': [{ id: 'typica', note: 'by its name' }, { name: 'Bourbon × an Ethiopian landrace', note: 'DNA fingerprinting, as importers report' }],
                'monte-claro': [{ name: 'Its cross isn’t published', note: 'bred in Venezuela for rust tolerance' }],
                sidra: [{ id: 'ethiopian-landrace', note: 'DNA tests; a 2026 study, one farm' }, { name: 'Typica × Bourbon', from: 'Y', note: 'how it’s usually sold' }],
                'bourbon-aji': [{ id: 'ethiopian-landrace', note: 'reported genetic tests' }, { id: 'bourbon', note: 'by its name' }],
                papayo: [{ id: 'ethiopian-landrace', note: 'some tests' }, { id: 'castillo', note: 'other tests' }, { id: 'caturra', note: 'first thought a mutation' }],
                'orange-bourbon': [{ id: 'pink-bourbon', note: 'one DNA test, 2023' }, { id: 'bourbon', note: 'by its name' }],
                chiroso: [{ id: 'ethiopian-landrace', note: 'early DNA work' }, { id: 'caturra', note: 'long taken for a mutation' }],
                udaini: [{ id: 'yemenia', note: 'most trees' }, { name: 'Typica–Bourbon types', from: 'Y', note: 'some trees' }, { id: 'sl34', note: 'some trees' }],
                tufahi: [{ id: 'yemenia', note: 'some trees' }, { name: 'Typica–Bourbon types', from: 'Y', note: 'some trees' }, { id: 'sl34', note: 'some trees' }],
                jaadi: [{ id: 'yemenia', note: 'most trees' }, { name: 'Typica–Bourbon types', from: 'Y', note: 'a few' }, { id: 'sl34', note: 'a few' }],
                dawairi: [{ id: 'yemenia', note: 'most trees' }, { name: 'Typica–Bourbon types', from: 'Y', note: 'a few' }],
            };
            const UNSURE = new Set(Object.keys(ALT));
            // the small print under each name: when it was found, selected or released, and how it came about
            const WHEN = { Y: '1400s', typica: 'c. 1700', bourbon: '1700s', 74110: '1974', 'rume-sudan': '1941', kent: '1911', 'yellow-bourbon': 'c. 1930', sl28: '1935', k7: '1936', caturra: '1915–18', pacas: '1949', 'villa-sarchi': '1950s–60s', tekisic: '1977', 'mundo-novo': '1943', catuai: '1949', pacamara: '1958', sarchimor: '1967', 'colombia-var': '1982', castillo: '2005', 'cenicafe-1': '2016', tabi: '2002', 'anacafe-14': '2014', batian: '2010', parainema: '2004', marsellesa: '2009', obata: '2000', 'ipr-107': '2010', limani: '1994', 'monte-claro': '2013, registered', chandragiri: '2007', icatu: '1950', catucai: '1988', arara: '2012', andungsari: '1999', 'sigarar-utang': 'c. 1988', s795: '1945–46', centroamericano: '2010', evaluna: '2010', 'ruiru-11': '1985' };
            const HOW = { W: 'where Arabica began', Y: 'where coffee was first farmed', AB: 'Ethiopian types grown abroad', SEL: 'chosen from forest trees, 1970s', 74110: 'a selection', 74112: 'a selection', 74140: 'a selection', 74148: 'a selection', 74158: 'a selection', 74165: 'a selection', 75227: 'a selection', 'ethiopian-landrace': '“heirloom”: Ethiopia’s many local types', kurume: 'a landrace', wolisho: 'a landrace', 'gori-gesha': 'a landrace', 'gesha-1931': 'a forest selection resembling Panama Gesha', 'wush-wush': 'a landrace', 'rume-sudan': 'semi-wild coffee from the Boma Plateau, South Sudan', java: 'a selection', yemenia: 'Yemen’s own genetic group', typica: 'one of the two old lines', kent: 'a selection', maragogipe: 'a natural mutation', pache: 'a natural mutation', sl14: 'a selection', bourbon: 'one of the two old lines', 'yellow-bourbon': 'a natural mutation', k7: 'a selection', jackson: 'a selection', bm139: 'a selection', caturra: 'a dwarf mutation of Bourbon', pacas: 'a dwarf mutation', 'villa-sarchi': 'a dwarf mutation', tekisic: 'a selection', 'mundo-novo': 'Bourbon × Typica', catuai: 'Caturra × Mundo Novo', pacamara: 'Pacas × Maragogipe', 'timor-hybrid': 'Arabica × Robusta, found on Timor', catimor: 'Caturra × Timor Hybrid', sarchimor: 'Villa Sarchi × Timor Hybrid', tabi: 'Timor Hybrid × Bourbon', 'costa-rica-95': 'a selection', 'anacafe-14': 'Catimor × Pacamara', parainema: 'a selection', cuscatleco: 'a selection', 'ipr-107': 'IAPAR 59 × Mundo Novo', paraiso: 'Timor Hybrid × Catuaí', catigua: 'Timor Hybrid × Catuaí', icatu: 'Bourbon × Robusta', catucai: 'Catuaí × Icatu', arara: 'Obatã × Catuaí', ateng: 'a selection', andungsari: 'a selection', 'sigarar-utang': 'a farm find: Timor Hybrid × another Arabica', s795: 'Kent × S288', 'sln-9': 'Timor Hybrid × Ethiopian landrace', batian: 'a mix of SL28, SL34, K7, Rume Sudan, N39, SL4 and Timor Hybrid lines', centroamericano: 'Sarchimor × Rume Sudan', starmaya: 'Marsellesa × a wild Ethiopian tree', 'mundo-maya': 'Sarchimor × a wild Ethiopian tree', milenio: 'Sarchimor × Rume Sudan', casiopea: 'Caturra × a wild Ethiopian tree', evaluna: 'Catimor × an Ethiopian tree from CATIE’s collection', nayarita: 'Catimor × a wild Ethiopian tree', mundomex: 'Catimor × a wild Ethiopian tree', esperanza: 'Sarchimor × an Ethiopian tree from CATIE’s collection', h3: 'Caturra × an Ethiopian tree from CATIE’s collection', 'ruiru-11': 'Catimor × SL28' };
            const GROUP = { W: 'Wild Ethiopia', SEL: 'Research picks', AB: 'Ethiopians abroad', Y: 'Yemen' };
            const PLATES = { W: ['Wild Ethiopia', 'where Arabica began', '#c98bbb'], Y: ['Yemen', 'where coffee was first farmed', '#d7b46a'], typica: ['Typica family', 'old line, via Java', '#b9a07a'], bourbon: ['Bourbon family', 'old line, via Réunion', '#e0b65a'], AB: ['Ethiopians abroad', 'sold under other names', '#d9a1c7'], 'timor-hybrid': ['Timor Hybrid', 'Arabica × Robusta: the Robusta line', '#6fb3a0'], catimor: ['Catimors', 'Caturra × Timor Hybrid', '#6fb3a0'], sarchimor: ['Sarchimors', 'Villa Sarchi × Timor Hybrid', '#6fb3a0'], SEL: ['Research picks', 'chosen from forest trees', '#c98bbb'] };
            // v20.3: each family's color: its branches are tinted with it, and the chips under the tree are its key
            const FAMC = { W: '#c98bbb', SEL: '#c98bbb', AB: '#e8a7c8', Y: '#e0915a', typica: '#86a9d9', bourbon: '#e3b94a', 'timor-hybrid': '#5fbfa8', catimor: '#5fbfa8', sarchimor: '#5fbfa8', f1: '#9cc97a' };
            const famOf = id => { if (F1.has(id)) return 'f1'; for (let p = id; p && p !== 'arabica'; p = MAIN[p]) if (FAMC[p]) return p; return ''; };
            const F1 = new Set(['centroamericano', 'starmaya', 'mundo-maya', 'milenio', 'casiopea', 'evaluna', 'nayarita', 'mundomex', 'esperanza', 'h3', 'ruiru-11']);
            const SIMPLE = new Set(['ethiopian-landrace', 'gesha', 'rume-sudan', 'java', 'pink-bourbon', 'sidra', 'yemenia', 'typica', 'blue-mountain', 'maragogipe', 'sl34', 'timor-hybrid', 'tabi', 'bourbon', 'yellow-bourbon', 'sl28', 'batian', 'caturra', 'pacas', 'villa-sarchi', 'mundo-novo', 'catuai', 'catimor', 'castillo', 'colombia-var', 'pacamara', 'sarchimor', 'parainema', 'marsellesa', 'centroamericano', 'starmaya', 'ruiru-11']);
            const ORD = { arabica: ['W', 'Y'], W: ['AB', 'SEL', 'ethiopian-landrace', 'gesha', 'gori-gesha', 'rume-sudan'], Y: ['yemenia', 'monte-claro', 'bourbon', 'typica'],
                bourbon: ['french-mission', 'jackson', 'kent', 'bm139', 'sl28', 'laurina', 'tekisic', 'yellow-bourbon', 'icatu', 'pacas', 'mundo-novo', 'villa-sarchi', 'caturra'],
                typica: ['timor-hybrid', 'sl34', 'sl14', 'mibirizi', 'maragogipe', 'pache', 'typica-mejorado', 'blue-mountain'], 'timor-hybrid': ['catimor', 'sarchimor', 'paraiso', 'catigua', 'tabi', 'sigarar-utang', 'sln-9'], caturra: ['casiopea', 'h3', 'catuai'] };
            const inWild = id => { let p = id; while (p) { if (p === 'W') return true; p = MAIN[p]; } return false; };
            const chain = id => { const out = []; for (let p = id; p && p !== 'arabica'; p = MAIN[p]) out.unshift(p); return out; };

            // ================= the tree =================
            function build(mode) {
                const keep = id => GROUP[id] || mode === 'every' || SIMPLE.has(id);
                const ids = Object.keys(MAIN).filter(keep);
                const nodes = { arabica: { id: 'arabica', kids: [], depth: 0 } };
                const under = (i, g) => { let p = MAIN[i]; while (p) { if (p === g) return true; p = MAIN[p]; } return false; };
                const order = ids.filter(i => !GROUP[i] || ids.some(j => !GROUP[j] && under(j, i)));
                order.forEach(id => { nodes[id] = { id, kids: [] }; });
                const up = id => { let p = MAIN[id]; while (p && !nodes[p]) p = MAIN[p]; return p || 'arabica'; };
                order.forEach(id => { const p = nodes[up(id)]; p.kids.push(nodes[id]); nodes[id].parent = p; });
                const rank = (p, id) => { const o = ORD[p] || []; const i = o.indexOf(id); return i < 0 ? 100 : i; };
                const sortKids = n => { n.kids.sort((a, b) => rank(n.id, a.id) - rank(n.id, b.id) || (b.kids.length - a.kids.length)); n.kids.forEach(sortKids); };
                const depth = (n, d) => { n.depth = d; n.kids.forEach(k => depth(k, d + 1)); };
                const height = n => (n.h = n.kids.length ? 1 + Math.max(...n.kids.map(height)) : 0);
                const weight = n => (n.w = n.kids.length ? n.kids.reduce((s, k) => s + weight(k), 0) + 0.6 : 1);
                sortKids(nodes.arabica); depth(nodes.arabica, 0); height(nodes.arabica); weight(nodes.arabica);
                return nodes;
            }
            // every tip on the edge of a dome-shaped crown, evenly spaced; each fork sits between its parent and its tips,
            // so the generations along any branch are evenly spaced too
            function layout(nodes, mode) {
                const EV = mode === 'every', root = nodes.arabica;
                const Rr = EV ? 2050 : 1100, SY = EV ? 1.5 : 1.6, trunkH = Rr * (EV ? 0.42 : 0.46);
                const T = Rr * 1.45, cy = Rr * SY + 260, G = cy + trunkH;
                const tips = []; const walk = n => { if (!n.kids.length) tips.push(n); n.kids.forEach(walk); }; walk(root);
                const lca = (a, b) => { const s = new Set(); for (let p = a; p; p = p.parent) s.add(p); for (let p = b; p; p = p.parent) if (s.has(p)) return p; return root; };
                let pos = 0; const P = tips.map((n, i) => { if (i) { const d = lca(tips[i - 1], n).depth; pos += 1 + (d === 0 ? 1.8 : d === 1 ? 1.1 : d === 2 ? 0.45 : 0); } return pos; });
                const A0 = -172, A1 = -8;
                tips.forEach((n, i) => { n.a = A0 + (A1 - A0) * P[i] / pos; n.r = Rr * (0.96 + (i % 2 ? 0.07 : 0) + ((n.id.length * 7) % 5) * 0.006); });
                const ang = n => { if (n.kids.length) { n.kids.forEach(ang); n.a = n.kids.reduce((s, k) => s + k.a, 0) / n.kids.length; n.r = Rr * n.depth / (n.depth + n.h); } };
                ang(root);
                root.x = T; root.y = cy; root.dir = -90;
                const place = n => { if (n !== root) { const r = n.a * Math.PI / 180, c = Math.cos(r); n.x = T + c * n.r; n.y = cy + Math.sin(r) * n.r * SY + Rr * 0.24 * c * c * Math.pow(n.r / Rr, 2); } n.kids.forEach(place); };
                place(root);
                return { T, G, cy, Rr, trunkH };
            }
            // ctx: { name(id), mine: Set of variety ids you've logged }
            function draw(mode, ctx = {}) {
                const EV = mode === 'every', nodes = build(mode), geo = layout(nodes, mode), { T, G, Rr } = geo;
                const name = ctx.name || (id => id), mine = ctx.mine || new Set(), FS = ctx.fam || '';   // FS: 'tint' (colored branches), 'dots' (a colored dot by each name), '' (plain)
                const Lf = EV ? 92 : 104, all = Object.values(nodes), root = nodes.arabica;
                seed(5);
                const toward = (deg, w) => { const r = deg * Math.PI / 180; return Math.atan2(Math.sin(r) + w, Math.cos(r)) * 180 / Math.PI; };
                let canopy = '', mid = '', stems = '', leaves = '', fruit = '', links = '', ground = '';
                const B = [1e9, 1e9, -1e9, -1e9], grow = (x0, y0, x1, y1) => { B[0] = Math.min(B[0], x0); B[1] = Math.min(B[1], y0); B[2] = Math.max(B[2], x1); B[3] = Math.max(B[3], y1); };
                const BOX = {}, boxGrow = (g, x0, y0, x1, y1) => { const b = BOX[g] || (BOX[g] = [1e9, 1e9, -1e9, -1e9]); b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1); };
                // the trunk and its roots
                [[-1, 0.9, 70], [1, 1, 60], [-1, 0.55, 30], [1, 0.6, 40], [0.2, 0.7, 50]].forEach(([d, l, dy]) => { stems += stem([T + d * 8, G - 6, T + d * 70 * l, G + 4, T + d * 140 * l, G + dy * 0.5, T + d * 200 * l, G + dy], 18, 2); });
                stems += stem([T, G + 12, T - 22, G - geo.trunkH * 0.4, T + 20, G - geo.trunkH * 0.75, root.x, root.y], EV ? 84 : 66, EV ? 50 : 40, 'bark trunk');
                const width = n => Math.max(5, Math.min(EV ? 46 : 38, 4 + Math.sqrt(n.w) * (EV ? 5.2 : 6.6)));
                const sub = n => { const out = [n]; n.kids.forEach(k => out.push(...sub(k))); return out; };
                const PATHS = {};
                const leafy = (p, len, n, unsure) => {
                    const np = Math.max(3, Math.round(len / (Lf * (EV ? 0.6 : 0.46))));
                    for (let k = 1; k <= np; k++) {
                        const t = k / (np + 0.2); if (t < 0.22 && n.kids.length) continue;
                        const [x, y] = bez(p, t), [dx, dy] = bezd(p, t), a = Math.atan2(dy, dx) * 180 / Math.PI, sz = Lf * (0.7 + 0.35 * R()) * (n.kids.length ? 0.85 : 1);
                        [-1, 1].forEach(side => { if (R() < 0.08) return; const ang = toward(a + side * (45 + R() * 38), 0.45 + 0.4 * R()), tone = unsure ? 'u' : !n.kids.length && t > 0.7 ? 'n' : R() < 0.16 ? 'u' : Math.floor(R() * 3), bend = (R() - 0.5) * 22, ratio = 0.13 + 0.08 * R(); leaves += EV ? leafLite(x, y, ang + bend, sz, tone === 'u' ? 'u' : tone === 'n' ? 'n' : tone, ratio).replace('class="lb', 'class="lf') : leaf(x, y, ang, sz, { tone, bend, ratio }); });
                        if (t > 0.2 && t < 0.7 && R() < 0.3) fruit += cherries(x + 2, y + 7, 3 + Math.floor(R() * 3), sz * 0.07, { ripe: R() < 0.7 ? 'g' : 'y' });
                        if (R() < 0.04) fruit += blossom(x, y + 4, Lf * 0.07, 3 + Math.floor(R() * 2));
                    }
                };
                all.filter(n => n !== root).sort((a, b) => a.depth - b.depth).forEach(n => {
                    const p = n.parent, dist = Math.hypot(n.x - p.x, n.y - p.y), seg = Math.atan2(n.y - p.y, n.x - p.x), pd = (p.dir == null ? -90 : p.dir) * Math.PI / 180;
                    const c1 = [p.x + Math.cos(pd) * dist * 0.38, p.y + Math.sin(pd) * dist * 0.38];
                    const c2 = [n.x - Math.cos(seg) * dist * 0.3, n.y - Math.sin(seg) * dist * 0.3 + dist * 0.07];
                    n.dir = Math.atan2(n.y - c2[1], n.x - c2[0]) * 180 / Math.PI;
                    const path = [p.x, p.y, c1[0], c1[1], c2[0], c2[1], n.x, n.y]; PATHS[n.id] = path.map(v => Math.round(v));
                    const unsure = UNSURE.has(n.id) || n.id === 'monte-claro';
                    const fc = FS ? FAMC[famOf(n.id)] || '' : '';
                    stems += unsure ? `<g class="unsure">${stem(path, width(n) * 1.05, width(n) * 0.82, 'bark', fc)}</g>` : stem(path, width(n) * 1.05, width(n) * 0.82, 'bark', fc);
                    leafy(path, dist, n, unsure);
                    // the tip of a branch: a tuft of younger, lighter leaves
                    if (!n.kids.length) { for (let i = 0; i < 5; i++) leaves += leaf(n.x, n.y, toward(n.dir + (i - 2) * 34 + (R() - 0.5) * 14, 0.25), Lf * (0.55 + 0.25 * R()), { tone: unsure ? 'u' : i % 2 ? 'n' : Math.floor(R() * 3), ratio: 0.15 + 0.06 * R() }); }
                    if (mine.has(n.id)) fruit += cherries(n.x + 4, n.y + 12, 5, Lf * 0.09, { ripe: 'r' });
                    // fuller: darker leaves behind each branch
                    for (let i = 0; i < (EV ? 8 : 14); i++) { const t = R(), [x, y] = bez(path, t), r = 60 + R() * 150, a = R() * Math.PI * 2; canopy += leafLite(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, toward(R() * 360, 0.5), Lf * (0.55 + 0.4 * R()), R() < 0.7 ? 'd' : 2, 0.14 + 0.08 * R()); }
                    for (let i = 0; i < (EV ? 3 : 5); i++) { const t = R(), [x, y] = bez(path, t), r = 40 + R() * 110, a = R() * Math.PI * 2; mid += leafLite(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, toward(R() * 360, 0.5), Lf * (0.6 + 0.4 * R()), Math.floor(R() * 3), 0.13 + 0.09 * R()); }
                    grow(n.x - 170, n.y - 170, n.x + 170, n.y + 170);
                });
                // crosses: a dashed line from the second parent, bowing in toward the trunk so it stays off the tips
                const arc = (m, n, cls) => { const mx = (m.x + n.x) / 2, my = (m.y + n.y) / 2, k = 0.22; const qx = mx + (T - mx) * k, qy = my + (geo.cy - my) * k + 40; return `<path d="M${i0(m.x)} ${i0(m.y)}Q${i0(qx)} ${i0(qy)} ${i0(n.x)} ${i0(n.y)}" class="${cls}"/>`; };
                all.forEach(n => { const o = SECOND[n.id]; if (!o || !nodes[o] || inWild(o)) return; links += arc(nodes[o], n, 'xline'); });
                // names, for the app's label layer (a fixed size on screen; each shown only where it fits)
                const LABELS = [];
                Object.keys(PLATES).forEach(g => { const n = nodes[g]; if (!n) return; const [nm, desc, col] = PLATES[g]; LABELS.push({ x: n.x, y: n.y, text: nm, desc, col, kind: 'group', id: g, prio: 90 + Math.min(9, n.w / 4) }); sub(n).forEach(m => boxGrow(g, m.x - 170, m.y - 170, m.x + 170, m.y + 170)); });
                all.forEach(n => {
                    // (v20.3: with the families as colors, Typica, Bourbon, Timor Hybrid, Catimor and Sarchimor are names on the tree
                    // like any variety, and among the first to show)
                    if (n === root || GROUP[n.id] || (PLATES[n.id] && !FS)) return;
                    const prio = PLATES[n.id] ? 88 : mine.has(n.id) ? 70 : n.kids.length ? 45 + Math.min(20, n.w) : F1.has(n.id) ? 22 : 30;
                    const side = n.kids.length ? '' : n.a < -118 ? 'l' : n.a > -62 ? 'r' : 'u';
                    LABELS.push({ x: n.x, y: n.y, text: name(n.id), kind: 'variety', id: n.id, own: mine.has(n.id), f1: F1.has(n.id), q: UNSURE.has(n.id), side, prio, fc: FAMC[famOf(n.id)] || '' });
                    if (F1.has(n.id)) boxGrow('f1', n.x - 190, n.y - 190, n.x + 190, n.y + 190);
                });
                // the ground, and Arabica's two parent species standing under the crown's edges
                const crownW = Math.max(T - B[0], B[2] - T);
                ground += `<ellipse cx="${i0(T)}" cy="${i0(G + 24)}" rx="${i0(crownW * 0.62)}" ry="46" class="shade"/>`;
                seed(77); for (let x = T - crownW * 1.05; x < T + crownW * 1.05; x += 40 + R() * 50) ground += grass(x, G + 18 + (R() - 0.5) * 18, 28 + R() * 26, 3 + Math.floor(R() * 4));
                for (let i = 0; i < 16; i++) ground += leafLite(T + (R() - 0.5) * crownW * 1.2, G + 10 + R() * 44, (R() - 0.5) * 60, Lf * (0.5 + 0.3 * R()), R() < 0.5 ? 'f' : 'd', 0.17);
                const plant = (x, h, id, title, desc, sc) => {
                    let s = stem([x, G + 4, x - 5, G - h * 0.4, x + 6, G - h * 0.75, x, G - h], 15 * sc, 3);
                    for (let i = 0; i < 4; i++) { const yy = G - h * (0.3 + i * 0.2), sz = Lf * 0.95 * sc * (1 - i * 0.12); s += leaf(x, yy, -165 + i * 10, sz) + leaf(x, yy, -15 - i * 10, sz); }
                    s += leaf(x, G - h, -90, Lf * 0.5 * sc, { tone: 'n' });
                    if (id === 'robusta') s += cherries(x + 10, G - h * 0.52, 6, Lf * 0.06, { ripe: 'r' }) + cherries(x - 12, G - h * 0.72, 5, Lf * 0.055, { ripe: 'r' });
                    grow(x - 130, G - h - 40, x + 130, G + 170);
                    return { s, x, top: G - h, lab: { x, y: G + 60, text: title, desc, kind: 'species', id, prio: 100 } };
                };
                const ph = Rr * 0.2;
                const eu = plant(T - crownW * 0.8, ph * 0.85, 'eugenioides', 'Eugenioides', 'a wild species', 0.9), ro = plant(T + crownW * 0.8, ph, 'robusta', 'Robusta', 'its own species, with types like Conilon', 1.05);
                // their roots run into Arabica's: it began as a wild cross of the two
                links += `<path d="M${i0(eu.x + 20)} ${i0(G + 2)}C${i0(eu.x + 160)} ${i0(G + 40)} ${i0(T - 160)} ${i0(G + 40)} ${i0(T - 30)} ${i0(G - 10)}" class="xline par"/><path d="M${i0(ro.x - 20)} ${i0(G + 2)}C${i0(ro.x - 160)} ${i0(G + 40)} ${i0(T + 160)} ${i0(G + 40)} ${i0(T + 30)} ${i0(G - 10)}" class="xline par"/>`;
                // and Robusta's genes came back much later, through the Timor Hybrid (and, separately, Icatu)
                ['timor-hybrid', 'icatu'].forEach(id => { const th = nodes[id]; if (th) links += `<path d="M${i0(ro.x)} ${i0(ro.top)}C${i0(ro.x)} ${i0(ro.top - 500)} ${i0(th.x + 420)} ${i0(th.y + 260)} ${i0(th.x)} ${i0(th.y)}" class="xline rob"/>`; });
                LABELS.push(eu.lab, ro.lab, { x: T, y: G + 70, text: 'Arabica: the species', desc: 'began as a wild cross of Robusta × Eugenioides', kind: 'species', id: 'arabica', prio: 110, wide: true });
                grow(T - 320, G, T + 320, G + 210);
                BOX.species = [eu.x - 200, G - ph - 260, ro.x + 200, G + 230];
                const svg = `<g class="canopy">${canopy}</g><g class="midc">${mid}</g><g class="ground">${ground}</g><g>${ro.s}${eu.s}</g><g>${stems}</g><g>${leaves}</g><g class="t-fruit">${fruit}</g><g class="t-links">${links}</g>`;
                const NODES = {}; all.forEach(n => { NODES[n.id] = { x: Math.round(n.x), y: Math.round(n.y), parent: n.parent && n.parent.id }; });
                return { svg, bounds: B.map(Math.round), BOX, trunkX: T, ground: G, labels: LABELS, paths: PATHS, nodes: NODES };
            }

            // ================= the family line: one variety's ancestors, as a list read top to bottom =================
            // Here Yemen is drawn as coming from Wild Ethiopia (its coffee did); on the tree they're the two first limbs.
            const SPECIAL = {
                robusta: { name: 'Robusta', sub: 'another coffee species', art: 'robusta', page: ['species', 'robusta'] },
                eugenioides: { name: 'Eugenioides', sub: 'another coffee species', art: 'robusta', page: ['species', 'eugenioides'] },
                ET: { name: 'A wild Ethiopian tree', sub: 'from a research collection', art: 'wild', up: 'W' },
                ETL: { name: 'An Ethiopian tree', sub: 'a landrace from CATIE’s collection', art: 'wild', up: 'W' },
                S288: { name: 'S288', sub: 'an Indian line with some Liberica', art: 'cherry' },
            };
            const COLOR = { 'yellow-bourbon': 'y', 'pink-bourbon': 'p', 'orange-bourbon': 'o' };
            const upOf = id => id === 'Y' ? 'W' : id === 'W' ? null : SPECIAL[id] ? SPECIAL[id].up || null : MAIN[id] || null;
            function lineGraph(id) {
                const nodes = {}, edges = [];
                const addChain = start => { let p = start, prev = null; while (p) { const fresh = !nodes[p]; if (fresh) nodes[p] = { id: p }; if (prev && !edges.some(e => e.a === p && e.b === prev)) edges.push({ a: p, b: prev }); if (!fresh) break; prev = p; p = upOf(p); } };
                const parents = [];
                if (ALT[id]) ALT[id].forEach((o, i) => { if (o.id) { addChain(o.id); parents.push({ id: o.id, maybe: true, note: o.note }); } else { const k = 'alt' + i; nodes[k] = { id: k, name: o.name, maybeName: true }; if (o.from) { addChain(o.from); edges.push({ a: o.from, b: k }); } parents.push({ id: k, maybe: true, note: o.note }); } });
                else { if (MAIN[id] && MAIN[id] !== 'arabica') { addChain(MAIN[id]); parents.push({ id: MAIN[id] }); } const o = SECOND[id]; if (o) { addChain(o); parents.push({ id: o }); } }
                // where Robusta came in, for anything descended from the Timor Hybrid or Icatu
                ['timor-hybrid', 'icatu'].forEach(t => { if (!nodes[t]) return; if (!nodes.robusta) nodes.robusta = { id: 'robusta' }; if (!edges.some(e => e.a === 'robusta' && e.b === t)) edges.push({ a: 'robusta', b: t }); });
                nodes[id] = { id, me: true };
                parents.forEach(p => edges.push({ a: p.id, b: id, maybe: p.maybe }));
                const parentsOf = b => edges.filter(e => e.b === b).map(e => e.a);
                const floating = n => n.id !== 'W' && n.id !== id && !parentsOf(n.id).length;
                const memo = {}, dep = (nid, stk = new Set()) => { if (memo[nid] != null) return memo[nid]; if (nid === 'W') return (memo[nid] = 0); if (stk.has(nid)) return 0; stk.add(nid); const real = parentsOf(nid).filter(p => !floating(nodes[p])); return (memo[nid] = real.length ? 1 + Math.max(...real.map(p => dep(p, stk))) : 1); };
                const list = Object.values(nodes);
                list.forEach(n => { if (n.id !== id && !floating(n)) n.d = dep(n.id); });
                const top = Math.max(0, ...list.filter(n => n.d != null).map(n => n.d));
                // an outside parent (another species, a wild tree, an unknown) sits just above the one it joins
                list.forEach(n => { if (!floating(n)) return; const kids = edges.filter(e => e.a === n.id && e.b !== id).map(e => nodes[e.b]); n.d = kids.length ? Math.min(...kids.map(k => k.d)) - 0.5 : top + 0.5; });
                nodes[id].d = top + 1;
                // lanes: the main line keeps the left lane; each branch-off or outside parent takes the next lane
                const onMain = new Set(); for (let p = parents[0] && parents[0].id; p; p = upOf(p)) onMain.add(p);
                let lanes = 0; const setLane = (n, l) => { if (n.lane != null) return; n.lane = l; lanes = Math.max(lanes, l + 1); edges.filter(e => e.a === n.id && e.b !== id).map(e => nodes[e.b]).sort((a, b) => (onMain.has(b.id) ? 1 : 0) - (onMain.has(a.id) ? 1 : 0)).forEach((k, i) => setLane(k, i === 0 ? l : lanes)); };
                list.filter(n => n.id !== id && !parentsOf(n.id).length).sort((a, b) => (a.id === 'W' ? -1 : b.id === 'W' ? 1 : a.d - b.d)).forEach((n, i) => setLane(n, i === 0 ? 0 : lanes));
                nodes[id].lane = 0;
                const rows = list.sort((a, b) => a.d - b.d || a.lane - b.lane);
                rows.forEach((n, i) => { n.row = i; });
                return { rows, edges, lanes: Math.max(1, lanes), parents };
            }
            // the little picture inside each circle
            const BB = {};
            function bboxOf(d) {
                if (BB[d]) return BB[d];
                const tok = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+/g) || []; let x = 0, y = 0, sx = 0, sy = 0, cmd = 'M', i = 0; const b = [1e9, 1e9, -1e9, -1e9];
                while (i < tok.length) {
                    const t = tok[i]; if (/[A-Za-z]/.test(t)) { cmd = t; i++; if (/[Zz]/.test(t)) { x = sx; y = sy; } continue; }
                    const n = parseFloat(t);
                    if (cmd === 'M') { x = n; y = parseFloat(tok[i + 1]); sx = x; sy = y; i += 2; cmd = 'L'; } else if (cmd === 'm') { x += n; y += parseFloat(tok[i + 1]); sx = x; sy = y; i += 2; cmd = 'l'; } else if (cmd === 'L') { x = n; y = parseFloat(tok[i + 1]); i += 2; } else if (cmd === 'l') { x += n; y += parseFloat(tok[i + 1]); i += 2; } else if (cmd === 'H') { x = n; i++; } else if (cmd === 'h') { x += n; i++; } else if (cmd === 'V') { y = n; i++; } else if (cmd === 'v') { y += n; i++; } else i++;
                    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
                }
                return (BB[d] = b);
            }
            function art(id, r, maybeName, world) {
                if (maybeName) return `<text y="${f1(r * 0.36)}" text-anchor="middle" font-size="${f1(r * 1.1)}" font-weight="700" class="fq">?</text>`;
                const place = { W: 'ETH', Y: 'YEM' }[id], d = place && world && world.c && world.c[place];
                if (d) { const b = bboxOf(d), k = (r * 2 * 0.66) / Math.max(b[2] - b[0], b[3] - b[1]); return `<path d="${d}" transform="translate(${(-k * (b[0] + b[2]) / 2).toFixed(2)} ${(-k * (b[1] + b[3]) / 2).toFixed(2)}) scale(${k.toFixed(4)})" class="fland"/>`; }
                const kind = (SPECIAL[id] && SPECIAL[id].art) || (id === 'AB' ? 'globe' : id === 'SEL' ? 'wild' : 'cherry');
                if (kind === 'globe') return `<circle r="${f1(r * 0.56)}" class="fglobe"/><ellipse rx="${f1(r * 0.25)}" ry="${f1(r * 0.56)}" class="fglobe"/><path d="M${f1(-r * 0.56)} 0H${f1(r * 0.56)}" class="fglobe"/>`;
                const lf = (x, y, a, L, tone) => leaf(x, y, a, L, { tone, bend: 6, ratio: 0.24 });
                if (kind === 'wild') return lf(-r * 0.05, r * 0.55, -118, r * 1.05, 0) + lf(r * 0.05, r * 0.55, -62, r * 1.05, 2) + lf(0, r * 0.6, -90, r * 0.9, 'n');
                if (kind === 'robusta') return lf(-r * 0.1, r * 0.2, -150, r * 1.1, 2) + lf(r * 0.1, r * 0.2, -30, r * 1.1, 0) + cherries(0, r * 0.18, 6, r * 0.2, { ripe: 'r' });
                return lf(-r * 0.15, r * 0.05, -140, r * 1.15, 0) + lf(r * 0.1, r * 0.05, -28, r * 0.95, 2) + cherries(r * 0.02, r * 0.22, 2, r * 0.3, { ripe: COLOR[id] || 'r' });
            }
            // ctx: { name(id), esc(s), mine: Set, open(id) -> onclick string or '' (a page to open), tree -> onclick for groups, world: WORLD_MAP }
            function line(id, ctx = {}) {
                const g = lineGraph(id); if (g.rows.length < 2) return '';
                const esc = ctx.esc || (s => String(s)), mine = ctx.mine || new Set(), nm0 = ctx.name || (x => x);
                const nameOf = x => SPECIAL[x] ? SPECIAL[x].name : GROUP[x] || (x === 'catimor' ? 'Catimor' : x === 'sarchimor' ? 'Sarchimor' : nm0(x));
                const howOf = x => HOW[x] || (SPECIAL[x] ? SPECIAL[x].sub : '');
                const RH = 52, LW = 26, r0 = 15, x0 = 22, H = g.rows.length * RH, byId = {}; g.rows.forEach(n => { byId[n.id] = n; });
                const cx = n => x0 + n.lane * LW, cyy = n => n.row * RH + RH / 2;
                const textX = x0 + (g.lanes - 1) * LW + r0 + 16;
                seed(11);
                let lines = '', dots = '';
                g.edges.forEach(e => { const a = byId[e.a], b = byId[e.b]; if (!a || !b) return; const ax = cx(a), ay = cyy(a), bx = cx(b), by = cyy(b);
                    const d = ax === bx ? `M${ax} ${ay}V${by}` : `M${ax} ${ay}V${by - RH * 0.62}C${ax} ${by - RH * 0.22} ${bx} ${by - RH * 0.5} ${bx} ${by - r0 + 2}`;
                    lines += `<path d="${d}" class="lx-fl-ln${e.maybe ? ' maybe' : ''}"/>`; });
                g.rows.forEach(n => { const r = n.me ? r0 + 3 : r0; dots += `<g transform="translate(${cx(n)} ${cyy(n)})" class="lx-fl-dot${n.me ? ' me' : ''}"><circle r="${r}" class="lx-fl-c"/><clipPath id="lxfl-${esc(id)}-${n.row}"><circle r="${r - 1.5}"/></clipPath><g clip-path="url(#lxfl-${esc(id)}-${n.row})">${art(n.id, r - 1.5, n.maybeName, ctx.world)}</g>${n.me ? `<circle r="${r + 3.5}" class="lx-fl-ring"/>` : ''}</g>`; });
                const maybeOf = nid => { const p = g.parents.find(q => q.id === nid && q.maybe); return p ? p.note : null; };
                const rowsHtml = g.rows.map(n => {
                    // as an ancestor, Catimor and Sarchimor stand for their whole group of crosses, not the first 1959 or 1967 line
                    const grp = !n.me && { catimor: ['Catimors', 'the Caturra × Timor Hybrid crosses'], sarchimor: ['Sarchimors', 'the Villa Sarchi × Timor Hybrid crosses'] }[n.id];
                    const nm = n.maybeName ? n.name : grp ? grp[0] : nameOf(n.id), mb = maybeOf(n.id);
                    const sub = n.me ? [WHEN[id], ALT[id] ? 'family not settled' : howOf(id), ALSO[id]].filter(Boolean).join(' · ') : n.maybeName ? '' : grp ? grp[1] : [WHEN[n.id], howOf(n.id)].filter(Boolean).join(' · ');
                    const go = n.maybeName || n.me ? '' : GROUP[n.id] ? (ctx.tree || '') : SPECIAL[n.id] ? (SPECIAL[n.id].page && ctx.openKind ? ctx.openKind(...SPECIAL[n.id].page) : '') : (ctx.open ? ctx.open(n.id) : '');
                    const tag = go ? 'button' : 'div';
                    return `<${tag}${go ? ' type="button"' : ''} class="lx-fl-row${n.me ? ' me' : ''}" style="top:${n.row * RH}px;height:${RH}px;padding-left:${textX}px"${go ? ` onclick="${go}"` : ''}><span class="lx-fl-t"><b>${esc(nm)}</b>${mb != null ? `<span class="lx-fl-sub"><em>Maybe</em> · ${esc(mb)}</span>` : sub ? `<span class="lx-fl-sub">${esc(sub)}</span>` : ''}</span>${mine.has(n.id) ? '<span class="lx-fl-yo">Yours</span>' : ''}</${tag}>`;
                }).join('');
                return `<div class="lx-fline" style="height:${H}px"><svg class="lx-fl-svg lxk" width="${textX}" height="${H}" viewBox="0 0 ${textX} ${H}" aria-hidden="true">${lines}${dots}</svg>${rowsHtml}</div>`;
            }
            // the family in words, for the tree's card: "Wild Ethiopia › Yemen › Bourbon"
            function path(id, name) { const c = chain(id); return (c[0] === 'Y' ? ['W'] : []).concat(c).slice(0, -1).map(x => GROUP[x] || name(x)); }
            // a small coffee sprig, for the way onto the tree
            function sprig() {
                seed(3); const p = [12, 90, 30, 64, 58, 42, 90, 12]; let s = stem(p, 6, 1.6), fr = '';
                for (let i = 0; i < 5; i++) { const t = 0.16 + 0.19 * i, [x, y] = bez(p, t), [dx, dy] = bezd(p, t), a = Math.atan2(dy, dx) * 180 / Math.PI, L = 26 - i * 2.5; s += leaf(x, y, a - 62, L, { tone: i % 3, ratio: 0.24, bend: 4 }) + leaf(x, y, a + 62, L * 0.95, { tone: (i + 1) % 3, ratio: 0.24, bend: -4 }); if (i === 1 || i === 3) fr += cherries(x + 1, y + 3, 4, 3.4, { ripe: i === 1 ? 'r' : 'y' }); }
                s += leaf(90, 12, -50, 12, { tone: 'n', ratio: 0.24 });
                return `<svg class="lxk" viewBox="0 0 100 100" aria-hidden="true">${s}${fr}</svg>`;
            }
            // v20.1: a coffee cherry cut in half: skin, fruit, the sticky layer (mucilage), parchment, the silver skin and the
            // two seeds. off = { skin, fruit, mucilage, parchment }: a layer that's already off draws as a dashed outline.
            function cut(o = {}) {
                const off = o.off || {}, c = k => off[k] ? ' xoff' : '';
                const bean = sx => `<g transform="translate(${150 + sx * 3} 120) scale(${sx} 1)"><path d="M2 -62C46 -62 72 -34 72 0C72 34 46 62 2 62Z" class="xpa${c('parchment')}"/><path d="M6 -55C42 -55 64 -30 64 0C64 30 42 55 6 55Z" class="xss${c('parchment')}"/><path d="M8 -51C40 -51 60 -28 60 0C60 28 40 51 8 51Z" class="xsd"/><path d="M8 -20C20 -12 20 12 8 20" class="xsdc"/></g>`;
                const size = o.size || 120;
                return `<svg class="lxk lx-cut" viewBox="0 0 300 240" width="${size}" height="${i0(size * 0.8)}" role="img" aria-label="${o.label || 'A coffee cherry cut in half'}"><defs><radialGradient id="lxxsk" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ef6a54"/><stop offset=".6" stop-color="#c12e24"/><stop offset="1" stop-color="#7a1712"/></radialGradient><radialGradient id="lxxsd" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#cfe0b6"/><stop offset="1" stop-color="#94b07a"/></radialGradient></defs>`
                    + `<path d="M150 12C220 12 262 62 262 120C262 180 216 228 150 228C84 228 38 180 38 120C38 62 80 12 150 12Z" class="xsk${c('skin')}"/><path d="M150 22C212 22 252 66 252 120C252 174 210 218 150 218C90 218 48 174 48 120C48 66 88 22 150 22Z" class="xpu${c('fruit')}"/><path d="M150 44C198 44 230 78 230 120C230 162 198 196 150 196C102 196 70 162 70 120C70 78 102 44 150 44Z" class="xmu${c('mucilage')}"/>${bean(1)}${bean(-1)}<path d="M150 12C148 6 150 0 156 -2" class="xstk"/></svg>`;
            }
            const children = id => [...new Set(Object.keys(MAIN).filter(k => MAIN[k] === id).concat(Object.keys(SECOND).filter(k => SECOND[k] === id)))];
            return { draw, line, defs, sprig, cut, chain, path, children, FAMC, famOf, has: id => (!!MAIN[id] && !GROUP[id]) || !!ALT[id], onTree: id => !!MAIN[id] && !GROUP[id], simple: id => SIMPLE.has(id), unsure: id => UNSURE.has(id), second: id => SECOND[id] || null, MAIN, SECOND, ALT, WHEN, HOW, GROUP, VERSION: 1 };
        })();
        if (typeof module !== 'undefined' && module.exports) module.exports = LearnTree;
