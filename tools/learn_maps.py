#!/usr/bin/env python3
"""Learn (v19.0): the country maps on origin pages, as small SVG paths in learn/maps.json.

    python3 tools/learn_maps.py --ne <folder with Natural Earth geojson> [--out learn/maps.json] [--atlas learn/atlas.json --checks a.json,b.json]

v20.1: with --atlas, every other country with a research page gets a map too: the provinces its research names as
growing coffee (only the ones a fact-checker confirmed, from --checks) or, when none, a dot at each confirmed town; and a
region of a mapped country that has no area of its own gets a dot at its confirmed town.

Natural Earth (public domain, naturalearthdata.com): ne_10m_admin_0_countries.geojson for outlines,
ne_10m_admin_1_states_provinces.geojson for regions (departments), ne_10m_populated_places.geojson for a few towns.
Where Natural Earth's regions don't match the coffee areas (Ethiopia's zones, Kenya's counties), the map is the outline
plus a dot at a town in each coffee area, from Wikipedia's coordinates (listed below with their pages).
v20.3: with --geob, a region whose research names its official areas (area.data like "ETH/ADM2", area.names) is drawn as
its own outline, from geoBoundaries (www.geoboundaries.org; each country's licence is in its metadata, all open).
Not edited by hand; rerun to change.
"""
import argparse, json, math, os

