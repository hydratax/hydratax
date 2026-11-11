/**
 * Rebuild readable lines from PDF.js text items using Y position.
 * Bank statements often put date / narrative / amount in separate runs;
 * naive string join loses row structure.
 */

export type PdfTextItem = {
  str: string;
  /** PDF.js transform[4]=x, transform[5]=y (bottom-left origin). */
  transform: number[];
  width?: number;
  height?: number;
};

export function linesFromPdfTextItems(items: PdfTextItem[]): string {
  const usable = items.filter((it) => (it.str ?? "").trim().length > 0);
  if (!usable.length) return "";

  const rows: { y: number; parts: { x: number; text: string }[] }[] = [];
  const yTol = 2.5;

  for (const it of usable) {
    const x = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const text = it.str.replace(/\s+/g, " ").trim();
    if (!text) continue;
    let row = rows.find((r) => Math.abs(r.y - y) <= yTol);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, text });
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}
