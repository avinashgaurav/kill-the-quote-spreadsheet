"""
Single source of truth for the fabricated demo dataset.

Everything else in dataset/generators/ reads from here, so the RFx, the five
vendor replies, the questionnaire results and the ground-truth answer key can
never drift apart.

Buyer:  Kaveri Retail India Pvt Ltd (fictional)
RFx:    RFX-2026-0142, FY27 IT Hardware Refresh
Scale:  30 line items, 5 vendors, ~Rs 4 crore at internal baseline

Currency convention: all INR amounts are ex-GST unless a field says otherwise.
"""

from datetime import date

# ---------------------------------------------------------------------------
# Buyer / RFx header
# ---------------------------------------------------------------------------

BUYER = {
    "legal_name": "Kaveri Retail India Pvt Ltd",
    "short_name": "Kaveri Retail",
    "cin": "U52190KA2011PTC058842",
    "gstin": "29AACCN4471K1ZP",
    "hq": "Prestige Tech Park, Outer Ring Road, Bengaluru 560103",
    "sites": ["Bengaluru (HQ)", "Pune (DC-West)", "Gurugram (DC-North)"],
    "headcount": 1420,
}

RFX = {
    "id": "RFX-2026-0142",
    "title": "FY27 IT Hardware Refresh - Enduser Compute, Datacentre & Network",
    "issued": date(2026, 9, 4),
    "due": date(2026, 9, 18),
    "buyer_contact": {
        "name": "Ananya Kulkarni",
        "title": "Category Manager - IT & Telecom",
        "email": "ananya.kulkarni@northbridgeretail.in",
        "phone": "+91 80 4718 2290",
    },
    "approver": {
        "name": "Rajat Menon",
        "title": "VP - Procurement",
        "email": "rajat.menon@northbridgeretail.in",
    },
    "incoterm_asked": "FOR destination, all three sites",
    "tax_basis_asked": "Quote ex-GST. State GST rate and HSN per line.",
    "payment_asked": "Net 30 from delivery and acceptance",
    "validity_asked": "90 days from bid due date",
    "currency_asked": "INR",
}

# ---------------------------------------------------------------------------
# The 30 RFx line items
#
# uom            : unit of measure the BUYER asked for
# pack_size      : how many billable units sit inside one `uom` (kit/box/pack)
# baseline_inr   : buyer's internal should-cost per `uom`, ex-GST
# trap           : the specific ugly edge this line is built to exercise
# ---------------------------------------------------------------------------

