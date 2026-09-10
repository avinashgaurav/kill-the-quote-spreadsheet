"""
The RFx pack, four of the five vendor replies, and every attachment.

Each vendor writes the way that kind of firm actually writes:

  RFx  a clean template, so there is a template to ignore
  V1   its own branded spreadsheet: merged cells, own column order, prices as
       text, notes below the table, a grand total that does not equal the sum
       of the lines, plus a Rev 2 sent two days later that supersedes Rev 1
  V2   a PDF on letterhead, part INR part USD, with the real discount in
       footnote 3 on page 2
  V3   a Word letter with the commercials in prose
  V5   five lines of email that price by reference to last year

V4 (the photographed rate card) is built by build_photo.py.
"""

import base64
import csv
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak)

from catalog import (BUYER, RFX, LINES, VENDORS, QUOTES, TERMS, PRIOR_PO,
                     QUESTIONNAIRE, QUESTIONNAIRE_ANSWERS)

OUT = Path(__file__).resolve().parents[1] / "out"
DIRS = {
    "rfx": OUT / "00-rfx",
    "V1": OUT / "01-vendor-zenith",
    "V2": OUT / "02-vendor-cygnus",
    "V3": OUT / "03-vendor-orbit",
    "V4": OUT / "04-vendor-vector",
    "V5": OUT / "05-vendor-helios",
    "internal": OUT / "99-internal",
}

THIN = Side(style="thin", color="B0B0B5")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
written = []


def note(path):
    written.append(path)
    return path


def vendor(code):
    return next(v for v in VENDORS if v["code"] == code)


# ===========================================================================
# RFx pack
# ===========================================================================

