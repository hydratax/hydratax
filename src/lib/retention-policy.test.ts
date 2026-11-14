import { describe, expect, it } from "vitest";
import {
  LAWFUL_BASIS_LABEL,
  RETENTION_DAYS,
  RETENTION_POLICY,
  getRetentionCategory,
  retentionSummaryRows,
} from "@/lib/retention-policy";

describe("retention policy consistency", () => {
  it("has unique ids", () => {
    const ids = RETENTION_POLICY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(RETENTION_POLICY.map((c) => [c.id, c] as const))(
    "%s has purpose, lawful basis, retention and erasure behaviour",
    (_id, c) => {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.purpose.length).toBeGreaterThan(10);
      expect(c.lawfulBasis.length).toBeGreaterThan(0);
      for (const b of c.lawfulBasis) expect(LAWFUL_BASIS_LABEL[b]).toBeTruthy();
      expect(c.retention.description.length).toBeGreaterThan(5);
      // Either a concrete period or an explicit trigger for the clock.
      expect(c.retention.days !== null || c.retention.trigger.length > 3).toBe(true);
      if (c.retention.days !== null) {
        expect(Number.isInteger(c.retention.days)).toBe(true);
        expect(c.retention.days).toBeGreaterThan(0);
      }
      expect(c.erasure).toBeTruthy();
      expect(c.erasureNotes.length).toBeGreaterThan(5);
      expect(c.stores.length).toBeGreaterThan(0);
      expect(c.dataTypes.length).toBeGreaterThan(0);
    },
  );

  it("processor categories rely on the controller's instruction", () => {
    for (const c of RETENTION_POLICY.filter((c) => c.role === "processor")) {
      const basis = c.lawfulBasis;
      // audit evidence also carries our own legal-obligation basis
      expect(basis).toContain("controller_instruction");
    }
  });

  it("controller categories never use controller_instruction alone", () => {
    for (const c of RETENTION_POLICY.filter((c) => c.role === "controller")) {
      const own = c.lawfulBasis.filter((b) => b !== "controller_instruction");
      expect(own.length).toBeGreaterThan(0);
    }
  });

  it("only cites authoritative https sources", () => {
    const allowed =
      /^https:\/\/(www\.gov\.uk|www\.legislation\.gov\.uk|ico\.org\.uk|developer\.service\.hmrc\.gov\.uk)\//;
    for (const c of RETENTION_POLICY) {
      for (const u of c.sourceUrls) expect(u).toMatch(allowed);
    }
  });

  it("statutory-record categories cite a source", () => {
    for (const id of ["billing_records", "payroll_data", "filing_records", "audit_events"]) {
      expect(getRetentionCategory(id)?.sourceUrls.length).toBeGreaterThan(0);
    }
  });

  it("matches the statutory figures we publish", () => {
    // PAYE 3 years (GOV.UK paye-for-employers/keeping-records)
    expect(getRetentionCategory("payroll_data")?.retention.days).toBe(3 * 365);
    // Companies / VAT records 6 years
    expect(getRetentionCategory("filing_records")?.retention.days).toBe(6 * 365);
  });

  it("RETENTION_DAYS are positive integers", () => {
    for (const [k, v] of Object.entries(RETENTION_DAYS)) {
      expect(Number.isInteger(v), k).toBe(true);
      expect(v, k).toBeGreaterThan(0);
    }
  });

  it("summary rows cover every category", () => {
    expect(retentionSummaryRows()).toHaveLength(RETENTION_POLICY.length);
  });
});