LINES = [
    # --- Enduser compute -------------------------------------------------
    dict(no=1,  sku="LT-BUS-14",  group="Enduser Compute",
         desc="Laptop, business, 14in FHD, Core i5 13th gen, 16GB DDR5, 512GB NVMe SSD, Win 11 Pro, 3yr onsite NBD warranty",
         spec=dict(cpu="Core i5-1345U or equivalent", ram_gb=16, storage="512GB NVMe",
                   display="14in FHD IPS", os="Win 11 Pro", warranty="3yr onsite NBD"),
         uom="nos", pack_size=1, qty=120, hsn="8471", baseline_inr=64500,
         trap="config downgrade (V3 quotes 8GB); warranty bundling (V2 quotes 1yr + separate uplift)"),
    dict(no=2,  sku="LT-DEV-14",  group="Enduser Compute",
         desc="Laptop, developer, 14in QHD, Core i7 13th gen, 32GB DDR5, 1TB NVMe SSD, Win 11 Pro, 3yr onsite NBD warranty",
         spec=dict(cpu="Core i7-1365U or equivalent", ram_gb=32, storage="1TB NVMe",
                   display="14in QHD", os="Win 11 Pro", warranty="3yr onsite NBD"),
         uom="nos", pack_size=1, qty=30, hsn="8471", baseline_inr=112000,
         trap="OEM substitution (V1 offers previous-gen equivalent)"),
    dict(no=3,  sku="LT-ULT-13",  group="Enduser Compute",
         desc="Laptop, ultraportable, 13.3in FHD, Core i5 13th gen, 16GB, 512GB NVMe SSD, sub-1.1kg, 3yr onsite NBD",
         spec=dict(cpu="Core i5 13th gen", ram_gb=16, storage="512GB NVMe",
                   weight="<1.1 kg", warranty="3yr onsite NBD"),
         uom="nos", pack_size=1, qty=25, hsn="8471", baseline_inr=89000, trap=None),
    dict(no=4,  sku="DT-SFF",     group="Enduser Compute",
         desc="Desktop, small form factor, Core i5 13th gen, 8GB DDR5, 512GB NVMe SSD, Win 11 Pro, 3yr onsite NBD",
         spec=dict(cpu="Core i5 13th gen", ram_gb=8, storage="512GB NVMe",
                   os="Win 11 Pro", warranty="3yr onsite NBD"),
         uom="nos", pack_size=1, qty=40, hsn="8471", baseline_inr=41000, trap=None),
    dict(no=5,  sku="MON-24",     group="Enduser Compute",
         desc="Monitor, 23.8in FHD IPS, height-adjustable stand, DisplayPort + HDMI, 3yr warranty",
         spec=dict(size="23.8in", res="1920x1080", panel="IPS", stand="height adjustable"),
         uom="nos", pack_size=1, qty=160, hsn="8528", baseline_inr=9800,
         trap="V5 prices by reference to a prior PO ('same as our March PO rates')"),
    dict(no=6,  sku="MON-27",     group="Enduser Compute",
         desc="Monitor, 27in QHD IPS, USB-C 65W power delivery, RJ45 passthrough, 3yr warranty",
         spec=dict(size="27in", res="2560x1440", panel="IPS", usb_c_pd_w=65),
         uom="nos", pack_size=1, qty=45, hsn="8528", baseline_inr=21500, trap=None),
    dict(no=7,  sku="DOCK-USBC",  group="Enduser Compute",
         desc="Docking station, USB-C, dual 4K@60Hz, 100W power delivery, 2x RJ45, 3yr warranty",
         spec=dict(displays="dual 4K@60", pd_w=100),
         uom="nos", pack_size=1, qty=140, hsn="8473", baseline_inr=13500,
         trap="V3 bundles 12 free units, so quoted qty (128) != asked qty (140)"),
    dict(no=8,  sku="BAG-15",     group="Enduser Compute",
         desc="Laptop backpack, fits 15.6in, water resistant, padded sleeve",
         spec=dict(fits="15.6in"),
         uom="nos", pack_size=1, qty=170, hsn="4202", baseline_inr=1450, trap=None),
    dict(no=9,  sku="KBM-WL",     group="Enduser Compute",
         desc="Wireless keyboard and mouse combo, 2.4GHz unifying receiver, Indian layout",
         spec=dict(layout="Indian"),
         uom="nos", pack_size=1, qty=200, hsn="8471", baseline_inr=1850, trap=None),
    dict(no=10, sku="HDST-UC",    group="Enduser Compute",
         desc="USB headset, UC-certified (Teams), active noise cancelling, in-line controls",
         spec=dict(cert="Microsoft Teams certified", anc=True),
         uom="nos", pack_size=1, qty=170, hsn="8518", baseline_inr=3200, trap=None),
    dict(no=11, sku="CAM-1080",   group="Enduser Compute",
         desc="Webcam, 1080p30, autofocus, dual mic, mechanical privacy shutter",
         spec=dict(res="1080p30", privacy_shutter=True),
         uom="nos", pack_size=1, qty=80, hsn="8525", baseline_inr=2900, trap=None),

    # --- Datacentre ------------------------------------------------------
    dict(no=12, sku="SRV-2U",     group="Datacentre",
         desc="Rack server, 2U, 2x Xeon Silver 4410Y, 128GB DDR5 RDIMM, 8x 2.5in SFF bays, dual 1100W PSU, iDRAC/iLO equivalent, 3yr NBD onsite",
         spec=dict(cpu="2x Xeon Silver 4410Y", ram_gb=128, bays=8, psu="dual 1100W",
                   warranty="3yr NBD onsite"),
         uom="nos", pack_size=1, qty=6, hsn="8471", baseline_inr=585000,
         trap="V1 substitutes a different OEM; V2 quotes in USD ex-works Singapore"),
    dict(no=13, sku="RAM-32K",    group="Datacentre",
         desc="Server memory upgrade, 32GB total as a matched kit of 2x 16GB DDR5-4800 RDIMM",
         spec=dict(total_gb=32, form="kit of 2x 16GB RDIMM", speed="DDR5-4800"),
         uom="kit", pack_size=2, qty=24, hsn="8473", baseline_inr=18500,
         trap="UoM: V4 quotes PER DIMM, not per kit. Looks ~half price until normalised."),
    dict(no=14, sku="SSD-192",    group="Datacentre",
         desc="Enterprise SSD, 1.92TB, SAS 12Gbps, mixed-use endurance (>=3 DWPD), 2.5in SFF, OEM-certified caddy",
         spec=dict(capacity="1.92TB", iface="SAS 12G", endurance=">=3 DWPD"),
         uom="nos", pack_size=1, qty=24, hsn="8471", baseline_inr=68000,
         trap="V2 quotes in USD ex-works"),
    dict(no=15, sku="NAS-60",     group="Datacentre",
         desc="Backup storage appliance, 60TB raw, 12-bay, dual 10GbE, hardware RAID, 3yr NBD",
         spec=dict(raw_tb=60, bays=12, net="dual 10GbE"),
         uom="nos", pack_size=1, qty=2, hsn="8471", baseline_inr=820000,
         trap="V3 silently omits this line (27 of 30)"),
    dict(no=16, sku="TAPE-LTO9",  group="Datacentre",
         desc="LTO-9 tape drive, external, SAS HBA included, 18TB native per cartridge",
         spec=dict(gen="LTO-9", iface="external SAS"),
         uom="nos", pack_size=1, qty=2, hsn="8471", baseline_inr=410000,
         trap="V3 silently omits this line (27 of 30)"),
    dict(no=17, sku="MED-LTO9",   group="Datacentre",
         desc="LTO-9 tape media, 18TB native, barcode-labelled, supplied as packs of 5 cartridges",
         spec=dict(gen="LTO-9", pack="5 cartridges"),
         uom="pack of 5", pack_size=5, qty=12, hsn="8523", baseline_inr=22000,
         trap="UoM: pack of 5 vs per cartridge. V3 silently omits (27 of 30)"),

    # --- Network & power -------------------------------------------------
    dict(no=18, sku="SW-48P",     group="Network & Power",
         desc="Access switch, 48-port GbE PoE+ (740W budget), 4x 10G SFP+ uplinks, L2 managed, stackable, lifetime hardware warranty",
         spec=dict(ports=48, poe_budget_w=740, uplinks="4x 10G SFP+", layer="L2"),
         uom="nos", pack_size=1, qty=14, hsn="8517", baseline_inr=195000,
         trap="V5 prices as '+6% over last year' - resolvable only against the prior PO table"),
    dict(no=19, sku="SW-24SFP",   group="Network & Power",
         desc="Core switch, 24-port 10G SFP+, 2x 40G QSFP+ uplinks, L3 with OSPF/BGP, redundant PSU, 5yr warranty",
         spec=dict(ports="24x 10G SFP+", uplinks="2x 40G QSFP+", layer="L3"),
         uom="nos", pack_size=1, qty=4, hsn="8517", baseline_inr=460000,
         trap="V1 substitutes a different OEM"),
    dict(no=20, sku="SFP-10G",    group="Network & Power",
         desc="Transceiver, 10GBASE-SR SFP+, 850nm multimode, OEM-coded to the quoted switch, supplied in boxes of 10",
         spec=dict(type="10GBASE-SR", pack="box of 10"),
         uom="box of 10", pack_size=10, qty=6, hsn="8517", baseline_inr=42000,
         trap="UoM: V4 quotes PER PIECE. Looks 1/10th price until normalised."),
    dict(no=21, sku="AP-WIFI6",   group="Network & Power",
         desc="Wireless access point, Wi-Fi 6 (802.11ax), dual radio 2x2, indoor, PoE+ powered, incl. 3yr cloud management licence",
         spec=dict(std="802.11ax", radios="dual 2x2", licence="3yr cloud mgmt"),
         uom="nos", pack_size=1, qty=55, hsn="8517", baseline_inr=28500, trap=None),
    dict(no=22, sku="PC-CAT6A",   group="Network & Power",
         desc="Patch cord, Cat6A, 2m, LSZH jacket, factory-terminated and tested, supplied in boxes of 50",
         spec=dict(cat="6A", length="2m", jacket="LSZH", pack="box of 50"),
         uom="box of 50", pack_size=50, qty=14, hsn="8544", baseline_inr=14500,
         trap="UoM: V4 quotes PER PIECE. V1 raises qty to its MOQ of 20 boxes."),
    dict(no=23, sku="RACK-42U",   group="Network & Power",
         desc="Server rack, 42U, 800mm deep, perforated front/rear doors, incl. pair of 32A vertical PDUs",
         spec=dict(height="42U", depth="800mm", pdu="2x 32A vertical"),
         uom="nos", pack_size=1, qty=3, hsn="9403", baseline_inr=78000, trap=None),
    dict(no=24, sku="UPS-10K",    group="Network & Power",
         desc="Online UPS, 10kVA, 3-phase in / 1-phase out, incl. battery bank for 30 min at full load, SNMP card",
         spec=dict(kva=10, topology="online double conversion", backup="30 min @ full load"),
         uom="nos", pack_size=1, qty=3, hsn="8504", baseline_inr=315000,
         trap="V2 declines to quote (not their line of business)"),
    dict(no=25, sku="UPS-3K",     group="Network & Power",
         desc="Rack-mount online UPS, 3kVA, 2U, incl. battery for 15 min at full load, network management card",
         spec=dict(kva=3, form="2U rackmount", backup="15 min @ full load"),
         uom="nos", pack_size=1, qty=8, hsn="8504", baseline_inr=68000,
         trap="V2 declines to quote (not their line of business)"),

    # --- Retail / peripherals -------------------------------------------
    dict(no=26, sku="MFP-A3",     group="Retail & Peripherals",
         desc="Multifunction printer, A3 mono laser, network, auto-duplex, 50ppm, ADF, incl. 3yr onsite AMC",
         spec=dict(format="A3 mono laser", ppm=50, amc="3yr onsite"),
         uom="nos", pack_size=1, qty=8, hsn="8443", baseline_inr=148000,
         trap="V1 substitutes a different OEM"),
    dict(no=27, sku="SCAN-2D",    group="Retail & Peripherals",
         desc="Barcode scanner, 2D imager, wireless (Bluetooth), incl. charging cradle, for DC use",
         spec=dict(type="2D imager", link="Bluetooth", cradle=True),
         uom="nos", pack_size=1, qty=90, hsn="8471", baseline_inr=9400, trap=None),
    dict(no=28, sku="HHT-AND",    group="Retail & Peripherals",
         desc="Rugged handheld terminal, Android 13, 2D scanner, 4GB/64GB, hot-swap battery, IP65, 3yr comprehensive cover",
         spec=dict(os="Android 13", rating="IP65", warranty="3yr comprehensive"),
         uom="nos", pack_size=1, qty=25, hsn="8471", baseline_inr=52000, trap=None),
    dict(no=29, sku="DSP-55",     group="Retail & Peripherals",
         desc="Digital signage display, 55in FHD, 24x7 rated, 500 nits, incl. tilt wall mount, 3yr onsite",
         spec=dict(size="55in", duty="24x7", brightness="500 nits"),
         uom="nos", pack_size=1, qty=18, hsn="8528", baseline_inr=47000,
         trap="V2 declines to quote (not their line of business)"),
    dict(no=30, sku="WTY-EXT",    group="Retail & Peripherals",
         desc="Warranty uplift for laptop lines 1-3: years 4 and 5, onsite next-business-day, per unit",
         spec=dict(scope="lines 1-3", years="4-5", sla="onsite NBD"),
         uom="nos", pack_size=1, qty=170, hsn="9983", baseline_inr=6800,
         trap="Comparability: V2 folds years 1-3 in here, V3 says 'included', V1 quotes as asked"),
]

