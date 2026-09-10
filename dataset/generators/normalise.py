"""
Reference implementation of the normalisation and award engine, plus the
ground-truth answer key for the dataset.

Two jobs:

1. It is the ORACLE. The prototype's extraction accuracy is measured against
   the JSON this writes. The running demo never reads it.

2. It is the SPEC. Every rule below has to exist in the TypeScript engine, and
   the arithmetic here is the arithmetic the model must never be asked to do.

Normalisation order matters and is fixed:
    raw price
      -> per-UoM alignment  (kit / box / pack -> the unit the RFx asked for)
      -> currency           (USD -> INR at a dated, named rate)
      -> scope adjustment   (bring warranty scope onto a common basis)
      -> line extension     (x asked qty, never the vendor's own qty)
      -> discount           (line-level, then conditional, then total-level)
"""

import json
from datetime import date
from pathlib import Path

from catalog import (LINES, VENDORS, QUOTES, TERMS, PRIOR_PO, RFX,
                     QUESTIONNAIRE, QUESTIONNAIRE_ANSWERS, qualification,
                     baseline_total_inr)

# ---------------------------------------------------------------------------
# Assumptions. Every one of these is a row the buyer can see and change in the
# UI, and changing one recomputes everything downstream. Nothing here is
# hardcoded into a prompt.
# ---------------------------------------------------------------------------

ASSUMPTIONS = {
    "fx_usd_inr": dict(
        value=88.40,
        source="Vendor V2's own stated reference rate, quote page 1",
        alternative="RBI reference rate on bid-due date",
        note="V2's terms say conversion happens at the rate on the INVOICE date, not the "
             "bid date. Any INR total for V2 is therefore an estimate, not an offer. "
             "The buyer sees this wherever a V2 total is shown.",
        confidence="stated by vendor, not independently verified",
    ),
    "compare_qty": dict(
        value="RFx asked quantity",
        source="RFx line table",
        note="Where a vendor quoted a different quantity (V1 MOQ 20 boxes, V3 128 docks), "
             "the unit rate is applied to the ASKED quantity so lines stay comparable. "
             "The quantity difference is carried as a separate flag, not silently absorbed.",
    ),
    "v2_warranty_basis": dict(
        value="include line 30A uplift in lines 1-3",
        source="V2 quote note on lines 1-3 plus vendor-created line 30A",
        alternative="exclude 30A and compare 1-year cover against 3-year cover",
        note="V2's laptops carry 1-year cover. Every other bid carries 3-year. Comparing "
             "them without the uplift understates V2 by Rs 7,900 per laptop.",
    ),
    "v2_footnote_discount": dict(
        value="EXCLUDED from the ranked comparison",
        source="V2 quote, footnote 3, page 2",
        alternative="include 4.5% on OEM-branded lines",
        note="Conditional on a deal-registration approval V2 does not hold yet. Shown to "
             "the buyer as a named upside scenario, never folded into the headline number.",
    ),
    "v4_early_po_discount": dict(
        value="EXCLUDED from the ranked comparison",
        source="V4 rate card, handwritten and circled",
        note="Conditional on a PO by 25 Sep, which is before the internal approval cycle "
             "can close. Treated as unavailable rather than as a price.",
    ),
    "v1_total_discount": dict(
        value="APPLIED at total level only",
        source="V1 quote, grand total block",
        note="2.5% on order value, not attributable to any line. It cannot be used in "
             "per-line ranking. It is applied only to a whole-of-V1 award total, and the "
             "system says so wherever the two disagree.",
    ),
    "tax_basis": dict(
        value="ex-GST throughout",
        source="RFx tax instruction",
        note="V3 said 'taxes as applicable' and V4 wrote '+ GST' with no rate. Both are "
             "READ AS ex-GST. That is an assumption, not a finding, and it is flagged on "
             "both vendors.",
        confidence="assumed - vendor did not state a rate",
    ),
    "freight_duty": dict(
        value="EXCLUDED from all totals",
        source="RFx asked FOR destination; V2 quoted ex-works Singapore",
        note="V2's imported lines exclude customs duty and freight, which the buyer bears. "
             "No duty rate is assumed. V2's datacentre lines are therefore NOT directly "
             "comparable and are marked as such rather than silently ranked.",
        confidence="known gap - deliberately not estimated",
    ),
}

