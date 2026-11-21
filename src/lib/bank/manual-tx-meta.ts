/**
 * Encode / decode cash–manual metadata inside bank_transactions.description
 * so notes work across Postgres, desk/D1, and memory stores (no extra column).
 *
 * Wire format: `${description}\u001eM\u001e${notes}`
 * - Always includes the M marker for manual lines
 * - notes may be empty
 */

const SEP = "\u001e";
const MANUAL_MARK = "M";

export function encodeManualBankDescription(
  description: string,
  notes?: string | null,
): string {
  const desc = description.replace(/\u001e/g, " ").trim();
  const note = (notes ?? "").replace(/\u001e/g, " ").trim();
  return `${desc}${SEP}${MANUAL_MARK}${SEP}${note}`;
}

export function parseBankDescriptionMeta(raw: string): {
  description: string;
  notes: string | null;
  manual: boolean;
} {
  const text = String(raw ?? "");
  const parts = text.split(SEP);
  if (parts.length >= 3 && parts[1] === MANUAL_MARK) {
    return {
      description: parts[0] || "Cash / manual",
      notes: parts.slice(2).join(SEP).trim() || null,
      manual: true,
    };
  }
  return {
    description: text,
    notes: null,
    manual: false,
  };
}

export function isManualBankSource(source: string | null | undefined): boolean {
  const s = String(source ?? "").toLowerCase();
  return s === "manual" || s === "cash";
}
