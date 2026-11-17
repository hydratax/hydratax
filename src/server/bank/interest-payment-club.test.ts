import { describe, expect, it } from "vitest";
import { findInterestLikePayments } from "@/server/bank/interest-payment-club";

describe("findInterestLikePayments", () => {
  it("clubs outflows near annual interest and monthly slice", () => {
    const hits = findInterestLikePayments(
      [
        {
          id: "a",
          dated: "2025-05-01",
          description: "MORTGAGE INT",
          amountPence: -45000,
          category: "expense_queries",
        },
        {
          id: "b",
          dated: "2025-06-01",
          description: "MORTGAGE INT",
          amountPence: -45000,
          category: "expense_queries",
        },
        {
          id: "c",
          dated: "2025-07-01",
          description: "RENT",
          amountPence: -120000,
          category: "premises",
        },
      ],
      {
        periodInterestPence: 540000, // £5,400 / yr → £450 / mo
        periodStart: "2025-04-01",
        periodEnd: "2026-03-31",
      },
    );
    expect(hits.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("ignores inflows and out-of-period lines", () => {
    const hits = findInterestLikePayments(
      [
        {
          id: "in",
          dated: "2025-05-01",
          description: "REFUND",
          amountPence: 45000,
        },
        {
          id: "old",
          dated: "2024-05-01",
          description: "OLD INT",
          amountPence: -45000,
        },
      ],
      {
        periodInterestPence: 540000,
        periodStart: "2025-04-01",
        periodEnd: "2026-03-31",
      },
    );
    expect(hits).toEqual([]);
  });
});
