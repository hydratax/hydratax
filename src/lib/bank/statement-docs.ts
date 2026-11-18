/**
 * Bank statement documents in Books, tagged by desk:
 * - Company tax (CT / year-end) — `accounts` | `general` | `corporation_tax`
 * - VAT — `vat`
 * - Self Assessment — `sa:{taxpayerId}:bank_statement`
 *
 * Personal SA statements must not be mixed into company VAT by default.
 */

import { parseSaBookCategory } from "@/lib/sa-taxpayer";

export type BankStatementDesk = "ct" | "vat" | "sa";

export const BANK_STATEMENT_DESK_LABEL: Record<BankStatementDesk, string> = {
  ct: "Company tax",
  vat: "VAT",
  sa: "Self Assessment",
};

function isBankFileShape(doc: {
  filename: string;
  contentType: string;
}): boolean {
  const name = doc.filename.toLowerCase();
  const type = doc.contentType.toLowerCase();
  return (
    type.includes("pdf") ||
    type.includes("csv") ||
    type.includes("sheet") ||
    type.includes("excel") ||
    type.startsWith("image/") ||
    name.endsWith(".pdf") ||
    name.endsWith(".csv") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    /\.(png|jpe?g|webp|tif{1,2})$/i.test(name)
  );
}

/** Map a client_documents.category to a bank-statement desk. */
export function bankStatementDesk(
  category: string,
): BankStatementDesk | null {
  // Books typed uploads: desk:bank_statement
  if (category === "vat:bank_statement" || category === "vat") return "vat";
  if (
    category === "corporation_tax:bank_statement" ||
    category === "corporation_tax" ||
    category === "accounts" ||
    category === "general"
  ) {
    return "ct";
  }
  if (
    category === "self_assessment:bank_statement" ||
    category === "self_assessment"
  ) {
    return "sa";
  }
  // Receipts / invoices on Books are not bank statements for VAT pull.
  if (
    /^(vat|corporation_tax|self_assessment|payroll):(receipt|invoice|other)$/.test(
      category,
    )
  ) {
    return null;
  }
  const sa = parseSaBookCategory(category);
  if (sa?.kind === "bank_statement") return "sa";
  return null;
}

/**
 * True when the document is a bank statement file for any desk
 * (CT Books, VAT, or SA personal books).
 */
export function isBankStatementDoc(doc: {
  filename: string;
  contentType: string;
  category: string;
}): boolean {
  if (!isBankFileShape(doc)) return false;
  // Prefer explicit bank_statement kind when present.
  if (doc.category.endsWith(":bank_statement")) {
    return bankStatementDesk(doc.category) !== null;
  }
  if (/:(receipt|invoice|other)$/.test(doc.category)) return false;
  return bankStatementDesk(doc.category) !== null;
}

export type BankStatementDocSummary = {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Document category as stored (accounts, vat, sa:…:bank_statement, …). */
  category: string;
  /** Desk bucket for Books / VAT pull UI. */
  desk: BankStatementDesk;
};

export function toBankStatementSummary(doc: {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string | Date;
  category: string;
}): BankStatementDocSummary | null {
  const desk = bankStatementDesk(doc.category);
  if (!desk || !isBankFileShape(doc)) return null;
  return {
    id: doc.id,
    filename: doc.filename,
    blobUrl: doc.blobUrl,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    createdAt:
      typeof doc.createdAt === "string"
        ? doc.createdAt
        : doc.createdAt.toISOString(),
    category: doc.category,
    desk,
  };
}

/** Group summaries in CT → VAT → SA order for desk UIs. */
export function groupBankStatementsByDesk(
  docs: BankStatementDocSummary[],
): Array<{ desk: BankStatementDesk; label: string; docs: BankStatementDocSummary[] }> {
  const order: BankStatementDesk[] = ["ct", "vat", "sa"];
  return order
    .map((desk) => ({
      desk,
      label: BANK_STATEMENT_DESK_LABEL[desk],
      docs: docs.filter((d) => d.desk === desk),
    }))
    .filter((g) => g.docs.length > 0);
}