# ---------------------------------------------------------------------------
# Prior-PO reference table. Internal data, used to resolve V5's relative prices.
# Deliberately incomplete: it covers monitors, docks and access switches but
# NOT the developer laptop, so one of V5's references is resolvable and another
# is not.
# ---------------------------------------------------------------------------

PRIOR_PO = {
    "po_number": "NBR/PO/2026/00317",
    "po_date": date(2026, 3, 21),
    "vendor": "Helios Enterprise Solutions Pvt Ltd",
    "rates": {
        "MON-24": 10100,
        "DOCK-USBC": 13900,
        "SW-48P": 188000,
        "KBM-WL": 1920,
        "BAG-15": 1500,
    },
}

# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

VENDORS = [
    dict(code="V1", slug="zenith", name="Zenith Infotech Solutions Pvt Ltd",
         city="Bengaluru", gstin="29AABCZ8812H1Z4",
         contact="Prakash Iyer", role="Key Account Manager",
         email="prakash.iyer@zenithinfotech.co.in", phone="+91 98450 21174",
         reply_format="xlsx", reply_channel="email attachment",
         received=date(2026, 9, 11), revision_received=date(2026, 9, 13),
         blurb="Large national reseller, multi-OEM, strong on enduser compute."),
    dict(code="V2", slug="cygnus", name="Cygnus Technologies India Pvt Ltd",
         city="Mumbai", gstin="27AADCC1190J1ZK",
         contact="Farida Merchant", role="Enterprise Sales Director",
         email="farida.merchant@cygnustech.in", phone="+91 98201 44903",
         reply_format="pdf", reply_channel="email attachment",
         received=date(2026, 9, 15),
         blurb="OEM-authorised partner, imports datacentre kit directly, quotes part USD."),
    dict(code="V3", slug="orbit", name="Orbit Systems & Services",
         city="Pune", gstin="27AAGFO2246L1ZB",
         contact="Sameer Deshpande", role="Proprietor",
         email="sameer@orbitsystems.co.in", phone="+91 99225 61180",
         reply_format="docx", reply_channel="email attachment",
         received=date(2026, 9, 16),
         blurb="Mid-size partnership firm. Writes quotes as letters, not spreadsheets."),
    dict(code="V4", slug="vector", name="Vector Digital Systems",
         city="Chennai", gstin="33AAMFV7731Q1ZG",
         contact="R. Karthikeyan", role="Partner",
         email="karthik@vectordigital.in", phone="+91 94440 78215",
         reply_format="photo", reply_channel="WhatsApp, forwarded to email",
         received=date(2026, 9, 17),
         blurb="Small channel partner. Sent a phone photo of a printed rate card, hand-annotated."),
    dict(code="V5", slug="helios", name="Helios Enterprise Solutions Pvt Ltd",
         city="Gurugram", gstin="06AACCH5528M1Z9",
         contact="Vikram Sethi", role="Director - Sales",
         email="vikram.sethi@helios-ent.com", phone="+91 98111 30542",
         reply_format="eml", reply_channel="plain email body, no attachment",
         received=date(2026, 9, 17),
         blurb="Incumbent for peripherals. Replies in one paragraph and expects you to remember last year."),
]

