import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSaLivePayloadSupported,
  buildSa100BodyInner,
  saFixtureTaxYearDir,
  saMtrNamespace,
  wrapSa100GovTalk,
} from "@/server/hmrc/sa100/build-body";
import { submitSa100ToHmrc } from "@/server/hmrc/sa100/submit";
import { emptySa100Draft } from "@/lib/sa100/schema";

function minimalDraft() {
  return emptySa100Draft({
    taxYear: "2025-26",
    utr: "1234567890",
    nino: "AB123456C",
    dateOfBirth: "1980-01-01",
    declarationName: "Test Taxpayer",
    declarationDate: "2026-01-31",
    signedCapacity: "Taxpayer",
    declarationAccepted: true,
  });
}

function xsdValidate(bodyInner: string, taxYearLabel: string) {
  const dir = mkdtempSync(join(tmpdir(), "sa-xsd-"));
  const xmlPath = join(dir, "body.xml");
  writeFileSync(xmlPath, bodyInner, "utf8");
  const fixtureYear = saFixtureTaxYearDir(taxYearLabel);
  return execFileSync(
    "python",
    [
      "scripts/validate-sa-xsd.py",
      "--tax-year",
      fixtureYear,
      "--xml",
      xmlPath,
    ],
    { encoding: "utf8", cwd: process.cwd() },
  ).trim();
}

describe("SA100 MTR body (official RIM 25-26)", () => {
  it("uses year-scoped SA100 namespace", () => {
    expect(saMtrNamespace("2025-26")).toBe(
      "http://www.govtalk.gov.uk/taxation/SA/SA100/25-26/1",
    );
    const body = buildSa100BodyInner({
      draft: minimalDraft(),
      taxpayerName: "Test Taxpayer",
    });
    expect(body).toContain(
      'xmlns="http://www.govtalk.gov.uk/taxation/SA/SA100/25-26/1"',
    );
    expect(body).toContain("<IRmark Type=\"generic\">");
    expect(body).toContain("<SA110>");
    expect(body).toContain("<IndividualDeclaration>yes</IndividualDeclaration>");
  });

  it("wraps Class HMRC-SA-SA100 with UTR key and clear auth", () => {
    const draft = minimalDraft();
    const body = buildSa100BodyInner({
      draft,
      taxpayerName: "Test Taxpayer",
    });
    const xml = wrapSa100GovTalk({
      bodyInner: body,
      utr: "1234567890",
      senderId: "user",
      senderPassword: "pass",
      gatewayTest: true,
      vendorId: "1234",
      productName: "HydraTax",
    });
    expect(xml).toContain("<Class>HMRC-SA-SA100</Class>");
    expect(xml).toContain('<Key Type="UTR">1234567890</Key>');
    expect(xml).toContain("<Method>clear</Method>");
  });

  it("XSD-validates a minimal SA100 + SA110 envelope", () => {
    const body = buildSa100BodyInner({
      draft: minimalDraft(),
      taxpayerName: "Test Taxpayer",
    });
    expect(xsdValidate(body, "2025-26")).toBe("VALID");
  });

  it("XSD-validates employment + short self-employment + property subset", () => {
    const draft = emptySa100Draft({
      taxYear: "2025-26",
      utr: "1234567890",
      nino: "AB123456C",
      dateOfBirth: "1980-06-15",
      declarationName: "Sam Taylor",
      declarationAccepted: true,
      hasEmployment: true,
      employments: [
        {
          employerName: "Acme Ltd",
          payeRef: "123/AB456",
          pay: 40000,
          payrolledBenefitsStudentLoan: 0,
          taxTakenOff: 6000,
          tips: 0,
          wasDirector: false,
          directorCeasedDate: "",
          wasCloseCompany: false,
          closeCompanyName: "",
          closeCompanyNumber: "",
          closeCompanyDividends: 0,
          closeCompanySharePct: 0,
          offPayroll: false,
          benefitCars: 0,
          benefitFuel: 0,
          benefitMedical: 0,
          benefitVouchers: 0,
          benefitGoods: 0,
          benefitAccommodation: 0,
          benefitOther: 0,
          benefitExpensesPayments: 0,
          benefits: 0,
          expenseTravel: 0,
          expenseFixed: 0,
          expenseProfessional: 0,
          expenseOther: 0,
        },
      ],
      hasSelfEmployment: true,
      seBusinessName: "Sam Consulting",
      seDescription: "IT consultancy",
      seTurnover: 12000,
      seExpenses: 2000,
      seCashBasis: true,
      hasUkProperty: true,
      propPropertyCount: 1,
      propRents: 9000,
      propExpenses: 1500,
      interestUntaxedUk: 100,
      dividendsUk: 500,
    });
    const body = buildSa100BodyInner({
      draft,
      taxpayerName: "Sam Taylor",
    });
    expect(body).toContain("<SA102>");
    expect(body).toContain("<SA103S>");
    expect(body).toContain("<SA105>");
    expect(xsdValidate(body, "2025-26")).toBe("VALID");
  });

  it("refuses unsupported supplements", () => {
    expect(() =>
      assertSaLivePayloadSupported(
        emptySa100Draft({ hasForeign: true, hasCapitalGains: true }),
      ),
    ).toThrow(/foreign|capital gains/);
  });

  it("still allows demo submit when live would be gated by credentials", async () => {
    const res = await submitSa100ToHmrc({
      draft: minimalDraft(),
      taxpayerName: "Test Taxpayer",
      senderId: "",
      senderPassword: "",
      actorId: "a1",
      clientId: "c1",
      demo: true,
    });
    expect(res.ok).toBe(true);
    expect(res.demo).toBe(true);
  });
});
