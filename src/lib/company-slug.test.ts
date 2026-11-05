import { describe, expect, it } from "vitest";
import {
  companyNumberFromSlug,
  companyProfilePath,
  companyProfileSlug,
} from "./company-slug";
import { companyProfileFacts, daysUntil } from "./company-profile-facts";

describe("company profile slug", () => {
  it("builds a name-and-number path", () => {
    expect(companyProfileSlug("HYDRA RETAIL LTD", "14806369")).toBe(
      "hydra-retail-ltd-14806369",
    );
    expect(companyProfilePath("HYDRA RETAIL LTD", "14806369")).toBe(
      "/company/hydra-retail-ltd-14806369",
    );
  });

  it("reads the company number back out of the slug", () => {
    expect(companyNumberFromSlug("hydra-retail-ltd-14806369")).toBe("14806369");
    expect(companyNumberFromSlug("14806369")).toBe("14806369");
    expect(companyNumberFromSlug("not-a-company")).toBeNull();
  });
});

describe("company profile facts", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("uses Companies House dates for accounts, confirmation statement, and CT600", () => {
    const facts = companyProfileFacts(
      {
        company_number: "14806369",
        company_name: "HYDRA RETAIL LTD",
        company_status: "active",
        date_of_creation: "2023-04-16",
        sic_codes: ["45112"],
        registered_office_address: { locality: "Barking" },
        accounts: {
          next_due: "2028-01-31",
          next_accounts: { due_on: "2028-01-31", period_end_on: "2027-04-30" },
          last_accounts: { made_up_to: "2026-04-30" },
        },
        confirmation_statement: { next_made_up_to: "2027-04-29" },
      },
      now,
    );

    expect(facts.ageYears).toBe(3);
    expect(facts.location).toBe("Barking");
    expect(facts.sic).toBe("45112");
    expect(facts.accountsDue).toBe("2028-01-31");
    expect(facts.ct600Due).toBe("2028-04-30");
    expect(facts.confirmationDate).toBe("2027-04-29");
    expect(daysUntil(facts.accountsDue, now)).toBe(456);
  });
});
