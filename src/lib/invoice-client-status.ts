/**
 * Practice-wide invoice desk cards — Due / Paid / Sent per client.
 */

export type InvoiceDeskFilter = "all" | "due" | "paid" | "sent";

export type InvoiceHint = {
  status: string;
  dueDate: string;
  totalPence: number;
};

export type InvoiceClientSummary = {
  dueCount: number;
  paidCount: number;
  sentCount: number;
  duePence: number;
  paidPence: number;
  sentPence: number;
  /** Dominant chip for the card */
  highlight: "due" | "paid" | "sent" | "none";
};

export function deriveInvoiceClientSummary(
  invoices: InvoiceHint[],
): InvoiceClientSummary {
  let dueCount = 0;
  let paidCount = 0;
  let sentCount = 0;
  let duePence = 0;
  let paidPence = 0;
  let sentPence = 0;

  for (const inv of invoices) {
    const status = String(inv.status ?? "").toLowerCase();
    const amount = Number(inv.totalPence) || 0;
    if (status === "paid") {
      paidCount += 1;
      paidPence += amount;
    } else if (status === "sent") {
      sentCount += 1;
      sentPence += amount;
    } else if (status === "due" || status === "draft") {
      // Draft still sits with Due on the practice desk (unpaid work).
      dueCount += 1;
      duePence += amount;
    }
  }

  const highlight: InvoiceClientSummary["highlight"] =
    dueCount > 0
      ? "due"
      : sentCount > 0
        ? "sent"
        : paidCount > 0
          ? "paid"
          : "none";

  return {
    dueCount,
    paidCount,
    sentCount,
    duePence,
    paidPence,
    sentPence,
    highlight,
  };
}

export function matchesInvoiceFilter(
  summary: InvoiceClientSummary,
  filter: InvoiceDeskFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "due":
      return summary.dueCount > 0;
    case "paid":
      return summary.paidCount > 0;
    case "sent":
      return summary.sentCount > 0;
    default:
      return true;
  }
}
