#!/usr/bin/env bash
# Build the two shareable documents from the markdown, and verify the result.
#
# The markdown is the source of truth. Never edit the .docx by hand: it gets
# overwritten. Run from the repo root or from docs/.
set -euo pipefail
cd "$(dirname "$0")"

USABLE_PRODUCT=17.2   # A4 minus 1.9cm margins each side
USABLE_NOTE=17.8      # A4 minus 1.6cm margins each side, so the note fits one page

build () {
  local src="$1" out="$2" ref="$3" usable="$4"
  pandoc "../$src" --from=gfm --reference-doc="$ref" -o "$out.docx"
  python3 fix-tables.py "$out.docx" "$usable"
  rm -f "$out.pdf"
  soffice --headless --convert-to pdf "$out.docx" >/dev/null 2>&1
  echo "  built $out.docx and $out.pdf"
}

build WHAT-I-BUILT.md WHAT-I-BUILT reference-product.docx "$USABLE_PRODUCT"
build DECISIONS.md    DECISIONS    reference-note.docx    "$USABLE_NOTE"

python3 verify.py