# Synonyms for the SAME unit. An alias never changes the number. Kept strictly
# apart from UOM_CONVERSIONS below, which always changes the number - conflating
# the two tables is exactly how a system silently multiplies a price by 5.
UOM_ALIASES = {
    "pack of 5": {"pack", "pkt of 5", "5-pack", "pack (5 nos)", "box of 5"},
    "box of 10": {"box (10 nos)", "10-pack", "pkt of 10"},
    "box of 50": {"box (50 nos)", "50-pack", "bundle of 50"},
    "nos": {"no", "unit", "units", "ea", "each", "pc", "pcs", "piece"},
    "kit": {"kit of 2", "set", "matched kit"},
}


def canonical_uom(quoted, asked):
    """Return the asked unit if `quoted` is merely a different word for it."""
    if quoted == asked:
        return asked
    if quoted in UOM_ALIASES.get(asked, ()):
        return asked
    return quoted


UOM_CONVERSIONS = {
    ("per DIMM", "kit"): (2, "One asked kit = 2x 16GB DIMMs, from the RFx line spec"),
    ("per pc", "box of 10"): (10, "One asked box = 10 transceivers, from the RFx line spec"),
    ("per pc", "box of 50"): (50, "One asked box = 50 patch cords, from the RFx line spec"),
}

# Statuses that carry a usable absolute number once normalised.
PRICED = ("quoted", "substituted", "downgraded", "uom_mismatch", "bundled", "moq_adjusted")

# Statuses that must NEVER enter award arithmetic.
NON_COMPARABLE = ("illegible", "not_quoted", "omitted", "relative", "match_rival", "unmapped")


def line_by_no(no):
    return next(l for l in LINES if l["no"] == no)


