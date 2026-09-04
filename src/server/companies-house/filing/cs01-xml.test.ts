import { describe, expect, it } from "vitest";
import { buildCs01FormBody } from "./cs01-xml";
import { buildConfirmationStatementXml } from "./xml-gateway";
import { redactChGatewayXml } from "./ch-xml-log";
import type { ParsedCsFilingInput } from "./personal-codes";

const sampleInput: ParsedCsFilingInput = {
  companyNumber: "15855034",
  companyName: "GLAM BY YUMNA LTD",
  confirmationDate: "2026-07-22",
  companyAuthCode: "TESTAUTH1",
  registeredEmail: "directors@example.com",
  lawfulPurposeConfirmed: true,
  sicCodes: ["96090"],
  statementOfCapital: {
    shareCurrency: "GBP",
    totalAmountUnpaid: 0,
    totalNumberOfIssuedShares: 1,
    totalAggregateNominalValue: 1,
    shares: [
      {
        shareClass: "Ordinary",
        prescribedParticulars: "Voting rights",
        numShares: 1,
        aggregateNominalValue: 1,
      },
    ],
  },
  directors: [
    {
      fullName: "ALI, Yumna",
      dateOfBirth: "1997-08-13",
      personalCode: "X4PSFHL2223",
    },
  ],
  clientId: "",
  practiceId: "",
};

describe("buildCs01FormBody", () => {
  it("includes ECCTA fields, SIC codes, and statement of capital in schema order", () => {
    const body = buildCs01FormBody(sampleInput);
    expect(body).toContain("ConfirmationAndVerificationStatement");
    expect(body).toContain("<ReviewDate>2026-07-22</ReviewDate>");
    expect(body).toContain("<SICCode>96090</SICCode>");
    expect(body).toContain("<StatementOfCapital>");
    expect(body).toContain("<RegisteredEmailAddress>directors@example.com</RegisteredEmailAddress>");
    expect(body).toContain("<AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>");
    expect(body).toContain("<StateConfirmation>true</StateConfirmation>");
    expect(body).toContain("<CompaniesHousePersonalCode>X4PSFHL2223</CompaniesHousePersonalCode>");

    const reviewIdx = body.indexOf("<ReviewDate>");
    const sicIdx = body.indexOf("<SICCodes>");
    const capitalIdx = body.indexOf("<StatementOfCapital>");
    const emailIdx = body.indexOf("<RegisteredEmailAddress>");
    const lawfulIdx = body.indexOf("<AcceptLawfulPurposeStatement>");
    const stateIdx = body.indexOf("<StateConfirmation>");
    const verifyIdx = body.indexOf("<VerificationStatement>");
    expect(reviewIdx).toBeLessThan(sicIdx);
    expect(sicIdx).toBeLessThan(capitalIdx);
    expect(capitalIdx).toBeLessThan(emailIdx);
    expect(emailIdx).toBeLessThan(lawfulIdx);
    expect(lawfulIdx).toBeLessThan(stateIdx);
    expect(stateIdx).toBeLessThan(verifyIdx);
  });
});

describe("buildConfirmationStatementXml", () => {
  it("wraps the form in a populated GovTalk Body with presenter clear auth", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";

    const xml = buildConfirmationStatementXml(sampleInput);
    expect(xml).toContain("<Body>");
    expect(xml).toContain("<FormSubmission");
    expect(xml).toContain(
      "<Class>ConfirmationAndVerificationStatement</Class>",
    );
    expect(xml).toContain("<Method>clear</Method>");
    expect(xml).toContain("<SenderID>00072271000</SenderID>");
    expect(xml).not.toMatch(/<Body>\s*<\/Body>/);

    const body = xml.match(/<Body>([\s\S]*?)<\/Body>/i)?.[1] ?? "";
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain(
      "<FormIdentifier>ConfirmationAndVerificationStatement</FormIdentifier>",
    );
    expect(body).toContain("<ConfirmationAndVerificationStatement");
  });

  it("uses ConfirmationStatement class when no personal codes are present", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";

    const xml = buildConfirmationStatementXml({
      ...sampleInput,
      directors: sampleInput.directors.map(({ personalCode: _omit, ...d }) => d),
    });
    expect(xml).toContain("<Class>ConfirmationStatement</Class>");
    expect(xml).toContain(
      "<FormIdentifier>ConfirmationStatement</FormIdentifier>",
    );
    expect(xml).toContain("<ConfirmationStatement");
    expect(xml).not.toContain("ConfirmationAndVerificationStatement");
  });
});

describe("redactChGatewayXml", () => {
  it("redacts presenter auth, company auth, and personal codes", () => {
    const redacted = redactChGatewayXml(
      `<Value>secret</Value><CompanyAuthenticationCode>ABC123</CompanyAuthenticationCode><CompaniesHousePersonalCode>CODE1234567</CompaniesHousePersonalCode>`,
    );
    expect(redacted).not.toContain("secret");
    expect(redacted).toContain("[REDACTED_PRESENTER_AUTH]");
    expect(redacted).toContain("[REDACTED]");
  });
});
