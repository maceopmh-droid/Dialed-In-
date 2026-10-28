#!/usr/bin/env python3
"""Learn (v19.0): the country maps on origin pages, as small SVG paths in learn/maps.json.

    python3 tools/learn_maps.py --ne <folder with Natural Earth geojson> [--out learn/maps.json]

Natural Earth (public domain, naturalearthdata.com): ne_10m_admin_0_countries.geojson for outlines,
ne_10m_admin_1_states_provinces.geojson for regions (departments), ne_10m_populated_places.geojson for a few towns.
Where Natural Earth's regions don't match the coffee areas (Ethiopia's zones, Kenya's counties), the map is the outline
plus a dot at a town in each coffee area, from Wikipedia's coordinates (listed below with their pages).
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
    a = ap.parse_args()
    adm0 = json.load(open(os.path.join(a.ne, 'ne_10m_admin_0_countries.geojson')))
    adm1 = json.load(open(os.path.join(a.ne, 'ne_10m_admin_1_states_provinces.geojson')))
    towns = json.load(open(os.path.join(a.ne, 'ne_10m_populated_places.geojson')))
    out = {'about': 'Country maps for Learn. Made with Natural Earth (public domain); town positions from Natural Earth and Wikipedia. Made by tools/learn_maps.py.', 'maps': {}}
    for code in list(ADM1) + list(DOTS):
        outline = [f for f in adm0['features'] if f['properties'].get('ADM0_A3') == code][0]
        rings = [r[0] for r in rings_of(outline['geometry'])]
        lons = [p[0] for r in rings for p in r]; lats = [p[1] for r in rings for p in r]
        # keep the mainland's box (islands far off, like San Andrés, would squash the map)
        big = max(rings, key=lambda r: area(r))
        bl = [p[0] for p in big]; bt = [p[1] for p in big]
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
        m = {'w': W, 'h': round(H, 1), 'outline': path(rings, 0.5, 4.0)}
        if code in ADM1:
            regs = {}
            for f in adm1['features']:
                p = f['properties']
                if p.get('adm0_a3') != code or p.get('name') not in ADM1[code]: continue
                regs[ADM1[code][p['name']]] = path([r[0] for r in rings_of(f['geometry'])], 0.8, 1.0)
            others = ''.join(path([r[0] for r in rings_of(f['geometry'])], 1.0, 2.0) for f in adm1['features']
                             if f['properties'].get('adm0_a3') == code and f['properties'].get('name') not in ADM1[code])
            m['regions'] = regs; m['rest'] = others
        if code in DOTS:
            dots = []
            for rid, label, lat, lon, src in DOTS[code]:
                if lat is None:
                    nm = src.split(':', 1)[1]
                    t = [f for f in towns['features'] if f['properties'].get('ADM0_A3') == code and f['properties'].get('NAME') == nm][0]
                    lon, lat = t['geometry']['coordinates']; src = 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/'
                x, y = proj(lon, lat)
                dots.append({'id': rid, 'label': label, 'x': round(x, 1), 'y': round(y, 1), 'src': src})
            m['dots'] = dots
        out['maps'][code] = m
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('wrote', a.out, os.path.getsize(a.out), 'bytes', {c: len(json.dumps(v)) for c, v in out['maps'].items()})


if __name__ == '__main__':
    main()