def build_rfx():
    d = DIRS["rfx"]; d.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Line Items"

    ws["A1"] = f"{RFX['id']} - {RFX['title']}"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"{BUYER['legal_name']}  |  GSTIN {BUYER['gstin']}"
    ws["A3"] = (f"Issued {RFX['issued']:%d %b %Y}   Responses due "
                f"{RFX['due']:%d %b %Y} 17:00 IST")
    ws["A4"] = (f"Quote ex-GST in INR. State GST rate and HSN per line. "
                f"{RFX['incoterm_asked']}. Payment {RFX['payment_asked']}. "
                f"Bid validity {RFX['validity_asked']}.")
    ws["A5"] = ("Do not alter the unit of measure. Where a line is specified as a kit, "
                "box or pack, quote per kit / box / pack, not per piece.")
    ws["A5"].font = Font(bold=True, color="9C2A2A")

    hdr = ["Line", "SKU", "Group", "Description", "Key spec", "UoM",
           "Units per UoM", "Qty", "HSN", "Unit rate (INR, ex-GST)",
           "Line total (INR)", "GST %", "Lead time (weeks)", "Make / model offered",
           "Remarks"]
    r = 7
    for c, h in enumerate(hdr, 1):
        cell = ws.cell(r, c, h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2F4F6F")
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = BOX

    for i, ln in enumerate(LINES):
        rr = r + 1 + i
        spec = ", ".join(f"{k}={v}" for k, v in ln["spec"].items())
        for c, val in enumerate([ln["no"], ln["sku"], ln["group"], ln["desc"], spec,
                                 ln["uom"], ln["pack_size"], ln["qty"], ln["hsn"],
                                 None, None, None, None, None, None], 1):
            cell = ws.cell(rr, c, val)
            cell.border = BOX
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(rr, 11).value = f"=IF(J{rr}=\"\",\"\",H{rr}*J{rr})"
        if ln["pack_size"] > 1:
            ws.cell(rr, 6).font = Font(bold=True, color="9C2A2A")
            ws.cell(rr, 7).font = Font(bold=True, color="9C2A2A")

    tr = r + 1 + len(LINES)
    ws.cell(tr, 9, "TOTAL (ex-GST)").font = Font(bold=True)
    ws.cell(tr, 11, f"=SUM(K{r+1}:K{tr-1})").font = Font(bold=True)

    for c, w in enumerate([6, 12, 20, 52, 40, 12, 8, 7, 8, 15, 15, 7, 13, 30, 30], 1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = "A8"

    q = wb.create_sheet("Questionnaire")
    q["A1"] = f"{RFX['id']} - Vendor Questionnaire"
    q["A1"].font = Font(bold=True, size=14)
    q["A2"] = ("M = mandatory. Failure or non-response on ANY mandatory question "
               "disqualifies the bid regardless of price.")
    q["A2"].font = Font(bold=True, color="9C2A2A")
    for c, h in enumerate(["Q", "M/D", "Question", "Answer", "Document attached (filename)"], 1):
        cell = q.cell(4, c, h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2F4F6F")
        cell.border = BOX
        cell.alignment = Alignment(wrap_text=True)
    for i, qq in enumerate(QUESTIONNAIRE):
        rr = 5 + i
        for c, val in enumerate([qq["no"], qq["kind"], qq["q"], None,
                                 "required" if qq["doc_required"] else ""], 1):
            cell = q.cell(rr, c, val)
            cell.border = BOX
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    for c, w in enumerate([7, 7, 88, 44, 30], 1):
        q.column_dimensions[get_column_letter(c)].width = w

    p = d / f"{RFX['id']}_Line_Items_and_Questionnaire.xlsx"
    wb.save(p); note(p)

    # Instructions to bidders
    styles = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=styles["BodyText"], fontSize=9.5, leading=14)
    doc = SimpleDocTemplate(str(d / f"{RFX['id']}_Instructions_to_Bidders.pdf"),
                            pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            title=f"{RFX['id']} Instructions to Bidders")
    fl = [Paragraph(f"<b>{BUYER['legal_name']}</b>", styles["Title"]),
          Paragraph(f"<b>{RFX['id']} - {RFX['title']}</b>", styles["Heading2"]),
          Paragraph("Instructions to Bidders", styles["Heading3"]), Spacer(1, 6)]
    for i, t in enumerate([
        f"Responses are due by {RFX['due']:%d %B %Y} at 17:00 IST, by email to "
        f"{RFX['buyer_contact']['email']}.",
        "Complete both sheets of the attached workbook. Return the workbook itself. "
        "Quotations in any other format will be accepted but may delay evaluation.",
        f"Quote in {RFX['currency_asked']}, ex-GST, {RFX['incoterm_asked']}. "
        f"State the GST rate and HSN code against every line.",
        "<b>Do not alter the unit of measure.</b> Lines 13, 17, 20 and 22 are "
        "specified per kit, per pack of 5, per box of 10 and per box of 50 "
        "respectively. Quote per that unit. A price per piece against a line "
        "specified per box will be normalised, and the vendor will be asked to "
        "confirm, which costs time.",
        "Partial bids are permitted. Mark any line you cannot supply as NQ. Do not "
        "leave it blank: a blank line and a declined line are treated differently.",
        "Equivalents are permitted provided the offered make and model is stated in "
        "the 'Make / model offered' column and meets or exceeds the key spec. An "
        "unstated substitution will be treated as non-compliant.",
        "Warranty for lines 1 to 4, 12, 26, 28 and 29 must be quoted inclusive of the "
        "cover stated in the line description. Do not quote a shorter term with a "
        "separate uplift line.",
        f"Bid validity {RFX['validity_asked']}. Payment terms {RFX['payment_asked']}. "
        "Counter-terms may be offered but will be evaluated as a commercial deviation.",
        "<b>All mandatory questionnaire questions must be answered and evidenced. "
        "Failure or non-response on any mandatory question disqualifies the bid "
        "regardless of price.</b>",
        "Any discount conditional on an approval, an order date or a competitor's "
        "price must be stated as such. Conditional discounts are recorded but are "
        "not used in the ranked comparison.",
    ], 1):
        fl.append(Paragraph(f"{i}. {t}", body))
        fl.append(Spacer(1, 5))
    fl += [Spacer(1, 10),
           Paragraph(f"<b>{RFX['buyer_contact']['name']}</b><br/>"
                     f"{RFX['buyer_contact']['title']}<br/>"
                     f"{RFX['buyer_contact']['email']} | {RFX['buyer_contact']['phone']}", body)]
    doc.build(fl)
    note(d / f"{RFX['id']}_Instructions_to_Bidders.pdf")


# ===========================================================================
# V1 Zenith: its own spreadsheet, cheerfully ignoring the template
# ===========================================================================

def build_v1(revision=1):
    v = vendor("V1")
    d = DIRS["V1"]; d.mkdir(parents=True, exist_ok=True)

    # Rev 2 sharpens three lines and says so. Rev 1 stays on disk: deciding
    # which one counts is the system's problem, not the dataset's.
    rev2 = {1: 60900, 5: 9180, 7: 12700}
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Quotation"

    ws.merge_cells("A1:H1")
    ws["A1"] = v["name"]
    ws["A1"].font = Font(bold=True, size=16, color="1F4E79")
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A2:H2")
    ws["A2"] = (f"#14, 2nd Main, Koramangala Industrial Layout, {v['city']} 560095  |  "
                f"GSTIN {v['gstin']}")
    ws["A2"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A3:H3")
    ws["A3"] = f"{v['contact']}, {v['role']}  |  {v['email']}  |  {v['phone']}"
    ws["A3"].alignment = Alignment(horizontal="center")

    qno = "ZIS/NBR/2026/1184" + ("-R2" if revision == 2 else "")
    ws["A5"] = "QUOTATION NO:"; ws["B5"] = qno
    ws["A6"] = "DATE:"
    ws["B6"] = (v["revision_received"] if revision == 2 else v["received"]).strftime("%d-%m-%Y")
    ws["A7"] = "CUSTOMER:"; ws["B7"] = BUYER["short_name"]
    ws["A8"] = "YOUR REF:"; ws["B8"] = RFX["id"]
    ws["A9"] = "KIND ATTN:"; ws["B9"] = RFX["buyer_contact"]["name"]
    for rr in range(5, 10):
        ws.cell(rr, 1).font = Font(bold=True)
    if revision == 2:
        ws["A10"] = ("REVISED QUOTATION. This supersedes ZIS/NBR/2026/1184 dated "
                     f"{v['received']:%d-%m-%Y}. Revised lines are marked REVISED below.")
        ws["A10"].font = Font(bold=True, color="C00000")

    # Zenith's own column order, nothing like the template's.
    r = 12
    hdr = ["Sr", "Zenith Part Code", "Item Description", "Make / Model Offered",
           "UOM", "Qty", "Rate", "Amount", "Remarks"]
    for c, h in enumerate(hdr, 1):
        cell = ws.cell(r, c, h)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="D9E2F3")
        cell.border = BOX
        cell.alignment = Alignment(wrap_text=True, horizontal="center")

    rr = r
    line_sum = 0
    groups = []
    for ln in LINES:
        q = QUOTES["V1"][ln["no"]]
        if ln["group"] not in groups:                     # section banners
            groups.append(ln["group"])
            rr += 1
            ws.merge_cells(start_row=rr, start_column=1, end_row=rr, end_column=9)
            ws.cell(rr, 1, ln["group"].upper()).font = Font(bold=True, italic=True)
            ws.cell(rr, 1).fill = PatternFill("solid", fgColor="F2F2F2")
        rr += 1
        price = rev2.get(ln["no"], q["price"]) if revision == 2 else q["price"]
        qty = q.get("qty_override", ln["qty"])
        amt = price * qty
        line_sum += amt

        remarks = []
        if q.get("note"):
            remarks.append(q["note"])
        if revision == 2 and ln["no"] in rev2:
            remarks.insert(0, "REVISED")

        vals = [ln["no"], f"ZIS-{ln['sku']}", ln["desc"][:70],
                q.get("offered", "As specified"), q.get("uom", ln["uom"]), qty,
                # Rates as TEXT with a rupee glyph and Indian digit grouping. A
                # naive reader gets a string, not a number.
                f"₹ {price:,}".replace(",", ","),
                f"₹ {amt:,}",
                " ".join(remarks)]
        for c, val in enumerate(vals, 1):
            cell = ws.cell(rr, c, val)
            cell.border = BOX
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        if q["status"] == "substituted":
            ws.cell(rr, 4).font = Font(bold=True, color="806000")

    # Totals block: the 2.5% discount lives only here.
    disc_pct = TERMS["V1"]["total_level_discount_pct"]
    disc = round(line_sum * disc_pct / 100)
    net = line_sum - disc
    gst = round(net * 0.18)
    rr += 2
    for label, val, bold in [
        ("Gross Value", f"₹ {line_sum:,}", False),
        (f"Less: Order Value Discount @ {disc_pct}%", f"(₹ {disc:,})", False),
        ("Net Value (ex-GST)", f"₹ {net:,}", True),
        ("Add: GST @ 18%", f"₹ {gst:,}", False),
        ("GRAND TOTAL", f"₹ {net + gst:,}", True),
    ]:
        ws.cell(rr, 6, label).font = Font(bold=bold)
        ws.cell(rr, 8, val).font = Font(bold=bold)
        ws.cell(rr, 8).alignment = Alignment(horizontal="right")
        rr += 1

    rr += 1
    ws.cell(rr, 1, "Terms & Conditions:").font = Font(bold=True)
    for i, t in enumerate([
        f"1. GST: {TERMS['V1']['gst']}.",
        f"2. Freight: {TERMS['V1']['freight']}.",
        f"3. Payment: {TERMS['V1']['payment']}.",
        f"4. Validity: {TERMS['V1']['validity']} from date of quotation.",
        f"5. Delivery: {TERMS['V1']['delivery']}.",
        "6. Cat6A patch cords carry a minimum order quantity of 20 boxes. We have "
        "quoted 20 boxes against the 14 boxes indicated in your enquiry.",
        "7. Order value discount is applied on the total order value and is not "
        "attributable to individual lines. It is available only if the complete "
        "scope is awarded to us.",
        "8. Equivalents offered against lines 2, 12, 19 and 26 as noted in Remarks. "
        "Original makes can be supplied against a longer lead time.",
    ]):
        ws.cell(rr + 1 + i, 1, t)
        ws.merge_cells(start_row=rr + 1 + i, start_column=1,
                       end_row=rr + 1 + i, end_column=9)

    for c, w in enumerate([5, 18, 60, 34, 12, 7, 15, 17, 44], 1):
        ws.column_dimensions[get_column_letter(c)].width = w

    name = ("Zenith_Quotation_ZIS-NBR-2026-1184"
            + ("-R2_REVISED" if revision == 2 else "") + ".xlsx")
    p = d / name
    wb.save(p); note(p)
    return line_sum, net


def build_v1_questionnaire():
    d = DIRS["V1"]
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Questionnaire"
    ws["A1"] = f"{RFX['id']} - Vendor Questionnaire - {vendor('V1')['name']}"
    ws["A1"].font = Font(bold=True, size=13)
    for c, h in enumerate(["Q", "M/D", "Question", "Answer", "Document attached"], 1):
        cell = ws.cell(3, c, h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2F4F6F"); cell.border = BOX
    ans = QUESTIONNAIRE_ANSWERS["V1"]
    for i, qq in enumerate(QUESTIONNAIRE):
        a = ans[qq["no"]]
        for c, val in enumerate([qq["no"], qq["kind"], qq["q"], a["answer"],
                                 a["doc"] or ""], 1):
            cell = ws.cell(4 + i, c, val)
            cell.border = BOX; cell.alignment = Alignment(wrap_text=True, vertical="top")
    for c, w in enumerate([6, 6, 80, 46, 52], 1):
        ws.column_dimensions[get_column_letter(c)].width = w
    p = d / "Zenith_Questionnaire_Response.xlsx"
    wb.save(p); note(p)


# ===========================================================================
# V2 Cygnus: PDF, part USD, discount in footnote 3
# ===========================================================================

def build_v2():
    v = vendor("V2")
    d = DIRS["V2"]; d.mkdir(parents=True, exist_ok=True)
    t = TERMS["V2"]
    styles = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=styles["BodyText"], fontSize=7.4, leading=9.6)
    cellst = ParagraphStyle("c", parent=styles["BodyText"], fontSize=6.8, leading=8.4)
    foot = ParagraphStyle("f", parent=styles["BodyText"], fontSize=6.6, leading=8.6,
                          textColor=colors.HexColor("#333333"))

    p = d / "Cygnus_Quotation_CTI-Q-2026-0918.pdf"
    doc = SimpleDocTemplate(str(p), pagesize=A4, topMargin=14 * mm, bottomMargin=14 * mm,
                            leftMargin=13 * mm, rightMargin=13 * mm,
                            title="Cygnus Technologies Quotation CTI-Q-2026-0918")
    fl = []

    fl.append(Table([[Paragraph(f"<font size=15 color='#0B3C5D'><b>CYGNUS TECHNOLOGIES "
                                f"INDIA PVT LTD</b></font><br/>"
                                f"<font size=7>Authorised Enterprise Partner  |  "
                                f"501 Peninsula Business Park, Lower Parel, {v['city']} 400013"
                                f"<br/>GSTIN {v['gstin']}  |  IEC 0389041721  |  "
                                f"{v['email']}  |  {v['phone']}</font>", small),
                     Paragraph("<font size=8><b>QUOTATION</b></font><br/>"
                               "<font size=7>CTI-Q-2026-0918<br/>"
                               f"{v['received']:%d %B %Y}</font>", small)]],
                    colWidths=[125 * mm, 55 * mm]))
    fl.append(Spacer(1, 5))
    fl.append(Table([[""]], colWidths=[184 * mm], rowHeights=[1.6],
                    style=TableStyle([("BACKGROUND", (0, 0), (-1, -1),
                                       colors.HexColor("#0B3C5D"))])))
    fl.append(Spacer(1, 7))
    fl.append(Paragraph(
        f"<b>To:</b> {RFX['buyer_contact']['name']}, {RFX['buyer_contact']['title']}, "
        f"{BUYER['legal_name']}<br/><b>Reference:</b> {RFX['id']} - {RFX['title']}"
        f"<br/><b>Subject:</b> Our commercial offer against your enquiry", small))
    fl.append(Spacer(1, 7))

    hdr = ["Ln", "Description", "Make / Model", "UoM", "Qty", "Ccy",
           "Unit Rate", "Amount", "Notes"]
    rows = [[Paragraph(f"<b>{h}</b>", cellst) for h in hdr]]
    inr_sum = usd_sum = 0

    for ln in LINES:
        q = QUOTES["V2"][ln["no"]]
        if q["status"] == "not_quoted":
            rows.append([Paragraph(str(ln["no"]), cellst),
                         Paragraph(ln["desc"][:58], cellst),
                         Paragraph("-", cellst), Paragraph(ln["uom"], cellst),
                         Paragraph(str(ln["qty"]), cellst), Paragraph("-", cellst),
                         Paragraph("<b>NQ</b>", cellst), Paragraph("-", cellst),
                         Paragraph(q["note"], cellst)])
            continue
        amt = q["price"] * ln["qty"]
        if q["ccy"] == "USD":
            usd_sum += amt
        else:
            inr_sum += amt
        nt = q.get("note", "")
        if ln["no"] in (1, 2, 3):
            nt = "1 yr std warranty. 3 yr onsite: see line 30A."
        rows.append([Paragraph(str(ln["no"]), cellst),
                     Paragraph(ln["desc"][:58], cellst),
                     Paragraph("As specified", cellst),
                     Paragraph(ln["uom"], cellst),
                     Paragraph(str(ln["qty"]), cellst),
                     Paragraph(q["ccy"], cellst),
                     Paragraph(f"{q['price']:,}", cellst),
                     Paragraph(f"{amt:,}", cellst),
                     Paragraph(nt, cellst)])

    x = QUOTES["V2"]["30A"]
    rows.append([Paragraph("<b>30A</b>", cellst),
                 Paragraph(f"<b>{x['desc']}</b>", cellst),
                 Paragraph("As specified", cellst), Paragraph("nos", cellst),
                 Paragraph(str(x["qty"]), cellst), Paragraph("INR", cellst),
                 Paragraph(f"{x['price']:,}", cellst),
                 Paragraph(f"{x['price'] * x['qty']:,}", cellst),
                 Paragraph("<b>Additional line offered by us. Required to bring "
                           "lines 1-3 to the 3 year onsite cover called for in "
                           "your enquiry.</b>", cellst)])
    inr_sum += x["price"] * x["qty"]

    tbl = Table(rows, colWidths=[8 * mm, 55 * mm, 21 * mm, 13 * mm, 9 * mm, 9 * mm,
                                 16 * mm, 19 * mm, 34 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B3C5D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#AAAAAA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (6, 1), (7, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F6F8")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF6E0")),
    ]))
    fl.append(tbl)
    fl.append(Spacer(1, 6))
    fl.append(Table([
        [Paragraph("<b>Sub-total, INR lines (ex-GST)</b>", small),
         Paragraph(f"<b>INR {inr_sum:,}</b>", small)],
        [Paragraph("<b>Sub-total, USD lines (ex-works)</b>", small),
         Paragraph(f"<b>USD {usd_sum:,}</b>", small)],
        [Paragraph(f"USD sub-total at our reference rate of {t['fx_reference']}, "
                   f"<i>indicative only</i>", small),
         Paragraph(f"INR {round(usd_sum * t['fx_reference']):,}", small)],
    ], colWidths=[125 * mm, 59 * mm],
        style=TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"),
                          ("LINEABOVE", (0, 0), (-1, 0), 0.6, colors.HexColor("#0B3C5D"))])))
    fl.append(PageBreak())

    # ---- page 2: terms, and the footnote that actually matters -----------
    fl.append(Paragraph("<font size=9 color='#0B3C5D'><b>CYGNUS TECHNOLOGIES INDIA "
                        "PVT LTD</b></font>  <font size=7>CTI-Q-2026-0918</font>", small))
    fl.append(Spacer(1, 8))
    fl.append(Paragraph("<b>Commercial Terms</b>", styles["Heading4"]))
    for i, tx in enumerate([
        f"Taxes: {t['gst']}",
        f"Delivery basis: {t['freight']}",
        f"Payment: {t['payment']}",
        f"Bid validity: <b>{t['validity']}</b> from the date of this quotation.",
        f"Delivery: {t['delivery']} from receipt of a firm order and, where applicable, "
        f"receipt of advance.",
        "Warranty: lines 1 to 3 carry the manufacturer's standard one year warranty. "
        "The three year onsite cover called for in your enquiry is offered separately "
        "at line 30A.",
        "Installation and commissioning of datacentre and network items is included. "
        "Structured cabling work is excluded.",
    ], 1):
        fl.append(Paragraph(f"{i}. {tx}", small)); fl.append(Spacer(1, 3))

    fl.append(Spacer(1, 10))
    fl.append(Paragraph("<b>Notes</b>", styles["Heading4"]))
    fl.append(Paragraph(
        "<super>1</super> Lines 12 to 20 are of imported origin and are quoted "
        "ex-works Singapore. Basic customs duty, IGST on import, inbound freight, "
        "insurance and customs clearance charges are to the buyer's account and are "
        "not included in the rates above.", foot))
    fl.append(Spacer(1, 3))
    fl.append(Paragraph(
        f"<super>2</super> USD amounts will be converted and invoiced at the "
        f"prevailing telegraphic transfer selling rate on the date of invoicing. The "
        f"rate of {t['fx_reference']} shown on page 1 is a reference only and is not "
        f"a committed rate. Exchange variation is to the buyer's account.", foot))
    fl.append(Spacer(1, 3))
    fl.append(Paragraph(
        f"<super>3</super> An additional discount of <b>{t['footnote_discount_pct']}%</b> "
        f"is available on {t['footnote_discount_scope']}. This discount is not "
        f"reflected in the unit rates on page 1 and is subject to our receiving deal "
        f"registration approval from the respective manufacturer, which is normally "
        f"granted within ten working days of a firm indication of order.", foot))
    fl.append(Spacer(1, 3))
    fl.append(Paragraph(
        "<super>4</super> Lines 24, 25 and 29 are marked NQ. These product categories "
        "are outside our current portfolio.", foot))
    fl.append(Spacer(1, 14))
    fl.append(Paragraph(f"For <b>{v['name']}</b><br/><br/><br/>{v['contact']}<br/>"
                        f"{v['role']}", small))
    def stamp(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 6.6)
        canvas.setFillColorRGB(0.35, 0.35, 0.35)
        canvas.drawRightString(197 * mm, 8 * mm, f"Page {canvas.getPageNumber()}")
        canvas.drawString(13 * mm, 8 * mm,
                          "Cygnus Technologies India Pvt Ltd  |  CTI-Q-2026-0918")
        canvas.restoreState()

    doc.build(fl, onFirstPage=stamp, onLaterPages=stamp)
    note(p)