def normalise_cell(vendor_code, line_no):
    """
    Normalise one vendor-line cell. Returns a dict that always carries a
    status, and carries a unit_inr only when the value is genuinely comparable.
    """
    line = line_by_no(line_no)
    vq = QUOTES[vendor_code]
    raw = vq.get(line_no)

    if raw is None:
        raw = vq.get("_default")
        if raw is None:
            return dict(status="omitted", unit_inr=None, flags=["silently missing"],
                        trace=["no entry for this line anywhere in the response"])
        raw = dict(raw)

    status = raw["status"]
    trace = []
    flags = []

    # --- non-comparable paths, resolved first -----------------------------
    if status == "relative":
        basis = raw["basis"]
        ref = PRIOR_PO["rates"].get(raw["ref_sku"])
        if ref is None:
            return dict(status="unresolvable", unit_inr=None,
                        flags=["priced by reference to data we do not hold"],
                        trace=[f"vendor said: {raw['note']}",
                               f"no prior-PO rate on file for {raw['ref_sku']}"])
        if basis == "prior_po":
            val = ref
            trace = [f"vendor said: {raw['note']}",
                     f"prior PO {PRIOR_PO['po_number']} dated {PRIOR_PO['po_date']}: "
                     f"Rs {ref:,} per {line['uom']}",
                     f"resolved to Rs {val:,}"]
        else:
            val = round(ref * (1 + raw["uplift_pct"] / 100))
            trace = [f"vendor said: {raw['note']}",
                     f"prior PO {PRIOR_PO['po_number']}: Rs {ref:,}",
                     f"+{raw['uplift_pct']}% uplift -> Rs {val:,}"]
        return dict(status="resolved_from_reference", unit_inr=val,
                    flags=["price derived from a prior PO, not quoted directly",
                           "vendor must confirm before award"],
                    trace=trace, needs_confirmation=True)

    if status == "match_rival":
        return dict(status="non_comparable", unit_inr=None,
                    flags=["offer is conditional on another bidder's price",
                           "cannot be ranked, cannot be awarded"],
                    trace=[f"vendor said: {raw['note']}"])

    if status == "illegible":
        return dict(status="unreadable", unit_inr=None,
                    flags=["a price is present on the source and cannot be read",
                           "buyer action required"],
                    trace=[raw.get("note", ""), "not guessed, not interpolated"])

    if status == "not_quoted":
        return dict(status="declined", unit_inr=None,
                    flags=["vendor explicitly declined this line"],
                    trace=[raw.get("note", "")])

    if status == "omitted":
        return dict(status="omitted", unit_inr=None,
                    flags=["silently missing: no price, no decline, no mention"],
                    trace=["the line simply is not in the response",
                           "absence is reported as absence, never as zero"])

    if status == "unmapped":
        return dict(status="unmapped", unit_inr=None,
                    flags=["vendor-created line with no RFx equivalent"],
                    trace=[raw.get("note", "")])

    # --- priced paths ------------------------------------------------------
    #
    # A zero is not a rate. V3 wrote "extended cover to five years is included
    # in our laptop prices at no additional charge" against line 30, which is a
    # scope statement. Treating it as Rs 0 makes it the cheapest bid on that
    # line every time and hands V3 a line they never priced.
    if raw.get("price") in (None, 0):
        return dict(status="needs_review", unit_inr=None,
                    flags=["the supplier addressed this line but gave no usable rate; "
                           "a zero would otherwise win it automatically"],
                    trace=[dict(rule="no usable rate",
                                basis=f"reported as '{status}' with no comparable number",
                                result="excluded from every total pending a decision")])

    price = raw["price"]
    unit = raw.get("uom", line["uom"])
    trace.append(f"raw: {raw['ccy']} {price:,} per {unit}")

    if raw.get("handwritten"):
        flags.append("handwritten override beats the printed price")
        trace.append(f"printed Rs {raw['printed_price']:,} struck through, "
                     f"Rs {price:,} written in pen")

    # 1. UoM alignment. Aliases first (free), then real conversions (factor).
    resolved = canonical_uom(unit, line["uom"])
    if resolved != unit:
        trace.append(f"UoM: '{unit}' is a synonym for '{line['uom']}', no factor applied")
        unit = resolved
    if unit != line["uom"]:
        key = (unit, line["uom"])
        if key not in UOM_CONVERSIONS:
            return dict(status="needs_review", unit_inr=None,
                        flags=[f"quoted per '{unit}', RFx asked per '{line['uom']}', "
                               f"no conversion rule"],
                        trace=trace)
        factor, why = UOM_CONVERSIONS[key]
        price = price * factor
        flags.append(f"unit mismatch: quoted per '{unit}', normalised to '{line['uom']}' (x{factor})")
        trace.append(f"UoM: x{factor} -> {raw['ccy']} {price:,} per {line['uom']}  [{why}]")

    # An ex-works price is a real number and NOT a landed cost. Customs duty
    # and inbound freight fall on the buyer and are not estimated here, so
    # ranking this against a delivered price understates it by an amount nobody
    # has quantified. It stays awardable, because it is a genuine offer, but it
    # carries the caveat visibly rather than sitting in the grid looking like a
    # like-for-like number.
    #
    # Checked BEFORE and INDEPENDENTLY of currency. This used to sit inside the
    # USD branch, which worked for the one supplier here who quotes ex-works in
    # dollars and silently let an ex-works price quoted in RUPEES through as a
    # delivered cost. A domestic ex-works quote is ordinary in Indian
    # procurement, so that is not a corner case.
    ex_works = False
    if "ex-works" in (raw.get("note") or "").lower():
        ex_works = True
        flags.append(
            "ex-works: customs duty and inbound freight are excluded and fall on you, "
            "so this is NOT a delivered cost and is not directly comparable with a "
            "FOR-destination price")

    # 2. Currency
    if raw["ccy"] == "USD":
        fx = ASSUMPTIONS["fx_usd_inr"]["value"]
        price = round(price * fx)
        flags.append(f"converted from USD at {fx} (vendor's own stated reference rate)")
        trace.append(f"FX: x{fx} -> INR {price:,}  [{ASSUMPTIONS['fx_usd_inr']['source']}]")

    # 3. Scope adjustment: put a partial offer onto the same footing as a
    #    complete one. Driven by the response itself, which names the label the
    #    supplier quoted the missing scope under. No vendor code and no line
    #    numbers: pricing one year of cover and quoting the other two separately
    #    is an ordinary thing to do, and a rule that only fires for one supplier
    #    fires for nobody.
    ref = raw.get("scope_uplift_ref")
    if ref:
        uplift_row = QUOTES[vendor_code].get(ref) or {}
        what = raw.get("scope_uplift_note") or "scope the enquiry asked for"
        if uplift_row.get("price") is None:
            flags.append(
                f"this price excludes {what}, which the supplier quoted separately at "
                f"their line {ref}. That line was not found in the response, so this "
                f"cannot be compared with bids that include it.")
            trace.append(f"scope adjustment unavailable (line {ref} not extracted)")
            return dict(status="needs_review", unit_inr=None, flags=flags, trace=trace,
                        extended_inr=None)
        uplift = uplift_row["price"]
        # The uplift is a price the supplier quoted, so it carries its own
        # currency. Adding a USD figure to an INR one without converting would
        # understate the adjustment by a factor of about eighty-eight.
        if uplift_row.get("ccy") == "USD":
            fx = ASSUMPTIONS["fx_usd_inr"]["value"]
            uplift = round(uplift * fx)
            flags.append(f"the uplift at line {ref} was quoted in USD, converted at {fx}")
        price += uplift
        flags.append(f"scope: +Rs {uplift:,} for {what} (supplier's own line {ref}), "
                     f"added so this is comparable with bids that include it")
        trace.append(f"scope: +Rs {uplift:,} (line {ref}) -> Rs {price:,}")

    # 4. Quantity flags. The rate is always applied to the ASKED quantity.
    if raw.get("qty_override"):
        flags.append(f"vendor quoted {raw['qty_override']} {line['uom']} against "
                     f"{line['qty']} asked; rate applied to asked quantity")

    if status == "substituted":
        flags.append(f"substitution: {raw.get('offered')}")
    if status == "downgraded" and raw.get("offered"):
        flags.append(f"below spec: {raw.get('offered')}")

    if raw.get("note") and status in ("downgraded", "bundled", "moq_adjusted", "quoted"):
        flags.append(raw["note"])

    trace.append(f"landed: Rs {price:,} per {line['uom']}, ex-GST")

    # A number we had to ADJUST is not a like-for-like number, whatever the
    # supplier's own status said. The caveat used to ride on the raw status,
    # which meant a supplier who wrote "quoted" and pointed at a separate uplift
    # line got a clean tick on an adjusted figure.
    out_status = "comparable"
    if status in ("substituted", "downgraded") or ex_works or raw.get("scope_uplift_ref"):
        out_status = "comparable_with_caveat"

    return dict(status=out_status, unit_inr=price, flags=flags, trace=trace,
                extended_inr=price * line["qty"])


