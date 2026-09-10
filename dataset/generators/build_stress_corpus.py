"""
A stress corpus for the readers.

    python3 build_stress_corpus.py

The five canonical vendor replies test the happy version of each format. This
builds the awkward versions, each one aimed at a specific way a reader can
silently lose information:

  xlsx  table not starting at A1 · merged multi-row headers · prices stored as
        text with a rupee glyph · a second sheet holding the real prices ·
        blank spacer rows and section banners · a totals block above the table
  pdf   two-column layout · landscape · a footnote on a later page than the
        numbers it modifies · an IMAGE-ONLY page with no text layer at all
  docx  prices only in prose · prices only in a table · a nested table ·
        a numbered list carrying the commercials
  eml   HTML-only body · a forwarded chain with the quote buried three levels
        down · quoted-printable encoding · prices in an attached body part
  jpg   flat scan · steep angle · low light · finger occlusion · a photo of a
        screen showing a spreadsheet

Every file carries the SAME underlying prices as the canonical set, so a reader
test can assert that the information survived the format rather than guessing at
what the right answer was.

The point is not to test the model. It is to test that the mechanical layer puts
the model in a position to succeed: if the laid-out text does not contain the
price and its address, no model can recover them.
"""

import base64
import email.message
import email.utils
import quopri
from datetime import datetime
from pathlib import Path

import numpy as np
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from docx import Document
from docx.shared import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle, PageBreak, Frame, PageTemplate,
                                BaseDocTemplate)

from catalog import LINES, QUOTES, VENDORS, RFX, BUYER

OUT = Path(__file__).resolve().parents[1] / "out" / "98-stress"
F = "/System/Library/Fonts/Supplemental/"

# A fixed subset, so every variant carries identical facts and a test can assert
# on them without re-deriving the expected answer per file.
SUBSET = [1, 2, 5, 7, 12, 13, 18, 20, 22, 27]
V1 = QUOTES["V1"]

# What every reader must surface, whatever the format.
EXPECTED = [
    dict(line=n, price=V1[n]["price"], uom=V1[n].get("uom", "nos"),
         sku=next(l["sku"] for l in LINES if l["no"] == n))
    for n in SUBSET
]

written: list[tuple[Path, str]] = []


def note(p: Path, what: str):
    written.append((p, what))


def font(name, size):
    return ImageFont.truetype(F + name, size)


# ===========================================================================
# Spreadsheets
# ===========================================================================

def xlsx_offset_table():
    """The table starts at C12, not A1, under a totals block."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Offer"
    ws["C2"] = "ZENITH INFOTECH SOLUTIONS"
    ws["C4"] = "GRAND TOTAL (incl. GST)"
    ws["F4"] = 48_500_000
    ws["C5"] = "This total is stated ABOVE the line items on purpose."
    hdr = ["Sr", "Item", "UOM", "Qty", "Rate", "Amount"]
    for i, h in enumerate(hdr):
        c = ws.cell(12, 3 + i, h)
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="DDEBF7")
    for r, n in enumerate(SUBSET, start=13):
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        ws.cell(r, 3, n)
        ws.cell(r, 4, ln["desc"][:60])
        ws.cell(r, 5, q.get("uom", ln["uom"]))
        ws.cell(r, 6, ln["qty"])
        ws.cell(r, 7, q["price"])
        ws.cell(r, 8, q["price"] * ln["qty"])
    p = OUT / "xlsx_01_offset_table.xlsx"
    wb.save(p)
    note(p, "table starts at C12, with a totals block above it")


def xlsx_merged_headers():
    """Two-row merged header, so a single header row cannot be assumed."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Quotation"
    ws.merge_cells("A1:F1")
    ws["A1"] = "COMMERCIAL OFFER — NORTHBRIDGE RETAIL"
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A3:A4"); ws["A3"] = "Sr"
    ws.merge_cells("B3:B4"); ws["B3"] = "Description"
    ws.merge_cells("C3:D3"); ws["C3"] = "Quantity"
    ws["C4"] = "UOM"; ws["D4"] = "Nos"
    ws.merge_cells("E3:F3"); ws["E3"] = "Commercials (INR)"
    ws["E4"] = "Rate"; ws["F4"] = "Amount"
    for r, n in enumerate(SUBSET, start=5):
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        ws.cell(r, 1, n)
        ws.cell(r, 2, ln["desc"][:60])
        ws.cell(r, 3, q.get("uom", ln["uom"]))
        ws.cell(r, 4, ln["qty"])
        ws.cell(r, 5, q["price"])
        ws.cell(r, 6, q["price"] * ln["qty"])
    p = OUT / "xlsx_02_merged_headers.xlsx"
    wb.save(p)
    note(p, "two-row merged header spanning columns")


