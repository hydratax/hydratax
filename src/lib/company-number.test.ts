import { describe, expect, it } from "vitest";
import { looksLikeCompanyNumber } from "@/lib/company-number";

describe("looksLikeCompanyNumber", () => {
  it("accepts numeric and prefixed UK numbers", () => {
    expect(looksLikeCompanyNumber("01234567")).toBe(true);
    expect(looksLikeCompanyNumber("12345678")).toBe(true);
    expect(looksLikeCompanyNumber("SC123456")).toBe(true);
    expect(looksLikeCompanyNumber("ni654321")).toBe(true);
  });

  it("rejects company-name style text", () => {
    expect(looksLikeCompanyNumber("tassests")).toBe(false);
    expect(looksLikeCompanyNumber("HYDRATAX LTD")).toBe(false);
    expect(looksLikeCompanyNumber("ABC")).toBe(false);
  });
});
