from PIL import Image, ImageDraw
import os

C1 = (0x6C, 0x5C, 0xE7)
C2 = (0x00, 0xB8, 0xA9)

# Bintang 4 sudut + titik kecil, diskalakan dari viewBox 32 pada favicon index.html.
STAR = [(16, 5), (18.3, 11.9), (19.8, 13.4), (26.7, 16), (19.8, 18.6),
        (18.3, 20.1), (16, 26.7), (13.7, 20.1), (12.2, 18.6), (5.3, 16),
        (12.2, 13.4), (13.7, 11.9)]


def draw_logo(size, rounded=True):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad = Image.new('RGBA', (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            px[x, y] = tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3)) + (255,)

    mask = Image.new('L', (size, size), 255)
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1],
                                               radius=int(size * 0.30), fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    k = size / 32.0
    d.polygon([(x * k, y * k) for x, y in STAR], fill=(255, 255, 255, 255))
    for cx, cy, r in ((24.5, 24.5, 2.2), (7.5, 24.0, 1.5)):
        d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k],
                  fill=(255, 255, 255, 255))
    return img


def star_only(size):
    """Bintang putih transparan untuk foreground adaptive icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = size / 32.0
    d.polygon([(x * k, y * k) for x, y in STAR], fill=(255, 255, 255, 255))
    for cx, cy, r in ((24.5, 24.5, 2.2), (7.5, 24.0, 1.5)):
        d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k],
                  fill=(255, 255, 255, 255))
    return img


res = 'android/app/src/main/res'
for dpi, s in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    ic = draw_logo(s)
    ic.save(os.path.join(res, 'mipmap-%s' % dpi, 'ic_launcher.png'))
    ic.save(os.path.join(res, 'mipmap-%s' % dpi, 'ic_launcher_round.png'))

# Adaptive foreground: bintang di area aman (66% tengah), background dari warna brand.
for dpi, s in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    inner = star_only(int(s * 0.66))
    off = (s - inner.width) // 2
    canvas.paste(inner, (off, off), inner)
    canvas.save(os.path.join(res, 'mipmap-%s' % dpi, 'ic_launcher_foreground.png'))

print('icons written')
