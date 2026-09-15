import { describe, expect, it } from "vitest";
import {
  describePresenterReadiness,
  resolveChCompanyType,
} from "./presenter";
import { buildFormSubmissionEnvelope } from "./form-envelope";

describe("resolveChCompanyType", () => {
  it("maps SC / NI / numeric prefixes", () => {
    expect(resolveChCompanyType("SC123456")).toBe("SC");
    expect(resolveChCompanyType("NI123456")).toBe("NI");
    expect(resolveChCompanyType("15855034")).toBe("EW");
    expect(resolveChCompanyType("1234567")).toBe("EW");
  });
});

describe("buildFormSubmissionEnvelope presenter model", () => {
  it("uses fixed presenter auth and per-company company auth", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";
    process.env.COMPANIES_HOUSE_ENV = "live";

    const xml = buildFormSubmissionEnvelope({
      messageClass: "ConfirmationStatement",
      formIdentifier: "ConfirmationStatement",
      companyNumber: "15855034",
      companyName: "EXAMPLE LTD",
      companyAuthCode: "abc123",
      formBody: "<ConfirmationStatement xmlns=\"http://xmlgw.companieshouse.gov.uk\"/>",
    });

    expect(xml).toContain("<SenderID>00072271000</SenderID>");
    expect(xml).toContain("<Method>clear</Method>");
    expect(xml).toContain("<CompanyAuthenticationCode>ABC123</CompanyAuthenticationCode>");
    expect(xml).toContain("<CompanyNumber>15855034</CompanyNumber>");
    expect(xml).toContain("<CompanyType>EW</CompanyType>");
    expect(xml).not.toContain("<GatewayTest>");
    expect(xml).toContain("<Body>");
    expect(xml).toContain("<FormSubmission");
  });

  it("sets GatewayTest=1 in test env", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";
    process.env.COMPANIES_HOUSE_ENV = "test";

    const xml = buildFormSubmissionEnvelope({
      messageClass: "ConfirmationStatement",
      formIdentifier: "ConfirmationStatement",
      companyNumber: "15855034",
      companyName: "EXAMPLE LTD",
      companyAuthCode: "abc123",
      formBody: "<ConfirmationStatement xmlns=\"http://xmlgw.companieshouse.gov.uk\"/>",
    });

    expect(xml).toContain("<GatewayTest>1</GatewayTest>");
  });

  it("zero-pads numeric company numbers and sets SC type", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";

    const sc = buildFormSubmissionEnvelope({
      messageClass: "ConfirmationStatement",
      formIdentifier: "ConfirmationStatement",
      companyNumber: "SC123456",
      companyName: "SCOTS LTD",
      companyAuthCode: "XYZ999",
      formBody: "<x/>",
    });
    expect(sc).toContain("<CompanyNumber>SC123456</CompanyNumber>");
    expect(sc).toContain("<CompanyType>SC</CompanyType>");

    const short = buildFormSubmissionEnvelope({
      messageClass: "ConfirmationStatement",
      formIdentifier: "ConfirmationStatement",
      companyNumber: "1234567",
      companyName: "PADDED LTD",
      companyAuthCode: "XYZ999",
      formBody: "<x/>",
    });
    expect(short).toContain("<CompanyNumber>01234567</CompanyNumber>");
  });
});

describe("describePresenterReadiness", () => {
  it("reports software presenter shape", () => {
    process.env.COMPANIES_HOUSE_ENV = "live";
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";
    process.env.COMPANIES_HOUSE_CREDIT_ACCOUNT = "00531722000";
    process.env.COMPANIES_HOUSE_PRESENTER_EMAIL =
      "info@hydraconsultancyservices.com";

    const r = describePresenterReadiness();
    expect(r.fixedPresenter.notWebFilingEmail).toBe(true);
    expect(r.fixedPresenter.looksLikeSoftwarePresenterId).toBe(true);
    expect(r.fixedPresenter.presenterEmailConfigured).toBe(true);
    expect(r.canAttemptLiveFeeFiling).toBe(true);
    expect(r.ok).toBe(true);
  });
});
