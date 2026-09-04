import { describe, expect, it } from "vitest";
import { getChService } from "@/lib/ch-services";
import { companyAuthCodeSchema } from "@/server/companies-house/filing/personal-codes";

describe("Companies House request validation (client-side rules)", () => {
  it("change-of-name requires company number, auth code, current and new name", () => {
    const service = getChService("change-of-name");
    expect(service).toBeDefined();
    const required = service!.formFields.filter((f) => f.required).map((f) => f.name);
    expect(required).toEqual(
      expect.arrayContaining([
        "companyNumber",
        "companyAuthCode",
        "currentName",
        "newName",
        "resolutionAck",
      ]),
    );
  });

  it("rejects invalid company authentication codes", () => {
    expect(companyAuthCodeSchema.safeParse("abc").success).toBe(false);
    expect(companyAuthCodeSchema.safeParse("FRUGC2").success).toBe(true);
    expect(companyAuthCodeSchema.safeParse("123456").success).toBe(true);
  });

  it("accounts-ixbrl is a separate service from change-of-name", () => {
    const accounts = getChService("accounts-ixbrl");
    const rename = getChService("change-of-name");
    expect(accounts?.id).toBe("accounts-ixbrl");
    expect(rename?.id).toBe("change-of-name");
    expect(accounts?.formFields.some((f) => f.name === "newName")).toBe(false);
  });
});