# admin-1 maps: country -> the regions to draw (Natural Earth name -> our region id)
ADM1 = {
    'COL': {'Huila': 'huila', 'Cauca': 'cauca', 'Nariño': 'narino', 'Tolima': 'tolima', 'Antioquia': 'antioquia', 'Caldas': 'caldas',
            'Quindío': 'quindio', 'Risaralda': 'risaralda', 'Valle del Cauca': 'valle-del-cauca', 'Santander': 'santander',
            'Norte de Santander': 'norte-de-santander', 'Cundinamarca': 'cundinamarca', 'Magdalena': 'magdalena'},
    'PER': {'Cajamarca': 'cajamarca', 'Amazonas': 'amazonas', 'San Martín': 'san-martin', 'Piura': 'piura', 'Junín': 'junin',
            'Pasco': 'pasco', 'Huánuco': 'huanuco', 'Ayacucho': 'ayacucho', 'Cusco': 'cusco', 'Puno': 'puno'},
    'BRA': {"Minas Gerais": "minas-gerais", "Espírito Santo": "espirito-santo", "São Paulo": "sao-paulo", "Bahia": "bahia", "Paraná": "parana", "Rondônia": "rondonia"},
    'MEX': {"Chiapas": "chiapas", "Oaxaca": "oaxaca", "Veracruz": "veracruz", "Puebla": "puebla", "San Luis Potosí": "san-luis-potosi", "Nayarit": "nayarit", "Colima": "colima", "Guerrero": "guerrero"},
    'NIC': {"Jinotega": "jinotega", "Matagalpa": "matagalpa", "Nueva Segovia": "nueva-segovia", "Madriz": "madriz", "Estelí": "esteli"},
    'HND': {"Copán": "copan", "Ocotepeque": "ocotepeque", "Santa Bárbara": "santa-barbara", "Intibucá": "intibuca", "Lempira": "lempira", "La Paz": "la-paz", "Comayagua": "comayagua", "Francisco Morazán": "francisco-morazan", "El Paraíso": "el-paraiso", "Olancho": "olancho"},
    'PAN': {'Chiriquí': 'chiriqui'},
}
# outline + dots: (region id, label, lat, lon, source)
DOTS = {
    'ETH': [('yirgacheffe', 'Yirgacheffe', 6.167, 38.200, 'https://en.wikipedia.org/wiki/Irgachefe'),
            ('sidama', 'Sidama (Yirgalem)', 6.750, 38.417, 'https://en.wikipedia.org/wiki/Irgalem'),
            ('guji', 'Guji (Shakiso)', 5.750, 38.917, 'https://en.wikipedia.org/wiki/Shakiso'),
            ('jimma', 'Jimma', None, None, 'ne:Jima'),
            ('harrar', 'Harrar', None, None, 'ne:Harar'),
            ('kaffa', 'Kaffa (Bonga)', 7.267, 36.233, 'https://en.wikipedia.org/wiki/Bonga')],
    'KEN': [('nyeri', 'Nyeri', None, None, 'ne:Nyeri'),
            ('kirinyaga', 'Kirinyaga (Kerugoya)', -0.500, 37.283, 'https://en.wikipedia.org/wiki/Kerugoya'),
            ('muranga', "Murang'a", -0.7167, 37.150, "https://en.wikipedia.org/wiki/Murang%27a"),
            ('kiambu', 'Kiambu', -1.167, 36.817, 'https://en.wikipedia.org/wiki/Kiambu'),
            ('embu', 'Embu', None, None, 'ne:Embu')],
    'GTM': [("antigua", "Antigua", None, None, "ne:Antigua Guatemala"),
            ("huehuetenango", "Huehuetenango", None, None, "ne:Huehuetenango"),
            ("coban", "Cobán", None, None, "ne:Cobán"),
            ("san-marcos", "San Marcos", None, None, "ne:San Marcos"),
            ("fraijanes", "Fraijanes", 14.467, -90.433, "https://en.wikipedia.org/wiki/Fraijanes"),
            ("acatenango", "Acatenango", 14.55444, -90.94389, "https://en.wikipedia.org/wiki/Acatenango,_Chimaltenango"),
            ("atitlan", "Atitlán", 14.633, -91.233, "https://en.wikipedia.org/wiki/Santiago_Atitl%C3%A1n")],
    'CRI': [("tarrazu", "Tarrazú", 9.6703061, -84.0091815, "https://en.wikipedia.org/wiki/San_Marcos,_Costa_Rica"),
            ("west-valley", "West Valley", 10.1001475, -84.3900771, "https://en.wikipedia.org/wiki/Naranjo_de_Alajuela"),
            ("central-valley", "Central Valley", None, None, "ne:Heredia"),
            ("tres-rios", "Tres Ríos", 9.907172, -83.9864611, "https://en.wikipedia.org/wiki/Tres_R%C3%ADos,_Cartago"),
            ("orosi", "Orosi", 9.6874392, -83.7609867, "https://en.wikipedia.org/wiki/Orosi,_Cartago"),
            ("turrialba", "Turrialba", 9.8897121, -83.6806611, "https://en.wikipedia.org/wiki/Turrialba_(district)"),
            ("brunca", "Brunca", 9.3403459, -83.7337922, "https://en.wikipedia.org/wiki/San_Isidro_de_El_General"),
            ("guanacaste", "Guanacaste", 10.3440686, -84.4198985, "https://en.wikipedia.org/wiki/Quesada,_San_Carlos")],
    'PAN': [("boquete", "Boquete", 8.78, -82.44, "https://en.wikipedia.org/wiki/Boquete,_Chiriqu%C3%AD"),
            ("volcan", "Volcán", 8.778972, -82.64425, "https://en.wikipedia.org/wiki/Volc%C3%A1n,_Panama"),
            ("renacimiento", "Renacimiento (Río Sereno)", 8.82, -82.86, "https://en.wikipedia.org/wiki/R%C3%ADo_Sereno")],
    'RWA': [("nyamasheke", "Nyamasheke", -2.342868, 29.096947, "https://www.latlong.net/place/nyamasheke-rwanda-15157.html"),
            ("karongi", "Karongi (Kibuye)", -2.061672, 29.348344, "https://en.wikipedia.org/wiki/Kibuye,_Rwanda"),
            ("huye", "Huye", -2.6, 29.75, "https://en.wikipedia.org/wiki/Butare"),
            ("gakenke", "Gakenke", -1.670278, 29.664444, "https://en.wikipedia.org/wiki/Busengo,_Rwanda"),
            ("rulindo", "Rulindo", -1.71556, 29.91444, "https://en.wikipedia.org/wiki/Tare,_Rwanda")],
}
W = 300.0