# ===========================================================================
# V3 Orbit: a Word letter with the commercials in prose
# ===========================================================================

def build_v3():
    v = vendor("V3")
    d = DIRS["V3"]; d.mkdir(parents=True, exist_ok=True)
    t = TERMS["V3"]
    q = QUOTES["V3"]
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Calibri"; st.font.size = Pt(10.5)

    h = doc.add_paragraph(); h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = h.add_run("ORBIT SYSTEMS & SERVICES")
    r.bold = True; r.font.size = Pt(17); r.font.color.rgb = RGBColor(0x1B, 0x4D, 0x3E)
    sub = doc.add_paragraph(); sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = sub.add_run(f"Office No. 7, Kumar Prestige Point, Bajirao Road, {v['city']} 411002\n"
                     f"GSTIN {v['gstin']}  |  {v['email']}  |  {v['phone']}")
    sr.font.size = Pt(8.5)
    doc.add_paragraph("_" * 96)

    doc.add_paragraph(f"Ref: OSS/QT/2026-27/0442\t\t\t\tDate: {v['received']:%d %B %Y}")
    doc.add_paragraph()
    doc.add_paragraph(f"To,\n{RFX['buyer_contact']['name']}\n{RFX['buyer_contact']['title']}\n"
                      f"{BUYER['legal_name']}\n{BUYER['hq']}")
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.add_run(f"Subject: Our offer against your enquiry {RFX['id']} dated "
              f"{RFX['issued']:%d.%m.%Y}").bold = True
    doc.add_paragraph()
    doc.add_paragraph("Dear Madam,")
    doc.add_paragraph(
        "Thank you for the opportunity to quote. We have been supplying IT hardware to "
        "retail and manufacturing customers in western India since 2009 and would be "
        "glad to be associated with Kaveri Retail. Our offer is set out below.")

    doc.add_paragraph()
    doc.add_paragraph().add_run("Enduser Computing").bold = True

    # Prose commercials. The numbers are in sentences, not cells.
    doc.add_paragraph(
        f"For the 14 inch business laptop at your line 1, you have indicated a "
        f"requirement of {LINES[0]['qty']} units. Our best price for this model is "
        f"Rs. {q[1]['price']:,}/- per unit with 8GB DDR5 memory as standard, which is "
        f"upgradeable. Should you require 16GB as originally specified, the upgrade is "
        f"available at Rs. 3,400/- per unit over and above the above price. The "
        f"developer variant at your line 2 with Core i7 and 32GB memory works out to "
        f"Rs. {q[2]['price']:,}/- each for {LINES[1]['qty']} units, and the "
        f"ultraportable at line 3 to Rs. {q[3]['price']:,}/- each for "
        f"{LINES[2]['qty']} units. All three carry three year onsite warranty.")
    doc.add_paragraph(
        f"The small form factor desktop at line 4 is Rs. {q[4]['price']:,}/- per unit. "
        f"For displays, the 23.8 inch model at line 5 is offered at "
        f"Rs. {q[5]['price']:,}/- and the 27 inch USB-C model at line 6 at "
        f"Rs. {q[6]['price']:,}/-, both per unit.")
    doc.add_paragraph(
        f"On the docking stations at line 7 we are pleased to offer a special "
        f"arrangement. Our rate is Rs. {q[7]['price']:,}/- per unit, and we will "
        f"supply one docking station free of charge for every ten business laptops "
        f"ordered. Against 120 laptops this means 12 units free, so we have quoted "
        f"{q[7]['qty_override']} chargeable units against the 140 indicated in your "
        f"enquiry. We trust this is acceptable.")
    doc.add_paragraph(
        f"The accessories are offered as follows: laptop backpack at "
        f"Rs. {q[8]['price']:,}/-, wireless keyboard and mouse combination at "
        f"Rs. {q[9]['price']:,}/-, USB headset at Rs. {q[10]['price']:,}/- and "
        f"webcam at Rs. {q[11]['price']:,}/-, all rates being per unit.")

    doc.add_paragraph()
    doc.add_paragraph().add_run("Datacentre and Network").bold = True
    doc.add_paragraph(
        f"The 2U rack server at line 12 is offered at Rs. {q[12]['price']:,}/- per unit "
        f"in the configuration called for, with three year next business day onsite "
        f"support. The 32GB memory kit at line 13 is Rs. {q[13]['price']:,}/- per kit "
        f"and the 1.92TB enterprise SSD at line 14 is Rs. {q[14]['price']:,}/- per unit.")
    doc.add_paragraph(
        f"For the network, the 48 port PoE+ access switch at line 18 is "
        f"Rs. {q[18]['price']:,}/- and the 24 port 10G core switch at line 19 is "
        f"Rs. {q[19]['price']:,}/-. The 10G SFP+ transceivers at line 20 are "
        f"Rs. {q[20]['price']:,}/- per box of ten and the Cat6A patch cords at line 22 "
        f"are Rs. {q[22]['price']:,}/- per box of fifty. Wireless access points at "
        f"line 21 are Rs. {q[21]['price']:,}/- per unit including the three year "
        f"management licence.")
    doc.add_paragraph(
        f"On power and racks, the 42U rack with PDUs at line 23 is "
        f"Rs. {q[23]['price']:,}/-, the 10kVA online UPS at line 24 is "
        f"Rs. {q[24]['price']:,}/- and the 3kVA rack mount UPS at line 25 is "
        f"Rs. {q[25]['price']:,}/-, all per unit.")

    doc.add_paragraph()
    doc.add_paragraph().add_run("Retail and Peripherals").bold = True
    # One small table, so the document is neither fully prose nor fully tabular.
    tb = doc.add_table(rows=1, cols=4)
    tb.style = "Table Grid"
    for c, hh in enumerate(["Line", "Item", "Qty", "Rate (Rs.)"]):
        cell = tb.rows[0].cells[c]
        cell.text = hh
        cell.paragraphs[0].runs[0].bold = True
    for n in (26, 27, 28, 29):
        ln = next(l for l in LINES if l["no"] == n)
        row = tb.add_row().cells
        row[0].text = str(n)
        row[1].text = ln["desc"][:52]
        row[2].text = str(ln["qty"])
        row[3].text = f"{q[n]['price']:,}/-"

    doc.add_paragraph()
    doc.add_paragraph(
        "Regarding your line 30, extended cover to five years is included in our "
        "laptop prices at no additional charge, so no separate amount is payable "
        "against that line.")

    doc.add_paragraph()
    doc.add_paragraph().add_run("Commercial Terms").bold = True
    doc.add_paragraph(
        f"{t['gst']}. {t['freight']}. Payment {t['payment']} from date of invoice. "
        f"Our offer is valid for {t['validity']}. Delivery {t['delivery']} from "
        f"receipt of your purchase order.")
    doc.add_paragraph()
    doc.add_paragraph(
        "We look forward to your favourable consideration and remain available for "
        "any clarification.")
    doc.add_paragraph()
    doc.add_paragraph(f"Yours faithfully,\n\n\nFor Orbit Systems & Services\n"
                      f"{v['contact']}\n{v['role']}")

    for s in doc.sections:
        s.left_margin = s.right_margin = Inches(0.9)

    p = d / "Orbit_Offer_OSS-QT-2026-27-0442.docx"
    doc.save(p); note(p)


