import { describe, expect, it } from "vitest";
import {
  buildChangeOfNameXml,
  buildOfficerAppointmentXml,
  buildOfficerTerminationXml,
  buildPscCessationXml,
  buildPscChangeXml,
  buildPscNotificationXml,
  buildReturnOfAllotmentXml,
  buildStrikeOffApplicationXml,
} from "./company-forms-xml";

describe("company-forms-xml", () => {
  const base = {
    companyNumber: "14633422",
    companyName: "HYDRA CONSULTANCY SERVICES LTD",
    companyAuthCode: "ABC123",
  };

  it("builds change of name envelope", () => {
    const xml = buildChangeOfNameXml({
      ...base,
      newName: "NEW NAME LTD",
    });
    expect(xml).toContain("<Class>ChangeOfName</Class>");
    expect(xml).toContain("<FormIdentifier>ChangeOfName</FormIdentifier>");
    expect(xml).toContain("NEW NAME LTD");
  });

  it("builds officer appointment envelope with structured fields", () => {
    const xml = buildOfficerAppointmentXml({
      ...base,
      directorName: "Jane Smith",
      forename: "Jane",
      surname: "Smith",
      dateOfBirth: "1985-06-15",
      appointedOn: "2026-01-01",
      personalCode: "ABCD1234567",
      serviceAddress: "1 Test Street, London, SW1A 1AA",
      residentialAddress: JSON.stringify({
        premise: "1",
        street: "Test Street",
        postTown: "London",
        postcode: "SW1A 1AA",
        country: "GBR",
      }),
      serviceSameAsRegistered: false,
      nationality: "British",
      countryOfResidence: "United Kingdom",
    });
    expect(xml).toContain("<Class>OfficerAppointment</Class>");
    expect(xml).toContain("Jane");
    expect(xml).toContain("Smith");
    expect(xml).toContain("British");
  });

  it("builds officer termination envelope", () => {
    const xml = buildOfficerTerminationXml({
      ...base,
      directorName: "John Doe",
      resignedOn: "2026-02-01",
    });
    expect(xml).toContain("<Class>OfficerTermination</Class>");
    expect(xml).toContain("John");
  });

  it("builds strike-off envelope", () => {
    const xml = buildStrikeOffApplicationXml(base);
    expect(xml).toContain("<Class>StrikeOffApplication</Class>");
    expect(xml).toContain("DeclarationSigned");
  });

  it("builds PSC notification envelope", () => {
    const xml = buildPscNotificationXml({
      ...base,
      forename: "Alice",
      surname: "Owner",
      dateOfBirth: "1980-01-01",
      nationality: "British",
      countryOfResidence: "United Kingdom",
      personalCode: "ABCD1234567",
      notificationDate: "2026-03-01",
      residentialAddress: JSON.stringify({
        premise: "10",
        street: "High Street",
        postTown: "Leeds",
        postcode: "LS1 1AA",
        country: "GBR",
      }),
      naturesOfControl: ["ownership-of-shares-75-to-100-percent"],
    });
    expect(xml).toContain("<Class>PSCNotification</Class>");
    expect(xml).toContain("Alice");
    expect(xml).toContain("ownership-of-shares-75-to-100-percent");
  });

  it("builds PSC change envelope", () => {
    const xml = buildPscChangeXml({
      ...base,
      forename: "Bob",
      surname: "Shareholder",
      changeDate: "2026-03-15",
      naturesOfControl: ["voting-rights-25-to-50-percent"],
    });
    expect(xml).toContain("<Class>PSCChangeDetails</Class>");
    expect(xml).toContain("voting-rights-25-to-50-percent");
  });

  it("builds PSC cessation envelope", () => {
    const xml = buildPscCessationXml({
      ...base,
      forename: "Carol",
      surname: "Investor",
      cessationDate: "2026-04-01",
    });
    expect(xml).toContain("<Class>PSCCessation</Class>");
    expect(xml).toContain("Carol");
  });

  it("builds return of allotment envelope", () => {
    const xml = buildReturnOfAllotmentXml({
      ...base,
      allotmentDate: "2026-05-01",
      shareClass: "Ordinary",
      numShares: 100,
      nominalValue: "1.00",
      amountPaid: "1.00",
      amountUnpaid: "0.00",
      allotteeForename: "Dan",
      allotteeSurname: "Subscriber",
      allotteeAddress: JSON.stringify({
        premise: "2",
        street: "Church Lane",
        postTown: "Manchester",
        postcode: "M1 1AE",
        country: "GBR",
      }),
    });
    expect(xml).toContain("<Class>ReturnOfAllotmentShares</Class>");
    expect(xml).toContain("Ordinary");
    expect(xml).toContain("<NumShares>100</NumShares>");
  });
});
