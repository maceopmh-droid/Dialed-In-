#!/usr/bin/env python3
"""Makes src/js/05-world-map.js, the world behind the coffee map (v15.1): every country of Natural Earth's 1:110m
admin-0 countries (public domain, https://www.naturalearthdata.com; GitHub nvkelso/natural-earth-vector,
geojson/ne_110m_admin_0_countries.geojson), Antarctica left out, in the Equal Earth projection, as SVG paths in a
1000-wide box with whole-unit coordinates (small enough to ship inside index.html).

    python3 tools/world_map.py <ne_110m_admin_0_countries.geojson>
"""
import json, math, os, sys

W = 1000
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(M * math.sin(phi))
    t2 = th * th; t6 = t2 * t2 * t2
    x = lam * math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


def main(src):
    d = json.load(open(src))
    feats = [f for f in d['features'] if f['properties']['ADM0_A3'] != 'ATA']
    XMAX = equal_earth(180, 0)[0]
    k = (W / 2) / XMAX
    rings = {}
    ys = []
    for f in feats:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        out = []
        for poly in polys:
            for ring in poly[:1]:   # outer rings only (holes are lakes; too small to matter at this size)
                pts = []
                for lon, lat in ring:
                    x, y = equal_earth(lon, lat)
                    pts.append((round(W / 2 + x * k), -y * k))
                out.append(pts)
                ys += [p[1] for p in pts]
        rings[f['properties']['ADM0_A3']] = out
    top = math.floor(min(ys)) - 6
    H = math.ceil(max(ys)) - top + 6
    paths = {}
    for code, rs in rings.items():
        s = []
        for pts in rs:
            q = []
            for x, y in pts:
                p = (x, round(y - top))
                if not q or q[-1] != p:
                    q.append(p)
            if len(q) > 2 and q[0] == q[-1]:
                q.pop()
            if len(q) < 3:
                continue
            area = abs(sum(q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1] for i in range(len(q)))) / 2
            if area < 2 and len(rs) > 1:
                continue   # a speck of an island beside the country's main land
            cmd = [f'M{q[0][0]} {q[0][1]}']
            for (x0, y0), (x1, y1) in zip(q, q[1:]):
                cmd.append(f'{x1 - x0} {y1 - y0}')
            s.append(cmd[0] + 'l' + ' '.join(cmd[1:]) + 'z')
        if s:
            paths[code] = ''.join(s)
    hx, hy = equal_earth(-155.6, 19.7)   # Hawaii (Kona), a dot: it's part of the United States on the map
    dots = {'HI': [round(W / 2 + hx * k), round(-hy * k - top)]}
    # the coffee belt: between the Tropics of Cancer and Capricorn (23.44 degrees north and south)
    belt = [round(-equal_earth(0, 23.44)[1] * k - top, 1), round(-equal_earth(0, -23.44)[1] * k - top, 1)]
    names = {f['properties']['ADM0_A3']: f['properties']['NAME'] for f in feats}
    body = ',\n'.join(f'            {c}: {json.dumps(p)}' for c, p in sorted(paths.items()))
    js = ('        // v15.1: the world behind the coffee map: Natural Earth 1:110m countries (public domain), Equal Earth\n'
          '        // projection, simplified. Made by tools/world_map.py; not edited by hand.\n'
          f'        const WORLD_MAP = {{ w: {W}, h: {H}, belt: {json.dumps(belt)}, dots: {json.dumps(dots)}, names: {json.dumps(names, ensure_ascii=False)}, c: {{\n{body}\n        }} }};\n')
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'js', '05-world-map.js')
    open(out, 'w', encoding='utf-8').write(js)
    print(f'{len(paths)} countries, {W} x {H}, {len(js.encode())} bytes -> {os.path.relpath(out)}')


if __name__ == '__main__':
    main(sys.argv[1])