def build_matrix():
    """Normalise every vendor x line cell, and extend any cell that landed a
    comparable unit rate. Extension always uses the ASKED quantity."""
    m = {}
    for v in VENDORS:
        row = {}
        for ln in LINES:
            cell = normalise_cell(v["code"], ln["no"])
            if cell["unit_inr"] is not None and "extended_inr" not in cell:
                cell["extended_inr"] = cell["unit_inr"] * ln["qty"]
            row[ln["no"]] = cell
        m[v["code"]] = row
    return m


# ---------------------------------------------------------------------------
# Award scenarios
# ---------------------------------------------------------------------------

# Statuses that may enter award arithmetic.
#
# `resolved_from_reference` is deliberately EXCLUDED. Those cells carry a real,
# citable number derived from a prior PO ("same as our March rates"), but the
# vendor never actually quoted it. Letting a derived price win a line would mean
# awarding against an offer nobody made. The buyer can opt in once the vendor
# confirms; until then it is shown, flagged, and left out of the maths.
AWARDABLE = ("comparable", "comparable_with_caveat")


def _awardable(cell, include_unconfirmed):
    if cell["unit_inr"] is None:
        return False
    if cell["status"] in AWARDABLE:
        return True
    return include_unconfirmed and cell["status"] == "resolved_from_reference"


