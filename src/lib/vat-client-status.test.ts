import { describe, expect, it } from "vitest";
import {
  deriveVatClientSummary,
  matchesVatFilter,
  vatStatusLabel,
} from "./vat-client-status";

describe("vat client status", () => {
  it("maps draft return to Drafted", () => {
    const summary = deriveVatClientSummary({
      returns: [{ status: "draft", periodKey: "26A1", periodEnd: "2026-03-31" }],
    });
    expect(summary.status).toBe("drafted");
    expect(vatStatusLabel(summary.status)).toBe("Drafted");
    expect(matchesVatFilter(summary, "drafted")).toBe(true);
  });

  it("prefers approved over submitted", () => {
    const summary = deriveVatClientSummary({
      returns: [{ status: "submitted", periodKey: "26A1" }],
      portal: { approveVat: true },
    });
    expect(summary.status).toBe("approved");
  });

  it("treats portal pack / vat email as Emailed", () => {
    const summary = deriveVatClientSummary({
      returns: [{ status: "ready" }],
      workLog: [{ kind: "email", label: "bulk_vat_reminder" }],
    });
    expect(summary.status).toBe("emailed");
  });
});
