import { describe, expect, it } from "vitest";
import {
  matchSaPersonToPayeEmployee,
  normalizeAddress,
  normalizeDob,
  normalizeNino,
  saTaxYearToPayrollYear,
} from "./sa-paye-match";

describe("sa-paye-match", () => {
  it("normalises NINO", () => {
    expect(normalizeNino("ab 12 34 56 c")).toBe("AB123456C");
  });

  it("normalises DOB", () => {
    expect(normalizeDob("1990-05-01")).toBe("1990-05-01");
    expect(normalizeDob("1/5/1990")).toBe("1990-05-01");
  });

  it("normalises address", () => {
    expect(normalizeAddress("1 High Street,\nLondon, UK")).toBe(
      "1 high street london",
    );
  });

  it("requires all three identity checks", () => {
    const person = {
      nino: "AB123456C",
      dateOfBirth: "1990-05-01",
      address: "1 High Street London",
    };
    expect(
      matchSaPersonToPayeEmployee(person, {
        nino: "AB123456C",
        dateOfBirth: "1990-05-01",
        address: "1 High Street, London, UK",
      }).matched,
    ).toBe(true);

    expect(
      matchSaPersonToPayeEmployee(person, {
        nino: "AB123456C",
        dateOfBirth: "1990-05-02",
        address: "1 High Street London",
      }).failed,
    ).toContain("dateOfBirth");

    expect(
      matchSaPersonToPayeEmployee(person, {
        nino: "AB123456C",
        dateOfBirth: "1990-05-01",
        address: "",
      }).matched,
    ).toBe(false);
  });

  it("maps SA year to payroll short year", () => {
    expect(saTaxYearToPayrollYear("2025-26")).toBe("25-26");
  });
});
