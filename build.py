#!/usr/bin/env python3
"""Build Dialed In: src/ -> index.html (the one file GitHub Pages serves).

    python3 build.py                 build index.html (refuses if a check fails)
    python3 build.py --out X.html    build somewhere else
    python3 build.py --check F.html  build in memory and confirm it is byte-for-byte F.html (exit 1 if not)
    python3 build.py --bump 14.2     set the version in all three places (in src/index.html), then build

src/index.html is the page itself. A line that reads exactly `@@include <path>` is replaced by that file
(paths are relative to src/). Nothing else is changed, so the output is exactly the files, in order.
"""
import argparse, hashlib, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
INC = re.compile(r'^@@include (\S+)$')


def assemble():
    out = []
    for line in open(os.path.join(SRC, 'index.html'), encoding='utf-8').read().split('\n'):
        m = INC.match(line)
        if not m:
            out.append(line)
            continue
        path = os.path.join(SRC, m.group(1))
        if not os.path.isfile(path):
            sys.exit(f'missing include: src/{m.group(1)}')
        text = open(path, encoding='utf-8').read()
        if not text.endswith('\n'):
            sys.exit(f'src/{m.group(1)} must end with a newline')
        out.extend(text.split('\n')[:-1])
    return '\n'.join(out)


def checks(s):
    bad = []
    m = re.search(r'<meta name="dialed-in-version" content="([\d.]+)">', s)
    v = m.group(1) if m else None
    if not v: bad.append('meta dialed-in-version missing')
    elif s.split('\n')[1] != f'<!-- Dialed In v{v} -->': bad.append(f'line 2 is not <!-- Dialed In v{v} -->')
    elif f'Dialed In · v{v}' not in s: bad.append(f'Settings line "Dialed In · v{v}" missing')
    if '<link rel="apple-touch-icon" href="icon.png">' not in s: bad.append('apple-touch-icon link missing')
    # every app method is defined once (a second definition silently replaces the first)
    body = s[s.find('        const app = {'):] if '        const app = {' in s else s   # the app object (the data layer above it has its own pull/send)
    names = [n for n in re.findall(r'^            (?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{', body, re.M)
             if n not in {'if', 'for', 'while', 'switch', 'catch', 'function', 'return'}]
    seen, dup = set(), set()
    for n in names: (dup if n in seen else seen).add(n)
    if dup: bad.append('app methods defined twice: ' + ', '.join(sorted(dup)))
    # every inline script parses (one stray bracket and the app won't start)
    if shutil.which('node'):
        for i, sm in enumerate(re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S)):
            fd, js = tempfile.mkstemp(suffix='.js'); os.close(fd)
            open(js, 'w', encoding='utf-8').write(sm.group(1))
            r = subprocess.run(['node', '--check', js], capture_output=True, text=True)
            os.unlink(js)
            if r.returncode:
                bad.append(f'script {i} does not parse: ' + ' '.join(l for l in r.stderr.splitlines() if 'Error' in l)[:200])
    else:
        print('note: node not found, skipped the script parse check')
    return v, bad


def bump(new):
    if not re.fullmatch(r'\d+\.\d+', new): sys.exit('version looks like 14.2')
    p = os.path.join(SRC, 'index.html')
    t = open(p, encoding='utf-8').read()
    old = re.search(r'<meta name="dialed-in-version" content="([\d.]+)">', t).group(1)
    for a, b in [(f'<!-- Dialed In v{old} -->', f'<!-- Dialed In v{new} -->'),
                 (f'<meta name="dialed-in-version" content="{old}">', f'<meta name="dialed-in-version" content="{new}">'),
                 (f'Dialed In · v{old}', f'Dialed In · v{new}')]:
        if t.count(a) != 1: sys.exit(f'expected exactly one "{a}" in src/index.html')
        t = t.replace(a, b)
    open(p, 'w', encoding='utf-8').write(t)
    print(f'version {old} -> {new}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'index.html'))
    ap.add_argument('--check')
    ap.add_argument('--bump')
    a = ap.parse_args()
    if a.bump: bump(a.bump)
    s = assemble()
    sha = hashlib.sha256(s.encode('utf-8')).hexdigest()
    if a.check:
        want = hashlib.sha256(open(a.check, 'rb').read()).hexdigest()
        print(f'built  {sha}\nfile   {want}')
        sys.exit(0 if sha == want else 1)
    v, bad = checks(s)
    if bad:
        print('BUILD REFUSED:'); [print('  -', b) for b in bad]; sys.exit(1)
    open(a.out, 'w', encoding='utf-8').write(s)
    print(f'built {os.path.relpath(a.out)}  v{v}  {len(s.encode("utf-8"))} bytes  sha256 {sha}')


if __name__ == '__main__':
    main()