def cheapest_per_line(matrix, vendor_codes, exclude_caveats=False,
                      include_unconfirmed=False):
    picks, unfilled = {}, []
    for ln in LINES:
        best, best_v = None, None
        for vc in vendor_codes:
            cell = matrix[vc][ln["no"]]
            if not _awardable(cell, include_unconfirmed):
                continue
            if exclude_caveats and cell["status"] == "comparable_with_caveat":
                continue
            if best is None or cell["unit_inr"] < best:
                best, best_v = cell["unit_inr"], vc
        if best is None:
            unfilled.append(ln["no"])
        else:
            picks[ln["no"]] = dict(vendor=best_v, unit_inr=best,
                                   extended_inr=best * ln["qty"])
    total = sum(p["extended_inr"] for p in picks.values())
    return dict(picks=picks, total_inr=total, unfilled_lines=unfilled,
                lines_awarded=len(picks))


def like_for_like(scenarios):
    """
    Totals from two scenarios are only comparable over the lines BOTH of them
    could fill. Scenario (c) below is nominally cheaper than (b) purely because
    it awards one fewer line - a comparison that looks like a Rs 30 lakh saving
    and is actually a hole in the award.

    The engine therefore refuses to rank two scenarios without restating them
    on their common line set, and the analyst is required to surface the
    coverage difference before the money difference.
    """
    sets = [set(s["picks"]) for s in scenarios.values()]
    common = set.intersection(*sets) if sets else set()

    # Coverage differs if the line SETS differ, not if the counts differ.
    #
    # Counting was the original test and it was wrong in a way that defeats the
    # entire guard: two scenarios that each award 25 lines, but 25 DIFFERENT
    # lines, have identical counts and nothing in common. Comparing their
    # totals is meaningless, and a count-based check would have declared them
    # directly comparable. The whole point of this function is to refuse
    # exactly that comparison.
    union = set().union(*sets) if sets else set()
    coverage_differs = any(s != sets[0] for s in sets) if sets else False
    out = {}
    for name, sc in scenarios.items():
        out[name] = dict(
            headline_total_inr=sc["total_inr"],
            lines_awarded=sc["lines_awarded"],
            like_for_like_total_inr=sum(sc["picks"][n]["extended_inr"] for n in common),
            lines_in_common_basis=len(common),
            lines_this_scenario_could_not_fill=sorted(set(sc["unfilled_lines"])),
        )
    return dict(
        common_lines=sorted(common),
        coverage_differs=coverage_differs,
        lines_in_any_scenario=len(union),
        lines_in_every_scenario=len(common),
        # How much of the enquiry the common basis actually represents. A
        # like-for-like total over 3 of 30 lines is arithmetically valid and
        # practically useless, and the caller has to be able to tell.
        common_basis_share=(len(common) / len(union)) if union else 0.0,
        scenarios=out,
    )


def single_vendor(matrix, vc, include_unconfirmed=False):
    filled, missing = {}, []
    for ln in LINES:
        cell = matrix[vc][ln["no"]]
        if not _awardable(cell, include_unconfirmed):
            missing.append(ln["no"])
        else:
            filled[ln["no"]] = cell["extended_inr"]
    total = sum(filled.values())
    disc = TERMS[vc].get("total_level_discount_pct")
    after = round(total * (1 - disc / 100)) if disc else total
    # A total-level discount conditional on the COMPLETE scope must not be
    # applied to a partial award. V1 states its 2.5% is "available only if the
    # complete scope is awarded to us"; applying it to a 27-line award would
    # quote a discount the vendor has not offered.
    discount_applies = bool(disc) and not missing
    after = round(total * (1 - disc / 100)) if discount_applies else total

    return dict(vendor=vc, total_inr=total, total_after_stated_discount_inr=after,
                total_level_discount_pct=disc,
                total_level_discount_applied=discount_applies,
                total_level_discount_withheld_reason=(
                    f"stated discount of {disc}% requires the complete scope; "
                    f"{len(missing)} line(s) are unpriced, so it is not applied"
                    if disc and missing else None),
                lines_priced=len(filled), missing_lines=missing,
                complete=not missing,
                comparable_to_other_vendors=not missing)


