/**
 * Tag bank_transactions.description with the statement bank name (no extra column).
 * Wire: `${description}\u001eBANK\u001e${bankName}` (compatible with manual meta after).
 */

import { parseBankDescriptionMeta } from "@/lib/bank/manual-tx-meta";

const SEP = "\u001e";
const BANK_MARK = "BANK";

export function normalizeBankName(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function bankKey(name: string | null | undefined): string {
  const n = normalizeBankName(name);
  return n ? n.toLowerCase() : "unnamed";
}

/** Pull bank nickname from upload filename: `Tide — Mar 2024.pdf`, `Tide _ Statement…`. */
export function extractBankNameFromFilename(filename: string): string {
  const base = String(filename ?? "")
    .replace(/^.*[/\\]/, "")
    .replace(/\.[^.]+$/, "")
    .trim();
  if (!base) return "Unnamed bank";
  const m = /^(.+?)\s*[—–_-]+\s*(.+)$/.exec(base);
  if (m && m[1]!.trim().length >= 2 && m[1]!.trim().length <= 48) {
    return normalizeBankName(m[1]);
  }
  return "Unnamed bank";
}

export function encodeBankTaggedDescription(
  description: string,
  bankName: string | null | undefined,
): string {
  const parsed = parseBankDescriptionMeta(description);
  const bare = parsed.description.replace(/\u001e/g, " ").trim() || "Transaction";
  const bank = normalizeBankName(bankName);
  let out = bare;
  if (bank) out = `${bare}${SEP}${BANK_MARK}${SEP}${bank}`;
  if (parsed.manual) {
    const note = (parsed.notes ?? "").replace(/\u001e/g, " ").trim();
    out = `${out}${SEP}M${SEP}${note}`;
  }
  return out;
}

export function parseBankTaggedDescription(raw: string): {
  description: string;
  bankName: string | null;
  notes: string | null;
  manual: boolean;
} {
  const text = String(raw ?? "");
  const parts = text.split(SEP);
  let bankName: string | null = null;
  let rest = text;

  if (parts.length >= 3 && parts[1] === BANK_MARK) {
    bankName = normalizeBankName(parts[2]) || null;
    const afterBank = parts.slice(3);
    if (afterBank.length >= 2 && afterBank[0] === "M") {
      return {
        description: parts[0] || "Transaction",
        bankName,
        notes: afterBank.slice(1).join(SEP).trim() || null,
        manual: true,
      };
    }
    rest = parts[0] || "Transaction";
    const manual = parseBankDescriptionMeta(rest);
    return {
      description: manual.description,
      bankName,
      notes: manual.notes,
      manual: manual.manual,
    };
  }

  const manual = parseBankDescriptionMeta(text);
  return {
    description: manual.description,
    bankName: null,
    notes: manual.notes,
    manual: manual.manual,
  };
}

export function transactionDedupeKey(
  dated: string,
  description: string,
  amountPence: number,
): string {
  const bare = parseBankTaggedDescription(description).description
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${dated}|${bare}|${amountPence}`;
}
