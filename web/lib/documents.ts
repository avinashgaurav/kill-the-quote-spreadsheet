/**
 * The files that leave the system.
 *
 * Two directions, and they matter for different reasons.
 *
 * OUTBOUND: the four documents that make up an enquiry. Four files rather than
 * one because a real pack is answered by four different people inside the
 * supplier, and because splitting it is what creates the honest difficulty the
 * reader has to survive later: the questionnaire comes back on a different day,
 * in a different format, from a different person than the prices, and nothing
 * forces the two to agree.
 *
 * INBOUND: the comparison, an audit bundle, and an award note.
 *
 * The award note is the real deliverable of the whole product, and the one most
 * likely to be treated as an afterthought. Its reader is internal audit, eight
 * months later, who never touches the tool and has to reconstruct why a
 * supplier won a line at four per cent above the lowest bid, from a document
 * that stands alone. So it carries the assumptions in force, the cells that
 * were excluded and why, and the conditional money that was deliberately not
 * counted. A recommendation without those is an opinion.
 *
 * Spreadsheets are written with SheetJS. Documents are printable HTML rather
 * than generated PDFs: the browser's own print-to-PDF is better than anything a
 * PDF library would produce in an afternoon, and one fewer dependency on the
 * path that handles untrusted vendor files is worth having.
 */

import * as XLSX from "xlsx";

import type { DraftedRfx } from "./copilot";
import { LINES, VENDORS, QUALIFICATION, ASSUMPTIONS, inr, inrShort, isAwardable } from "./normalise";
import type { ComparisonPayload } from "./store";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * A printable document shell.
 *
 * Deliberately plain and self-contained: an award note that arrives in an audit
 * folder eight months from now must render from the file alone, with no network
 * and no fonts to fetch.
 */