def rings_of(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []


def dp(pts, tol):
    """Douglas-Peucker on a list of (x, y); a closed ring is split at its farthest point first."""
    if len(pts) < 3: return pts
    if pts[0] == pts[-1]:
        far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
        if far == 0: return pts[:1]
        return dp(pts[:far + 1], tol)[:-1] + dp(pts[far:], tol)
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ne', required=True); ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'learn', 'maps.json'))
    ap.add_argument('--atlas'); ap.add_argument('--checks')
    ap.add_argument('--geob', help='v20.3: folder of geoBoundaries files (ETH_ADM2.geojson ...); each region whose research names its official areas (area.data, area.names) is outlined')
    a = ap.parse_args()
    adm0 = json.load(open(os.path.join(a.ne, 'ne_10m_admin_0_countries.geojson')))
    adm1 = json.load(open(os.path.join(a.ne, 'ne_10m_admin_1_states_provinces.geojson')))
    towns = json.load(open(os.path.join(a.ne, 'ne_10m_populated_places.geojson')))
    out = {'about': 'Country maps for Learn. Made with Natural Earth (public domain); town positions from Natural Earth and Wikipedia. Made by tools/learn_maps.py.', 'maps': {}}
    adm1_all, dots_all, outline_of = dict(ADM1), {k: list(v) for k, v in DOTS.items()}, {}
    if a.atlas:   # v20.1: maps from the checked research
        import unicodedata, re
        slug = lambda t: re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()).strip('-')
        atlas = json.load(open(a.atlas)); checks = {}
        for f in (a.checks or '').split(','):
            if f: checks.update(json.load(open(f)))
        srcs = json.load(open(os.path.join(os.path.dirname(a.atlas), 'sources.json')))['sources']
        url = lambda ids: next((srcs[i]['url'] for i in (ids or []) if i != 'natural-earth' and i in srcs), 'https://www.naturalearthdata.com/')
        for r in atlas['records']:
            m = r.get('map') or {}
            key = f"{r['kind']}:{r['id']}"; c = checks.get(key, {})
            tw = [(t, next((x for x in c.get('towns', []) if x.get('i') == i), None)) for i, t in enumerate(m.get('towns') or [])]
            tw = [(t, v) for t, v in tw if v and v.get('verdict') in ('ok', 'fix')]
            pos = lambda t, v: (v['lat'], v['lon']) if v.get('verdict') == 'fix' and v.get('lat') is not None else (t['lat'], t['lon'])
            if r['kind'] == 'origin' and r['id'] not in ADM1 and r['id'] not in DOTS and r['id'] != 'HI':   # (Hawaii isn't a country on Natural Earth's map)
                keep = (c.get('adm1') or {}).get('keep') or []
                if keep: adm1_all[r['id']] = {n: slug(n) for n in keep}
                elif tw: dots_all[r['id']] = [(slug(t['name']), t['name'], *pos(t, v), v.get('source') or url(t.get('src'))) for t, v in tw]
            elif r['kind'] == 'region' and tw:
                code, rid = r['id'].split(':')
                have = set((ADM1.get(code) or {}).values()) | {d[0] for d in DOTS.get(code, [])}
                if rid in have or any(slug(n) in have for n in (m.get('adm1') or [])): continue
                t, v = tw[0]
                label = r['name']   # (the legend says it's a town in that region)
                dots_all.setdefault(code, []).append((rid, label, *pos(t, v), v.get('source') or url(t.get('src'))))
    # v20.3: a region's own outline, from the official areas its research names (geoBoundaries, open licences)
    geo, geo_file, geo_used = {}, {}, {}
    if a.atlas and a.geob:
        import unicodedata
        norm = lambda t: unicodedata.normalize('NFD', str(t)).encode('ascii', 'ignore').decode().lower().replace("'", '').strip()
        files = {}
        for r in json.load(open(a.atlas))['records']:
            ar = r.get('area') or {}
            if r['kind'] != 'region' or not ar.get('data') or not ar.get('names'): continue
            fn = os.path.join(a.geob, ar['data'].replace('/', '_') + '.geojson')
            if not os.path.exists(fn): print('no boundary file', fn, 'for', r['id']); continue
            if fn not in files: files[fn] = json.load(open(fn))
            want = {norm(n) for n in ar['names']}
            feats = [f for f in files[fn]['features'] if norm(f['properties'].get('shapeName')) in want]
            got = {norm(f['properties'].get('shapeName')) for f in feats}
            if want - got: print('not found in', ar['data'], 'for', r['id'], sorted(want - got))
            if not feats: continue
            code, rid = r['id'].split(':')
            geo.setdefault(code, []).append((rid, [ring[0] for f in feats for ring in rings_of(f['geometry'])]))
            geo_file.setdefault(code, fn); geo_used.setdefault(code, set()).update(got)
    for code in dict.fromkeys(list(adm1_all) + list(dots_all) + list(geo)):   # (a country can have both: shaded regions and town dots)
        if code in outline_of:   # (Hawaii: a state, drawn from its admin-1 shape)
            a3, nm = outline_of[code]; outline = [f for f in adm1['features'] if f['properties'].get('adm0_a3') == a3 and f['properties'].get('name') == nm][0]
        else: outline = [f for f in adm0['features'] if f['properties'].get('ADM0_A3') == code][0]
        rings = [r[0] for r in rings_of(outline['geometry'])]
        lons = [p[0] for r in rings for p in r]; lats = [p[1] for r in rings for p in r]
        # keep the mainland's box (islands far off, like San Andrés, would squash the map)
        big = max(rings, key=lambda r: area(r))
        if code in ADM1 or code in DOTS: box = [big]
        else: box = [r for r in rings if area(r) >= 0.02 * area(big)]   # (v20.1: an island country keeps its big islands)
        bl = [p[0] for r in box for p in r]; bt = [p[1] for r in box for p in r]
        x0, x1, y0, y1 = min(bl), max(bl), min(bt), max(bt)
        k = math.cos(math.radians((y0 + y1) / 2))
        s = W / ((x1 - x0) * k); H = (y1 - y0) * s
        proj = lambda lon, lat: ((lon - x0) * k * s, (y1 - lat) * s)
        inside = lambda pts: all(-20 <= x <= W + 20 and -20 <= y <= H + 20 for x, y in pts)

        def path(rs, tol=0.6, minA=6.0):
            d = []
            for r in rs:
                pts = dp([proj(*p) for p in r], tol)
                if len(pts) < 4 or area(pts) < minA or not inside(pts): continue
                d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
            return ''.join(d)
        old = code in ADM1 or code in DOTS   # (v20.1: the newer maps are drawn a little simpler, to stay small)
        m = {'w': W, 'h': round(H, 1), 'outline': path(rings, 0.5 if old else 0.8, 4.0)}
        if code in adm1_all and code not in outline_of:
            regs = {}
            for f in adm1['features']:
                p = f['properties']
                if p.get('adm0_a3') != code or p.get('name') not in adm1_all[code]: continue
                regs[adm1_all[code][p['name']]] = path([r[0] for r in rings_of(f['geometry'])], 0.8 if old else 1.2, 1.0 if old else 2.0)
            others = ''.join(path([r[0] for r in rings_of(f['geometry'])], 1.0 if old else 1.8, 2.0 if old else 6.0) for f in adm1['features']
                             if f['properties'].get('adm0_a3') == code and f['properties'].get('name') not in adm1_all[code])
            m['regions'] = regs; m['rest'] = others
        if code in dots_all:
            dots = []
            for rid, label, lat, lon, src in dots_all[code]:
                if lat is None:
                    nm = src.split(':', 1)[1]
                    t = [f for f in towns['features'] if f['properties'].get('ADM0_A3') == code and f['properties'].get('NAME') == nm][0]
                    lon, lat = t['geometry']['coordinates']; src = 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/'
                x, y = proj(lon, lat)
                dots.append({'id': rid, 'label': label, 'x': round(x, 1), 'y': round(y, 1), 'src': src})
            m['dots'] = dots
        if code in geo:   # (bigger regions first, so a region inside another is drawn on top and can be tapped)
            regs = m.get('regions') or {}
            for rid, rs in sorted(geo[code], key=lambda x: -sum(area([proj(*p) for p in ring]) for ring in x[1])):
                if rid in regs: continue
                d = path(rs, 0.6, 0.5)
                if d: regs[rid] = d
            m['regions'] = regs
            if not m.get('rest'):   # (the country's other areas, faint, so a zoomed map still shows where you are)
                m['rest'] = ''.join(path([ring[0] for ring in rings_of(f['geometry'])], 1.2, 1.5) for f in files[geo_file[code]]['features'] if norm(f['properties'].get('shapeName')) not in geo_used[code])
            m['geo'] = 'geoBoundaries (www.geoboundaries.org), open licences'
            # when the coffee regions are a small patch of a big country (Kenya), the map shows that patch, with room around it
            pts = [proj(*p) for _, rs in geo[code] for ring in rs for p in ring]
            bx0, bx1 = min(x for x, _ in pts), max(x for x, _ in pts); by0, by1 = min(y for _, y in pts), max(y for _, y in pts)
            if (bx1 - bx0) * (by1 - by0) < 0.12 * W * H:
                cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2; side = max(bx1 - bx0, (by1 - by0) * W / H) * 2.5
                zw, zh = min(W, side), min(H, side * H / W)
                zx, zy = min(max(0, cx - zw / 2), W - zw), min(max(0, cy - zh / 2), H - zh)
                m['zoom'] = [round(zx, 1), round(zy, 1), round(zw, 1), round(zh, 1)]
        out['maps'][code] = m
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('wrote', a.out, os.path.getsize(a.out), 'bytes', {c: len(json.dumps(v)) for c, v in out['maps'].items()})


if __name__ == '__main__':
    main()
