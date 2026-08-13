import { describe, expect, it } from "vitest";
import { categoriseDescription } from "@/server/bank/categorise";
import { summariseForYearEndAccounts } from "@/server/accounts/year-end-from-bank";

describe("bank merchant categorisation", () => {
  it("maps Shell to fuel", () => {
    const r = categoriseDescription("SHELL PETROL STATION 1234", -4500);
    expect(r.category).toBe("fuel");
  });

  it("maps Uber to travel", () => {
    const r = categoriseDescription("UBER TRIP HELP.UBER.COM", -1800);
    expect(r.category).toBe("travel");
  });

  it("maps credits to turnover by default", () => {
    const r = categoriseDescription("CUSTOMER PAYMENT", 250000);
    expect(r.category).toBe("turnover");
  });
});

describe("year-end rollup from bank", () => {
  it("puts fuel into Note 8 and cash movement on BS", () => {
    const draft = summariseForYearEndAccounts(
      [
        {
          dated: "2025-06-01",
          description: "Client invoice",
          amountPence: 100000,
          category: "turnover",
          confidence: "high",
        },
        {
          dated: "2025-06-02",
          description: "SHELL",
          amountPence: -5000,
          category: "fuel",
          confidence: "high",
        },
      ],
      { periodStart: "2025-04-01", periodEnd: "2026-03-31" },
    );
    expect(draft.turnoverPence).toBe(100000);
    expect(draft.note8.fuel).toBe(5000);
    expect(draft.adminExpensesPence).toBe(5000);
    expect(draft.balanceSheet.cashAtBankPence).toBe(95000);
  });
});
