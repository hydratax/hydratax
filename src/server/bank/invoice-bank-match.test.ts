import { describe, expect, it } from "vitest";
import { suggestInvoiceBankMatches } from "@/server/bank/invoice-bank-match";

describe("suggestInvoiceBankMatches", () => {
  it("matches amount + invoice number in bank narrative", () => {
    const suggestions = suggestInvoiceBankMatches(
      [
        {
          id: "inv1",
          invoiceNumber: "INV-100",
          totalPence: 120_000,
          issueDate: "2026-03-01",
          dueDate: "2026-03-31",
          reference: null,
          status: "sent",
        },
      ],
      [
        {
          id: "tx1",
          dated: "2026-03-05",
          description: "FASTER PAYMENT FROM CLIENT INV-100",
          amountPence: 120_000,
          category: "turnover",
        },
      ],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.bankTransactionId).toBe("tx1");
    expect(suggestions[0]!.score).toBeGreaterThanOrEqual(70);
  });
});
