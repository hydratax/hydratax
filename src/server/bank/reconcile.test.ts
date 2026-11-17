import { describe, expect, it } from "vitest";
import {
  extractStatementBalances,
  reconcileStatement,
} from "@/server/bank/reconcile";
import { parseUkStatementText } from "@/server/bank/parse-uk-statement-text";
import { mapBankHeadsToSaSelfEmployment } from "@/server/bank/sa-box-map";
import { detectBankProfile } from "@/server/bank/profiles";

describe("bankbee reconcile", () => {
  it("extracts opening and closing balances", () => {
    const text = `
HSBC
Opening balance £1,000.00
01/03/2026 Card payment Shop 50.00
Closing balance £950.00
`;
    const b = extractStatementBalances(text);
    expect(b.openingPence).toBe(100_000);
    expect(b.closingPence).toBe(95_000);
  });

  it("marks reconciled when movements tie out", () => {
    const r = reconcileStatement({
      openingPence: 10_000,
      closingPence: 9_350,
      lines: [{ amountPence: -650 }],
    });
    expect(r.status).toBe("reconciled");
    expect(r.deltaPence).toBe(0);
  });

  it("marks not_reconciled when a line is missing", () => {
    const r = reconcileStatement({
      openingPence: 10_000,
      closingPence: 9_000,
      lines: [{ amountPence: -650 }],
    });
    expect(r.status).toBe("not_reconciled");
  });

  it("parses HSBC fixture and reconciles", () => {
    const text = `
HSBC
Opening balance 100.00
01/03/2026 Card payment Pret A Manger 6.50
Closing balance 93.50
Page 1 of 2
`;
    const { lines, meta } = parseUkStatementText(text);
    expect(meta.profileId).toBe("hsbc");
    expect(lines).toHaveLength(1);
    expect(meta.reconcile.status).toBe("reconciled");
  });
});

describe("bankbee profiles", () => {
  it("detects Monzo and Starling", () => {
    expect(detectBankProfile("Monzo Bank statement").id).toBe("monzo");
    expect(detectBankProfile("Starling Bank Limited\nwww.starlingbank.com").id).toBe(
      "starling",
    );
  });
});

describe("bankbee SA box map", () => {
  it("maps turnover and fuel into SA103 fields", () => {
    const mapped = mapBankHeadsToSaSelfEmployment([
      { category: "turnover", amountPence: 125_000 },
      { category: "fuel", amountPence: -4_520 },
      { category: "drawings", amountPence: -50_000 },
    ]);
    expect(mapped.fields.seTurnover).toBe(1250);
    expect(mapped.fields.seCarVanTravel).toBe(45.2);
    expect(mapped.omittedLineCount).toBe(1);
    expect(mapped.fields.seWages).toBeUndefined();
  });
});
