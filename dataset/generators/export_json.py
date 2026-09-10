"""
Export the catalog to JSON so the TypeScript app and the Python generators read
the same source of truth.

Two files, and the split matters:

  web/lib/data/catalog.json    The RFx. Lines, units, quantities, questionnaire,
                               prior-PO table, assumptions, conversion rules.
                               The app NEEDS this at runtime: it is the buyer's
                               own enquiry, not an answer.

  web/lib/data/raw-quotes.json The values an extractor SHOULD find in the five
                               vendor documents, in the vendor's own units and
                               currency, with no normalisation applied.
                               The app must NEVER read this at runtime. It exists
                               so the TypeScript calculator can be tested against
                               the Python one on identical input, which separates
                               "the calculator is wrong" from "the extractor
                               misread the document".
"""

import json
from pathlib import Path

from catalog import (BUYER, RFX, LINES, VENDORS, QUOTES, TERMS, PRIOR_PO,
                     QUESTIONNAIRE, QUESTIONNAIRE_ANSWERS, qualification,
                     baseline_total_inr)
from normalise import ASSUMPTIONS, UOM_ALIASES, UOM_CONVERSIONS

WEB = Path(__file__).resolve().parents[2] / "web" / "lib" / "data"


def main():
    WEB.mkdir(parents=True, exist_ok=True)

    catalog = dict(
        buyer=BUYER,
        rfx=RFX,
        lines=LINES,
        vendors=VENDORS,
        terms=TERMS,
        questionnaire=QUESTIONNAIRE,
        questionnaire_answers=QUESTIONNAIRE_ANSWERS,
        qualification={v["code"]: qualification(v["code"]) for v in VENDORS},
        prior_po=PRIOR_PO,
        baseline_total_inr=baseline_total_inr(),
        assumptions=ASSUMPTIONS,
        uom_aliases={k: sorted(v) for k, v in UOM_ALIASES.items()},
        uom_conversions=[dict(from_uom=k[0], to_uom=k[1], factor=v[0], basis=v[1])
                         for k, v in UOM_CONVERSIONS.items()],
    )
    p = WEB / "catalog.json"
    p.write_text(json.dumps(catalog, indent=2, default=str))
    print(f"  {p.relative_to(WEB.parents[2])}  "
          f"{p.stat().st_size / 1024:.1f} KB  "
          f"({len(LINES)} lines, {len(VENDORS)} vendors, "
          f"{len(QUESTIONNAIRE)} questions, {len(ASSUMPTIONS)} assumptions)")

    # Raw quotes, keyed vendor -> line -> the vendor's own numbers.
    raw = {}
    for v in VENDORS:
        code = v["code"]
        rows = {}
        for key, q in QUOTES[code].items():
            rows[str(key)] = q
        raw[code] = rows
    p = WEB / "raw-quotes.json"
    p.write_text(json.dumps(dict(
        warning="TEST FIXTURE. The running app must never read this. It is the "
                "input the extractor is expected to produce, used to test the "
                "calculator in isolation from the extractor.",
        quotes=raw,
    ), indent=2, default=str))
    n = sum(len(r) for r in raw.values())
    print(f"  {p.relative_to(WEB.parents[2])}  "
          f"{p.stat().st_size / 1024:.1f} KB  ({n} raw quote entries)")


if __name__ == "__main__":
    main()
