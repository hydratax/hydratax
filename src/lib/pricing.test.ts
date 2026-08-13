import { describe, expect, it } from "vitest";
import {
  CUSTOM_PLAN_MODULES,
  CUSTOM_VS_PRACTICE_RATIO,
  PRACTICE_PLAN_CLIENT_LIMIT,
  PRACTICE_PLAN_PRICE_POUNDS,
  customPlanAmountPounds,
  practiceScaledCeilingPounds,
} from "@/lib/pricing";

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

  it("stays cheaper than Practice at 50 clients all-inclusive", () => {
    const custom = allInclusive(PRACTICE_PLAN_CLIENT_LIMIT);
    expect(custom).toBeLessThan(PRACTICE_PLAN_PRICE_POUNDS);
    expect(custom).toBeLessThanOrEqual(
      Math.round(PRACTICE_PLAN_PRICE_POUNDS * CUSTOM_VS_PRACTICE_RATIO),
    );
  });

  it("stays under Practice-scaled £790 at 500 clients all-inclusive", () => {
    const custom = allInclusive(500);
    const practiceScaled = practiceScaledCeilingPounds(500);
    expect(practiceScaled).toBe(790);
    expect(custom).toBeLessThan(practiceScaled);
    expect(custom).toBeLessThanOrEqual(
      Math.round(practiceScaled * CUSTOM_VS_PRACTICE_RATIO),
    );
  });

  it("gets cheaper per client as volume grows", () => {
    const at1 = allInclusive(1) / 1;
    const at50 = allInclusive(50) / 50;
    const at500 = allInclusive(500) / 500;
    expect(at50).toBeLessThan(at1);
    expect(at500).toBeLessThan(at1);
    expect(at500).toBeLessThan(practiceScaledCeilingPounds(500) / 500);
  });
});