def build_v3_questionnaire():
    v = vendor("V3")
    doc = Document()
    doc.styles["Normal"].font.size = Pt(10)
    doc.add_paragraph().add_run(f"{RFX['id']} - Vendor Questionnaire").bold = True
    doc.add_paragraph(f"Respondent: {v['name']}    GSTIN {v['gstin']}")
    doc.add_paragraph()
    tb = doc.add_table(rows=1, cols=4); tb.style = "Table Grid"
    for c, hh in enumerate(["Q", "M/D", "Question", "Our response"]):
        cell = tb.rows[0].cells[c]; cell.text = hh
        cell.paragraphs[0].runs[0].bold = True
    ans = QUESTIONNAIRE_ANSWERS["V3"]
    for qq in QUESTIONNAIRE:
        a = ans[qq["no"]]
        row = tb.add_row().cells
        row[0].text = qq["no"]; row[1].text = qq["kind"]; row[2].text = qq["q"]
        row[3].text = a["answer"] or ""
        if a["doc"]:
            row[3].text += f"\n[{a['doc']}]"
    p = DIRS["V3"] / "Orbit_Questionnaire_Response.docx"
    doc.save(p); note(p)


# ===========================================================================
# V4 attachments: a partly-blank questionnaire and an expired certificate
# ===========================================================================