def xlsx_prices_as_text():
    """Every price is a STRING with a glyph and Indian grouping."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rates"
    ws.append(["Sr", "Item", "UOM", "Qty", "Rate", "Amount"])
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        # Indian digit grouping, as a string, exactly as a reseller types it.
        def indian(v):
            s = str(v)
            if len(s) <= 3:
                return s
            head, tail = s[:-3], s[-3:]
            parts = []
            while len(head) > 2:
                parts.insert(0, head[-2:])
                head = head[:-2]
            if head:
                parts.insert(0, head)
            return ",".join(parts) + "," + tail
        ws.append([
            n, ln["desc"][:60], q.get("uom", ln["uom"]), ln["qty"],
            f"₹ {indian(q['price'])}/-",
            f"₹ {indian(q['price'] * ln['qty'])}/-",
        ])
    p = OUT / "xlsx_03_prices_as_text.xlsx"
    wb.save(p)
    note(p, "prices stored as text with a rupee glyph and Indian grouping")


def xlsx_prices_on_second_sheet():
    """Sheet 1 is a cover letter; the prices are on sheet 3."""
    wb = openpyxl.Workbook()
    a = wb.active
    a.title = "Covering Letter"
    a["A1"] = "Dear Ms Kulkarni,"
    a["A3"] = "Please find our offer enclosed. Rates are on the 'Annexure B' tab."
    b = wb.create_sheet("Terms")
    b["A1"] = "Payment 30 days. Freight included. Validity 60 days."
    c = wb.create_sheet("Annexure B")
    c.append(["Sr", "Item", "UOM", "Qty", "Rate"])
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        c.append([n, ln["desc"][:60], q.get("uom", ln["uom"]), ln["qty"], q["price"]])
    p = OUT / "xlsx_04_prices_on_third_sheet.xlsx"
    wb.save(p)
    note(p, "prices on the third sheet, cover letter on the first")


def xlsx_banners_and_gaps():
    """Section banners, blank spacer rows, and notes below the table."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Quote"
    ws.append(["Sr", "Item", "UOM", "Qty", "Rate"])
    last = None
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        if ln["group"] != last:
            last = ln["group"]
            ws.append([])
            ws.append([f"--- {ln['group'].upper()} ---"])
            ws.append([])
        q = V1[n]
        ws.append([n, ln["desc"][:60], q.get("uom", ln["uom"]), ln["qty"], q["price"]])
    ws.append([])
    ws.append(["Notes:"])
    ws.append(["1. Cat6A patch cords carry MOQ of 20 boxes."])
    ws.append(["2. Order value discount of 2.5% applies to the total only."])
    p = OUT / "xlsx_05_banners_and_gaps.xlsx"
    wb.save(p)
    note(p, "section banners, blank spacer rows, notes below the table")


# ===========================================================================
# PDFs
# ===========================================================================

_styles = getSampleStyleSheet()
_cell = ParagraphStyle("c", parent=_styles["BodyText"], fontSize=7.4, leading=9)
_body = ParagraphStyle("b", parent=_styles["BodyText"], fontSize=9, leading=13)


def _rate_rows():
    rows = [[Paragraph(f"<b>{h}</b>", _cell)
             for h in ["Ln", "Description", "UoM", "Qty", "Rate", "Amount"]]]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        rows.append([
            Paragraph(str(n), _cell), Paragraph(ln["desc"][:52], _cell),
            Paragraph(q.get("uom", ln["uom"]), _cell), Paragraph(str(ln["qty"]), _cell),
            Paragraph(f"{q['price']:,}", _cell),
            Paragraph(f"{q['price'] * ln['qty']:,}", _cell),
        ])
    return rows


