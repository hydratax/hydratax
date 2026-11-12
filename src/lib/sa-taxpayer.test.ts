import { describe, expect, it } from "vitest";
import {
  displayPersonName,
  mergeTaxpayerRoles,
  normalizePersonName,
  personCompanySummary,
  personKeyFromParam,
  personKeySlug,
} from "./sa-taxpayer";

describe("normalizePersonName", () => {
  it("matches CH officer and PSC spellings of the same person", () => {
    expect(normalizePersonName("JAVED, Muhammad Usama")).toBe(
      normalizePersonName("Mr Muhammad Usama Javed"),
    );
    expect(normalizePersonName("MINHAS, Raja Haris Aziz")).toBe(
      normalizePersonName("Mr Raja Haris Aziz Minhas"),
    );
  });
});

describe("personKeySlug", () => {
  it("uses hyphens so SA URLs have no spaces", () => {
    expect(personKeySlug("E Rabbani Zill")).toBe("e-rabbani-zill");
    expect(personKeyFromParam("e-rabbani-zill")).toBe("e rabbani zill");
    expect(personKeyFromParam("e%20rabbani%20zill")).toBe("e rabbani zill");
  });
});

describe("displayPersonName", () => {
  it("converts surname-first CH names to forename surname", () => {
    expect(displayPersonName("JAVED, Muhammad Usama")).toBe(
      "Muhammad Usama Javed",
    );
  });
});

describe("mergeTaxpayerRoles", () => {
  it("promotes director + shareholder to director_shareholder", () => {
    expect(mergeTaxpayerRoles("director", "shareholder")).toBe(
      "director_shareholder",
    );
  });
});

describe("personCompanySummary", () => {
  it("states director and shareholder company counts", () => {
    expect(
      personCompanySummary({
        directorOf: 1,
        shareholderOf: 1,
        companyCount: 1,
      }),
    ).toBe("Director of 1 company · Shareholder of 1 company");
  });
});

describe("roleFromCompanyLinks", () => {
  it("keeps shareholder-only when not a director", async () => {
    const { roleFromCompanyLinks } = await import("./sa-taxpayer");
    expect(
      roleFromCompanyLinks({ directorOf: 0, shareholderOf: 1 }),
    ).toBe("shareholder");
  });
});