def main():
    matrix = build_matrix()
    qualified = [v["code"] for v in VENDORS if qualification(v["code"])["qualified"]]
    everyone = [v["code"] for v in VENDORS]
    baseline = baseline_total_inr()

    naive = cheapest_per_line(matrix, everyone)
    compliant = cheapest_per_line(matrix, qualified)
    strict = cheapest_per_line(matrix, qualified, exclude_caveats=True)

    print("=" * 78)
    print(f"{RFX['id']}  {len(LINES)} lines  {len(VENDORS)} vendors")
    print(f"Internal baseline                    Rs {baseline:>13,}   ({baseline/1e7:.2f} cr)")
    print("=" * 78)

    print("\nCELL STATUS COUNTS  (5 vendors x 30 lines = 150 cells)")
    counts = {}
    for vc in everyone:
        for ln in LINES:
            s = matrix[vc][ln["no"]]["status"]
            counts[s] = counts.get(s, 0) + 1
    for s, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {s:28} {n:3}")
    usable = counts.get("comparable", 0) + counts.get("comparable_with_caveat", 0)
    derived = counts.get("resolved_from_reference", 0)
    print(f"  {'-> awardable':28} {usable:3}  of 150")
    print(f"  {'-> derived, awaiting vendor':28} {derived:3}  (shown, not awardable)")

    print("\nSINGLE-VENDOR AWARD")
    for vc in everyone:
        r = single_vendor(matrix, vc)
        tag = "QUALIFIED " if vc in qualified else "DISQUALIFIED"
        note = "" if r["complete"] else f"  incomplete, {len(r['missing_lines'])} lines unpriced"
        d = f"  after {r['total_level_discount_pct']}% total discount: Rs {r['total_after_stated_discount_inr']:,}" \
            if r["total_level_discount_pct"] else ""
        print(f"  {vc} {tag}  Rs {r['total_inr']:>13,}  ({r['lines_priced']:2}/30 priced){note}{d}")

    print("\nSPLIT AWARD, CHEAPEST PER LINE")
    print(f"  a) all five vendors, ignoring the questionnaire")
    print(f"       Rs {naive['total_inr']:,}   ({naive['lines_awarded']}/30 lines fillable)")
    print(f"  b) only vendors that cleared every mandatory question ({', '.join(qualified)})")
    print(f"       Rs {compliant['total_inr']:,}   ({compliant['lines_awarded']}/30 lines fillable)")
    print(f"  c) as (b), also excluding substitutions and below-spec offers")
    print(f"       Rs {strict['total_inr']:,}   ({strict['lines_awarded']}/30 lines fillable)")

    lfl = like_for_like(
        {"a_all_vendors": naive, "b_qualified": compliant, "c_qualified_no_caveats": strict})
    print(f"\n  LIKE-FOR-LIKE, restated on the {lfl['scenarios']['a_all_vendors']['lines_in_common_basis']} "
          f"lines all three scenarios can fill")
    for name, r in lfl["scenarios"].items():
        print(f"    {name:24} headline Rs {r['headline_total_inr']:>12,} over {r['lines_awarded']:2} lines"
              f"   |  like-for-like Rs {r['like_for_like_total_inr']:>12,}")
    a_lines = lfl["scenarios"]["b_qualified"]["lines_awarded"]
    c_lines = lfl["scenarios"]["c_qualified_no_caveats"]["lines_awarded"]
    print(f"  Scenario (c)'s headline is LOWER than (b)'s only because it awards")
    print(f"  {a_lines - c_lines} fewer line(s). On a common basis it is higher, which is the")
    print(f"  true direction.")

    delta = compliant["total_inr"] - naive["total_inr"]
    print(f"\n  COST OF COMPLIANCE  (b) - (a) = Rs {delta:,}  "
          f"({delta / naive['total_inr'] * 100:.1f}% more)")
    print(f"  This is the demo's money moment. The apparent saving in (a) is not")
    print(f"  available: it is concentrated in V4, which failed six mandatory questions,")
    print(f"  and V4's cheapest-looking lines are the two UoM traps.")

    if compliant["unfilled_lines"]:
        print(f"\n  Lines no qualified vendor can fill: {compliant['unfilled_lines']}")
        for n in compliant["unfilled_lines"]:
            ln = line_by_no(n)
            print(f"    L{n:2} {ln['sku']:11} {ln['desc'][:52]}")
            for vc in everyone:
                c = matrix[vc][n]
                print(f"         {vc}: {c['status']}")

    print("\nUOM TRAPS: what V4 looks like before and after normalisation")
    for n in (13, 20, 22):
        ln, cell = line_by_no(n), matrix["V4"][n]
        raw = QUOTES["V4"][n]
        v1 = matrix["V1"][n]["unit_inr"]
        print(f"  L{n:2} {ln['sku']:10} asked per '{ln['uom']}'")
        print(f"       V4 raw    Rs {raw['price']:>9,} per {raw['uom']:<12} "
              f"looks {(1 - raw['price']/v1)*100:5.1f}% under V1")
        print(f"       V4 landed Rs {cell['unit_inr']:>9,} per {ln['uom']:<12} "
              f"actually {(cell['unit_inr']/v1 - 1)*100:+5.1f}% vs V1 (Rs {v1:,})")

    print("\nCONDITIONAL MONEY LEFT ON THE TABLE (shown, never scored)")
    v2 = single_vendor(matrix, "V2")
    fn = TERMS["V2"]["footnote_discount_pct"]
    print(f"  V2 footnote-3 discount {fn}% on OEM-branded lines, subject to deal registration")
    print(f"     up to Rs {round(v2['total_inr'] * fn / 100):,} off a whole-of-V2 award")
    v4 = single_vendor(matrix, "V4")
    ep = TERMS["V4"]["early_po_discount_pct"]
    print(f"  V4 handwritten {ep}% if PO by 25 Sep (before approval can close)")
    print(f"     up to Rs {round(v4['total_inr'] * ep / 100):,}, and V4 is disqualified anyway")

    # ---------------- ground truth ----------------
    out = dict(
        generated=str(date.today()),
        warning="ORACLE FILE. The prototype must never read this at runtime. "
                "It exists to score extraction accuracy and to prove the demo is not scripted.",
        basis="Computed over the FIRST quotation on file from each supplier. Zenith "
              "later sent a revised quotation (ZIS/NBR/2026/1184-R2) which is also in "
              "the corpus and which sharpens lines 1, 5 and 7. Loading it is a "
              "deliberate demo step, and the app is expected to move the headline when "
              "it lands: qualified-only Rs 4.07 cr -> Rs 4.04 cr, cost of compliance "
              "Rs 18.6 L (4.8%) -> Rs 15.7 L (4.0%). Deciding which quotation counts is "
              "the system's problem, so the answer key is deliberately pinned to Rev 1 "
              "and the movement is the thing being demonstrated.",
        rfx=RFX["id"],
        baseline_total_inr=baseline,
        assumptions=ASSUMPTIONS,
        uom_conversions={f"{k[0]} -> {k[1]}": dict(factor=v[0], basis=v[1])
                         for k, v in UOM_CONVERSIONS.items()},
        qualification={vc: qualification(vc) for vc in everyone},
        cells={vc: {str(n): matrix[vc][n] for n in (l["no"] for l in LINES)}
               for vc in everyone},
        scenarios=dict(
            single_vendor={vc: single_vendor(matrix, vc) for vc in everyone},
            split_all_vendors=naive,
            split_qualified_only=compliant,
            split_qualified_no_caveats=strict,
            cost_of_compliance_inr=delta,
            like_for_like=lfl,
        ),
        cell_status_counts=counts,
    )
    p = Path(__file__).resolve().parents[1] / "out" / "99-internal" / "ground-truth.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nOracle written: {p}")


if __name__ == "__main__":
    main()