def _grid(rows, widths):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EDF2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def pdf_landscape():
    p = OUT / "pdf_01_landscape.pdf"
    doc = SimpleDocTemplate(str(p), pagesize=landscape(A4),
                            topMargin=14 * mm, bottomMargin=14 * mm,
                            leftMargin=14 * mm, rightMargin=14 * mm,
                            title="Landscape offer")
    doc.build([
        Paragraph("<b>ZENITH INFOTECH — OFFER (landscape)</b>", _styles["Heading3"]),
        Spacer(1, 6),
        _grid(_rate_rows(), [12 * mm, 100 * mm, 22 * mm, 16 * mm, 26 * mm, 30 * mm]),
    ])
    note(p, "landscape page orientation")


def pdf_two_column():
    """Two text frames per page, so reading order is not simply top-to-bottom."""
    p = OUT / "pdf_02_two_column.pdf"
    doc = BaseDocTemplate(str(p), pagesize=A4, title="Two-column offer")
    w = (A4[0] - 40 * mm) / 2 - 4 * mm
    doc.addPageTemplates([PageTemplate(id="two", frames=[
        Frame(20 * mm, 20 * mm, w, A4[1] - 40 * mm, id="l"),
        Frame(20 * mm + w + 8 * mm, 20 * mm, w, A4[1] - 40 * mm, id="r"),
    ])])
    flow = [Paragraph("<b>ZENITH INFOTECH — OFFER</b>", _styles["Heading4"]), Spacer(1, 6)]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        flow.append(Paragraph(
            f"<b>Line {n}</b> — {ln['desc'][:70]}<br/>"
            f"Qty {ln['qty']} {q.get('uom', ln['uom'])} at "
            f"INR {q['price']:,} per {q.get('uom', ln['uom'])}.", _body))
        flow.append(Spacer(1, 8))
    doc.build(flow)
    note(p, "two-column layout, non-linear reading order")


def pdf_footnote_far_from_table():
    """The discount is on page 4; the numbers are on page 1."""
    p = OUT / "pdf_03_footnote_page4.pdf"
    doc = SimpleDocTemplate(str(p), pagesize=A4, topMargin=16 * mm,
                            bottomMargin=16 * mm, leftMargin=16 * mm,
                            rightMargin=16 * mm, title="Offer with distant footnote")
    small = ParagraphStyle("s", parent=_styles["BodyText"], fontSize=6.8, leading=9)
    flow = [
        Paragraph("<b>ZENITH INFOTECH — OFFER</b>", _styles["Heading3"]), Spacer(1, 6),
        _grid(_rate_rows(), [10 * mm, 74 * mm, 18 * mm, 12 * mm, 22 * mm, 24 * mm]),
        Paragraph("<super>3</super> See note 3 overleaf.", small),
    ]
    for pg in range(2, 4):
        flow += [PageBreak(), Paragraph(f"<b>Annexure {pg - 1}</b>", _styles["Heading4"])]
        flow += [Paragraph(
            "Standard commercial annexure text. " * 24, _body)]
    flow += [
        PageBreak(), Paragraph("<b>Notes</b>", _styles["Heading4"]),
        Paragraph("<super>1</super> Delivery 4-6 weeks.", small),
        Paragraph("<super>2</super> Installation included.", small),
        Paragraph(
            "<super>3</super> An additional discount of <b>3.75%</b> is available on all "
            "lines, subject to the complete scope being awarded to us. This discount is "
            "not reflected in the rates on page 1.", small),
    ]
    doc.build(flow)
    note(p, "conditional discount in a footnote on page 4, numbers on page 1")


