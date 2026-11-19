import { describe, expect, it } from "vitest";
import { deriveCtClientSummary, matchesCtFilter } from "./ct-client-status";

describe("ct client status", () => {
  it("maps CT600 ready to Ready to file", () => {
    const summary = deriveCtClientSummary({
      returns: [
        {
          status: "ready",
          periodStart: "2025-04-01",
          periodEnd: "2026-03-31",
        },
      ],
    });
    expect(summary.status).toBe("ready");
    expect(matchesCtFilter(summary, "ready")).toBe(true);
  });

  it("marks accepted returns as filed", () => {
    const summary = deriveCtClientSummary({
      returns: [
        {
          status: "accepted",
          periodStart: "2024-04-01",
          periodEnd: "2025-03-31",
        },
      ],
    });
    expect(summary.status).toBe("accepted");
    expect(summary.filed).toBe(true);
  });
});