# ---------------------------------------------------------------------------
# Per-vendor, per-line quote behaviour.
#
# status:
#   quoted        - a clean explicit price
#   substituted   - priced, but against a different make/model
#   downgraded    - priced, but against a lower spec than asked
#   uom_mismatch  - priced in a different unit than asked (the pack/kit traps)
#   bundled       - priced, but quantity differs because of a free-goods offer
#   moq_adjusted  - priced, but quantity raised to the vendor's MOQ
#   relative      - no absolute price; refers to a prior PO or an uplift %
#   match_rival   - no price at all; offers to match another bidder
#   illegible     - a price exists on the page but cannot be read
#   not_quoted    - explicitly declined
#   omitted       - silently missing, no mention anywhere
#
# price is stated in the vendor's OWN unit and currency. Normalising it is the
# system's job, not the dataset's.
# ---------------------------------------------------------------------------

QUOTES = {
    # ---------------- V1 Zenith: complete, messy spreadsheet ----------------
    "V1": {
        1:  dict(status="quoted", price=62800, uom="nos", ccy="INR"),
        2:  dict(status="substituted", price=104500, uom="nos", ccy="INR",
                 offered="HP ProBook 445 G11, Ryzen 7 7735U, 32GB, 1TB",
                 note="Equivalent offered. i7-1365U variant on 10-12 wk lead time."),
        3:  dict(status="quoted", price=91200, uom="nos", ccy="INR"),
        4:  dict(status="quoted", price=39800, uom="nos", ccy="INR"),
        5:  dict(status="quoted", price=9450, uom="nos", ccy="INR"),
        6:  dict(status="quoted", price=20900, uom="nos", ccy="INR"),
        7:  dict(status="quoted", price=13100, uom="nos", ccy="INR"),
        8:  dict(status="quoted", price=1390, uom="nos", ccy="INR"),
        9:  dict(status="quoted", price=1780, uom="nos", ccy="INR"),
        10: dict(status="quoted", price=3080, uom="nos", ccy="INR"),
        11: dict(status="quoted", price=2760, uom="nos", ccy="INR"),
        12: dict(status="substituted", price=548000, uom="nos", ccy="INR",
                 offered="Lenovo ThinkSystem SR630 V3, 2x Xeon Silver 4410Y, 128GB",
                 note="Lenovo offered in place of the referenced OEM."),
        13: dict(status="quoted", price=18900, uom="kit", ccy="INR",
                 note="Kit of 2x16GB as specified."),
        14: dict(status="quoted", price=66500, uom="nos", ccy="INR"),
        15: dict(status="quoted", price=838000, uom="nos", ccy="INR"),
        16: dict(status="quoted", price=402000, uom="nos", ccy="INR"),
        17: dict(status="quoted", price=21400, uom="pack of 5", ccy="INR"),
        18: dict(status="quoted", price=191500, uom="nos", ccy="INR"),
        19: dict(status="substituted", price=438000, uom="nos", ccy="INR",
                 offered="Aruba CX 8325-32C, 32x 100G (down-linked to 10G)",
                 note="Higher port class offered; commercially closest available."),
        20: dict(status="quoted", price=41200, uom="box of 10", ccy="INR"),
        21: dict(status="quoted", price=27900, uom="nos", ccy="INR"),
        22: dict(status="moq_adjusted", price=14200, uom="box of 50", ccy="INR",
                 qty_override=20, note="MOQ 20 boxes on Cat6A. Quoting 20 against 14 asked."),
        23: dict(status="quoted", price=76500, uom="nos", ccy="INR"),
        24: dict(status="quoted", price=309000, uom="nos", ccy="INR"),
        25: dict(status="quoted", price=66200, uom="nos", ccy="INR"),
        26: dict(status="substituted", price=139000, uom="nos", ccy="INR",
                 offered="Kyocera TASKalfa 4004i, A3 mono, 40ppm",
                 note="40ppm offered against 50ppm asked."),
        27: dict(status="quoted", price=9150, uom="nos", ccy="INR"),
        28: dict(status="quoted", price=50400, uom="nos", ccy="INR"),
        29: dict(status="quoted", price=45800, uom="nos", ccy="INR"),
        30: dict(status="quoted", price=6650, uom="nos", ccy="INR"),
    },

    # ---------------- V2 Cygnus: PDF, mixed currency, footnote discount ----
    "V2": {
        # These three carry an explicit pointer at the supplier's own uplift
        # line. The calculator adds it before ranking, driven by this field
        # rather than by any knowledge of which vendor or which lines: the
        # pattern (price one year, quote the other two separately) is ordinary,
        # and a system that only handles it for V2 handles it for nobody.
        1:  dict(status="downgraded", price=59900, uom="nos", ccy="INR",
                 note="1-year standard warranty only. 3-year onsite uplift quoted at line 30A.",
                 scope_uplift_ref="30A",
                 scope_uplift_note="years 1-3 onsite cover, to match the 3-year term asked"),
        2:  dict(status="downgraded", price=105800, uom="nos", ccy="INR",
                 note="1-year standard warranty only. See line 30A.",
                 scope_uplift_ref="30A",
                 scope_uplift_note="years 1-3 onsite cover, to match the 3-year term asked"),
        3:  dict(status="downgraded", price=86400, uom="nos", ccy="INR",
                 note="1-year standard warranty only. See line 30A.",
                 scope_uplift_ref="30A",
                 scope_uplift_note="years 1-3 onsite cover, to match the 3-year term asked"),
        4:  dict(status="quoted", price=40200, uom="nos", ccy="INR"),
        5:  dict(status="quoted", price=9700, uom="nos", ccy="INR"),
        6:  dict(status="quoted", price=20400, uom="nos", ccy="INR"),
        7:  dict(status="quoted", price=12850, uom="nos", ccy="INR"),
        8:  dict(status="quoted", price=1520, uom="nos", ccy="INR"),
        9:  dict(status="quoted", price=1910, uom="nos", ccy="INR"),
        10: dict(status="quoted", price=3040, uom="nos", ccy="INR"),
        11: dict(status="quoted", price=2820, uom="nos", ccy="INR"),
        12: dict(status="quoted", price=6180, uom="nos", ccy="USD",
                 note="Ex-works Singapore. Duty and freight to buyer's account."),
        13: dict(status="quoted", price=198, uom="kit", ccy="USD",
                 note="Ex-works Singapore."),
        14: dict(status="quoted", price=735, uom="nos", ccy="USD",
                 note="Ex-works Singapore."),
        15: dict(status="quoted", price=8840, uom="nos", ccy="USD",
                 note="Ex-works Singapore."),
        16: dict(status="quoted", price=4420, uom="nos", ccy="USD",
                 note="Ex-works Singapore."),
        17: dict(status="quoted", price=232, uom="pack of 5", ccy="USD",
                 note="Ex-works Singapore."),
        18: dict(status="quoted", price=2090, uom="nos", ccy="USD",
                 note="Ex-works Singapore."),
        19: dict(status="quoted", price=4980, uom="nos", ccy="USD",
                 note="Ex-works Singapore."),
        20: dict(status="quoted", price=452, uom="box of 10", ccy="USD",
                 note="Ex-works Singapore."),
        21: dict(status="quoted", price=29400, uom="nos", ccy="INR"),
        22: dict(status="quoted", price=15100, uom="box of 50", ccy="INR"),
        23: dict(status="quoted", price=81000, uom="nos", ccy="INR"),
        24: dict(status="not_quoted", note="Not our line of business - regret."),
        25: dict(status="not_quoted", note="Not our line of business - regret."),
        26: dict(status="quoted", price=151000, uom="nos", ccy="INR"),
        27: dict(status="quoted", price=9600, uom="nos", ccy="INR"),
        28: dict(status="quoted", price=53500, uom="nos", ccy="INR"),
        29: dict(status="not_quoted", note="Not our line of business - regret."),
        30: dict(status="quoted", price=4200, uom="nos", ccy="INR",
                 note="Years 4-5 only, as asked."),
        # The line the vendor invented, which is not in the RFx at all.
        "30A": dict(status="unmapped", price=7900, uom="nos", ccy="INR", qty=175,
                    desc="Warranty uplift years 1-3, onsite NBD, laptop lines 1-3",
                    note="Not an RFx line. Vendor-created. Without it, lines 1-3 are "
                         "1-year cover and are not comparable to other bids."),
    },

    # ---------------- V3 Orbit: prose letter, 27 of 30 ---------------------
    "V3": {
        1:  dict(status="downgraded", price=58200, uom="nos", ccy="INR",
                 offered="8GB DDR5 as standard, upgradeable to 16GB",
                 note="8GB against 16GB asked. Upgrade to 16GB quoted at Rs 3,400 per unit."),
        2:  dict(status="quoted", price=109500, uom="nos", ccy="INR"),
        3:  dict(status="quoted", price=92400, uom="nos", ccy="INR"),
        4:  dict(status="quoted", price=38900, uom="nos", ccy="INR"),
        5:  dict(status="quoted", price=9250, uom="nos", ccy="INR"),
        6:  dict(status="quoted", price=21100, uom="nos", ccy="INR"),
        7:  dict(status="bundled", price=13400, uom="nos", ccy="INR", qty_override=128,
                 note="One docking station free with every ten laptops. 12 free against "
                      "120 business laptops, so 128 chargeable against 140 asked."),
        8:  dict(status="quoted", price=1320, uom="nos", ccy="INR"),
        9:  dict(status="quoted", price=1690, uom="nos", ccy="INR"),
        10: dict(status="quoted", price=2950, uom="nos", ccy="INR"),
        11: dict(status="quoted", price=2680, uom="nos", ccy="INR"),
        12: dict(status="quoted", price=571000, uom="nos", ccy="INR"),
        13: dict(status="quoted", price=19200, uom="kit", ccy="INR"),
        14: dict(status="quoted", price=69500, uom="nos", ccy="INR"),
        15: dict(status="omitted"),
        16: dict(status="omitted"),
        17: dict(status="omitted"),
        18: dict(status="quoted", price=197000, uom="nos", ccy="INR"),
        19: dict(status="quoted", price=471000, uom="nos", ccy="INR"),
        20: dict(status="quoted", price=43500, uom="box of 10", ccy="INR"),
        21: dict(status="quoted", price=27200, uom="nos", ccy="INR"),
        22: dict(status="quoted", price=13900, uom="box of 50", ccy="INR"),
        23: dict(status="quoted", price=74000, uom="nos", ccy="INR"),
        24: dict(status="quoted", price=298000, uom="nos", ccy="INR"),
        25: dict(status="quoted", price=64500, uom="nos", ccy="INR"),
        26: dict(status="quoted", price=142000, uom="nos", ccy="INR"),
        27: dict(status="quoted", price=8850, uom="nos", ccy="INR"),
        28: dict(status="quoted", price=49800, uom="nos", ccy="INR"),
        29: dict(status="quoted", price=44200, uom="nos", ccy="INR"),
        30: dict(status="quoted", price=0, uom="nos", ccy="INR",
                 note="'Extended cover to five years is included in our laptop prices at "
                      "no additional charge.' Zero-price line, not a missing line."),
    },

    # ---------------- V4 Vector: photographed rate card, ~22 lines ---------
    # Cheapest on most lines, and disqualified on the questionnaire. The whole
    # point of the dataset.
    "V4": {
        1:  dict(status="quoted", price=57900, uom="nos", ccy="INR",
                 handwritten=True, printed_price=59500,
                 note="Printed 59,500 struck through, 57,900 written in pen."),
        2:  dict(status="quoted", price=99500, uom="nos", ccy="INR"),
        3:  dict(status="quoted", price=84000, uom="nos", ccy="INR"),
        4:  dict(status="quoted", price=37200, uom="nos", ccy="INR"),
        5:  dict(status="quoted", price=8950, uom="nos", ccy="INR"),
        6:  dict(status="illegible", printed_price=19800,
                 note="Glare across the cell. A price is clearly present and cannot be read."),
        7:  dict(status="quoted", price=12400, uom="nos", ccy="INR"),
        8:  dict(status="quoted", price=1180, uom="nos", ccy="INR"),
        9:  dict(status="quoted", price=1540, uom="nos", ccy="INR"),
        10: dict(status="quoted", price=2870, uom="nos", ccy="INR"),
        11: dict(status="quoted", price=2490, uom="nos", ccy="INR"),
        12: dict(status="quoted", price=524000, uom="nos", ccy="INR",
                 handwritten=True, printed_price=536000,
                 note="Printed 5,36,000 struck through, 5,24,000 written in pen."),
        13: dict(status="uom_mismatch", price=9600, uom="per DIMM", ccy="INR",
                 note="Quoted per 16GB DIMM. Two DIMMs make the asked kit."),
        14: dict(status="quoted", price=63500, uom="nos", ccy="INR"),
        15: dict(status="omitted"),
        16: dict(status="omitted"),
        17: dict(status="omitted"),
        18: dict(status="quoted", price=184000, uom="nos", ccy="INR"),
        19: dict(status="omitted"),
        20: dict(status="uom_mismatch", price=4150, uom="per pc", ccy="INR",
                 note="Quoted per transceiver. Ten make the asked box."),
        21: dict(status="quoted", price=26400, uom="nos", ccy="INR"),
        22: dict(status="uom_mismatch", price=268, uom="per pc", ccy="INR",
                 note="Quoted per patch cord. Fifty make the asked box."),
        23: dict(status="omitted"),
        24: dict(status="omitted"),
        25: dict(status="quoted", price=61800, uom="nos", ccy="INR"),
        26: dict(status="omitted"),
        27: dict(status="quoted", price=8400, uom="nos", ccy="INR"),
        28: dict(status="quoted", price=47500, uom="nos", ccy="INR"),
        29: dict(status="quoted", price=41900, uom="nos", ccy="INR"),
        30: dict(status="omitted"),
    },

    # ---------------- V5 Helios: five-line email --------------------------
    "V5": {
        1:  dict(status="quoted", price=61200, uom="nos", ccy="INR"),
        2:  dict(status="quoted", price=107500, uom="nos", ccy="INR"),
        5:  dict(status="relative", basis="prior_po", ref_sku="MON-24",
                 note="'monitors and docks same as our March PO rates'"),
        7:  dict(status="relative", basis="prior_po", ref_sku="DOCK-USBC",
                 note="'monitors and docks same as our March PO rates'"),
        18: dict(status="relative", basis="prior_po_uplift", ref_sku="SW-48P", uplift_pct=6.0,
                 note="'switches +6% over last year'"),
        # Everything else: "rest we'll match Zenith". Not a price.
        "_default": dict(status="match_rival", rival="V1",
                         note="'rest we'll match Zenith' - conditional on a competitor's "
                              "bid. Not an offer this system can score."),
    },
}

