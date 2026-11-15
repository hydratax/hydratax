import { describe, expect, it } from "vitest";
import { getCheckoutPlan } from "@/lib/checkout-plans";
import { entitlementsForPlans } from "@/lib/entitlements";
import {
  secretarialMonthlyPounds,
  secretarialScalePlanKey,
  secretarialStarterPlanKey,
} from "@/lib/company-secretarial";

describe("company secretarial banded pricing", () => {
  it("charges £5 for 1–10 companies", () => {
    expect(secretarialMonthlyPounds(1)).toBe(5);
    expect(secretarialMonthlyPounds(10)).toBe(5);
  });

  it("scales £5 per band of 10 above that", () => {
    expect(secretarialMonthlyPounds(11)).toBe(10);
    expect(secretarialMonthlyPounds(20)).toBe(10);
    expect(secretarialMonthlyPounds(25)).toBe(15);
    expect(secretarialMonthlyPounds(100)).toBe(50);
  });

  it("resolves starter and scale checkout plans", () => {
    const starter = getCheckoutPlan(secretarialStarterPlanKey());
    expect(starter?.amountPence).toBe(500);
    expect(starter?.interval).toBe("month");

    const scale = getCheckoutPlan(secretarialScalePlanKey(25));
    expect(scale?.amountPence).toBe(1500);
    expect(scale?.key).toBe("company-secretarial:Scale:25");
  });

  it("unlocks the company_secretarial module from plan keys", () => {
    const starter = entitlementsForPlans([secretarialStarterPlanKey()]);
    expect(starter.modules.has("company_secretarial")).toBe(true);
    expect(starter.maxSecretarialCompanies).toBe(10);

    const scale = entitlementsForPlans([secretarialScalePlanKey(40)]);
    expect(scale.modules.has("company_secretarial")).toBe(true);
    expect(scale.maxSecretarialCompanies).toBe(40);

    const practice = entitlementsForPlans(["practice:Practice"]);
    expect(practice.modules.has("company_secretarial")).toBe(true);
  });
});
