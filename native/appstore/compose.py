#!/usr/bin/env python3
"""App Store screenshots, finished: each raw simulator screen (1320 x 2868, from the app-store-shots branch) in a phone
frame under a short headline, on the app's own paper and matcha colors, alternating light and dark, plus one of both
looks side by side. Writes store_01.png ... at 1320 x 2868 (iPhone 6.9"), the size App Store Connect asks for.

    python3 compose.py <raw dir> <out dir>

The raw screens are named <screen>_<light|dark>.png (native/store-shots.js). The fonts are Inter (close to Apple's own
SF Pro); FONT_BOLD and FONT_TEXT point elsewhere if needed.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1320, 2868
FONT_BOLD = os.environ.get('FONT_BOLD', '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf')
FONT_TEXT = os.environ.get('FONT_TEXT', '/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf')

# the set, in App Store order: (raw screen, look, headline, line under it). The first three show in search results.
SET = [
    ('02_next_shot', 'light', 'Your next shot,\nfigured out', 'A coach reads your notes and numbers and\ntells you exactly what to change.'),
    ('01_coffee', 'dark', 'Every coffee gets\nits own page', 'Its flavor shape, your best shot,\nand every session on it.'),
    ('05_log_taste', 'light', 'Log a cup\nin seconds', 'Taste sliders, flavor notes and a timer,\nfor every way you brew.'),
    ('03_vs_last', 'dark', 'See exactly\nwhat changed', 'Every session side by side\nwith the one before it.'),
    ('04_dialin', 'light', 'Watch yourself\ndial in', 'Your ratings shot by shot,\nright up to the one that clicks.'),
    ('06_palate', 'dark', 'Get to know\nyour palate', 'What you love, learned from\neverything you brew.'),
    ('07_collection', 'light', 'Your whole\ncoffee shelf', 'Every bag you\'ve tried,\nand how good it got.'),
]
BOTH = ('01_coffee', 'Light or dark,\nyour call', 'It follows your phone,\nor pick one in Settings.')

LOOKS = {
    'light': dict(top=(248, 244, 236), bottom=(236, 229, 216), glow=(118, 150, 112), glow_a=58, ink=(30, 36, 32), sub=(100, 108, 101),
                  frame=(30, 32, 31), rim=(78, 82, 80), shadow=90),
    'dark': dict(top=(19, 26, 22), bottom=(9, 13, 11), glow=(104, 156, 112), glow_a=70, ink=(243, 240, 233), sub=(163, 172, 165),
                 frame=(44, 47, 45), rim=(92, 97, 94), shadow=170),
}


def background(look):
    L = LOOKS[look]
    bg = Image.new('RGB', (W, H))
    px = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / (H - 1)
        px.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(L['top'], L['bottom'])))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.5 - 760, 1180, W * 0.5 + 760, 2780], fill=L['glow_a'])
    glow = glow.filter(ImageFilter.GaussianBlur(230))
    bg.paste(Image.new('RGB', (W, H), L['glow']), (0, 0), glow)
    return bg


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def phone(raw, look, scale):
    """The screen in a thin dark frame with the iPhone's rounded corners, and its shadow (returned as one RGBA layer)."""
    L = LOOKS[look]
    sw, sh = round(raw.width * scale), round(raw.height * scale)
    screen = raw.convert('RGB').resize((sw, sh), Image.LANCZOS)
    bezel = round(22 * scale / 0.74)
    r_screen = round(170 * scale)
    pw, ph = sw + 2 * bezel, sh + 2 * bezel
    pad = 160
    layer = Image.new('RGBA', (pw + 2 * pad, ph + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new('L', layer.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle([pad, pad + 40, pad + pw, pad + ph + 40], radius=r_screen + bezel, fill=L['shadow'])
    shadow = shadow.filter(ImageFilter.GaussianBlur(56))
    layer.paste(Image.new('RGBA', layer.size, (0, 0, 0, 255)), (0, 0), shadow)
    body = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=r_screen + bezel, fill=L['frame'] + (255,))
    d.rounded_rectangle([2, 2, pw - 3, ph - 3], radius=r_screen + bezel - 2, outline=L['rim'] + (255,), width=2)
    body.paste(screen, (bezel, bezel), rounded_mask((sw, sh), r_screen))
    layer.alpha_composite(body, (pad, pad))
    return layer, pad


def text_block(img, look, head, sub, top=200):
    L = LOOKS[look]
    d = ImageDraw.Draw(img)
    fh, fs = ImageFont.truetype(FONT_BOLD, 104), ImageFont.truetype(FONT_TEXT, 46)
    y = top
    for line in head.split('\n'):
        w = d.textlength(line, font=fh)
        d.text(((W - w) / 2, y), line, font=fh, fill=L['ink'])
        y += 118
    y += 30
    for line in sub.split('\n'):
        w = d.textlength(line, font=fs)
        d.text(((W - w) / 2, y), line, font=fs, fill=L['sub'])
        y += 62
    return y


def single(raw_dir, name, look, head, sub):
    img = background(look)
    bottom = text_block(img, look, head, sub)
    raw = Image.open(os.path.join(raw_dir, f'{name}_{look}.png'))
    layer, pad = phone(raw, look, 0.74)
    y = max(bottom + 70, 640)
    img.paste(layer, ((W - layer.width) // 2, y - pad), layer)
    return img


def both(raw_dir, name, head, sub):
    """Both looks of the same screen, the dark phone in front of the light one."""
    img = background('light')
    bottom = text_block(img, 'light', head, sub)
    left, pad = phone(Image.open(os.path.join(raw_dir, f'{name}_light.png')), 'light', 0.5)
    right, _ = phone(Image.open(os.path.join(raw_dir, f'{name}_dark.png')), 'dark', 0.5)
    pw = left.width - 2 * pad
    y = max(bottom + 90, 680)
    gap = 120   # how much the two phones overlap
    x0 = (W - (2 * pw - gap)) // 2
    img.paste(left, (x0 - pad, y - pad), left)
    img.paste(right, (x0 + pw - gap - pad, y - pad + 170), right)
    return img


def main(raw_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for i, (name, look, head, sub) in enumerate(SET, 1):
        p = os.path.join(out_dir, f'store_{i:02d}.png')
        single(raw_dir, name, look, head, sub).save(p, optimize=True)
        made.append(p)
    p = os.path.join(out_dir, f'store_{len(SET) + 1:02d}.png')
    both(raw_dir, *BOTH).save(p, optimize=True)
    made.append(p)
    for p in made:
        im = Image.open(p)
        assert im.size == (W, H), (p, im.size)
    print('\n'.join(made))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
