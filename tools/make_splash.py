#!/usr/bin/env python3
"""v15.8: the Home Screen app's launch pictures (apple-touch-startup-image), so an iPhone opens Dialed In on its own
paper color instead of black. One plain picture per iPhone screen size, light and dark; prints the <link> lines for
src/index.html. Run from the repo root: python3 tools/make_splash.py"""
import os
from PIL import Image

LIGHT, DARK = (243, 238, 228), (12, 16, 13)   # --paper in light and dark (src/css/01-layout.css)
# (CSS width, CSS height, pixel ratio): iPhone screens from the SE to the 17 Pro Max
SIZES = [(440, 956, 3), (430, 932, 3), (420, 912, 3), (402, 874, 3), (393, 852, 3), (390, 844, 3), (428, 926, 3),
         (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2)]

os.makedirs('splash', exist_ok=True)
lines = {'light': [], 'dark': []}
for w, h, r in SIZES:
    px = f'{w * r}x{h * r}'
    for look, color in (('light', LIGHT), ('dark', DARK)):
        Image.new('RGB', (w * r, h * r), color).save(f'splash/{px}-{look}.png', optimize=True)
        media = f'(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)'
        if look == 'dark': media += ' and (prefers-color-scheme: dark)'
        lines[look].append(f'    <link rel="apple-touch-startup-image" media="{media}" href="splash/{px}-{look}.png">')
print('\n'.join(lines['light'] + lines['dark']))
