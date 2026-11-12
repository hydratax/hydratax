import { describe, expect, it } from "vitest";
import {
  CUSTOM_PLAN_MODULES,
  CUSTOM_PLAN_MIN_CLIENTS,
  ENTERPRISE_MODULE_PACK_FLOORS,
  ENTERPRISE_PACK_FLOOR_RATIO,
  ENTERPRISE_VOLUME_ANCHOR_CLIENTS,
  PRACTICE_PLAN_CLIENT_LIMIT,
  basePlanKey,
  customModuleAmountPounds,
  customPlanAmountPounds,
  customPlanKey,
  parseCustomPlanSelection,
  withYearlyPlanKey,
  yearlyAmountPoundsFromMonthly,
  yearlySavingsPoundsFromMonthly,
} from "@/lib/pricing";
import { getCheckoutPlan } from "@/lib/checkout-plans";

describe("CT practice pack billing", () => {
  it("charges the CT practice pack yearly, not monthly", () => {
    const pack = getCheckoutPlan("ct600:CT practice pack");
    expect(pack?.interval).toBe("year");
    expect(pack?.amountPence).toBe(35000);
  });
});

function allInclusive(clients: number) {
  return customPlanAmountPounds({
    modules: CUSTOM_PLAN_MODULES.map((m) => ({
      id: m.id,
      clients,
    })),
  });
}

describe("enterprise volume pricing", () => {
  it("starts at 11 clients per module (above Small Firm)", () => {
    expect(CUSTOM_PLAN_MIN_CLIENTS).toBe(11);
    expect(CUSTOM_PLAN_MIN_CLIENTS).toBeGreaterThan(PRACTICE_PLAN_CLIENT_LIMIT);
  });

  it("keeps Enterprise CT-only above a 12-month amortisation of the yearly CT pack", () => {
    // CT practice pack is £350/year → floor uses 350/12
    const monthlyFloor =
      ENTERPRISE_MODULE_PACK_FLOORS.corporation_tax.packPricePounds *
      ENTERPRISE_PACK_FLOOR_RATIO;
    const enterpriseMonthly = customModuleAmountPounds("corporation_tax", 15);
    expect(enterpriseMonthly).toBeGreaterThanOrEqual(Math.floor(monthlyFloor));
    expect(enterpriseMonthly * 12).toBeGreaterThanOrEqual(
      Math.round(350 * ENTERPRISE_PACK_FLOOR_RATIO),
    );
  });

  it("stays under £5000 at 1000 clients per module", () => {
    expect(allInclusive(ENTERPRISE_VOLUME_ANCHOR_CLIENTS)).toBeLessThan(5000);
  });

  it("gets cheaper per client as volume grows past the pack floor band", () => {
    const at15 = allInclusive(15) / 15;
    const at200 = allInclusive(200) / 200;
    const at500 = allInclusive(500) / 500;
    expect(at200).toBeLessThan(at15);
    expect(at500).toBeLessThan(at200);
  });

  it("encodes client counts in the plan key", () => {
    expect(
      customPlanKey({
        modules: [
          { id: "vat", clients: 11 },
          { id: "payroll", clients: 15 },
        ],
      }),
    ).toBe("practice:Custom:payroll:15+vat:11");
  });
});

describe("yearly desk billing (15% off)", () => {
  it("charges about 10.2 months — almost 2 months free", () => {
    expect(yearlyAmountPoundsFromMonthly(79)).toBe(806);
    expect(yearlySavingsPoundsFromMonthly(79)).toBe(79 * 12 - 806);
    expect(yearlyAmountPoundsFromMonthly(29)).toBe(296);
  });

  it("resolves yearly Solo / Small Firm / Enterprise checkout plans", () => {
    const solo = getCheckoutPlan("practice:Solo:yearly");
    expect(solo?.interval).toBe("year");
    expect(solo?.amountPence).toBe(29600);

    const practice = getCheckoutPlan("practice:Practice:yearly");
    expect(practice?.interval).toBe("year");
    expect(practice?.amountPence).toBe(80600);
    expect(practice?.name).toContain("Small Firm");

    const customMonthly = customPlanAmountPounds({
      modules: [{ id: "vat", clients: 11 }],
    });
    const custom = getCheckoutPlan("practice:Custom:vat:11:yearly");
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
      parseCustomPlanSelection("practice:Custom:vat:11+payroll:15:yearly"),
    ).toEqual({
      modules: [
        { id: "vat", clients: 11 },
        { id: "payroll", clients: 15 },
      ],
    });
  });

  it("raises sub-minimum Enterprise client counts to 11", () => {
    expect(
      parseCustomPlanSelection("practice:Custom:vat:5+payroll:1"),
    ).toEqual({
      modules: [
        { id: "vat", clients: 11 },
        { id: "payroll", clients: 11 },
      ],
    });
  });
});
