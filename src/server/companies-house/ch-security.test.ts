import { describe, expect, it } from "vitest";
import { parseCompanyNumberStrict } from "@/lib/company-number";
import { maskEmail, safeErr } from "@/lib/redact";
import { assertCompaniesHouseUrl } from "./api";

describe("parseCompanyNumberStrict", () => {
  it("normalises valid numbers", () => {
    expect(parseCompanyNumberStrict("12345678")).toBe("12345678");
    expect(parseCompanyNumberStrict("1234567")).toBe("01234567");
    expect(parseCompanyNumberStrict(" sc123456 ")).toBe("SC123456");
  });
  it("rejects traversal, separators, wrong length and empties", () => {
    for (const bad of ["../../etc/passwd", "1234567/..", "123456789", "AB", "", null, undefined, "12345678?x=1", "12345678#"]) {
      expect(parseCompanyNumberStrict(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });
});

describe("assertCompaniesHouseUrl (SSRF guard)", () => {
  it("allows official CH hosts over https", () => {
    expect(() =>
      assertCompaniesHouseUrl("https://document-api.company-information.service.gov.uk/document/abc/content"),
    ).not.toThrow();
  });
  it("allows S3 only when explicitly enabled", () => {
    const s3 = "https://ch-docs.s3.eu-west-1.amazonaws.com/x?X-Amz-Signature=1";
    expect(() => assertCompaniesHouseUrl(s3)).toThrow();
    expect(() => assertCompaniesHouseUrl(s3, { allowS3: true })).not.toThrow();
  });
  it("blocks internal / lookalike / non-https / credentialed URLs", () => {
    for (const bad of [
      "http://document-api.company-information.service.gov.uk/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://document-api.company-information.service.gov.uk.evil.example/x",
      "https://evil.example/document-api.company-information.service.gov.uk",
      "https://user:pw@document-api.company-information.service.gov.uk/x",
      "https://document-api.company-information.service.gov.uk:8443/x",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(() => assertCompaniesHouseUrl(bad, { allowS3: true }), bad).toThrow();
    }
  });
});

describe("log redaction", () => {
  it("masks emails", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
  });
  it("safeErr hides emails, bearer tokens, NINO/UTR and long secrets", () => {
    const out = safeErr(
      new Error(
        "failed for bob@example.com Bearer abc.def-ghi NINO QQ123456C utr 1234567890 key fake_payment_secret_abcdefghijklmnopqrstuvwx",
      ),
    );
    expect(out).not.toContain("bob@example.com");
    expect(out).not.toContain("abc.def-ghi");
    expect(out).not.toContain("QQ123456C");
    expect(out).not.toContain("1234567890");
    expect(out).not.toContain("fake_payment_secret_abcdefghijklmnopqrstuvwx");
  });
  it("safeErr never serialises arbitrary objects", () => {
    expect(safeErr({ secret: "hunter2", message: "boom" })).toBe("Error: boom");
    expect(safeErr(undefined)).toBe("Error");
  });
});
