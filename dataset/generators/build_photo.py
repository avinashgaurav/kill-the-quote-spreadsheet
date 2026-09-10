"""
Vendor 4: a phone photo of a printed rate card, taken at an angle.

This is the single hardest input in the dataset, so it is built rather than
faked: a real page is rendered, hand-annotated, then photographed through a
synthetic camera (perspective warp, uneven lighting, a glare hotspot, lens
blur, sensor noise, JPEG compression).

The result is a genuine image-extraction problem. Nothing about the numbers is
recoverable from metadata or a text layer, because there is no text layer.

Built-in traps:
  - two printed prices struck through in pen, with the real price written above
  - one price destroyed by glare: present, legible as "a price", unreadable as a
    number. The system must say so rather than interpolate.
  - RAM quoted per DIMM, transceivers and patch cords per piece
  - abbreviated descriptions that need fuzzy matching back to RFx lines
  - "+ GST" scrawled with no rate, and a circled conditional discount
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from pathlib import Path

from catalog import LINES, QUOTES, VENDORS, RFX

OUT = Path(__file__).resolve().parents[1] / "out" / "04-vendor-vector"

F = "/System/Library/Fonts/Supplemental/"
FONTS = dict(
    head=F + "Arial Bold.ttf",
    body=F + "Arial.ttf",
    narrow=F + "Arial Narrow.ttf",
    mono=F + "Courier New.ttf",
    pen=F + "Bradley Hand Bold.ttf",
)

PAGE_W, PAGE_H = 1700, 1980          # the printed page, cropped as shot
CANVAS = (2280, 3040)                 # the final photo
INK = (28, 28, 32)
PEN = (18, 38, 120)                   # blue ballpoint
PAPER = (250, 249, 245)

# Short-form descriptions, the way a small reseller actually prints a rate card.
SHORT = {
    1:  "LT 14in i5/16/512 W11P 3Y",
    2:  "LT 14in i7/32/1TB W11P 3Y",
    3:  "LT 13in ultra i5/16/512 3Y",
    4:  "DSKTP SFF i5/8/512 3Y",
    5:  'MON 24" FHD IPS adj',
    6:  'MON 27" QHD USB-C',
    7:  "DOCK USB-C 2x4K 100W",
    8:  "BAG 15.6in",
    9:  "KB+MSE wireless",
    10: "HDST USB ANC UC",
    11: "CAM 1080p",
    12: "SRV 2U 2xSilver4410Y 128G",
    13: "RAM 16GB RDIMM DDR5",
    14: "SSD 1.92TB SAS MU",
    18: "SW 48P GbE PoE+ L2",
    20: "SFP+ 10G SR",
    21: "AP WiFi6 + 3Y lic",
    22: "P/CORD CAT6A 2M",
    25: "UPS 3KVA RM 15min",
    27: "SCAN 2D BT + cradle",
    28: "HHT rugged Andr 3Y",
    29: 'DSP 55" 24x7 + mount',
}


def font(kind, size):
    return ImageFont.truetype(FONTS[kind], size)


def render_page():
    """The flat, printed, hand-annotated page, before the camera touches it."""
    img = Image.new("RGB", (PAGE_W, PAGE_H), PAPER)
    d = ImageDraw.Draw(img)
    v = next(x for x in VENDORS if x["code"] == "V4")

    # --- letterhead -------------------------------------------------------
    d.rectangle([0, 0, PAGE_W, 14], fill=(150, 30, 35))
    d.text((90, 70), "VECTOR DIGITAL SYSTEMS", font=font("head", 54), fill=(150, 30, 35))
    d.text((92, 138), "IT Infrastructure  |  Networking  |  Retail Automation",
           font=font("narrow", 27), fill=(90, 90, 95))
    d.text((92, 178), "No. 42/3, Second Floor, Nungambakkam High Road, Chennai 600034",
           font=font("narrow", 24), fill=(110, 110, 115))
    d.text((92, 210), f"GSTIN {v['gstin']}   |   {v['phone']}   |   {v['email']}",
           font=font("narrow", 24), fill=(110, 110, 115))
    d.line([90, 258, PAGE_W - 90, 258], fill=(190, 190, 195), width=3)

    # --- title block ------------------------------------------------------
    d.text((90, 292), "RATE CARD - CORPORATE SUPPLY", font=font("head", 38), fill=INK)
    d.text((90, 346), f"Ref: {RFX['id']}   Attn: {RFX['buyer_contact']['name']}, "
                      f"Kaveri Retail", font=font("body", 26), fill=INK)
    d.text((90, 384), "Date: 17.09.2026", font=font("body", 26), fill=INK)

    # --- table ------------------------------------------------------------
    x0, y = 90, 452
    col = [x0, x0 + 84, x0 + 700, x0 + 900, x0 + 1180, PAGE_W - 90]
    hdr = font("head", 25)
    d.rectangle([x0, y, PAGE_W - 90, y + 52], fill=(232, 231, 226))
    for cx, label in zip(col, ["S.NO", "DESCRIPTION", "QTY", "UNIT", "RATE (Rs)"]):
        d.text((cx + 14, y + 15), label, font=hdr, fill=INK)
    y += 52

    bf = font("body", 25)
    mf = font("mono", 25)
    rows = []                                    # (line_no, y_top, y_bottom)

    for ln in LINES:
        n = ln["no"]
        if n not in SHORT:
            continue
        q = QUOTES["V4"].get(n)
        if q is None or q["status"] == "omitted":
            continue

        h = 50
        d.line([x0, y + h, PAGE_W - 90, y + h], fill=(215, 215, 218), width=2)
        d.text((col[0] + 20, y + 13), str(n), font=bf, fill=INK)
        d.text((col[1] + 14, y + 13), SHORT[n], font=bf, fill=INK)
        d.text((col[2] + 20, y + 13), str(ln["qty"]), font=bf, fill=INK)

        unit = q.get("uom", ln["uom"]).replace("per ", "").upper()
        d.text((col[3] + 14, y + 13), unit, font=bf, fill=INK)

        printed = q.get("printed_price", q.get("price"))
        txt = f"{printed:,}".replace(",", ",")
        w = d.textlength(txt, font=mf)
        d.text((col[5] - 20 - w, y + 13), txt, font=mf, fill=INK)

        rows.append((n, y, y + h, col[5] - 20 - w, w))
        y += h

    d.rectangle([x0, 452, PAGE_W - 90, y], outline=(150, 150, 155), width=3)
    for cx in col[1:-1]:
        d.line([cx, 452, cx, y], fill=(200, 200, 205), width=2)

    # --- printed footer ---------------------------------------------------
    fy = y + 40
    d.text((90, fy), "Terms:", font=font("head", 25), fill=INK)
    for i, t in enumerate([
        "1. Rates are for corporate supply against firm purchase order.",
        "2. Lines not appearing above are not currently supplied by us.",
        "3. Delivery 3-4 weeks from receipt of order, subject to stock.",
    ]):
        d.text((90, fy + 38 + i * 34), t, font=font("body", 24), fill=INK)

    d.text((90, fy + 190), "For Vector Digital Systems", font=font("body", 25), fill=INK)
    d.text((90, fy + 300), "Authorised Signatory", font=font("body", 24), fill=INK)
    d.line([90, fy + 292, 430, fy + 292], fill=(140, 140, 145), width=2)

    # ======================================================================
    # Pen annotations. These OVERRIDE the printed values, which is precisely
    # the thing a template-based extractor gets wrong.
    # ======================================================================
    pen_big = font("pen", 40)
    pen_sm = font("pen", 32)

    for n, yt, yb, px, pw in rows:
        q = QUOTES["V4"][n]
        if not q.get("handwritten"):
            continue
        mid = (yt + yb) // 2
        # a struck-through printed price, drawn slightly off-horizontal
        d.line([px - 10, mid + 6, px + pw + 12, mid - 8], fill=PEN, width=5)
        # the real price written above and to the left, at a slight angle
        new = f"{q['price']:,}"
        chip = Image.new("RGBA", (330, 90), (0, 0, 0, 0))
        ImageDraw.Draw(chip).text((6, 6), new, font=pen_big, fill=PEN + (255,))
        chip = chip.rotate(4.5, resample=Image.BICUBIC, expand=True)
        img.paste(chip, (int(px - 300), int(yt - 36)), chip)

    # "+ GST" with no rate, scrawled at the foot of the rate column
    chip = Image.new("RGBA", (300, 90), (0, 0, 0, 0))
    ImageDraw.Draw(chip).text((6, 6), "+ GST", font=pen_big, fill=PEN + (255,))
    chip = chip.rotate(-6, resample=Image.BICUBIC, expand=True)
    img.paste(chip, (PAGE_W - 380, y + 8), chip)

    # circled conditional discount, in the right margin
    chip = Image.new("RGBA", (620, 200), (0, 0, 0, 0))
    cd = ImageDraw.Draw(chip)
    cd.text((40, 58), "5% if PO by 25 Sep", font=pen_sm, fill=PEN + (255,))
    cd.ellipse([14, 34, 600, 140], outline=PEN + (255,), width=6)
    cd.arc([10, 28, 606, 148], start=200, end=340, fill=PEN + (255,), width=5)
    chip = chip.rotate(-3.5, resample=Image.BICUBIC, expand=True)
    img.paste(chip, (PAGE_W - 720, fy + 120), chip)

    return img, rows


def glare(img, rows, target_line=6):
    """
    A specular hotspot from the phone flash, landing on one price.

    Deliberately destructive: after this the number is not recoverable by any
    means. A system that reports a value here is guessing, and the buyer has no
    way to know. Reporting 'unreadable' is the only honest output.
    """
    row = next((r for r in rows if r[0] == target_line), None)
    if row is None:
        return img
    _, yt, yb, px, pw = row
    cx, cy = int(px + pw / 2), (yt + yb) // 2

    # halo: wide, soft, non-destructive
    halo = Image.new("L", img.size, 0)
    hd = ImageDraw.Draw(halo)
    for rx, ry, val in [(300, 120, 70), (220, 88, 120), (150, 60, 170)]:
        hd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=val)
    halo = halo.filter(ImageFilter.GaussianBlur(40))
    img.paste(Image.new("RGB", img.size, (255, 255, 252)), (0, 0), halo)

    # core: blown out. Covers the full width of the number, hard-edged, then
    # only lightly feathered so the digits do not survive underneath.
    core = Image.new("L", img.size, 0)
    cd = ImageDraw.Draw(core)
    cd.ellipse([cx - int(pw * 0.78) - 26, cy - 34,
                cx + int(pw * 0.78) + 26, cy + 34], fill=255)
    cd.ellipse([cx - int(pw * 0.95), cy - 22, cx + int(pw * 0.95), cy + 22], fill=255)
    core = core.filter(ImageFilter.GaussianBlur(9))
    img.paste(Image.new("RGB", img.size, (255, 255, 255)), (0, 0), core)
    return img


def perspective(img, size, quad):
    """Map the page's four corners onto `quad` in the output frame."""
    w, h = img.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    A, B = [], []
    for (sx, sy), (dx, dy) in zip(src, quad):
        A.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        A.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        B += [sx, sy]
    coeffs = np.linalg.solve(np.array(A, dtype=float), np.array(B, dtype=float))
    return img.transform(size, Image.PERSPECTIVE, coeffs.tolist(),
                         resample=Image.BICUBIC, fillcolor=None)


