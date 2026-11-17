import { describe, expect, it } from "vitest";
import {
  defaultDocumentPasswordPolicy,
  normalizeDocumentPasswordPolicy,
  resolveDocumentPassword,
} from "@/lib/document-password-policy";

describe("document-password-policy", () => {
  it("defaults SA/letters to DOB and CT/accounts to company UTR", () => {
    const d = defaultDocumentPasswordPolicy();
    expect(d.sa).toBe("date_of_birth");
    expect(d.letters).toBe("date_of_birth");
    expect(d.ct).toBe("company_utr");
    expect(d.accounts).toBe("company_utr");
    expect(d.invoices).toBe("none");
  });

  it("normalises unknown keys safely", () => {
    const p = normalizeDocumentPasswordPolicy({
      sa: "company_utr",
      ct: "not-a-real-option",
    });
    expect(p.sa).toBe("company_utr");
    expect(p.ct).toBe("company_utr");
  });

  it("resolves DOB and company UTR passwords", () => {
    expect(
      resolveDocumentPassword("date_of_birth", {
        dateOfBirth: "1988-04-15",
      }),
    ).toMatchObject({ locked: true, password: "15041988" });

    expect(
      resolveDocumentPassword("company_utr", {
        companyUtr: "12345 67890",
      }),
    ).toMatchObject({ locked: true, password: "1234567890" });

    expect(resolveDocumentPassword("none", {})).toEqual({ locked: false });
  });
});
