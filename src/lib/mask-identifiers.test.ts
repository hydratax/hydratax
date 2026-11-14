import { describe, expect, it } from "vitest";
import {
  maskAccountNumber,
  maskDob,
  maskEmail,
  maskNino,
  maskSortCode,
  maskUtr,
} from "@/lib/mask-identifiers";

describe("mask-identifiers", () => {
  it("masks NINO keeping prefix and suffix letters", () => {
    const m = maskNino("QQ 12 34 56 C");
    expect(m.startsWith("QQ")).toBe(true);
    expect(m.endsWith("C")).toBe(true);
    expect(m).not.toMatch(/\d/);
    expect(m).toHaveLength(9);
  });

  it("masks UTR leaving the last four digits", () => {
    const m = maskUtr("1234567890");
    expect(m.endsWith("7890")).toBe(true);
    expect(m).not.toContain("123456");
  });

  it("masks DOB to the year only", () => {
    const m = maskDob("1980-04-12");
    expect(m).toContain("1980");
    expect(m).not.toContain("04");
    expect(m).not.toContain("12");
  });

  it("masks bank details", () => {
    expect(maskAccountNumber("12345678").endsWith("5678")).toBe(true);
    expect(maskAccountNumber("12345678")).not.toContain("1234");
    expect(maskSortCode("12-34-56").endsWith("56")).toBe(true);
    expect(maskSortCode("12-34-56")).not.toContain("12");
  });

  it("masks e-mail local part", () => {
    expect(maskEmail("jonathan@example.com")).toBe("jo•••@example.com");
  });

  it("handles empty / nullish input", () => {
    for (const fn of [maskNino, maskUtr, maskDob, maskAccountNumber, maskSortCode, maskEmail]) {
      expect(fn(null)).toBe("");
      expect(fn(undefined)).toBe("");
      expect(fn("")).toBe("");
    }
  });

  it("never returns short values unmasked", () => {
    expect(maskUtr("123")).not.toContain("1");
    expect(maskNino("AB")).not.toContain("A");
  });
});
