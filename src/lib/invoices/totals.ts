import type { PracticeLetterhead } from "@/lib/desk-profile";

export type InvoiceMoneyRow = {
  status: string;
  dueDate: string;
  totalPence: number;
};

const OPEN_STATUSES = new Set(["draft", "sent", "due"]);

export function isInvoiceOpen(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

export function isInvoiceOverdue(
  inv: Pick<InvoiceMoneyRow, "status" | "dueDate">,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (!isInvoiceOpen(inv.status)) return false;
  return inv.dueDate < today;
}

/** Amount still owed on open invoices (draft / sent / due). */
export function openInvoiceTotals(invoices: InvoiceMoneyRow[]) {
  const open = invoices.filter((i) => isInvoiceOpen(i.status));
  const overdue = open.filter((i) => isInvoiceOverdue(i));
  const dueSoon = open.filter((i) => !isInvoiceOverdue(i));
  const amountDuePence = open.reduce((sum, i) => sum + (i.totalPence || 0), 0);
  const overduePence = overdue.reduce((sum, i) => sum + (i.totalPence || 0), 0);
  return {
    openCount: open.length,
    dueSoonCount: dueSoon.length,
    overdueCount: overdue.length,
    amountDuePence,
    overduePence,
  };
}

/** True when practice branding is incomplete for a professional invoice face. */
export function letterheadNeedsBranding(lh: PracticeLetterhead): boolean {
  const hasAddress = (lh.addressLines ?? []).some((l) => l.trim());
  const hasLogo = Boolean(lh.logoUrl?.trim());
  const hasContact = Boolean(
    lh.phone?.trim() || lh.email?.trim() || lh.website?.trim(),
  );
  const hasBank = Boolean(
    lh.bankName?.trim() ||
      lh.accountName?.trim() ||
      lh.sortCode?.trim() ||
      lh.accountNumber?.trim(),
  );
  // Suggest branding when logo, address, or bank details are missing.
  return !hasLogo || !hasAddress || !hasContact || !hasBank;
}