def build_v4_attachments():
    v = vendor("V4")
    d = DIRS["V4"]; d.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=styles["BodyText"], fontSize=8, leading=10.6)
    cellst = ParagraphStyle("c", parent=styles["BodyText"], fontSize=7.2, leading=9)

    # Questionnaire with four mandatory questions simply left blank.
    p = d / "Vector_Questionnaire_Response.pdf"
    doc = SimpleDocTemplate(str(p), pagesize=A4, topMargin=16 * mm, bottomMargin=16 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            title="Vector Digital Systems questionnaire response")
    fl = [Paragraph(f"<font size=13 color='#96201F'><b>VECTOR DIGITAL SYSTEMS</b></font>",
                    small),
          Paragraph(f"<font size=7>GSTIN {v['gstin']}  |  {v['email']}</font>", small),
          Spacer(1, 8),
          Paragraph(f"<b>{RFX['id']} - Vendor Questionnaire</b>", styles["Heading4"]),
          Spacer(1, 4)]
    rows = [[Paragraph(f"<b>{h}</b>", cellst)
             for h in ["Q", "M/D", "Question", "Our response", "Document"]]]
    ans = QUESTIONNAIRE_ANSWERS["V4"]
    for qq in QUESTIONNAIRE:
        a = ans[qq["no"]]
        rows.append([Paragraph(qq["no"], cellst), Paragraph(qq["kind"], cellst),
                     Paragraph(qq["q"], cellst),
                     Paragraph(a["answer"] or "", cellst),
                     Paragraph("VDS_ISO27001.pdf" if qq["no"] == "Q2" else "", cellst)])
    tb = Table(rows, colWidths=[9 * mm, 10 * mm, 84 * mm, 44 * mm, 33 * mm], repeatRows=1)
    tb.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#96201F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#999999")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    fl += [tb, Spacer(1, 10),
           Paragraph(f"For {v['name']}<br/><br/>{v['contact']}, {v['role']}", small)]
    doc.build(fl); note(p)

    # The expired certificate. The vendor answered "Yes" to Q2; this is what
    # they actually attached. Answer and evidence disagree, and only the
    # evidence is true.
    p = d / "VDS_ISO27001.pdf"
    doc = SimpleDocTemplate(str(p), pagesize=A4, topMargin=26 * mm, bottomMargin=26 * mm,
                            leftMargin=26 * mm, rightMargin=26 * mm,
                            title="ISO 27001 certificate, Vector Digital Systems")
    ctr = ParagraphStyle("ctr", parent=styles["BodyText"], alignment=1, fontSize=10,
                         leading=15)
    fl = [Paragraph("<font size=8 color='#555555'>NORTHGATE ASSURANCE SERVICES "
                    "(INDIA) PVT LTD</font>", ctr),
          Spacer(1, 16),
          Paragraph("<font size=19><b>CERTIFICATE OF REGISTRATION</b></font>", ctr),
          Spacer(1, 20),
          Paragraph("This is to certify that the information security management "
                    "system of", ctr),
          Spacer(1, 10),
          Paragraph(f"<font size=15><b>{v['name'].upper()}</b></font>", ctr),
          Paragraph("<font size=9>No. 42/3, Second Floor, Nungambakkam High Road, "
                    "Chennai 600034</font>", ctr),
          Spacer(1, 16),
          Paragraph("has been assessed and found to conform to the requirements of", ctr),
          Spacer(1, 8),
          Paragraph("<font size=15><b>ISO/IEC 27001:2013</b></font>", ctr),
          Spacer(1, 16),
          Paragraph("<font size=9>Scope: supply, integration and maintenance of "
                    "information technology hardware and networking equipment.</font>", ctr),
          Spacer(1, 22),
          Table([[Paragraph("<font size=9><b>Certificate No.</b><br/>"
                            "NAS/IN/27K/19-4471</font>", small),
                  Paragraph("<font size=9><b>Original issue</b><br/>"
                            "01 December 2019</font>", small),
                  Paragraph("<font size=9><b>Valid until</b><br/>"
                            "30 November 2025</font>", small)]],
                colWidths=[52 * mm, 52 * mm, 52 * mm],
                style=TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                  ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.grey)])),
          Spacer(1, 24),
          Paragraph("<font size=7 color='#666666'>The validity of this certificate is "
                    "subject to satisfactory completion of surveillance audits. This "
                    "certificate remains the property of Northgate Assurance Services "
                    "(India) Pvt Ltd.</font>", ctr)]
    doc.build(fl); note(p)


