import { describe, expect, it } from "vitest";
import {
  safeChFieldDefault,
  sanitizePublicChFormDefaults,
} from "./ch-public-form-defaults";

describe("sanitizePublicChFormDefaults", () => {
  it("strips company and client hints when signed out", () => {
    const out = sanitizePublicChFormDefaults(
      {
        company: "14633422",
        clientId: "00000000-0000-4000-8000-000000000001",
        name: "Example Ltd",
        pay: "1",
      },
      { signedIn: false },
    );
    expect(out).toEqual({ pay: "1" });
  });

  it("rejects gateway-style numeric ids masquerading as company numbers", () => {
    const out = sanitizePublicChFormDefaults(
      { company: "264814035750", name: "Example Ltd" },
      { signedIn: true },
    );
    expect(out.companyNumber).toBeUndefined();
    expect(out.currentName).toBe("Example Ltd");
  });

  it("allows valid company numbers when signed in", () => {
    const out = sanitizePublicChFormDefaults(
      { company: "14633422" },
      { signedIn: true },
    );
    expect(out.companyNumber).toBe("14633422");
  });
});

describe("safeChFieldDefault", () => {
  it("never returns auth codes from defaults", () => {
    expect(
      safeChFieldDefault("companyAuthCode", {
        companyAuthCode: "SECRET12",
      }),
    ).toBe("");
  });

  it("rejects invalid company numbers", () => {
    expect(
      safeChFieldDefault("companyNumber", {
        companyNumber: "264814035750",
      }),
    ).toBe("");
  });
});
