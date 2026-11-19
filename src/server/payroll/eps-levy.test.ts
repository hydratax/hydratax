import { describe, expect, it } from "vitest";
import {
  APPRENTICESHIP_LEVY_ALLOWANCE_PENCE,
  APPRENTICESHIP_LEVY_BPS,
  buildApprenticeshipLevyXml,
  computeLevyDueYtdPence,
  hasApprenticeshipLevy,
  wholePoundsPence,
} from "./eps-levy";

describe("apprenticeship levy", () => {
  it("uses GOV.UK 0.5% and £15,000 allowance", () => {
    expect(APPRENTICESHIP_LEVY_BPS).toBe(50);
    expect(APPRENTICESHIP_LEVY_ALLOWANCE_PENCE).toBe(15_000_00);
  });

  it("floors levy due to whole pounds", () => {
    expect(wholePoundsPence(199_99)).toBe(199_00);
  });

  it("computes net levy due YTD after cumulative allowance", () => {
    // Month 1: 0.5% of £4m = £20,000; allowance to date £1,250 → £18,750
    const due = computeLevyDueYtdPence({
      payBillYtdPence: 400_000_000,
      taxMonth: 1,
      annualAllowancePence: 15_000_00,
    });
    expect(due).toBe(18_750_00);
  });

  it("returns zero when pay bill is under the allowance", () => {
    // £1m YTD @ 0.5% = £5,000; month-6 allowance = £7,500 → nil due
    expect(
      computeLevyDueYtdPence({
        payBillYtdPence: 1_000_000_00,
        taxMonth: 6,
      }),
    ).toBe(0);
  });

  it("builds XSD-ordered ApprenticeshipLevy fragment", () => {
    const xml = buildApprenticeshipLevyXml({
      taxMonth: 3,
      levyDueYtdPence: 1_250_50,
      annualAllowancePence: 15_000_00,
    });
    expect(xml).toContain("<LevyDueYTD>1250.00</LevyDueYTD>");
    expect(xml).toContain("<TaxMonth>3</TaxMonth>");
    expect(xml).toContain("<AnnualAllce>15000.00</AnnualAllce>");
    expect(hasApprenticeshipLevy({
      taxMonth: 3,
      levyDueYtdPence: 0,
      annualAllowancePence: 15_000_00,
    })).toBe(true);
  });
});
