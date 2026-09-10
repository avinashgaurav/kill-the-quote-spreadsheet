"""
Harder photographs of the same rate card.

One clean synthetic photo is not a real test. Real phone photos of a printed
quote arrive curled, thumbed, motion-blurred and lit by whatever was overhead.

These variants exist so the pipeline can be measured as conditions degrade,
rather than demoed once on its best input. Same page, same 22 prices, same
ground truth, five different cameras. Accuracy is expected to fall; what must
NOT happen is confidence staying high while accuracy falls.

The canonical demo input stays IMG_20260917_1142 (the moderate one). These are
the stress set, and the accuracy-vs-condition table they produce is the honest
answer to "how well does your extraction actually work".
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from pathlib import Path

from build_photo import render_page, glare, perspective, CANVAS, OUT

VAR = OUT / "variants"


def base_page():
    page, rows = render_page()
    return glare(page, rows, target_line=6), rows


def curl(img, amount=54):
    """Paper does not lie flat. Bow the page so text baselines bend."""
    a = np.asarray(img)
    h, w = a.shape[:2]
    out = np.zeros_like(a)
    for x in range(w):
        # cosine bow, strongest at the edges, plus a slight vertical squeeze
        shift = int(amount * np.cos(np.pi * (x / w - 0.5)) - amount * 0.35)
        out[:, x] = np.roll(a[:, x], shift, axis=0)
    return Image.fromarray(out)


def desk(size, warmth=0):
    W, H = size
    bg = Image.new("RGB", (W, H), (46, 43, 40))
    d = ImageDraw.Draw(bg)
    for i in range(0, H, 4):
        t = i / H
        d.line([0, i, W, i], fill=(int(52 - 16 * t) + warmth,
                                   int(48 - 15 * t), int(44 - 14 * t) - warmth // 2))
    return bg


def thumb(img, quad):
    """A thumb over the bottom-left corner, occluding part of the page."""
    d = ImageDraw.Draw(img, "RGBA")
    x, y = quad[3]
    d.ellipse([x - 60, y - 250, x + 250, y + 130], fill=(196, 152, 126, 255))
    d.ellipse([x - 40, y - 232, x + 226, y + 100], fill=(212, 168, 141, 255))
    d.arc([x + 40, y - 210, x + 210, y - 40], start=210, end=330,
          fill=(168, 126, 104, 255), width=7)
    return img.filter(ImageFilter.GaussianBlur(0.4))


def shoot(page, quad, *, blur=0.75, noise=3.4, exposure=1.0, motion=0,
          warmth=0, occlude=False, jpeg=79):
    W, H = CANVAS
    bg = desk(CANVAS, warmth)
    warped = perspective(page.convert("RGBA"), CANVAS, quad)

    mask = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(mask).polygon([(x + 34, y + 44) for x, y in quad], fill=190)
    bg.paste(Image.new("RGB", CANVAS, (12, 11, 10)), (0, 0),
             mask.filter(ImageFilter.GaussianBlur(38)))
    bg.paste(warped, (0, 0), warped)
    img = bg

    if occlude:
        img = thumb(img, quad)

    if motion:
        # directional smear: average several sub-pixel offsets along one axis
        acc = np.zeros((H, W, 3), dtype=np.float64)
        n = 9
        for i in range(n):
            off = int((i - n // 2) * motion / n)
            acc += np.asarray(img.rotate(0, translate=(off, off // 3)), dtype=np.float64)
        img = Image.fromarray((acc / n).astype(np.uint8))

    vig = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(vig).ellipse([-int(W * .22), -int(H * .22),
                                 int(W * 1.22), int(H * 1.22)], fill=255)
    img = Image.composite(img, ImageEnhance.Brightness(img).enhance(0.70),
                          vig.filter(ImageFilter.GaussianBlur(210)))

    if exposure != 1.0:
        img = ImageEnhance.Brightness(img).enhance(exposure)
        if exposure < 1.0:
            img = ImageEnhance.Contrast(img).enhance(0.88)

    img = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img).astype(np.int16)
    rng = np.random.default_rng(4471)
    a += rng.normal(0, noise, a.shape).astype(np.int16)
    if warmth:
        a[..., 0] = np.clip(a[..., 0] * 1.05, 0, 255)
        a[..., 2] = np.clip(a[..., 2] * 0.93, 0, 255)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), jpeg


VARIANTS = [
    dict(name="v1_flat_bright", label="Flat on a desk, good light, slight angle",
         difficulty="easy", quad=[(228, 210), (2072, 244), (2050, 2856), (208, 2812)],
         kw=dict(blur=0.55, noise=2.2, jpeg=90)),

    dict(name="v2_moderate", label="Handheld, off-axis, one overhead lamp "
                                  "(CANONICAL DEMO INPUT)",
         difficulty="moderate", quad=[(250, 232), (2062, 296), (2004, 2836), (192, 2740)],
         kw=dict(blur=0.75, noise=3.4, jpeg=79)),

    dict(name="v3_curled_thumb", label="Curled page, thumb over the bottom-left corner",
         difficulty="hard", quad=[(276, 268), (2036, 218), (2088, 2802), (168, 2884)],
         curl=58, kw=dict(blur=0.95, noise=4.2, occlude=True, jpeg=68)),

    dict(name="v4_lowlight_motion", label="Low light, handheld motion blur, warm tungsten",
         difficulty="very hard", quad=[(300, 300), (2010, 200), (2064, 2790), (150, 2900)],
         curl=32, kw=dict(blur=1.5, noise=8.5, exposure=0.62, motion=16,
                          warmth=14, jpeg=52)),

    dict(name="v5_steep_angle", label="Steep angle, strong keystone, screen-side glare",
         difficulty="very hard", quad=[(430, 176), (1904, 402), (2136, 2760), (128, 2560)],
         curl=44, kw=dict(blur=1.1, noise=5.4, exposure=1.08, jpeg=61)),
]


def main():
    VAR.mkdir(parents=True, exist_ok=True)
    page, rows = base_page()

    print(f"{len(rows)} priced lines on the card, identical across every variant\n")
    print(f"{'file':40} {'difficulty':11} {'size':>9}  condition")
    print("-" * 108)
    for v in VARIANTS:
        pg = curl(page, v["curl"]) if v.get("curl") else page
        img, jpeg = shoot(pg, v["quad"], **v["kw"])
        p = VAR / f"{v['name']}.jpg"
        img.save(p, "JPEG", quality=jpeg, optimize=True)
        print(f"{p.name:40} {v['difficulty']:11} {p.stat().st_size/1024:7.0f} KB  "
              f"{v['label']}")

    (VAR / "README.md").write_text(
        "# Photo stress set\n\n"
        "Five photographs of the same printed rate card. Same 22 line items, same\n"
        "prices, same ground truth in `../99-internal/ground-truth.json`.\n\n"
        "`v2_moderate` is the canonical demo input and is identical to\n"
        "`../04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg`.\n\n"
        "These exist to produce an accuracy-vs-condition curve rather than a single\n"
        "number from a single favourable input. Extraction accuracy is expected to\n"
        "fall from easy to very hard. The requirement is not that it stays high; the\n"
        "requirement is that reported confidence falls with it, and that lines the\n"
        "model cannot read are returned as unreadable rather than guessed.\n\n"
        "A run where accuracy drops and confidence does not is a failing run, even\n"
        "if the headline accuracy looks acceptable.\n\n"
        "| file | difficulty | condition |\n|---|---|---|\n"
        + "".join(f"| `{v['name']}.jpg` | {v['difficulty']} | {v['label']} |\n"
                 for v in VARIANTS))
    print(f"\nwrote {VAR / 'README.md'}")


if __name__ == "__main__":
    main()