# ===========================================================================
# V5 Helios: the five-line email
# ===========================================================================

def build_v5():
    v = vendor("V5")
    d = DIRS["V5"]; d.mkdir(parents=True, exist_ok=True)
    q = QUOTES["V5"]

    body = f"""Hi Ananya,

Sorry for the delay, was travelling.

{q[1]['price']:,} for the 14" i5 (16/512, 3yr onsite), {q[2]['price']:,} for the i7/32GB. Monitors and docks same as our March PO rates, switches +6% over last year, rest we'll match Zenith. Freight extra. Payment 45 days.

Let me know if we're in the running and I'll send a formal quote on letterhead.

Regards,
{v['contact']}
{v['role']} | {v['name']}
{v['phone']}
"""
    m = EmailMessage()
    m["From"] = f"{v['contact']} <{v['email']}>"
    m["To"] = f"{RFX['buyer_contact']['name']} <{RFX['buyer_contact']['email']}>"
    m["Subject"] = f"RE: {RFX['id']} - FY27 IT Hardware Refresh - our rates"
    m["Date"] = format_datetime(datetime(2026, 9, 17, 21, 14, 8))
    m["Message-ID"] = make_msgid(domain="helios-ent.com")
    m["In-Reply-To"] = f"<{RFX['id'].lower()}.invite.4471@kaveriretail.in>"
    m["X-Mailer"] = "Microsoft Outlook 16.0"
    m.set_content(body)

    p = d / "helios_reply_2026-09-17.eml"
    p.write_bytes(m.as_bytes()); note(p)

    # No questionnaire, no attachment. The absence is the data point.
    (d / "NO_QUESTIONNAIRE_RECEIVED.txt").write_text(
        "Helios returned no questionnaire and no attachments.\n\n"
        "This is a non-response on all ten questions, six of which are mandatory.\n"
        "It is recorded as a non-response, not as a fail on the merits, and not as\n"
        "a blank the system may fill in later. The distinction matters: a vendor who\n"
        "answered and failed has told you something; a vendor who never answered has\n"
        "not.\n\n"
        "This file exists so the dataset is explicit about the absence. The pipeline\n"
        "does not read it.\n")
    note(d / "NO_QUESTIONNAIRE_RECEIVED.txt")


