import { describe, expect, it } from "vitest";
import {
  CUSTOM_PLAN_MODULES,
  CUSTOM_VS_PRACTICE_RATIO,
  PRACTICE_PLAN_CLIENT_LIMIT,
  PRACTICE_PLAN_PRICE_POUNDS,
  basePlanKey,
  customPlanAmountPounds,
  customPlanKey,
  parseCustomPlanSelection,
  withYearlyPlanKey,
  yearlyAmountPoundsFromMonthly,
  yearlySavingsPoundsFromMonthly,
} from "@/lib/pricing";
import { getCheckoutPlan } from "@/lib/checkout-plans";

function allInclusive(clients: number) {
  return customPlanAmountPounds({
    modules: CUSTOM_PLAN_MODULES.map((m) => ({
      id: m.id,
      clients,
    })),
  });
}

describe("custom volume pricing", () => {
  it("has no desk fee at one client on a single module", () => {
    expect(
      customPlanAmountPounds({ modules: [{ id: "vat", clients: 1 }] }),
    ).toBe(12);
    expect(
      customPlanAmountPounds({
        modules: [
          { id: "vat", clients: 1 },
          { id: "payroll", clients: 1 },
        ],
      }),
    ).toBe(30);
  });

  it("stays cheaper than Practice at the Practice client cap all-inclusive", () => {
    const custom = allInclusive(PRACTICE_PLAN_CLIENT_LIMIT);
    expect(custom).toBeLessThan(PRACTICE_PLAN_PRICE_POUNDS);
    expect(custom).toBeLessThanOrEqual(
      Math.round(PRACTICE_PLAN_PRICE_POUNDS * CUSTOM_VS_PRACTICE_RATIO),
    );
  });

  it("gets cheaper per client as volume grows", () => {
    const at1 = allInclusive(1) / 1;
    const at50 = allInclusive(50) / 50;
    const at500 = allInclusive(500) / 500;
    expect(at50).toBeLessThan(at1);
    expect(at500).toBeLessThan(at1);
  });

  it("encodes client counts in the plan key", () => {
    expect(
      customPlanKey({
        modules: [
          { id: "vat", clients: 10 },
          { id: "payroll", clients: 5 },
        ],
      }),
    ).toBe("practice:Custom:payroll:5+vat:10");
  });
});

describe("yearly desk billing (15% off)", () => {
  it("charges about 10.2 months — almost 2 months free", () => {
    expect(yearlyAmountPoundsFromMonthly(79)).toBe(806);
    expect(yearlySavingsPoundsFromMonthly(79)).toBe(79 * 12 - 806);
    expect(yearlyAmountPoundsFromMonthly(29)).toBe(296);
  });

  it("resolves yearly Solo / Practice / Custom checkout plans", () => {
    const solo = getCheckoutPlan("practice:Solo:yearly");
    expect(solo?.interval).toBe("year");
    expect(solo?.amountPence).toBe(29600);

    const practice = getCheckoutPlan("practice:Practice:yearly");
    expect(practice?.interval).toBe("year");
    expect(practice?.amountPence).toBe(80600);

    const customMonthly = customPlanAmountPounds({
      modules: [{ id: "vat", clients: 10 }],
    });
    const custom = getCheckoutPlan("practice:Custom:vat:10:yearly");
    expect(custom?.interval).toBe("year");
    expect(custom?.amountPence).toBe(
      yearlyAmountPoundsFromMonthly(customMonthly) * 100,
    );
  });

  it("round-trips yearly suffix helpers", () => {
    expect(withYearlyPlanKey("practice:Practice")).toBe(
      "practice:Practice:yearly",
    );
    expect(basePlanKey("practice:Practice:yearly")).toBe("practice:Practice");
    expect(
      parseCustomPlanSelection("practice:Custom:vat:10+payroll:5:yearly"),
    ).toEqual({
      modules: [
        { id: "vat", clients: 10 },
        { id: "payroll", clients: 5 },
      ],
    });
  });
});