# ---------------------------------------------------------------------------
# Commercial terms and the vendor-level modifiers the extractor has to find
# ---------------------------------------------------------------------------

TERMS = {
    "V1": dict(
        gst="18% extra as applicable, HSN stated per line",
        freight="FOR destination, included",
        payment="Net 30",
        validity="60 days",
        delivery="4-6 weeks, ex-stock on lines 5 to 11",
        total_level_discount_pct=2.5,
        total_level_discount_note=(
            "A 2.5% 'order value discount' is applied only to the grand total and is "
            "not reflected in any line price. Sum of lines != stated total, on purpose."),
    ),
    "V2": dict(
        gst="18% extra. IGST plus basic customs duty on ex-works lines, to buyer's account.",
        freight="Ex-works Singapore on lines 12-20. FOR destination on INR lines.",
        payment="50% advance, 50% against delivery",
        validity="15 days",
        delivery="8-10 weeks on imported lines",
        fx_reference=88.40,
        fx_note="Converted at the reference rate on the date of invoicing, not the date of bid.",
        footnote_discount_pct=4.5,
        footnote_discount_scope="OEM-branded lines only, subject to deal registration approval",
        footnote_discount_note=(
            "Buried in footnote 3 on page 2. Not reflected in any unit price. "
            "Conditional on an approval the vendor does not yet hold."),
    ),
    "V3": dict(
        gst="'Taxes as applicable' - rate and inclusive/exclusive both unstated",
        freight="'Freight at actuals'",
        payment="Net 45",
        validity="30 days",
        delivery="6-8 weeks",
        note="Commercials written in prose. No line table for 19 of 27 quoted lines.",
    ),
    "V4": dict(
        gst="'+ GST' handwritten at the foot of the card. Rate not stated.",
        freight="Not stated anywhere",
        payment="Not stated anywhere",
        validity="Not stated anywhere",
        early_po_discount_pct=5.0,
        early_po_discount_note=(
            "Circled in pen: '5% if PO by 25 Sep'. Conditional on a date two days "
            "before the internal approval cycle can close."),
    ),
    "V5": dict(
        gst="Not stated",
        freight="'Freight extra'",
        payment="45 days",
        validity="Not stated",
        note="Five lines of email. No attachment, no questionnaire.",
    ),
}