# ===========================================================================
# Shared attachments and internal reference data
# ===========================================================================

def build_certs():
    """Valid certificates for V1, V2, V3, so V4's expired one is a real finding
    rather than the only certificate in the set."""
    styles = getSampleStyleSheet()
    ctr = ParagraphStyle("ctr", parent=styles["BodyText"], alignment=1, fontSize=10,
                         leading=15)
    small = ParagraphStyle("s", parent=styles["BodyText"], fontSize=8, leading=10.6)
    specs = [
        ("V1", "ISO/IEC 27001:2022", "14 January 2028", "NAS/IN/27K/23-8812",
         "Zenith_ISO27001_2022.pdf"),
        ("V2", "ISO/IEC 27001:2022", "08 November 2027", "NAS/IN/27K/22-1190",
         "Cygnus_ISO27001_2022.pdf"),
        ("V3", "ISO/IEC 27001:2022", "22 April 2027", "NAS/IN/27K/24-2246",
         "Orbit_ISO27001_2022.pdf"),
    ]
    for code, std, valid, certno, fname in specs:
        v = vendor(code)
        p = DIRS[code] / fname
        doc = SimpleDocTemplate(str(p), pagesize=A4, topMargin=26 * mm,
                                bottomMargin=26 * mm, leftMargin=26 * mm,
                                rightMargin=26 * mm,
                                title=f"{std} certificate, {v['name']}")
        doc.build([
            Paragraph("<font size=8 color='#555555'>NORTHGATE ASSURANCE SERVICES "
                      "(INDIA) PVT LTD</font>", ctr),
            Spacer(1, 16),
            Paragraph("<font size=19><b>CERTIFICATE OF REGISTRATION</b></font>", ctr),
            Spacer(1, 20),
            Paragraph("This is to certify that the information security management "
                      "system of", ctr),
            Spacer(1, 10),
            Paragraph(f"<font size=15><b>{v['name'].upper()}</b></font>", ctr),
            Spacer(1, 16),
            Paragraph("has been assessed and found to conform to the requirements of", ctr),
            Spacer(1, 8),
            Paragraph(f"<font size=15><b>{std}</b></font>", ctr),
            Spacer(1, 22),
            Table([[Paragraph(f"<font size=9><b>Certificate No.</b><br/>{certno}</font>", small),
                    Paragraph(f"<font size=9><b>Valid until</b><br/>{valid}</font>", small)]],
                  colWidths=[78 * mm, 78 * mm],
                  style=TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                    ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.grey)])),
        ])
        note(p)


