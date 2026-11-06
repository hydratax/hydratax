import { describe, expect, it } from "vitest";
import {
  displayPersonName,
  mergeTaxpayerRoles,
  normalizePersonName,
  personCompanySummary,
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
