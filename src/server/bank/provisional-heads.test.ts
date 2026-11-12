import { describe, expect, it } from "vitest";
import { counterpartyKey } from "@/server/bank/counterparty-key";
import {
  applyProvisionalHeads,
  clusterIsMaterial,
  clusterUnknownLines,
  provisionalHeadLabel,
} from "@/server/bank/provisional-heads";

describe("counterpartyKey", () => {
  it("strips card payment noise and amounts", () => {
    expect(counterpartyKey("CARD PAYMENT TESCO STORES 12.40")).toBe(
      "tesco stores",
    );
  });

  it("keeps named payees from faster payments", () => {
    expect(
      counterpartyKey("FASTER PAYMENT FROM ACME BUILDING LTD REF 991122"),
    ).toContain("acme");
  });
});

describe("provisional heads", () => {
  it("flags material clusters by value", () => {
    const lines = [
      {
        description: "CARD PAYMENT AWS EMEA",
        amountPence: -600_000,
        category: "expense_queries",
        confidence: "low",
      },
    ];
    const clusters = clusterUnknownLines(lines);
    expect(clusters).toHaveLength(1);
    expect(clusterIsMaterial(clusters[0]!, lines.length)).toBe(true);
  });

  it("creates a review head and reassigns lines", async () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({
      description: `CARD PAYMENT UNKNOWN SUPPLIER LTD ${i}`,
      amountPence: -12_00,
      category: "expense_queries" as const,
      confidence: "low" as const,
    }));

    const { lines: next, created } = await applyProvisionalHeads(lines, {
      ensureCategory: async (label) => ({
        id: "cat-1",
        label,
      }),
      upsertIdentifier: async () => {},
    });

    expect(created).toHaveLength(1);
    expect(created[0]!.label).toMatch(/^Review:/);
    expect(next.every((l) => String(l.category) === "custom:cat-1")).toBe(true);
    expect(provisionalHeadLabel("unknown supplier ltd", 14400)).toMatch(
      /Review: Unknown Supplier Ltd/,
    );
  });

  it("does not create heads for small unique unknowns", async () => {
    const lines = [
      {
        description: "COFFEE SHOP A",
        amountPence: -350,
        category: "expense_queries",
        confidence: "low",
      },
      {
        description: "COFFEE SHOP B",
        amountPence: -400,
        category: "expense_queries",
        confidence: "low",
      },
    ];
    const { created } = await applyProvisionalHeads(lines, {
      ensureCategory: async (label) => ({ id: "x", label }),
    });
    expect(created).toHaveLength(0);
  });
});
