import * as XLSX from "xlsx";
import { readFileParts } from "../lib/extract/readers";

(async () => {
  // A sheet where every data region is a merged block: only the top-left cell
  // of each merge carries a value, which is how Excel stores it.
  const aoa = [
    ["QUOTATION - ACME", null, null, null],
    ["Line", "Description", "Rate", "Unit"],
    [1, "Laptop 14in i5", 62800, "nos"],
    [2, "Laptop 14in i7", 74500, "nos"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 2 } },
    { s: { r: 2, c: 3 }, e: { r: 2, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },  // whole row merged: only "2" survives
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quotation");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const r = await readFileParts(buf, "merged.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  console.log("=== all-merged sheet ===");
  console.log((r.parts[0] as {text:string}).text);

  // A sheet with a !ref but every cell blank -> is the empty read caught?
  const ws2 = XLSX.utils.aoa_to_sheet([[""],[""]]);
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, ws2, "Blank");
  const buf2 = XLSX.write(wb2, { type: "buffer", bookType: "xlsx" }) as Buffer;
  try {
    const r2 = await readFileParts(buf2, "blank.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    console.log("\n=== sheet with a ref but no values ===");
    console.log("meta:", JSON.stringify(r2.meta));
    console.log("text length:", (r2.parts[0] as {text:string}).text.length);
    console.log(JSON.stringify((r2.parts[0] as {text:string}).text.slice(-120)));
  } catch (e) { console.log("\nblank.xlsx THREW:", String(e).slice(0,140)); }
})();
