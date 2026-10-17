#!/usr/bin/env python3
"""App Store screenshots, finished: each raw simulator screen (1320 x 2868, dark mode) in a tilted phone under a serif
headline on matcha green, plus one of the coffee page in light and dark side by side. Writes store_01.png ... at
1320 x 2868 (iPhone 6.9"), the size App Store Connect asks for.

    python3 compose.py <raw dir> <out dir>

The raw screens are named <screen>_<light|dark>.png (native/store-shots.js). Headlines are in Lora, the lines under them
in Inter Display (both SIL Open Font License, in native/appstore/fonts).
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1320, 2868
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_HEAD = os.environ.get('FONT_HEAD', os.path.join(HERE, 'fonts', 'Lora-Variable.ttf'))
FONT_TEXT = os.environ.get('FONT_TEXT', os.path.join(HERE, 'fonts', 'InterDisplay-Medium.otf'))

# the set, in App Store order: (raw screen, headline, line under it, tilt in degrees: + leans left, - leans right).
# The first three show in search results.
SET = [
    ('01_coffee', 'See how your\ncoffee tastes', 'Every cup becomes a flavor shape\nyou can spin and compare.', -5),
    ('02_next_shot', 'Know what to\nchange next', 'A coach reads your notes and numbers\nand says what to try on the next shot.', 5),
    ('03_feed', 'Brew with\nyour friends', 'Photos, likes and comments\non every cup.', -5),
    ('04_community', 'Join a coffee\ncommunity', 'A weekly goal you fill together,\nand monthly awards.', 5),
    ('05_help', 'Stuck? Ask\nfor help', 'Ask about any session,\nand anyone can answer.', -5),
    ('06_roaster', 'Every roaster\ngets a page', 'Their coffees, the best shot on them,\nand who drinks them.', 5),
    ('07_dialin', 'Watch yourself\ndial in', 'Your ratings shot by shot,\nright up to the one that clicks.', -5),
    ('08_log_taste', 'Log a cup\nin seconds', 'Taste sliders, flavor notes and a timer,\nfor every way you brew.', 5),
    ('09_palate', 'Learn what\nyou like', 'Your palate, learned from\neverything you brew.', -5),
]
BOTH = ('01_coffee', 'Light or dark,\nyour call', 'It follows your phone,\nor pick one in Settings.')

# matcha: the app's own green, deep enough that a dark phone and white type both sit well on it
TOP, BOTTOM = (92, 118, 91), (66, 88, 66)
INK, SUB = (250, 248, 241), (218, 228, 214)


def font(path, size, weight=None):
    f = ImageFont.truetype(path, size)
    if weight is not None:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def background():
    bg = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    # a soft light behind the phone
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.5 - 820, 900, W * 0.5 + 820, 2700], fill=46)
    glow = glow.filter(ImageFilter.GaussianBlur(260))
    bg.paste(Image.new('RGB', (W, H), (150, 182, 138)), (0, 0), glow)
    return bg


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def phone(raw, scale, light=False):
    """The screen in an iPhone-like frame (titanium edge, black bezel, side buttons), as one RGBA layer."""
    sw, sh = round(raw.width * scale), round(raw.height * scale)
    screen = raw.convert('RGB').resize((sw, sh), Image.LANCZOS)
    bezel = round(30 * scale / 0.7)            # black glass around the screen
    edge = max(4, round(9 * scale / 0.7))      # the metal band
    r_screen = round(180 * scale)
    pw, ph = sw + 2 * (bezel + edge), sh + 2 * (bezel + edge)
    btn = max(4, round(8 * scale / 0.7))
    layer = Image.new('RGBA', (pw + 2 * btn, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    metal = (196, 199, 194) if light else (58, 61, 59)
    metal_hi = (232, 234, 230) if light else (104, 108, 105)
    # side buttons (action + volume on the left, power on the right), drawn first so the band covers their inner half
    for x0, y0, y1 in ((0, 0.205, 0.245), (0, 0.285, 0.345), (0, 0.36, 0.42)):
        d.rounded_rectangle([x0, round(ph * y0), x0 + btn * 2, round(ph * y1)], radius=btn, fill=metal)
    d.rounded_rectangle([pw, round(ph * 0.30), pw + btn * 2 - 1, round(ph * 0.40)], radius=btn, fill=metal)
    R = r_screen + bezel + edge
    d.rounded_rectangle([btn, 0, btn + pw - 1, ph - 1], radius=R, fill=metal)
    d.rounded_rectangle([btn + 1, 1, btn + pw - 2, ph - 2], radius=R - 1, outline=metal_hi, width=max(2, edge // 3))
    d.rounded_rectangle([btn + edge, edge, btn + pw - 1 - edge, ph - 1 - edge], radius=R - edge, fill=(8, 9, 9))
    layer.paste(screen, (btn + edge + bezel, edge + bezel), rounded_mask((sw, sh), r_screen))
    return layer


def place(img, layer, angle, cx, cy, shadow=150):
    """Tilt the phone, drop a soft shadow under it, and put it centered at (cx, cy)."""
    big = layer.resize((layer.width * 2, layer.height * 2), Image.LANCZOS).rotate(angle, resample=Image.BICUBIC, expand=True)
    rot = big.resize((big.width // 2, big.height // 2), Image.LANCZOS)
    x, y = round(cx - rot.width / 2), round(cy - rot.height / 2)
    a = rot.getchannel('A')
    sh = Image.new('L', (rot.width + 400, rot.height + 400), 0)
    sh.paste(a.point(lambda v: v * shadow // 255), (200, 200))
    sh = sh.filter(ImageFilter.GaussianBlur(60))
    img.paste(Image.new('RGB', sh.size, (16, 26, 16)), (x - 200 + 26, y - 200 + 70), sh)
    img.paste(rot, (x, y), rot)


def text_block(img, head, sub, top=196):
    d = ImageDraw.Draw(img)
    fh, fs = font(FONT_HEAD, 124, 600), font(FONT_TEXT, 46)
    y = top
    for line in head.split('\n'):
        w = d.textlength(line, font=fh)
        d.text(((W - w) / 2, y), line, font=fh, fill=INK)
        y += 140
    y += 30
    for line in sub.split('\n'):
        w = d.textlength(line, font=fs)
        d.text(((W - w) / 2, y), line, font=fs, fill=SUB)
        y += 62
    return y


def single(raw_dir, name, head, sub, angle):
    img = background()
    bottom = text_block(img, head, sub)
    layer = phone(Image.open(os.path.join(raw_dir, f'{name}_dark.png')), 0.70)
    cx = W / 2 + (34 if angle < 0 else -34)
    cy = bottom + 110 + layer.height / 2
    place(img, layer, angle, cx, cy)
    return img


def both(raw_dir, name, head, sub):
    """The same screen in light (behind, leaning left) and dark (in front, leaning right)."""
    img = background()
    bottom = text_block(img, head, sub)
    light = phone(Image.open(os.path.join(raw_dir, f'{name}_light.png')), 0.56, light=True)
    dark = phone(Image.open(os.path.join(raw_dir, f'{name}_dark.png')), 0.56)
    top = bottom + 90
    place(img, light, 7, W * 0.335, top + light.height / 2 + 10, shadow=120)
    place(img, dark, -6, W * 0.665, top + dark.height / 2 + 190)
    return img


def status_bars(raw_dir):
    """The status bar should read the same on every screen, in both looks (9:41, full signal, full battery). Returns the
    screens whose clock or signal differs from most of the others (the simulator can drop its override)."""
    boxes = [(120, 55, 440, 140), (880, 55, 1240, 140)]   # the clock, and the signal / Wi-Fi / battery (not the island)
    def ink(path):
        im = Image.open(path).convert('L')
        bits = []
        for box in boxes:
            px = im.crop(box).tobytes(); med = sorted(px)[len(px) // 2]
            bits += [abs(v - med) > 60 for v in px]
        return bits
    names = sorted(f for f in os.listdir(raw_dir) if f.endswith(('_light.png', '_dark.png')) and not f.startswith(('00_', 'store_')))
    if len(names) < 3:
        return []
    masks = {n: ink(os.path.join(raw_dir, n)) for n in names}
    odd = []
    for n in names:
        diffs = sorted(sum(a != b for a, b in zip(masks[n], masks[m])) for m in names if m != n)
        if diffs[len(diffs) // 2] > 1200:
            odd.append(n)
    return odd


def main(raw_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for n in status_bars(raw_dir):
        print(f'::warning title=Status bar::{n} has a different status bar from the rest')
    made = []
    for i, (name, head, sub, angle) in enumerate(SET, 1):
        if not os.path.exists(os.path.join(raw_dir, f'{name}_dark.png')):
            print(f'::warning title=Screenshots::{name}_dark.png is missing; left out')
            continue
        p = os.path.join(out_dir, f'store_{len(made) + 1:02d}.png')
        single(raw_dir, name, head, sub, angle).save(p, optimize=True)
        made.append(p)
    p = os.path.join(out_dir, f'store_{len(made) + 1:02d}.png')
    both(raw_dir, *BOTH).save(p, optimize=True)
    made.append(p)
    for p in made:
        im = Image.open(p)
        assert im.size == (W, H), (p, im.size)
    print('\n'.join(made))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
