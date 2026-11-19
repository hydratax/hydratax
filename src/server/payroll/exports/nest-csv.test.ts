import { describe, expect, it } from "vitest";
import { buildNestContributionsCsv } from "./nest-csv";

describe("NEST CSV", () => {
  it("emits header and contribution rows in pence-safe pounds", () => {
    const csv = buildNestContributionsCsv([
      {
        nino: "AB 12 34 56 C",
        forename: "Sam",
        surname: "Taylor",
        payDate: "2026-08-28",
        employeeContributionPence: 12_345,
        employerContributionPence: 7_890,
        pensionablePayPence: 250_000,
      },
    ]);
    expect(csv).toContain("Member ID,NI Number,Forename,Surname");
    expect(csv).toContain("AB123456C");
    expect(csv).toContain("123.45");
    expect(csv).toContain("78.90");
    expect(csv).toContain("2500.00");
  });
});