# ---------------------------------------------------------------------------
# Questionnaire. M = mandatory (fail one, fail the bid). D = desirable (scored).
# ---------------------------------------------------------------------------

QUESTIONNAIRE = [
    dict(no="Q1", kind="M", doc_required=True,
         q="Do you hold current OEM authorisation for every brand you have quoted? Attach letters."),
    dict(no="Q2", kind="M", doc_required=True,
         q="Are you certified to ISO/IEC 27001:2022? Attach the certificate showing validity."),
    dict(no="Q3", kind="D", doc_required=True,
         q="Are you certified to ISO 9001:2015? Attach the certificate."),
    dict(no="Q4", kind="M", doc_required=True,
         q="Do you have a tie-up with a CPCB-authorised e-waste recycler under the E-Waste "
           "(Management) Rules 2022? Attach the authorisation."),
    dict(no="Q5", kind="M", doc_required=False,
         q="List your onsite support locations. Bengaluru, Pune and Gurugram are mandatory, "
           "plus a minimum of twelve tier-2 cities."),
    dict(no="Q6", kind="M", doc_required=False,
         q="Confirm next-business-day onsite response for enduser hardware and 4-hour "
           "response for datacentre hardware, at all locations listed in Q5."),
    dict(no="Q7", kind="M", doc_required=True,
         q="Was your audited annual turnover at least Rs 50 crore in each of the last two "
           "financial years? Attach audited statements."),
    dict(no="Q8", kind="D", doc_required=False,
         q="Provide three enterprise references of 500 seats or more, deployed in the last "
           "24 months, with contact details."),
    dict(no="Q9", kind="D", doc_required=False,
         q="Name your dedicated account manager and attach a three-level escalation matrix."),
    dict(no="Q10", kind="D", doc_required=False,
         q="Do you offer buyback and certified data destruction for the decommissioned fleet "
           "(approximately 300 laptops)?"),
]