function page(title: string, subtitle: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #16181d; margin: 0 auto; max-width: 190mm; padding: 12mm 8mm; }
  h1 { font-size: 16pt; margin: 0 0 2pt; letter-spacing: -0.2pt; }
  h2 { font-size: 11.5pt; margin: 18pt 0 6pt; padding-bottom: 3pt;
       border-bottom: 1px solid #d8dade; }
  h3 { font-size: 10pt; margin: 12pt 0 4pt; }
  p, li { margin: 0 0 6pt; }
  .sub { color: #5b6069; font-size: 9pt; margin: 0 0 14pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 8.6pt; }
  th, td { border: 1px solid #d8dade; padding: 4pt 5pt; text-align: left;
           vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .note { background: #fbf7ec; border-left: 3px solid #c8952e; padding: 7pt 9pt;
          margin: 8pt 0 12pt; font-size: 9pt; }
  .warn { background: #fdf1f1; border-left: 3px solid #b4443c; padding: 7pt 9pt;
          margin: 8pt 0 12pt; font-size: 9pt; }
  .muted { color: #5b6069; }
  .foot { margin-top: 22pt; padding-top: 8pt; border-top: 1px solid #d8dade;
          font-size: 8pt; color: #5b6069; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head>
<body>
<div class="noprint" style="background:#f3f4f6;border:1px solid #d8dade;padding:8pt 10pt;
     margin-bottom:14pt;font-size:9pt;border-radius:4px">
  Print or save as PDF from your browser (Cmd/Ctrl+P).
</div>
<h1>${esc(title)}</h1>
<p class="sub">${esc(subtitle)}</p>
${bodyHtml}
</body></html>`;
}

// ===========================================================================
// OUTBOUND: the enquiry pack
// ===========================================================================

export function scopeDocument(draft: DraftedRfx, rfxId: string): string {
  const s = draft.scope as {
    background?: string; included?: string[]; excluded?: string[];
    deliveryLocations?: Array<{ site: string; share: string }>;
    timeline?: Array<{ milestone: string; when: string }>;
    awardBasis?: string;
  };
  const groups = new Map<string, typeof draft.lines>();
  for (const l of draft.lines) {
    const g = String(l.group ?? "Other");
    groups.set(g, [...(groups.get(g) ?? []), l]);
  }

  return page(
    `${rfxId} — Scope of Work`,
    `${draft.title} · ${draft.lines.length} line items`,
    `
<h2>1. Background</h2><p>${esc(s.background)}</p>

<h2>2. Scope</h2>
<p>Supply, delivery and commissioning of ${draft.lines.length} line items across
${groups.size} group(s), as set out in the Line Items sheet. Quantities are firm.</p>
<table><thead><tr><th>Group</th><th class="n">Lines</th><th class="n">Units</th></tr></thead>
<tbody>${[...groups].map(([g, ls]) => `<tr><td>${esc(g)}</td><td class="n">${ls.length}</td>
<td class="n">${ls.reduce((a, l) => a + Number(l.qty ?? 0), 0)}</td></tr>`).join("")}
</tbody></table>

<h2>3. Delivery locations</h2>
<table><thead><tr><th>Site</th><th>Share</th></tr></thead><tbody>
${(s.deliveryLocations ?? []).map((d) =>
  `<tr><td>${esc(d.site)}</td><td>${esc(d.share)}</td></tr>`).join("")}
</tbody></table>

<h2>4. Included in scope</h2>
<ul>${(s.included ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>

<h2>5. Excluded from scope</h2>
<ul>${(s.excluded ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>

<h2>6. Timeline</h2>
<table><thead><tr><th>Milestone</th><th>Date</th></tr></thead><tbody>
${(s.timeline ?? []).map((t) =>
  `<tr><td>${esc(t.milestone)}</td><td>${esc(t.when)}</td></tr>`).join("")}
</tbody></table>

<h2>7. Award basis</h2><p>${esc(s.awardBasis)}</p>
<div class="note"><strong>Note to bidders.</strong> A bid that fails any mandatory question in
the Vendor Questionnaire will not be considered at any price.</div>
`,
  );
}

export function termsDocument(draft: DraftedRfx, rfxId: string): string {
  const t = draft.terms as Record<string, string>;
  const rows: Array<[string, string]> = [
    ["Currency", t.currency], ["Tax basis", t.taxBasis],
    ["Delivery basis", t.deliveryBasis], ["Payment", t.payment],
    ["Bid validity", t.validity], ["Price firmness", t.priceFirmness],
    ["Support SLA", t.supportSla], ["Acceptance", t.acceptance],
    ["Partial award", t.partialAward], ["Conditional discounts", t.conditionalDiscounts],
    ["Compliance", t.compliance], ["Governing law", t.governingLaw],
  ];
  return page(
    `${rfxId} — Commercial Terms`,
    `${draft.title} · counter-terms may be offered and will be evaluated as a deviation`,
    `<table><thead><tr><th style="width:32%">Item</th><th>Our requirement</th></tr></thead>
<tbody>${rows.filter(([, v]) => v).map(([k, v]) =>
  `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join("")}
</tbody></table>
<div class="note"><strong>Unit of measure.</strong> Do not alter it. Where a line is specified
per kit, box or pack, quote per that unit and not per piece. A price per piece against a line
specified per box will be normalised and you will be asked to confirm, which costs us both
time.</div>`,
  );
}

export function lineItemsWorkbook(draft: DraftedRfx, rfxId: string): Buffer {
  const wb = XLSX.utils.book_new();

  const header = [
    "Line", "SKU", "Group", "Description", "Key spec", "UoM", "Units per UoM", "Qty",
    "HSN", "Warranty basis", "Equivalents", "Unit rate (INR, ex-GST)", "Line total",
    "GST %", "Lead time (wks)", "Make / model offered", "Remarks",
  ];
  const rows = draft.lines.map((l) => [
    l.no, l.sku, l.group, l.description,
    (l.spec as Array<{ key: string; value: string }> | undefined)
      ?.map((s) => `${s.key}=${s.value}`).join(", ") ?? "",
    l.uom, l.unitsPerUom, l.qty, l.hsn ?? "",
    l.warrantyBasis === "included_in_unit_price" ? "Must be INCLUDED in unit price"
      : l.warrantyBasis === "quoted_separately" ? "Quote separately"
      : "n/a",
    l.substitutionAllowed ? "Permitted, state make and model" : "Not permitted",
    null, null, null, null, null, null,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    [`${rfxId} — Line Items`], [draft.title],
    ["Quote ex-GST in INR. State GST rate and HSN against every line."],
    ["DO NOT ALTER THE UNIT OF MEASURE. Where 'Units per UoM' is more than 1, the unit is a container: quote per container."],
    ["Mark any line you cannot supply as NQ. Do not leave it blank: a blank line and a declined line are treated differently."],
    [],
    header, ...rows, [],
    ["Vendor name:"], ["Signed by / date:"], ["Bid validity offered:"],
  ]);
  ws["!cols"] = [
    { wch: 5 }, { wch: 13 }, { wch: 18 }, { wch: 56 }, { wch: 34 }, { wch: 12 },
    { wch: 12 }, { wch: 7 }, { wch: 8 }, { wch: 30 }, { wch: 26 }, { wch: 16 },
    { wch: 14 }, { wch: 7 }, { wch: 13 }, { wch: 26 }, { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Line Items");

  // A tab naming the traps, because the pack is also the place to prevent them.
  const containers = draft.lines.filter((l) => Number(l.unitsPerUom) > 1);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Read this first"], [],
    ["1. Unit of measure. These lines are priced per container, not per piece:"],
    ...containers.map((l) =>
      [`   Line ${l.no}: one '${l.uom}' contains ${l.unitsPerUom} billable units`]),
    ...(containers.length ? [] : [["   (none on this enquiry)"]]),
    [],
    ["2. Warranty. Where a line says the warranty is included in the unit price, price it that"],
    ["   way. Do not quote a shorter term and add an uplift on a separate line: it makes your"],
    ["   bid look cheaper than it is and it will be adjusted onto a common basis anyway."],
    [],
    ["3. Equivalents. Where permitted, state the offered make and model. An unstated"],
    ["   substitution is treated as non-compliant."],
    [],
    ["4. Conditional discounts. Any discount that depends on an approval you do not yet hold,"],
    ["   an order date, or another bidder's price must be labelled conditional. It will be"],
    ["   recorded and shown to our approver, but it will not be used in the ranked comparison."],
  ]), "Read this first");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function questionnaireWorkbook(draft: DraftedRfx, rfxId: string): Buffer {
  const wb = XLSX.utils.book_new();
  const mandatory = draft.questionnaire.filter((q) => q.kind === "mandatory").length;

  const ws = XLSX.utils.aoa_to_sheet([
    [`${rfxId} — Vendor Questionnaire`], [draft.title],
    [`${draft.questionnaire.length} questions, ${mandatory} mandatory.`],
    ["MANDATORY: failure OR non-response on any mandatory question disqualifies the bid regardless of price."],
    ["Where an answer and its attached document disagree, the document governs. Check validity dates before attaching."],
    [],
    ["Q", "M/D", "Question", "Your answer", "Document required", "Attached filename"],
    ...draft.questionnaire.map((q) => [
      q.no, q.kind === "mandatory" ? "M" : "D", q.question, null,
      q.documentRequired ? "Yes" : "No", null,
    ]),
    [], ["Authorised signatory:"], ["Name and designation:"], ["Date:"],
  ]);
  ws["!cols"] = [
    { wch: 6 }, { wch: 6 }, { wch: 88 }, { wch: 42 }, { wch: 18 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Questionnaire");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ===========================================================================
// INBOUND: the comparison, the audit bundle, the award note
// ===========================================================================

/**
 * The comparison as a spreadsheet, with provenance attached as cell comments.
 *
 * The comments are the point. A comparison sheet that leaves the tool and lands
 * in someone's inbox normally loses every caveat on the way, which is how a
 * normalised number gets re-quoted as a raw one. Here each cell carries its own
 * source, its raw value and its flags, so the caveats survive being emailed.
 */
export function comparisonWorkbook(p: ComparisonPayload): Buffer {
  const wb = XLSX.utils.book_new();
  const vendors = p.vendors;

  const header = [
    "Line", "SKU", "Group", "Description", "UoM", "Units/UoM", "Qty",
    ...vendors.flatMap((v) => [
      `${v.name.split(" ")[0]} rate`, `${v.name.split(" ")[0]} status`,
    ]),
  ];

  const aoa: unknown[][] = [
    [`${(p.rfx as { id: string }).id} — Comparison, normalised`],
    [`Every rate below is ex-GST, in INR, per the unit the enquiry asked for.`],
    [`${p.trust.usable} of ${p.trust.total} cells are usable in a total. ` +
     `${p.trust.excluded} are excluded and are shown with their status, not as blanks.`],
    [`Cell comments carry the source, the supplier's raw value and every caveat.`],
    [],
    header,
  ];

  const comments: Array<{ addr: string; text: string }> = [];
  const headerRow = aoa.length;

  p.lines.forEach((line, i) => {
    const row: unknown[] = [
      line.no, line.sku, line.group, line.desc, line.uom, line.pack_size, line.qty,
    ];
    vendors.forEach((v, vi) => {
      const cell = p.matrix[v.code]?.[line.no];
      row.push(cell?.unitInr ?? null, cell?.status ?? "no data");
      if (cell) {
        const prov = p.provenance[`${v.code}:${line.no}`];
        const parts = [
          `${v.name}`,
          cell.raw?.price != null
            ? `Supplier wrote: ${cell.raw.ccy ?? "INR"} ${cell.raw.price} per ${cell.raw.uom ?? line.uom}`
            : `No price in the document`,
          cell.unitInr != null ? `Landed: ${inr(cell.unitInr)} per ${line.uom}` : `Not comparable`,
          prov ? `Source: ${prov.locator}` : null,
          prov?.citedText ? `Cited: "${prov.citedText}"` : null,
          ...cell.flags.map((f) => `• ${f}`),
        ].filter(Boolean);
        // +1 for the header row, +1 because rows are 1-indexed in A1 notation.
        const addr = XLSX.utils.encode_cell({ r: headerRow + i, c: 7 + vi * 2 });
        comments.push({ addr, text: parts.join("\n") });
      }
    });
    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const c of comments) {
    const cell = (ws[c.addr] ??= { t: "z" }) as XLSX.CellObject;
    cell.c = [{ a: "Quote Workbench", t: c.text }];
  }
  ws["!cols"] = [
    { wch: 5 }, { wch: 13 }, { wch: 18 }, { wch: 50 }, { wch: 11 }, { wch: 9 }, { wch: 6 },
    ...vendors.flatMap(() => [{ wch: 14 }, { wch: 22 }]),
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Comparison");

  // Qualification, because a price column is meaningless without it.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Qualification — mandatory questionnaire items"],
    ["A supplier failing any mandatory item cannot be awarded at any price."],
    [],
    ["Supplier", "Reply format", "Qualified", "Failed mandatory", "Lines priced"],
    ...vendors.map((v) => [
      v.name, v.reply_format, v.qualified ? "YES" : "NO",
      (v.failedMandatory ?? []).join(", ") || "-",
      `${p.scenarios.singleVendor[v.code]?.linesPriced ?? 0} of ${p.lines.length}`,
    ]),
  ]), "Qualification");

  // The assumption ledger. Every total above depends on these.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Assumptions in force"],
    ["Every total in this workbook depends on these. Change one and the totals change."],
    [],
    ["Key", "Value", "Source", "Alternative", "Note"],
    ...Object.entries(ASSUMPTIONS).map(([k, a]) => [
      k, String(a.value), a.source, a.alternative ?? "-", a.note,
    ]),
  ]), "Assumptions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Everything, as JSON, so a decision can be recomputed from scratch later. */
export function auditBundle(p: ComparisonPayload) {
  return {
    generatedFor: (p.rfx as { id: string }).id,
    whatThisIs:
      "The complete state a decision was made from: every extracted cell with its raw value, " +
      "its source, its normalisation trace and its status; the assumptions in force; and every " +
      "award scenario. Sufficient to recompute the decision without the tool.",
    buyer: p.buyer,
    rfx: p.rfx,
    lines: p.lines,
    suppliers: p.vendors.map((v) => ({
      code: v.code, name: v.name, replyFormat: v.reply_format,
      qualified: v.qualified, failedMandatory: v.failedMandatory,
      filesRead: v.meta?.filenames ?? [],
    })),
    questionnaire: p.questionnaire,
    questionnaireAnswers: p.questionnaireAnswers,
    assumptions: p.assumptions,
    cells: Object.fromEntries(
      Object.entries(p.matrix).map(([vendor, byLine]) => [
        vendor,
        Object.fromEntries(Object.entries(byLine).map(([no, c]) => [no, {
          status: c.status,
          awardable: isAwardable(c.status),
          raw: c.raw ?? null,
          landedUnitInr: c.unitInr,
          landedExtendedInr: c.extendedInr,
          flags: c.flags,
          normalisationTrace: c.trace,
          source: p.provenance[`${vendor}:${no}`] ?? null,
          readerConfidence: p.confidence[`${vendor}:${no}`] ?? null,
          independentReRead: p.verification[`${vendor}:${no}`] ?? null,
        }])),
      ]),
    ),
    unmappedItems: p.unmapped,
    trust: p.trust,
    scenarios: p.scenarios,
  };
}

/**
 * The award note. Written for internal audit, eight months from now.
 *
 * It leads with what the recommendation rests on rather than with the
 * recommendation, because the reader's question is never "what did we decide",
 * it is "was that decision sound".
 */
export function awardNote(p: ComparisonPayload, opts: { qualifiedOnly?: boolean } = {}): string {
  const rfxId = (p.rfx as { id: string }).id;
  /**
   * An award note ALWAYS recommends from the eligible field.
   *
   * The "all suppliers" view is a comparison aid, not a recommendation: a
   * supplier who failed a mandatory item cannot be awarded at any price, so a
   * note recommending one would be advising an award that cannot legally
   * happen. The toggle changes what the note COMPARES against, never what it
   * recommends.
   */
  const showAll = opts.qualifiedOnly === false;
  const scenario = p.scenarios.qualifiedOnly;
  const other = p.scenarios.allVendors;
  void showAll;

  const byVendor = new Map<string, number>();
  for (const pick of Object.values(scenario.picks)) {
    byVendor.set(pick.vendor, (byVendor.get(pick.vendor) ?? 0) + pick.extendedInr);
  }

  const disqualified = p.vendors.filter((v) => !v.qualified);
  const excludedCells = Object.entries(p.matrix).flatMap(([v, byLine]) =>
    Object.entries(byLine)
      .filter(([, c]) => !isAwardable(c.status))
      .map(([no, c]) => ({ vendor: v, lineNo: Number(no), status: c.status, flags: c.flags })),
  );

  const conditional: Array<{
    vendor: string; percent?: number | null; amountInr?: number | null;
    scope?: string; condition?: string;
  }> = p.vendors.flatMap((v) =>
    ((v.meta?.conditionalDiscounts as Array<Record<string, unknown>>) ?? [])
      .map((d) => ({
        vendor: v.name,
        percent: d.percent as number | null,
        amountInr: d.amountInr as number | null,
        scope: d.scope as string,
        condition: d.condition as string,
      })),
  );

  return page(
    `${rfxId} — Award Recommendation`,
    `${(p.buyer as { legal_name: string }).legal_name} · all amounts ex-GST, in INR`,
    `
<h2>Recommendation</h2>
<p>Award <strong>${scenario.linesAwarded} of ${p.lines.length}</strong> lines at a total of
<strong>${inr(scenario.totalInr)}</strong> (${inrShort(scenario.totalInr)}), split as follows.</p>
<table><thead><tr><th>Supplier</th><th class="n">Lines</th><th class="n">Value</th>
<th>Qualified</th></tr></thead><tbody>
${[...byVendor].sort((a, b) => b[1] - a[1]).map(([code, total]) => {
  const v = p.vendors.find((x) => x.code === code);
  const lines = Object.values(scenario.picks).filter((x) => x.vendor === code).length;
  return `<tr><td>${esc(v?.name ?? code)}</td><td class="n">${lines}</td>
<td class="n">${inr(total)}</td><td>${v?.qualified ? "Yes" : "NO"}</td></tr>`;
}).join("")}
</tbody></table>
<p class="muted">Against the buyer's own internal estimate of
${inr(p.baselineTotalInr)}.</p>

<h2>What we asked for and did not get</h2>
${(() => {
  const chases = p.chases ?? [];
  if (!chases.length) {
    return `<p class="muted">No supplier has been asked for anything further. Every gap
in the comparison below is a gap nobody has chased, which is a different thing from a
supplier declining to close it.</p>`;
  }
  const fmt = (d: string | null) => d
    ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "no deadline set";
  return `<p>The following suppliers were asked for items missing from their response.
This matters to the recommendation: a supplier who was asked and did not answer has
declined to close the gap, and awarding around them is defensible. A supplier nobody
asked has not.</p>
<table><thead><tr><th>Supplier</th><th class="n">Items asked</th><th>Sent</th>
<th>Due</th><th>Outcome</th></tr></thead><tbody>
${chases.map((c) => {
  const v = p.vendors.find((x) => x.code === c.vendorId);
  const outcome = c.answeredAt
    ? `Responded ${fmt(c.answeredAt)}`
    : c.closedReason
      ? `No response. Proceeded: ${esc(c.closedReason)}`
      : c.overdue
        ? "<strong>No response, deadline passed</strong>"
        : "Awaiting response";
  return `<tr><td>${esc(v?.name ?? c.vendorId)}</td><td class="n">${c.itemCount}</td>
<td>${fmt(c.sentAt)}</td><td>${fmt(c.dueAt)}</td><td>${outcome}</td></tr>`;
}).join("")}
</tbody></table>
${p.vendors.filter((v) => !chases.some((c) => c.vendorId === v.code)).length
  ? `<p class="muted">Not asked for anything further:
${p.vendors.filter((v) => !chases.some((c) => c.vendorId === v.code))
  .map((v) => esc(v.name)).join(", ")}.</p>`
  : ""}`;
})()}

<h2>What this recommendation rests on</h2>
<p>The total above is computed over <strong>${p.trust.usable} of ${p.trust.total}</strong>
extracted values. <strong>${p.trust.excluded}</strong> were excluded because they could not be
made comparable. No excluded value has been estimated, interpolated or filled in.</p>
<table><thead><tr><th>Status</th><th class="n">Cells</th><th>Meaning</th></tr></thead><tbody>
${Object.entries(p.trust.counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
  const meaning: Record<string, string> = {
    comparable: "normalised and directly rankable",
    comparable_with_caveat: "priced, but the offer deviates from the specification",
    resolved_from_reference: "derived from a prior purchase order; excluded until the supplier confirms",
    unreadable: "a price exists on the source document and could not be read",
    declined: "the supplier explicitly declined the line",
    omitted: "the supplier's response did not mention the line",
    non_comparable: "what the supplier offered is not a price that can be ranked",
    unresolvable: "priced by reference to information not held",
    needs_review: "could not be normalised safely",
  };
  return `<tr><td>${esc(k.replace(/_/g, " "))}</td><td class="n">${n}</td>
<td>${esc(meaning[k] ?? "")}</td></tr>`;
}).join("")}
</tbody></table>

<h2>Why not the cheapest</h2>
<p>Selecting the lowest price per line <em>without</em> applying the mandatory questionnaire
would give ${inr(other.totalInr)} over ${other.linesAwarded} lines, which is
${inrShort(Math.abs(scenario.totalInr - other.totalInr))}
${scenario.totalInr > other.totalInr ? "less" : "more"} than the recommendation above.
That figure is shown for comparison only and was never available.</p>
${disqualified.length ? `<div class="warn"><strong>That saving was not available.</strong>
${disqualified.map((v) => `${esc(v.name)} failed mandatory
${(v.failedMandatory ?? []).join(", ")}`).join("; ")}. A supplier failing any mandatory item
cannot be awarded at any price, so prices from
${disqualified.map((v) => esc(v.name.split(" ")[0])).join(", ")} were never eligible.</div>`
: ""}

<h2>Assumptions in force</h2>
<p>Each of these is a judgement, not a fact. Changing any one changes the totals above.</p>
<table><thead><tr><th style="width:20%">Assumption</th><th>Value and basis</th></tr></thead>
<tbody>${Object.entries(ASSUMPTIONS).map(([k, a]) => `<tr>
<td><strong>${esc(k.replace(/_/g, " "))}</strong></td>
<td>${esc(String(a.value))}<br><span class="muted">Source: ${esc(a.source)}.
${a.alternative ? `Alternative considered: ${esc(a.alternative)}. ` : ""}${esc(a.note)}</span></td>
</tr>`).join("")}</tbody></table>

<h2>Money deliberately not counted</h2>
${conditional.length ? `<p>The following were offered but depend on something outside the
supplier's own price, so they are recorded and were not used in ranking.</p>
<table><thead><tr><th>Supplier</th><th>Offer</th><th>Condition</th></tr></thead><tbody>
${conditional.map((d) => `<tr><td>${esc(d.vendor)}</td>
<td>${esc(d.percent ? `${d.percent}%` : d.amountInr ? inr(Number(d.amountInr)) : "-")}
${esc(d.scope ?? "")}</td><td>${esc(d.condition ?? "")}</td></tr>`).join("")}
</tbody></table>` : `<p class="muted">No conditional offers were recorded.</p>`}

<h2>Open items at the time of this recommendation</h2>
${excludedCells.length ? `<table><thead><tr><th>Supplier</th><th class="n">Line</th>
<th>Status</th><th>Detail</th></tr></thead><tbody>
${excludedCells.slice(0, 40).map((c) => {
  const v = p.vendors.find((x) => x.code === c.vendor);
  return `<tr><td>${esc(v?.name.split(" ")[0] ?? c.vendor)}</td>
<td class="n">${c.lineNo}</td><td>${esc(c.status.replace(/_/g, " "))}</td>
<td>${esc(c.flags[0] ?? "")}</td></tr>`;
}).join("")}
</tbody></table>
${excludedCells.length > 40
  ? `<p class="muted">${excludedCells.length - 40} further excluded cells are listed in full in
     the JSON audit bundle. None was estimated.</p>`
  : ""}` : `<p class="muted">None.</p>`}

<div class="foot">
Prepared by Quote Workbench from ${p.vendors.filter((v) => v.meta).length} supplier response(s).
Every value above traces to a specific location in a specific supplier document; the JSON audit
bundle for this enquiry contains each source locator, the supplier's own wording, and the
normalisation applied. All arithmetic was performed in code, not by a language model.
</div>
`,
  );
}

// ---------------------------------------------------------------------------

export const rfxPackFilenames = (rfxId: string) => ({
  scope: `${rfxId}_01_Scope_of_Work.html`,
  lines: `${rfxId}_02_Line_Items.xlsx`,
  questionnaire: `${rfxId}_03_Vendor_Questionnaire.xlsx`,
  terms: `${rfxId}_04_Commercial_Terms.html`,
});

export { LINES, VENDORS, QUALIFICATION };
