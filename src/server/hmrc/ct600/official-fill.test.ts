import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import {
  buildCt600BoxValues,
  fillOfficialCt600Pdf,
} from "@/server/hmrc/ct600/official-fill";
import { pence } from "@/server/money/pence";

describe("fillOfficialCt600Pdf", () => {
  it("fills the official HMRC template with 12 pages", async () => {
    const templatePath = path.join(
      process.cwd(),
      "src/server/hmrc/ct600/templates/CT600-2026-v3.pdf",
    );
    expect(fs.existsSync(templatePath)).toBe(true);

    const bytes = await fillOfficialCt600Pdf({
      company: {
        name: "Hydra Consultancy Services Ltd",
        companyNumber: "14633422",
        utr: "8612814429",
        declarantName: "Director Name",
        declarantStatus: "Director",
      },
      figures: {
        clientId: "test",
        periodStart: "2024-03-01",
        periodEnd: "2025-02-28",
        turnoverPence: pence(10000000),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
      },
      taxableProfitPence: pence(10000000),
      taxChargePence: pence(1900000),
    });

    expect(bytes.length).toBeGreaterThan(500_000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(12);

    fs.mkdirSync(path.join(process.cwd(), ".ct-test"), { recursive: true });
    fs.writeFileSync(
      path.join(process.cwd(), ".ct-test", "filled-sample.pdf"),
      bytes,
    );
  });

  it("maps core CT600 boxes", () => {
    const boxes = buildCt600BoxValues({
      company: {
        name: "Example Ltd",
        companyNumber: "12345678",
        utr: "1234567890",
      },
      figures: {
        clientId: "x",
        periodStart: "2024-04-01",
        periodEnd: "2025-03-31",
        turnoverPence: pence(500000),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(0),
        profitAndLossAccountPence: pence(0),
      },
      taxableProfitPence: pence(500000),
      taxChargePence: pence(95000),
    });
    expect(boxes[1]).toBe("EXAMPLE LTD");
    expect(boxes[2]).toBe("12345678");
    expect(boxes[145]).toBe(5000);
    expect(boxes[315]).toBe(5000);
    expect(boxes[440]).toBe(950);
    expect(boxes[80]).toBe(true);
  });

  it("zeros all figure boxes for dormant companies", () => {
    const boxes = buildCt600BoxValues({
      company: {
        name: "Dormant Ltd",
        companyNumber: "12345678",
        utr: "1234567890",
      },
      figures: {
        clientId: "x",
        periodStart: "2024-03-01",
        periodEnd: "2025-02-28",
        turnoverPence: pence(0),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
      },
      taxableProfitPence: pence(0),
      taxChargePence: pence(0),
    });
    expect(boxes[145]).toBe(0);
    expect(boxes[155]).toBe(0);
    expect(boxes[315]).toBe(0);
    expect(boxes[440]).toBe(0);
    expect(boxes[1]).toBe("DORMANT LTD");
    expect(boxes[30]).toBe("2024-03-01");
    expect(boxes[35]).toBe("2025-02-28");
  });
});
