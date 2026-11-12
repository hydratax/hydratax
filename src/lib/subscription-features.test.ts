import { describe, expect, it } from "vitest";
import {
  featuresForPlanKey,
  statusLabel,
} from "./subscription-features";

describe("featuresForPlanKey", () => {
  it("returns Small Firm desk marketing features", () => {
    const r = featuresForPlanKey("practice:Practice");
    expect(r.label).toContain("Small Firm");
    expect(r.features.some((f) => /trial/i.test(f))).toBe(true);
    expect(r.features.length).toBeGreaterThan(3);
  });

  it("summarises Custom module selections", () => {
    const r = featuresForPlanKey("practice:Custom:vat:10+payroll:5");
    expect(r.label).toBe("Enterprise");
    expect(r.features.some((f) => /VAT/i.test(f))).toBe(true);
  });

  it("summarises yearly Custom modules", () => {
    const r = featuresForPlanKey("practice:Custom:vat:10:yearly");
    expect(r.label).toBe("Enterprise");
    expect(r.features.some((f) => /yearly|15%/i.test(f))).toBe(true);
  });
});

describe("statusLabel", () => {
  it("labels trial and active", () => {
    expect(statusLabel("active")).toBe("Active");
    expect(statusLabel("trialing")).toMatch(/trial/i);
  });
});
