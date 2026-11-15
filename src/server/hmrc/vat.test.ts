import { describe, expect, it } from "vitest";
import { pence } from "@/server/money/pence";
import {
  assertVatBoxIdentities,
  boxesToHmrcPayload,
  draftVatBoxesFromLedger,
} from "@/server/hmrc/vat";

describe("VAT MTD payload contract", () => {
  it("maps nine boxes to HMRC JSON field names with finalised true", () => {
    const boxes = {
      vatDueSales: pence(20_000),
      vatDueAcquisitions: pence(0),
      totalVatDue: pence(20_000),
      vatReclaimedCurrPeriod: pence(2_000),
      netVatDue: pence(18_000),
      totalValueSalesExVAT: pence(100_000),
      totalValuePurchasesExVAT: pence(10_000),
      totalValueGoodsSuppliedExVAT: pence(0),
      totalAcquisitionsExVAT: pence(0),
    };
    const payload = boxesToHmrcPayload(boxes);
    expect(payload).toMatchObject({
      vatDueSales: 200,
      vatDueAcquisitions: 0,
      totalVatDue: 200,
      vatReclaimedCurrPeriod: 20,
      netVatDue: 180,
      totalValueSalesExVAT: 1000,
      totalValuePurchasesExVAT: 100,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    });
  });

  it("rejects Box 3 / Box 5 identity failures", () => {
    expect(() =>
      assertVatBoxIdentities({
        vatDueSales: pence(100),
        vatDueAcquisitions: pence(50),
        totalVatDue: pence(200),
        vatReclaimedCurrPeriod: pence(0),
        netVatDue: pence(200),
        totalValueSalesExVAT: pence(0),
        totalValuePurchasesExVAT: pence(0),
        totalValueGoodsSuppliedExVAT: pence(0),
        totalAcquisitionsExVAT: pence(0),
      }),
    ).toThrow(/Box 3/);
  });

  it("ledger draft satisfies box identities", () => {
    const boxes = draftVatBoxesFromLedger(
      [
        {
          type: "income",
          amountPence: 100_000,
          vatPence: 20_000,
          dated: "2026-02-01",
        },
        {
          type: "expense",
          amountPence: 10_000,
          vatPence: 2_000,
          dated: "2026-02-10",
        },
      ],
      "2026-01-01",
      "2026-03-31",
    );
    expect(() => assertVatBoxIdentities(boxes)).not.toThrow();
    expect(boxes.totalVatDue).toBe(20_000);
    expect(boxes.netVatDue).toBe(18_000);
  });
});