def pdf_image_only():
    """
    A scanned PDF: one page-sized image, no text layer at all.

    This is the reader test that matters most for PDFs. A pipeline that
    extracts a text layer returns an empty string here and, if nothing checks
    for it, reports a clean read of nothing. The correct behaviour is to detect
    the absence and route the page through vision instead.
    """
    W, H = 1654, 2339
    img = Image.new("RGB", (W, H), (252, 252, 250))
    d = ImageDraw.Draw(img)
    d.text((90, 80), "ZENITH INFOTECH SOLUTIONS", font=font("Arial Bold.ttf", 44),
           fill=(20, 20, 24))
    d.text((90, 150), "SCANNED OFFER — no text layer", font=font("Arial.ttf", 24),
           fill=(90, 90, 95))
    y = 240
    d.text((90, y), "Ln", font=font("Arial Bold.ttf", 22), fill=(0, 0, 0))
    d.text((160, y), "Item", font=font("Arial Bold.ttf", 22), fill=(0, 0, 0))
    d.text((900, y), "UoM", font=font("Arial Bold.ttf", 22), fill=(0, 0, 0))
    d.text((1080, y), "Qty", font=font("Arial Bold.ttf", 22), fill=(0, 0, 0))
    d.text((1300, y), "Rate", font=font("Arial Bold.ttf", 22), fill=(0, 0, 0))
    y += 46
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        d.line([90, y - 6, W - 90, y - 6], fill=(200, 200, 205), width=1)
        d.text((90, y), str(n), font=font("Arial.ttf", 21), fill=(25, 25, 30))
        d.text((160, y), ln["desc"][:52], font=font("Arial.ttf", 21), fill=(25, 25, 30))
        d.text((900, y), q.get("uom", ln["uom"]), font=font("Arial.ttf", 21), fill=(25, 25, 30))
        d.text((1080, y), str(ln["qty"]), font=font("Arial.ttf", 21), fill=(25, 25, 30))
        d.text((1300, y), f"{q['price']:,}", font=font("Courier New.ttf", 21), fill=(25, 25, 30))
        y += 52

    # Scanner artefacts: faint skew, speckle, slight blur.
    img = img.rotate(0.5, resample=Image.BICUBIC, fillcolor=(252, 252, 250))
    a = np.asarray(img).astype(np.int16)
    rng = np.random.default_rng(7)
    a += rng.normal(0, 3.0, a.shape).astype(np.int16)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(0.5))

    p = OUT / "pdf_04_image_only_scan.pdf"
    img.save(p, "PDF", resolution=200.0)
    note(p, "IMAGE-ONLY scanned PDF: no text layer, must go through vision")


# ===========================================================================
# Word documents
# ===========================================================================

def docx_prose_only():
    doc = Document()
    doc.styles["Normal"].font.size = Pt(10.5)
    doc.add_paragraph("Dear Ms Kulkarni,")
    doc.add_paragraph(
        "Thank you for your enquiry. Our commercial offer is set out in the "
        "paragraphs below. No separate rate sheet is enclosed.")
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        doc.add_paragraph(
            f"Against your line {n} for {ln['desc'][:64]}, you have indicated a requirement "
            f"of {ln['qty']} {q.get('uom', ln['uom'])}. Our best rate for this item works out "
            f"to Rs. {q['price']:,}/- per {q.get('uom', ln['uom'])}, which for the indicated "
            f"quantity amounts to Rs. {q['price'] * ln['qty']:,}/- exclusive of taxes.")
    doc.add_paragraph("Yours faithfully, Zenith Infotech Solutions")
    p = OUT / "docx_01_prose_only.docx"
    doc.save(p)
    note(p, "every price inside a prose sentence, no table at all")


def docx_nested_table():
    doc = Document()
    doc.add_paragraph("Offer — Zenith Infotech")
    outer = doc.add_table(rows=1, cols=2)
    outer.style = "Table Grid"
    outer.rows[0].cells[0].text = "Commercials"
    inner_cell = outer.rows[0].cells[1]
    inner = inner_cell.add_table(rows=1, cols=4)
    inner.style = "Table Grid"
    for i, h in enumerate(["Ln", "UoM", "Qty", "Rate"]):
        inner.rows[0].cells[i].text = h
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        row = inner.add_row().cells
        row[0].text = str(n)
        row[1].text = q.get("uom", ln["uom"])
        row[2].text = str(ln["qty"])
        row[3].text = f"{q['price']:,}"
    p = OUT / "docx_02_nested_table.docx"
    doc.save(p)
    note(p, "prices inside a table nested within another table")


def docx_numbered_list():
    doc = Document()
    doc.add_paragraph("Offer — commercials as a numbered list")
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        doc.add_paragraph(
            f"Line {n}: {ln['desc'][:56]} — Rs. {q['price']:,} per "
            f"{q.get('uom', ln['uom'])}, qty {ln['qty']}",
            style="List Number")
    p = OUT / "docx_03_numbered_list.docx"
    doc.save(p)
    note(p, "commercials as a numbered list, not a table or prose")


# ===========================================================================
# Email
# ===========================================================================