# answer, plus what the ATTACHED DOCUMENT actually shows. Where the two
# disagree, that disagreement is the interesting part.
QUESTIONNAIRE_ANSWERS = {
    "V1": {
        "Q1": dict(answer="Yes", doc="OEM authorisation letters, Dell / HP / Lenovo, valid to 2027-03-31", ok=True),
        "Q2": dict(answer="Yes", doc="ISO/IEC 27001:2022, valid to 2028-01-14", ok=True),
        "Q3": dict(answer="Yes", doc="ISO 9001:2015, valid to 2027-06-30", ok=True),
        "Q4": dict(answer="Yes", doc="CPCB authorisation, E-Waste Rules 2022, valid to 2027-09-30", ok=True),
        "Q5": dict(answer="Bengaluru, Pune, Gurugram plus 19 tier-2 cities", doc=None, ok=True),
        "Q6": dict(answer="Confirmed, NBD enduser and 4-hour datacentre at all locations", doc=None, ok=True),
        "Q7": dict(answer="Rs 412 crore FY25, Rs 468 crore FY26", doc="Audited statements attached", ok=True),
        "Q8": dict(answer="Three references provided with contacts", doc=None, ok=True),
        "Q9": dict(answer="Prakash Iyer, 3-level matrix attached", doc=None, ok=True),
        "Q10": dict(answer="Yes, buyback at assessed value plus NIST 800-88 erasure certificates", doc=None, ok=True),
    },
    "V2": {
        "Q1": dict(answer="Yes", doc="OEM authorisation letters, Dell / HPE / Cisco, valid to 2027-03-31", ok=True),
        "Q2": dict(answer="Yes", doc="ISO/IEC 27001:2022, valid to 2027-11-08", ok=True),
        "Q3": dict(answer="Yes", doc="ISO 9001:2015, valid to 2028-02-28", ok=True),
        "Q4": dict(answer="Yes", doc="CPCB authorisation, valid to 2028-03-31", ok=True),
        "Q5": dict(answer="Bengaluru, Pune, Gurugram plus 14 tier-2 cities", doc=None, ok=True),
        "Q6": dict(answer="Confirmed", doc=None, ok=True),
        "Q7": dict(answer="Rs 288 crore FY25, Rs 341 crore FY26", doc="Audited statements attached", ok=True),
        "Q8": dict(answer="Two references provided", doc=None, ok=True,
                   note="Desirable, not mandatory. Two of three asked - scores below V1."),
        "Q9": dict(answer="Farida Merchant, matrix attached", doc=None, ok=True),
        "Q10": dict(answer="No", doc=None, ok=True, note="Desirable. Scores zero, does not disqualify."),
    },
    "V3": {
        "Q1": dict(answer="Yes", doc="OEM authorisation, Dell and Kyocera, valid to 2027-01-31", ok=True),
        "Q2": dict(answer="Yes", doc="ISO/IEC 27001:2022, valid to 2027-04-22", ok=True),
        "Q3": dict(answer="Yes", doc="ISO 9001:2015, valid to 2027-08-15", ok=True),
        "Q4": dict(answer="Yes", doc="CPCB authorisation, valid to 2027-12-31", ok=True),
        "Q5": dict(answer="Pune, Mumbai, Nashik, Nagpur, Bengaluru plus 6 others", doc=None, ok=False,
                   note="FAILS MANDATORY. Gurugram is absent, and 6 tier-2 cities against 12 asked."),
        "Q6": dict(answer="Next business day on best-effort basis. 4-hour datacentre response "
                          "available in Pune and Mumbai only.", doc=None, ok=False,
                   note="FAILS MANDATORY. Best-effort is not a commitment, and coverage is partial."),
        "Q7": dict(answer="Rs 31.4 crore FY25, Rs 36.2 crore FY26", doc="Audited statements attached", ok=False,
                   note="FAILS MANDATORY. Below the Rs 50 crore floor in both years. "
                        "The attached statements agree with the stated answer."),
        "Q8": dict(answer="One reference provided", doc=None, ok=True),
        "Q9": dict(answer="Sameer Deshpande, no matrix attached", doc=None, ok=True),
        "Q10": dict(answer="Yes, buyback only, no erasure certification", doc=None, ok=True),
    },
    "V4": {
        "Q1": dict(answer="Yes", doc=None, ok=False,
                   note="FAILS MANDATORY on evidence. Answered Yes, no letter attached."),
        "Q2": dict(answer="Yes", doc="ISO/IEC 27001:2013, EXPIRED 2025-11-30", ok=False,
                   note="FAILS MANDATORY. The answer says Yes; the attached certificate is "
                        "expired and is against the superseded 2013 standard. This is the "
                        "case the system must catch: the document contradicts the answer."),
        "Q3": dict(answer=None, doc=None, ok=False, note="Left blank."),
        "Q4": dict(answer=None, doc=None, ok=False, note="FAILS MANDATORY. Left blank."),
        "Q5": dict(answer="Chennai, Coimbatore, Madurai, Bengaluru, Hyderabad", doc=None, ok=False,
                   note="FAILS MANDATORY. Pune and Gurugram absent."),
        "Q6": dict(answer=None, doc=None, ok=False, note="FAILS MANDATORY. Left blank."),
        "Q7": dict(answer="Rs 19 crore approx", doc=None, ok=False,
                   note="FAILS MANDATORY. Below floor, and 'approx' with no statements."),
        "Q8": dict(answer=None, doc=None, ok=False, note="Left blank."),
        "Q9": dict(answer="R. Karthikeyan", doc=None, ok=True),
        "Q10": dict(answer="Yes", doc=None, ok=True),
    },
    "V5": {
        # No questionnaire at all.
        q["no"]: dict(answer=None, doc=None, ok=False,
                      note="No questionnaire returned. Non-response on every question.")
        for q in QUESTIONNAIRE
    },
}


