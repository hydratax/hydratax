import { describe, expect, it } from "vitest";
import { ownershipNatures } from "./incorporation-schema";
import { buildCompanyIncorporationXml } from "./incorporation-xml";
import type { ParsedIncorporationInput } from "./incorporation-schema";

const sample: ParsedIncorporationInput = {
  companyName: "Example Trading Ltd",
  countryOfIncorporation: "EW",
  registeredOffice: {
    premise: "1",
    street: "High Street",
    thoroughfare: "",
    postTown: "London",
    county: "",
    postcode: "EC1A 1BB",
    country: "GBR",
  },
  registeredEmail: "directors@example.com",
  sicCodes: ["62012"],
  shareClass: "Ordinary",
  shareCurrency: "GBP",
  nominalValue: 1,
  amountPaidPerShare: 1,
  directors: [
    {
      forename: "Alex",
      surname: "Example",
      dateOfBirth: "1990-01-15",
      nationality: "British",
      countryOfResidence: "United Kingdom",
      personalCode: "ABC12345678",
      serviceAddressSameAsRo: true,
      residentialAddress: {
        premise: "1",
        street: "High Street",
        thoroughfare: "",
        postTown: "London",
        county: "",
        postcode: "EC1A 1BB",
        country: "GBR",
      },
      isSubscriber: true,
      shares: 100,
    },
  ],
  subscribers: [
    {
      forename: "Alex",
      surname: "Example",
      address: {
        premise: "1",
        street: "High Street",
        thoroughfare: "",
        postTown: "London",
        county: "",
        postcode: "EC1A 1BB",
        country: "GBR",
      },
      shares: 100,
      personalCode: "ABC12345678",
      dateOfBirth: "1990-01-15",
      nationality: "British",
      countryOfResidence: "United Kingdom",
      residentialAddress: {
        premise: "1",
        street: "High Street",
        thoroughfare: "",
        postTown: "London",
        county: "",
        postcode: "EC1A 1BB",
        country: "GBR",
      },
      isPsc: true,
    },
  ],
  sameDay: false,
  lawfulPurposeConfirmed: true,
  personalCodesConfirmed: true,
  authoriserForename: "Alex",
  authoriserSurname: "Example",
};

describe("ownershipNatures", () => {
  it("maps share percentages to CH nature codes", () => {
    expect(ownershipNatures(100)).toContain(
      "OWNERSHIPOFSHARES_75TO100PERCENT",
    );
    expect(ownershipNatures(60)[0]).toBe("OWNERSHIPOFSHARES_50TO75PERCENT");
    expect(ownershipNatures(30)[0]).toBe("OWNERSHIPOFSHARES_25TO50PERCENT");
    expect(ownershipNatures(20)).toEqual([]);
  });
});

describe("buildCompanyIncorporationXml", () => {
  it("builds a CompanyIncorporation GovTalk envelope", () => {
    const { xml, submissionNumber } = buildCompanyIncorporationXml(sample);
    expect(submissionNumber).toHaveLength(6);
    expect(xml).toContain("<Class>CompanyIncorporation</Class>");
    expect(xml).toContain("<FormIdentifier>CompanyIncorporation</FormIdentifier>");
    expect(xml).toContain("<CompanyType>BYSHR</CompanyType>");
    expect(xml).toContain("<Articles>BYSHRMODEL</Articles>");
    expect(xml).toContain("ABC12345678");
    expect(xml).toContain("OWNERSHIPOFSHARES_75TO100PERCENT");
    expect(xml).toContain("<RegisteredEmailAddress>directors@example.com</RegisteredEmailAddress>");
  });
});