def eml_html_only():
    """No text/plain part at all, so a text-only reader gets nothing."""
    rows = "".join(
        f"<tr><td>{n}</td><td>{next(l for l in LINES if l['no'] == n)['desc'][:44]}</td>"
        f"<td>{V1[n].get('uom', 'nos')}</td>"
        f"<td align=right>{V1[n]['price']:,}</td></tr>"
        for n in SUBSET)
    html = (
        f"<html><body><p>Hi Ananya,</p><p>Rates below.</p>"
        f"<table border=1 cellpadding=4><tr><th>Ln</th><th>Item</th><th>UoM</th>"
        f"<th>Rate</th></tr>{rows}</table><p>Freight included.</p></body></html>")

    m = email.message.EmailMessage()
    m["From"] = "Prakash Iyer <prakash.iyer@zenithinfotech.co.in>"
    m["To"] = f"{RFX['buyer_contact']['name']} <{RFX['buyer_contact']['email']}>"
    m["Subject"] = f"RE: {RFX['id']} — rates"
    m["Date"] = email.utils.format_datetime(datetime(2026, 9, 12, 11, 4))
    m.set_content("This message requires an HTML-capable reader.")
    m.add_alternative(html, subtype="html")
    p = OUT / "eml_01_html_only.eml"
    p.write_bytes(m.as_bytes())
    note(p, "HTML body with the rate table, plain-text part is a stub")


def eml_forwarded_chain():
    """The quote is three levels down a forwarded chain."""
    inner = "\n".join(
        f"> > > Line {n}: Rs {V1[n]['price']:,} per {V1[n].get('uom', 'nos')}"
        for n in SUBSET)
    body = (
        "Ananya,\n\nForwarding my colleague's mail below with the rates.\n\n"
        "Regards\nPrakash\n\n"
        "> -------- Forwarded message --------\n"
        "> From: Inside Sales <sales@zenithinfotech.co.in>\n"
        "> \n"
        "> > Prakash, rates as discussed:\n"
        f"{inner}\n"
        "> > \n> > Freight included, payment 30 days.\n")
    m = email.message.EmailMessage()
    m["From"] = "Prakash Iyer <prakash.iyer@zenithinfotech.co.in>"
    m["To"] = RFX["buyer_contact"]["email"]
    m["Subject"] = f"FW: FW: RE: {RFX['id']} rates"
    m["Date"] = email.utils.format_datetime(datetime(2026, 9, 12, 18, 40))
    m.set_content(body)
    p = OUT / "eml_02_forwarded_chain.eml"
    p.write_bytes(m.as_bytes())
    note(p, "quote three levels deep in a forwarded chain")


def eml_quoted_printable():
    """Quoted-printable with soft line breaks splitting the numbers."""
    lines = [f"Line {n}: Rs {V1[n]['price']:,} per {V1[n].get('uom', 'nos')}"
             for n in SUBSET]
    text = "Hi Ananya,\n\n" + "\n".join(lines) + "\n\nRegards, Prakash\n"
    payload = quopri.encodestring(text.encode()).decode()
    raw = (
        "From: Prakash Iyer <prakash.iyer@zenithinfotech.co.in>\n"
        f"To: {RFX['buyer_contact']['email']}\n"
        f"Subject: RE: {RFX['id']} rates (qp)\n"
        "MIME-Version: 1.0\n"
        "Content-Type: text/plain; charset=utf-8\n"
        "Content-Transfer-Encoding: quoted-printable\n\n"
        + payload)
    p = OUT / "eml_03_quoted_printable.eml"
    p.write_bytes(raw.encode())
    note(p, "quoted-printable encoding with soft line breaks")


def eml_rates_in_attachment():
    """A one-line body; the rates are in an attached text part."""
    rates = "\n".join(
        f"{n},{V1[n].get('uom', 'nos')},{V1[n]['price']}" for n in SUBSET)
    m = email.message.EmailMessage()
    m["From"] = "Prakash Iyer <prakash.iyer@zenithinfotech.co.in>"
    m["To"] = RFX["buyer_contact"]["email"]
    m["Subject"] = f"RE: {RFX['id']} — rates attached"
    m["Date"] = email.utils.format_datetime(datetime(2026, 9, 13, 9, 15))
    m.set_content("Rates attached as CSV.")
    m.add_attachment(("line,uom,rate\n" + rates).encode(),
                     maintype="text", subtype="csv", filename="rates.csv")
    p = OUT / "eml_04_rates_in_attachment.eml"
    p.write_bytes(m.as_bytes())
    note(p, "one-line body, rates in an attached CSV")


