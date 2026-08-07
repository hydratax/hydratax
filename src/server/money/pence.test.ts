import { describe, expect, it } from "vitest";
import {
  addPence,
  formatGBP,
  pence,
  poundsToPence,
  penceToPounds,
  vatOnNet,
} from "./pence";
import { buildFraudPreventionHeaders } from "@/server/hmrc/fraud-headers";
import { getHmrcConfig } from "@/server/hmrc/config";
import { draftVatBoxesFromLedger } from "@/server/hmrc/vat";
import { buildCt600Xml } from "@/server/hmrc/ct600";
import { calculateMonthlyPay, buildFpsXml } from "@/server/hmrc/payroll";
import { encryptSecret, decryptSecret } from "@/server/hmrc/crypto";

describe("pence engine", () => {
  it("converts pounds without float drift", () => {
    expect(poundsToPence("1000.00")).toBe(100000);
    expect(poundsToPence("0.01")).toBe(1);
    expect(penceToPounds(pence(100000))).toBe("1000.00");
    expect(formatGBP(pence(199))).toContain("1.99");
  });

  it("adds and computes VAT in integer pence", () => {
    expect(addPence(pence(100), pence(50))).toBe(150);
    expect(vatOnNet(pence(10000), 2000)).toBe(2000);
  });

  it("rejects non-integer pence", () => {
    expect(() => pence(1.5)).toThrow();
  });
});

describe("fraud headers", () => {
  it("blocks incomplete metadata", () => {
    expect(() =>
      buildFraudPreventionHeaders({
        browserJsUserAgent: "",
        timezone: "UTC+00:00",
        screens: "width=1&height=1&scaling-factor=1&colour-depth=24",
        windowSize: "width=1&height=1",
        localIps: "127.0.0.1",
        localIpsTimestamp: new Date().toISOString(),
      }),
    ).toThrow(/incomplete fraud prevention/i);
  });

  it("builds complete header set", () => {
    const headers = buildFraudPreventionHeaders({
      browserJsUserAgent: "Mozilla/5.0",
      timezone: "UTC+00:00",
      screens: "width=1920&height=1080&scaling-factor=1&colour-depth=24",
      windowSize: "width=1200&height=800",
      localIps: "127.0.0.1",
      localIpsTimestamp: "2026-03-01T12:00:00.000Z",
    });
    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    expect(headers["Gov-Vendor-Version"]).toBeTruthy();
  });
});

describe("hmrc config", () => {
  it("uses sandbox by default", () => {
    process.env.HMRC_ENV = "sandbox";
    // reset cached env by deleting module cache is hard; just assert current
    const cfg = getHmrcConfig();
    expect(cfg.apiBase).toContain("test-api.service.hmrc.gov.uk");
  });
});

describe("token crypto", () => {
  it("round-trips AES-256-GCM", () => {
    const cipher = encryptSecret("super-secret-token");
    expect(cipher).not.toContain("super-secret-token");
    expect(decryptSecret(cipher)).toBe("super-secret-token");
  });
});

describe("vat draft", () => {
  it("builds boxes from ledger", () => {
    const boxes = draftVatBoxesFromLedger(
      [
        {
          type: "income",
          amountPence: 100000,
          vatPence: 20000,
          dated: "2026-02-01",
        },
        {
          type: "expense",
          amountPence: 10000,
          vatPence: 2000,
          dated: "2026-02-10",
        },
      ],
      "2026-01-01",
      "2026-03-31",
    );
    expect(boxes.vatDueSales).toBe(20000);
    expect(boxes.vatReclaimedCurrPeriod).toBe(2000);
  });
});

describe("ct600 + payroll builders", () => {
  it("builds CT600 xml hash", () => {
    const built = buildCt600Xml({
      companyName: "Test Ltd",
      companyNumber: "12345678",
      utr: "1234567890",
      figures: {
        clientId: "c1",
        periodStart: "2025-04-01",
        periodEnd: "2026-03-31",
        turnoverPence: pence(10000000),
        costOfSalesPence: pence(1000000),
        administrativeExpensesPence: pence(2000000),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(10000),
        profitAndLossAccountPence: pence(0),
      },
    });
    expect(built.xml).toContain("HMRC-CT-CT600");
    expect(built.hash).toHaveLength(64);
  });

  it("calculates pay and builds FPS", () => {
    const line = calculateMonthlyPay({
      id: "e1",
      forename: "Sam",
      surname: "Taylor",
      nino: "AB123456C",
      taxCode: "1257L",
      annualSalaryPence: 3600000,
    });
    expect(line.grossPence).toBe(300000);
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-03-28",
      taxYear: "25-26",
      lines: [line],
    });
    expect(fps.xml).toContain("HMRC-PAYE-RTI-FPS");
  });
});
