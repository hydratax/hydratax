import { describe, expect, it } from "vitest";
import {
  collapseSubscriptionSummaries,
  featuresForPlanKey,
  statusLabel,
} from "./subscription-features";

describe("featuresForPlanKey", () => {
  it("returns Small Firm desk marketing features", () => {
    const r = featuresForPlanKey("practice:Practice");
    expect(r.label).toContain("Small Firm");
    expect(r.features.some((f) => /trial/i.test(f))).toBe(true);
    expect(r.features.some((f) => /free submissions/i.test(f))).toBe(false);
    expect(r.features).toContain("Prepare during trial");
    expect(r.features.length).toBeGreaterThan(3);
  });

  it("collapses multiple Companies House purchase rows", () => {
    const collapsed = collapseSubscriptionSummaries([
      {
        planKey: "companies-house:cs01",
        label: "Companies House filings",
        status: "active",
        features: ["Paid Companies House filing credit"],
        trialEndsAt: null,
        stripeSubscriptionId: null,
      },
      {
        planKey: "companies-house:accounts",
        label: "Companies House filings",
        status: "active",
        features: ["Paid Companies House filing credit"],
        trialEndsAt: null,
        stripeSubscriptionId: null,
      },
      {
        planKey: "practice:Practice",
        label: "Practice desk — Small Firm",
        status: "trialing",
        features: ["7-day free trial"],
        trialEndsAt: null,
        stripeSubscriptionId: null,
      },
    ]);
    expect(collapsed).toHaveLength(2);
    const ch = collapsed.find((r) => r.planKey === "companies-house:credits");
    expect(ch?.features[0]).toMatch(/2 paid/i);
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

  it("labels canceling during trial with access-until date", () => {
    const ends = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(statusLabel("canceling", ends)).toMatch(/access until/i);
  });
});