# ===========================================================================
# Photographs
# ===========================================================================

def _rate_card_page(w=1600, h=2100, title="ZENITH INFOTECH SOLUTIONS"):
    img = Image.new("RGB", (w, h), (251, 250, 247))
    d = ImageDraw.Draw(img)
    d.text((80, 70), title, font=font("Arial Bold.ttf", 46), fill=(28, 30, 40))
    d.text((82, 140), "RATE CARD — CORPORATE SUPPLY", font=font("Arial.ttf", 26),
           fill=(90, 92, 100))
    y = 230
    for label, x in [("Ln", 80), ("ITEM", 170), ("UOM", 820), ("QTY", 1010),
                     ("RATE", 1240)]:
        d.text((x, y), label, font=font("Arial Bold.ttf", 23), fill=(20, 20, 24))
    y += 48
    rows = []
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        d.line([80, y - 8, w - 80, y - 8], fill=(205, 205, 210), width=2)
        d.text((80, y), str(n), font=font("Arial.ttf", 22), fill=(25, 25, 30))
        d.text((170, y), ln["desc"][:46], font=font("Arial.ttf", 22), fill=(25, 25, 30))
        d.text((820, y), q.get("uom", ln["uom"]), font=font("Arial.ttf", 22), fill=(25, 25, 30))
        d.text((1010, y), str(ln["qty"]), font=font("Arial.ttf", 22), fill=(25, 25, 30))
        txt = f"{q['price']:,}"
        d.text((w - 90 - d.textlength(txt, font=font("Courier New.ttf", 23)), y),
               txt, font=font("Courier New.ttf", 23), fill=(25, 25, 30))
        rows.append((n, y))
        y += 54
    d.rectangle([80, 222, w - 80, y - 8], outline=(150, 150, 158), width=3)
    return img, rows


def _perspective(img, size, quad):
    w, h = img.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    A, B = [], []
    for (sx, sy), (dx, dy) in zip(src, quad):
        A.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        A.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        B += [sx, sy]
    coeffs = np.linalg.solve(np.array(A, dtype=float), np.array(B, dtype=float))
    return img.transform(size, Image.PERSPECTIVE, coeffs.tolist(),
                         resample=Image.BICUBIC)


def _shoot(page, name, what, quad, *, blur=0.7, noise=3.0, exposure=1.0,
           jpeg=82, occlude=False, moire=False):
    W, H = 2000, 2600
    bg = Image.new("RGB", (W, H), (44, 42, 40))
    warped = _perspective(page.convert("RGBA"), (W, H), quad)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(x + 26, y + 34) for x, y in quad], fill=180)
    bg.paste(Image.new("RGB", (W, H), (14, 13, 12)), (0, 0),
             mask.filter(ImageFilter.GaussianBlur(30)))
    bg.paste(warped, (0, 0), warped)
    img = bg

    if occlude:
        d = ImageDraw.Draw(img, "RGBA")
        x, y = quad[3]
        d.ellipse([x - 40, y - 300, x + 300, y + 120], fill=(198, 154, 128, 255))
        d.ellipse([x - 20, y - 280, x + 275, y + 92], fill=(214, 170, 143, 255))

    if moire:
        # A photo of a screen: scanline interference.
        a = np.asarray(img).astype(np.float64)
        rows = np.arange(H)[:, None, None]
        a *= 1 + 0.055 * np.sin(rows / 1.7)
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    if exposure != 1.0:
        a = np.asarray(img).astype(np.float64) * exposure
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    img = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img).astype(np.int16)
    rng = np.random.default_rng(len(name))
    a += rng.normal(0, noise, a.shape).astype(np.int16)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    p = OUT / name
    img.save(p, "JPEG", quality=jpeg, optimize=True)
    note(p, what)


# ===========================================================================
# The formats nobody remembers to support
# ===========================================================================

def csv_rate_sheet():
    """A CSV. The commonest shape a rate sheet actually arrives in."""
    rows = ["Line,SKU,Description,UOM,Qty,Rate"]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        desc = ln["desc"][:50].replace(",", ";")
        rows.append(f"{n},{ln['sku']},{desc},{q.get('uom', ln['uom'])},{ln['qty']},{q['price']}")
    p = OUT / "misc_01_rate_sheet.csv"
    p.write_text("\n".join(rows) + "\n")
    note(p, "plain CSV rate sheet, the commonest real shape")


