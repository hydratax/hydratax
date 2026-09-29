import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  balanceSheetFromYearEndPayload,
  buildAccountsGatewayXml,
} from "./accounts-filing";
import {
  buildChMicroAccountsIxbrl,
  deriveMicroBalanceSheet,
} from "./ch-micro-ixbrl";

describe("deriveMicroBalanceSheet", () => {
  it("keeps net assets equal to equity", () => {
    const lines = deriveMicroBalanceSheet({
      fixedAssetsPence: 50_000,
      currentAssetsPence: 10_000,
      creditorsWithinPence: 5_000,
      creditorsAfterPence: 0,
      shareCapitalPence: 100,
      retainedEarningsPence: 54_900,
    });
    expect(lines.equity).toBe(55_000);
    expect(lines.netAssets).toBe(55_000);
    expect(
      lines.fixedAssets +
        lines.currentAssets -
        lines.creditorsWithin -
        lines.creditorsAfter,
    ).toBe(lines.netAssets);
  });

  it("absorbs residual into current assets when inputs drift", () => {
    const lines = deriveMicroBalanceSheet({
      fixedAssetsPence: 0,
      currentAssetsPence: 0,
      creditorsWithinPence: 0,
      creditorsAfterPence: 0,
      shareCapitalPence: 100,
      retainedEarningsPence: 0,
    });
    expect(lines.currentAssets).toBe(100);
    expect(lines.netAssets).toBe(100);
  });
});

describe("balanceSheetFromYearEndPayload", () => {
  it("maps year-end wizard pounds fields to pence", () => {
    const bs = balanceSheetFromYearEndPayload(
      {
        pl: { turnover: "1200" },
        bs: {
          fixedAssets: "500",
          totalCurrentAssets: "250.50",
          creditorsWithinOneYear: "40",
          corporationTaxPayable: "10",
          creditorsAfterOneYear: "0",
          shareCapital: "1",
          retainedEarnings: "699.50",
        },
      },
      "micro",
    );
    expect(bs.fixedAssetsPence).toBe(50_000);
    expect(bs.currentAssetsPence).toBe(25_050);
    expect(bs.creditorsWithinPence).toBe(5_000);
    expect(bs.shareCapitalPence).toBe(100);
  });

  it("defaults dormant balance sheet when no figures", () => {
    const bs = balanceSheetFromYearEndPayload(null, "dormant");
    expect(bs.shareCapitalPence).toBe(100);
    expect(bs.currentAssetsPence).toBe(100);
  });
});

describe("buildChMicroAccountsIxbrl", () => {
  it("tags micro-entity balance sheet and statutory statements", () => {
    const html = buildChMicroAccountsIxbrl({
      companyName: "TEST COMPANY LTD",
      companyNumber: "12357645",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      dormant: false,
      balanceSheet: {
        fixedAssetsPence: 0,
        currentAssetsPence: 100,
        creditorsWithinPence: 0,
        creditorsAfterPence: 0,
        shareCapitalPence: 100,
        retainedEarningsPence: 0,
      },
      directorName: "Jane Doe",
    });
    expect(html).toContain("uk-core:FixedAssets");
    expect(html).toContain("uk-core:CurrentAssets");
    expect(html).toContain("uk-core:NetAssetsLiabilities");
    expect(html).toContain("uk-core:Equity");
    expect(html).toContain("uk-direp:StatementThatCompanyEntitledToExemption");
    expect(html).toContain("uk-bus:Micro-entities");
    expect(html).toContain("12357645");
  });
});

describe("buildAccountsGatewayXml", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.COMPANIES_HOUSE_ENV = "test";
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "ABCDEFGHIJK";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "1234567890A";
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("builds non-fee Accounts envelope with empty Form and ACCOUNTS document", () => {
    const ixbrl = buildChMicroAccountsIxbrl({
      companyName: "TEST COMPANY LTD",
      companyNumber: "12357645",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      dormant: true,
      balanceSheet: {
        fixedAssetsPence: 0,
        currentAssetsPence: 100,
        creditorsWithinPence: 0,
        creditorsAfterPence: 0,
        shareCapitalPence: 100,
        retainedEarningsPence: 0,
      },
      directorName: "Director",
    });
    const xml = buildAccountsGatewayXml({
      companyNumber: "12357645",
      companyName: "Test Company Ltd",
      companyAuthCode: "AUTHCODE12",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      ixbrlHtml: ixbrl,
    });

    expect(xml).toContain("<Class>Accounts</Class>");
    expect(xml).toContain("<FormIdentifier>Accounts</FormIdentifier>");
    expect(xml).toContain("<Key Type=\"FormType\">Accounts</Key>");
    expect(xml).toContain("<Organisation>Companies House</Organisation>");
    expect(xml).toMatch(/<Form>\s*<\/Form>/);
    expect(xml).not.toContain("<PeriodStart>");
    expect(xml).toContain("<Category>ACCOUNTS</Category>");
    expect(xml).toContain("<ContentType>application/xml</ContentType>");
    expect(xml).toContain("<Filename>accounts.html</Filename>");
    expect(xml).toContain("<PackageReference>0012</PackageReference>");
    expect(xml).toContain("<CompanyNumber>12357645</CompanyNumber>");
    expect(xml).toContain("<Method>clear</Method>");
    // Accounts uses MD5 digests, not plaintext presenter id
    expect(xml).not.toContain("<SenderID>ABCDEFGHIJK</SenderID>");
    expect(xml).toMatch(/<SenderID>[a-f0-9]{32}<\/SenderID>/);
    // Document data is base64 of iXBRL
    expect(xml).toMatch(/<Data>[A-Za-z0-9+/=]+<\/Data>/);
  });
});

describe("postXmlToGateway feeBearing", () => {
  it("skips credit-account gate when feeBearing is false", async () => {
    const envSnap = { ...process.env };
    process.env.COMPANIES_HOUSE_ENV = "live";
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "ABCDEFGHIJK";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "1234567890A";
    delete process.env.COMPANIES_HOUSE_CREDIT_ACCOUNT;
    // Avoid live/test URL mismatch gate
    process.env.COMPANIES_HOUSE_XML_GATEWAY_URL =
      "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `<GovTalkMessage><Body><SubmissionNumber>AC0001</SubmissionNumber></Body></GovTalkMessage>`,
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { postXmlToGateway } = await import("./xml-gateway");
      const xml = buildAccountsGatewayXml({
        companyNumber: "12357645",
        companyName: "Test Company Ltd",
        companyAuthCode: "AUTHCODE12",
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        ixbrlHtml: "<html></html>",
      });

      const withFee = await postXmlToGateway(xml, "CS01", { feeBearing: true });
      expect(withFee.ok).toBe(false);
      expect(withFee.error).toMatch(/credit account/i);

      const accounts = await postXmlToGateway(xml, "Accounts", {
        feeBearing: false,
      });
      expect(accounts.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      process.env = envSnap;
    }
  });
});
