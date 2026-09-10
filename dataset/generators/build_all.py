"""
Rebuild the entire dataset from scratch, deterministically.

    python3 build_all.py

Everything derives from catalog.py, so the RFx pack, the five vendor replies,
the attachments and the ground-truth answer key cannot drift apart. Re-running
this after editing catalog.py regenerates all 32 files consistently.
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
STEPS = [
    ("catalog.py",             "sanity check: lines, vendors, qualification"),
    ("build_rfx_pack.py",      "RFx pack: scope, line items, questionnaire, terms"),
    ("build_docs.py",          "vendor replies V1/V2/V3/V5 + all attachments"),
    ("build_photo.py",         "vendor reply V4: the photographed rate card"),
    ("build_photo_variants.py", "photo stress set: easy to very hard"),
    # Was missing, and the omission was invisible: the stress corpus reads the
    # buyer and the line catalog from catalog.py, so a change there left 27
    # awkward-format files quietly describing the previous dataset. Renaming
    # the buyer is exactly how that surfaced, with the buyer's own emails still
    # on the old company's domain.
    ("build_stress_corpus.py", "27 awkward-format files carrying identical facts"),
    ("normalise.py",           "normalisation, award scenarios, ground-truth oracle"),
    ("export_json.py",         "catalog + raw-quote fixtures for the TypeScript app"),
]


def main():
    for script, what in STEPS:
        print(f"\n{'=' * 74}\n{script}  {what}\n{'=' * 74}")
        r = subprocess.run([sys.executable, script], cwd=HERE)
        if r.returncode != 0:
            print(f"\nFAILED at {script}")
            return r.returncode
    out = HERE.parent / "out"
    n = sum(1 for _ in out.rglob("*") if _.is_file())
    print(f"\n{'=' * 74}\nDataset rebuilt: {n} files under dataset/out/\n{'=' * 74}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