def tsv_rate_sheet():
    rows = ["Line\tUOM\tQty\tRate"]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        rows.append(f"{n}\t{q.get('uom', ln['uom'])}\t{ln['qty']}\t{q['price']}")
    p = OUT / "misc_02_rates.tsv"
    p.write_text("\n".join(rows) + "\n")
    note(p, "tab-separated rates")


def ods_spreadsheet():
    """LibreOffice spreadsheet. Written as a real .ods zip."""
    import zipfile
    cells = []
    cells.append(
        "<table:table-row>" + "".join(
            f'<table:table-cell office:value-type="string">'
            f"<text:p>{h}</text:p></table:table-cell>"
            for h in ["Line", "Item", "UOM", "Qty", "Rate"]
        ) + "</table:table-row>")
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        vals = [str(n), ln["desc"][:48], q.get("uom", ln["uom"]), str(ln["qty"]), str(q["price"])]
        cells.append(
            "<table:table-row>" + "".join(
                f'<table:table-cell office:value-type="string">'
                f"<text:p>{v}</text:p></table:table-cell>" for v in vals
            ) + "</table:table-row>")

    content = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content '
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'office:version="1.2"><office:body><office:spreadsheet>'
        '<table:table table:name="Rates">' + "".join(cells) +
        "</table:table></office:spreadsheet></office:body></office:document-content>")

    p = OUT / "misc_03_libreoffice.ods"
    with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet")
        z.writestr("content.xml", content)
        # SheetJS requires styles.xml. A real LibreOffice file always has one;
        # omitting it made this fixture invalid rather than testing anything.
        z.writestr("styles.xml",
                   '<?xml version="1.0" encoding="UTF-8"?>'
                   '<office:document-styles '
                   'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
                   'office:version="1.2"><office:styles/>'
                   '</office:document-styles>')
        z.writestr("META-INF/manifest.xml",
                   '<?xml version="1.0"?><manifest:manifest '
                   'xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">'
                   '<manifest:file-entry manifest:full-path="/" '
                   'manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>'
                   '</manifest:manifest>')
    note(p, "LibreOffice .ods spreadsheet")


def odt_document():
    """LibreOffice writer document with prices in prose and a table."""
    import zipfile
    paras = ["<text:p>Dear Ms Kulkarni,</text:p>",
             "<text:p>Our offer follows. Rates are exclusive of taxes.</text:p>"]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        paras.append(
            f"<text:p>Line {n}, {ln['desc'][:46]}: Rs. {q['price']:,}/- per "
            f"{q.get('uom', ln['uom'])} for {ln['qty']} units.</text:p>")
    paras.append("<text:p>Yours faithfully, Zenith Infotech</text:p>")

    content = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content '
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'office:version="1.2"><office:body><office:text>'
        + "".join(paras) + "</office:text></office:body></office:document-content>")

    p = OUT / "misc_04_libreoffice.odt"
    with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.text")
        z.writestr("content.xml", content)
    note(p, "LibreOffice .odt letter, prices in prose")


def txt_quote():
    lines = ["ZENITH INFOTECH - QUOTATION", "", "Line  UOM          Qty   Rate"]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        lines.append(f"{n:<5} {q.get('uom', ln['uom']):<12} {ln['qty']:<5} {q['price']:,}")
    lines += ["", "Freight included. Payment 30 days."]
    p = OUT / "misc_05_quote.txt"
    p.write_text("\n".join(lines) + "\n")
    note(p, "plain text quotation, fixed-width columns")


def rtf_quote():
    body = [r"{\rtf1\ansi\deff0", r"{\fonttbl{\f0 Arial;}}",
            r"\f0\fs22 ZENITH INFOTECH - QUOTATION\par", r"\par"]
    for n in SUBSET:
        ln = next(l for l in LINES if l["no"] == n)
        q = V1[n]
        body.append(
            f"Line {n}: Rs. {q['price']:,} per {q.get('uom', ln['uom'])} "
            f"(qty {ln['qty']})\\par")
    body.append("}")
    p = OUT / "misc_06_quote.rtf"
    p.write_text("\n".join(body))
    note(p, "RTF quotation from a legacy system")


