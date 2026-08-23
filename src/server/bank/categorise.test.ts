import { describe, expect, it } from "vitest";
import { parseBankCsv } from "./categorise";

describe("parseBankCsv", () => {
  it("parses Monzo export columns", () => {
    const csv = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In,Balance
tx_1,04/08/2026,12:00:00,Card payment,Test Shop,,Shopping,-25.00,GBP,-25.00,GBP,,,,Test purchase,,25.00,,1000.00
tx_2,05/08/2026,13:00:00,Faster payment,Client,,Income,500.00,GBP,500.00,GBP,,,,Payment received,,,500.00,1500.00`;

    const lines = parseBankCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      dated: "2026-08-04",
      description: "Test purchase",
      amountPence: -2500,
    });
    expect(lines[1]).toMatchObject({
      dated: "2026-08-05",
      description: "Payment received",
      amountPence: 50000,
    });
  });

  it("parses simple date,description,amount CSV", () => {
    const csv = `Date,Description,Amount
01/01/2026,Office rent,-1200.00
02/01/2026,Client payment,2500.00`;

    const lines = parseBankCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0].amountPence).toBe(-120000);
    expect(lines[1].amountPence).toBe(250000);
  });
});
