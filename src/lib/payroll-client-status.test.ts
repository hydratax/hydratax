import { describe, expect, it } from "vitest";
import {
  derivePayrollClientSummary,
  isPayrollGenerated,
  isPayrollRtiSubmitted,
  matchesPayrollFilter,
} from "./payroll-client-status";

describe("payroll client status", () => {
  it("treats ready without correlation as generated", () => {
    const run = { status: "ready", kind: "FPS", payFrequency: "M1" };
    expect(isPayrollGenerated(run)).toBe(true);
    expect(isPayrollRtiSubmitted(run)).toBe(false);
  });

  it("treats accepted and DEMO-SEED as submitted", () => {
    expect(
      isPayrollRtiSubmitted({ status: "accepted", kind: "FPS" }),
    ).toBe(true);
    expect(
      isPayrollRtiSubmitted({
        status: "ready",
        kind: "FPS",
        hmrcCorrelationId: "DEMO-SEED-2026-03-31",
      }),
    ).toBe(true);
  });

  it("derives card summary from latest FPS", () => {
    const summary = derivePayrollClientSummary(
      [
        {
          payDate: "2026-03-31",
          periodStart: "2026-03-01",
          periodEnd: "2026-03-31",
          status: "ready",
          kind: "FPS",
          payFrequency: "M1",
        },
        {
          payDate: "2026-02-28",
          status: "accepted",
          kind: "FPS",
          payFrequency: "M1",
          hmrcCorrelationId: "DEMO-SEED-2026-02-28",
        },
      ],
      ["M1"],
    );
    expect(summary.status).toBe("generated");
    expect(summary.payFrequency).toBe("M1");
    expect(summary.latestPayDate).toBe("2026-03-31");
  });

  it("filters by workflow and frequency", () => {
    const weekly = derivePayrollClientSummary(
      [],
      ["W1", "W1", "M1"],
    );
    expect(weekly.status).toBe("not_started");
    expect(weekly.payFrequency).toBe("W1");
    expect(matchesPayrollFilter(weekly, "weekly")).toBe(true);
    expect(matchesPayrollFilter(weekly, "not_started")).toBe(true);
    expect(matchesPayrollFilter(weekly, "submitted")).toBe(false);
  });
});