def adversarial_files():
    """Files that must fail LOUDLY and usefully, not silently."""
    p = OUT / "bad_01_empty.xlsx"
    p.write_bytes(b"")
    note(p, "MUST FAIL: zero bytes")

    # A PDF renamed to .xlsx. The extension lies about the content, and parsing
    # it as a spreadsheet would produce confident garbage.
    p = OUT / "bad_02_pdf_renamed_to_xlsx.xlsx"
    p.write_bytes((OUT / "pdf_01_landscape.pdf").read_bytes())
    note(p, "MUST DETECT: a PDF renamed .xlsx, extension contradicts the bytes")

    p = OUT / "bad_03_truncated.pdf"
    src = (OUT / "pdf_01_landscape.pdf").read_bytes()
    p.write_bytes(src[: len(src) // 3])
    note(p, "truncated PDF: routed to vision, model must report what it cannot see")

    p = OUT / "bad_04_outlook.msg"
    p.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 200)
    note(p, "MUST FAIL CLEARLY: Outlook .msg, binary compound file, told to export .eml")


def photos():
    page, _ = _rate_card_page()
    _shoot(page, "jpg_01_flat_scan.jpg", "flat, well lit, minimal skew",
           [(180, 150), (1820, 168), (1812, 2452), (172, 2436)],
           blur=0.45, noise=1.8, jpeg=92)
    _shoot(page, "jpg_02_steep_angle.jpg", "steep angle, strong keystone",
           [(430, 130), (1700, 400), (1880, 2380), (140, 2160)],
           blur=1.0, noise=4.2, jpeg=68)
    _shoot(page, "jpg_03_low_light.jpg", "low light, heavy sensor noise",
           [(240, 220), (1790, 190), (1830, 2440), (200, 2470)],
           blur=1.3, noise=9.0, exposure=0.55, jpeg=54)
    _shoot(page, "jpg_04_finger_occlusion.jpg",
           "thumb covering the bottom-left corner",
           [(250, 200), (1800, 240), (1770, 2430), (210, 2390)],
           blur=0.85, noise=3.6, jpeg=72, occlude=True)
    _shoot(page, "jpg_05_photo_of_screen.jpg",
           "photo of a monitor showing the sheet, with moire",
           [(300, 260), (1740, 230), (1780, 2300), (260, 2330)],
           blur=1.1, noise=5.0, jpeg=62, moire=True)


# ===========================================================================

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*"):
        if f.is_file():
            f.unlink()

    xlsx_offset_table(); xlsx_merged_headers(); xlsx_prices_as_text()
    xlsx_prices_on_second_sheet(); xlsx_banners_and_gaps()
    pdf_landscape(); pdf_two_column(); pdf_footnote_far_from_table(); pdf_image_only()
    docx_prose_only(); docx_nested_table(); docx_numbered_list()
    eml_html_only(); eml_forwarded_chain(); eml_quoted_printable()
    eml_rates_in_attachment()
    csv_rate_sheet(); tsv_rate_sheet(); ods_spreadsheet(); odt_document()
    txt_quote(); rtf_quote()
    adversarial_files()
    photos()

    # The answer key: identical facts in every file, so a reader test can assert
    # rather than guess.
    import json
    key = OUT / "_expected.json"
    key.write_text(json.dumps({
        "note":
            "Every file in this directory encodes these same values. A reader test "
            "asserts that the mechanical layer surfaces them; an extraction test "
            "asserts the model reads them correctly.",
        "source": "Zenith (V1) prices for a fixed 10-line subset",
        "lines": EXPECTED,
        "files": [{"name": p.name, "tests": what} for p, what in written],
    }, indent=2))

    print(f"{len(written)} stress files in dataset/out/98-stress/\n")
    by_ext: dict[str, list] = {}
    for p, what in written:
        by_ext.setdefault(p.suffix, []).append((p, what))
    for ext in sorted(by_ext):
        print(f"  {ext}")
        for p, what in by_ext[ext]:
            print(f"    {p.stat().st_size / 1024:8.0f} KB  {p.name:38} {what}")
    print(f"\n  answer key: {key.name} ({len(EXPECTED)} lines every file must yield)")


if __name__ == "__main__":
    main()