def photograph(page):
    """Put the page on a desk and shoot it handheld, off-axis, under one lamp."""
    W, H = CANVAS

    # desk: a dark surface with a soft falloff
    bg = Image.new("RGB", (W, H), (46, 43, 40))
    bd = ImageDraw.Draw(bg)
    for i in range(0, H, 4):
        t = i / H
        bd.line([0, i, W, i], fill=(int(52 - 16 * t), int(48 - 15 * t), int(44 - 14 * t)))

    # handheld framing: page tilted, near corner larger than far corner
    quad = [(250, 232), (2062, 296), (2004, 2836), (192, 2740)]

    warped = perspective(page.convert("RGBA"), (W, H), quad)

    # contact shadow, offset down-right from the sheet
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(x + 34, y + 44) for x, y in quad], fill=190)
    mask = mask.filter(ImageFilter.GaussianBlur(38))
    bg.paste(Image.new("RGB", (W, H), (12, 11, 10)), (0, 0), mask)

    bg.paste(warped, (0, 0), warped)
    img = bg

    # one lamp, upper left: a broad luminance gradient across the frame
    lamp = Image.new("L", (W, H), 0)
    ld = ImageDraw.Draw(lamp)
    for i in range(26, 0, -1):
        r = int(i / 26 * max(W, H) * 1.15)
        ld.ellipse([560 - r, 300 - r, 560 + r, 300 + r], fill=int(30 * (1 - i / 26)))
    lamp = lamp.filter(ImageFilter.GaussianBlur(150))
    img = Image.composite(ImageEnhance.Brightness(img).enhance(1.16), img, lamp)

    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse([-int(W * 0.22), -int(H * 0.22),
                                 int(W * 1.22), int(H * 1.22)], fill=255)
    img = Image.composite(img, ImageEnhance.Brightness(img).enhance(0.70),
                          vig.filter(ImageFilter.GaussianBlur(210)))

    # optics and sensor: slight defocus, mild warmth, chroma noise
    img = img.filter(ImageFilter.GaussianBlur(0.75))
    img = ImageEnhance.Color(img).enhance(1.06)
    a = np.asarray(img).astype(np.int16)
    rng = np.random.default_rng(20260917)
    a += rng.normal(0, 3.4, a.shape).astype(np.int16)
    a[..., 0] = np.clip(a[..., 0] * 1.015, 0, 255)
    a[..., 2] = np.clip(a[..., 2] * 0.985, 0, 255)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    page, rows = render_page()
    page = glare(page, rows, target_line=6)

    photo = photograph(page)
    p = OUT / "IMG_20260917_1142_vector_rate_card.jpg"
    photo.save(p, "JPEG", quality=79, optimize=True)

    # The flat page is kept for the eval harness only: it lets us measure how
    # much accuracy the camera costs us. The demo never sees it.
    ref = OUT.parent / "99-internal" / "v4_rate_card_flat_REFERENCE.png"
    ref.parent.mkdir(parents=True, exist_ok=True)
    page.save(ref, "PNG")

    priced = [n for n, *_ in rows]
    print(f"photo   {p.name}   {photo.size[0]}x{photo.size[1]}  "
          f"{p.stat().st_size/1024:.0f} KB")
    print(f"        {len(priced)} of 30 lines on the card: {priced}")
    print(f"        glare over line 6 price; pen overrides on lines "
          f"{[n for n, *_ in rows if QUOTES['V4'][n].get('handwritten')]}")
    print(f"ref     {ref.name} (eval harness only, never shown to the pipeline)")


if __name__ == "__main__":
    main()