def build_oem_letters():
    styles = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=styles["BodyText"], fontSize=9.5, leading=13.5)
    for code, oems, fname in [
        ("V1", "Dell Technologies, HP Inc. and Lenovo", "Zenith_OEM_Authorisation.pdf"),
        ("V2", "Dell Technologies, Hewlett Packard Enterprise and Cisco Systems",
         "Cygnus_OEM_Authorisation.pdf"),
        ("V3", "Dell Technologies and Kyocera Document Solutions",
         "Orbit_OEM_Authorisation.pdf"),
    ]:
        v = vendor(code)
        p = DIRS[code] / fname
        doc = SimpleDocTemplate(str(p), pagesize=A4, topMargin=22 * mm,
                                bottomMargin=22 * mm, leftMargin=24 * mm,
                                rightMargin=24 * mm,
                                title=f"OEM authorisation, {v['name']}")
        doc.build([
            Paragraph("<font size=11><b>MANUFACTURER'S AUTHORISATION</b></font>",
                      styles["Heading3"]),
            Spacer(1, 10),
            Paragraph(f"This is to confirm that <b>{v['name']}</b>, {v['city']}, "
                      f"GSTIN {v['gstin']}, is an authorised channel partner for "
                      f"{oems} in India for the financial year 2026-27.", small),
            Spacer(1, 8),
            Paragraph(f"The partner is authorised to quote, supply and provide "
                      f"warranty service for the product lines covered by its "
                      f"partnership tier, including against enquiry {RFX['id']} of "
                      f"{BUYER['legal_name']}.", small),
            Spacer(1, 8),
            Paragraph("This authorisation is valid until 31 March 2027 unless "
                      "withdrawn earlier in writing.", small),
            Spacer(1, 20),
            Paragraph("For and on behalf of the respective manufacturers<br/>"
                      "(consolidated partner authorisation, India Channel Operations)",
                      small),
        ])
        note(p)


def build_internal():
    d = DIRS["internal"]; d.mkdir(parents=True, exist_ok=True)
    p = d / "prior_po_rates.csv"
    with p.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["# Internal reference data, not part of any vendor response."])
        w.writerow([f"# Needed to resolve V5's relative pricing. Deliberately"])
        w.writerow([f"# incomplete: it does NOT cover every line V5 refers to."])
        w.writerow(["po_number", "po_date", "vendor", "sku", "uom", "rate_inr_ex_gst"])
        for sku, rate in PRIOR_PO["rates"].items():
            ln = next(l for l in LINES if l["sku"] == sku)
            w.writerow([PRIOR_PO["po_number"], PRIOR_PO["po_date"], PRIOR_PO["vendor"],
                        sku, ln["uom"], rate])
    note(p)


def main():
    # The RFx pack now ships as five separate documents (scope / line items /
    # questionnaire / terms / instructions) and is built by build_rfx_pack.py.
    # build_rfx() below is superseded and no longer called.
    gross, net = build_v1(revision=1)
    build_v1(revision=2)
    build_v1_questionnaire()
    build_v2()
    build_v3()
    build_v3_questionnaire()
    build_v4_attachments()
    build_v5()
    build_certs()
    build_oem_letters()
    build_internal()

    print(f"{len(written)} files written\n")
    for p in sorted(written):
        rel = p.relative_to(OUT)
        print(f"  {p.stat().st_size/1024:8.1f} KB  {rel}")
    print(f"\nV1 line sum Rs {gross:,} vs stated net Rs {net:,} "
          f"(the 2.5% total-level discount, unattributable to any line)")


if __name__ == "__main__":
    main()
