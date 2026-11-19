import { describe, expect, it } from "vitest";
import {
  deriveInvoiceClientSummary,
  matchesInvoiceFilter,
} from "./invoice-client-status";

describe("invoice client status", () => {
  it("splits due / sent / paid amounts", () => {
    const summary = deriveInvoiceClientSummary([
      { status: "due", dueDate: "2026-04-01", totalPence: 10000 },
      { status: "sent", dueDate: "2026-04-10", totalPence: 20000 },
      { status: "paid", dueDate: "2026-03-01", totalPence: 5000 },
    ]);
    expect(summary.dueCount).toBe(1);
    expect(summary.sentCount).toBe(1);
    expect(summary.paidCount).toBe(1);
    expect(summary.duePence).toBe(10000);
    expect(matchesInvoiceFilter(summary, "sent")).toBe(true);
  });
});