def qualification(vendor_code):
    """Mandatory-question verdict for one vendor."""
    answers = QUESTIONNAIRE_ANSWERS[vendor_code]
    mandatory = [q["no"] for q in QUESTIONNAIRE if q["kind"] == "M"]
    failed = [n for n in mandatory if not answers[n]["ok"]]
    return dict(qualified=not failed, failed_mandatory=failed)


def baseline_total_inr():
    return sum(l["qty"] * l["baseline_inr"] for l in LINES)


if __name__ == "__main__":
    print(f"RFx {RFX['id']}: {len(LINES)} lines, {len(VENDORS)} vendors")
    t = baseline_total_inr()
    print(f"Internal baseline total: Rs {t:,} ex-GST  (Rs {t/1e7:.2f} crore)")
    print()
    for v in VENDORS:
        q = qualification(v["code"])
        n_priced = sum(
            1 for k, d in QUOTES[v["code"]].items()
            if isinstance(k, int) and d["status"] in
            ("quoted", "substituted", "downgraded", "uom_mismatch", "bundled", "moq_adjusted")
        )
        verdict = "QUALIFIED" if q["qualified"] else f"DISQUALIFIED {q['failed_mandatory']}"
        print(f"  {v['code']} {v['name'][:38]:38} {v['reply_format']:6} "
              f"{n_priced:2}/30 priced   {verdict}")
