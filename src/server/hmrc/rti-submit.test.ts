import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { extractRtiErrorMessage, wrapRtiGovTalk } from "@/server/hmrc/rti-submit";
import {
  buildEpsXml,
  buildFpsXml,
  calculatePeriodPay,
  type PayLine,
} from "@/server/hmrc/payroll";

function xsdValidate(
  kind: "fps" | "eps",
  taxYear: string,
  bodyInner: string,
): void {
  const script = path.join(process.cwd(), "scripts", "validate-rti-xsd.py");
  try {
    const out = execFileSync("python", [script, "--kind", kind, "--tax-year", taxYear, "--stdin"], {
      input: bodyInner,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("VALID");
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(e.stderr || e.message || String(err));
  }
}

function baseEmp(over: Partial<Parameters<typeof calculatePeriodPay>[0]> = {}) {
  return {
    id: "e1",
    payrollId: "HYABC123",
    forename: "Sam",
    surname: "Taylor",
    nino: "AB123456C",
    gender: "M" as const,
    dateOfBirth: "1990-05-01",
    address: "10 High Street, Anytown, NE14 7NS",
    taxCode: "1257L",
    annualSalaryPence: 3600000,
    startDate: "2026-04-06",
    firstFpsSent: true,
    niCategory: "A",
    hoursPerWeekHundredths: 3750,
    ...over,
  };
}

describe("extractRtiErrorMessage", () => {
  it("prefers ChRIS body error over generic 3001 wrapper", () => {
    const receipt = `<?xml version='1.0'?>
<GovTalkMessage>
  <GovTalkDetails>
    <GovTalkErrors>
      <Error>
        <Number>3001</Number>
        <Text>The submission of this document has failed due to departmental specific business logic in the Body tag.</Text>
      </Error>
    </GovTalkErrors>
  </GovTalkDetails>
  <Body>
    <ErrorResponse>
      <Error>
        <Number>2022</Number>
        <Text>IRmark not found.</Text>
        <Location>IRmark</Location>
      </Error>
    </ErrorResponse>
  </Body>
</GovTalkMessage>`;
    expect(extractRtiErrorMessage(receipt)).toBe(
      "IRmark not found. @ IRmark (2022)",
    );
  });
});

describe("RTI EPS package", () => {
  it("includes IRheader, unprefixed IRmark, tax-year end PeriodEnd, and EmpRefs", () => {
    const eps = buildEpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      taxYear: "26-27",
      periodStart: "2026-10-06",
      periodEnd: "2026-11-05",
      noPaymentForPeriod: true,
      senderId: "123456789012",
      senderPassword: "secret",
      gatewayTest: false,
    });
    expect(eps.bodyInner).toContain("<IRheader>");
    expect(eps.bodyInner).toContain('<IRmark Type="generic">');
    expect(eps.bodyInner).not.toContain("ct:IRmark");
    expect(eps.bodyInner).not.toContain("ct:Sender");
    expect(eps.bodyInner).toContain("<PeriodEnd>2027-04-05</PeriodEnd>");
    expect(eps.bodyInner).toContain("<NoPaymentForPeriod>yes</NoPaymentForPeriod>");
    expect(eps.bodyInner).toContain("<NoPaymentDates>");
    expect(eps.bodyInner).toContain("<From>2026-10-06</From>");
    expect(eps.bodyInner).toContain("<To>2026-11-05</To>");
    expect(eps.bodyInner).not.toContain("<NoPaymentPeriod>");
    // RelatedTaxYear must follow NoPayment* (XSD sequence).
    expect(eps.bodyInner.indexOf("NoPaymentForPeriod")).toBeLessThan(
      eps.bodyInner.indexOf("<RelatedTaxYear>"),
    );
    expect(eps.bodyInner).toContain(
      "http://www.govtalk.gov.uk/taxation/PAYE/RTI/EmployerPaymentSummary/26-27/1",
    );
    expect(eps.bodyInner).toContain("<PayeRef>AB45678</PayeRef>");
    expect(eps.bodyInner).not.toContain("<PayeRef>123/AB45678</PayeRef>");
    expect(eps.xml).toContain("HMRC-PAYE-RTI-EPS");
    expect(eps.irmark).toBeTruthy();
  });

  it("wraps with TaxOffice keys", () => {
    const xml = wrapRtiGovTalk({
      className: "HMRC-PAYE-RTI-EPS",
      bodyInner: "<IRenvelope/>",
      payeRef: "123/AB45678",
      senderId: "1",
      senderPassword: "x",
      gatewayTest: true,
    });
    expect(xml).toContain('<Key Type="TaxOfficeNumber">123</Key>');
    expect(xml).toContain('<Key Type="TaxOfficeReference">AB45678</Key>');
  });

  it("XSD-validates no-payment EPS against HMRC 26-27 schema", () => {
    const eps = buildEpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      taxYear: "26-27",
      periodStart: "2026-10-06",
      periodEnd: "2026-11-05",
      noPaymentForPeriod: true,
    });
    xsdValidate("eps", "26-27", eps.bodyInner);
  });

  it("XSD-validates EPS with RecoverableAmountsYTD", () => {
    const eps = buildEpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      taxYear: "26-27",
      periodStart: "2026-10-06",
      periodEnd: "2026-11-05",
      noPaymentForPeriod: false,
      recoverables: {
        taxMonth: 7,
        smpRecoveredPence: 50_000,
        nicCompensationOnSmpPence: 4_000,
      },
    });
    expect(eps.bodyInner).toContain("<SMPRecovered>500.00</SMPRecovered>");
    xsdValidate("eps", "26-27", eps.bodyInner);
  });
});

describe("RTI FPS package (HMRC FullPaymentSubmission XSD)", () => {
  it("emits Fore/Sur, Gender, FiguresToDate, Payment, and NI letter values", () => {
    const line = calculatePeriodPay(baseEmp(), "M1");
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-11-28",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    expect(fps.bodyInner).toContain("<Fore>Sam</Fore>");
    expect(fps.bodyInner).toContain("<Sur>Taylor</Sur>");
    expect(fps.bodyInner).toContain("<Gender>M</Gender>");
    expect(fps.bodyInner).toContain("<FiguresToDate>");
    expect(fps.bodyInner).toContain("<Payment>");
    expect(fps.bodyInner).toContain("<MonthNo>");
    expect(fps.bodyInner).toContain("<HoursWorked>D</HoursWorked>");
    expect(fps.bodyInner).toContain("<GrossEarningsForNICsYTD>");
    expect(fps.bodyInner).toContain("<AtLELYTD>");
    expect(fps.bodyInner).toContain("<EmpeeContribnsYTD>");
    expect(fps.bodyInner).not.toContain("<Forename>");
    expect(fps.bodyInner).not.toContain("<EmpPayment>");
    expect(fps.bodyInner).not.toContain("<EmployeeContribution>");
  });

  it("XSD-validates a standard monthly FPS with gender and address", () => {
    const line = calculatePeriodPay(baseEmp(), "M1");
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-11-28",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    xsdValidate("fps", "26-27", fps.bodyInner);
  });

  it("XSD-validates FPS with student loan and postgraduate loan", () => {
    const line = calculatePeriodPay(
      baseEmp({
        studentLoanPlan: "02",
        postgraduateLoan: true,
        payDate: "2026-11-28",
        taxYear: "26-27",
      }),
      "M1",
    );
    expect(line.studentLoanPence).toBeGreaterThan(0);
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-11-28",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    expect(fps.bodyInner).toContain('StudentLoanRecovered PlanType="02"');
    expect(fps.bodyInner).toContain("<PostgradLoanRecovered>");
    xsdValidate("fps", "26-27", fps.bodyInner);
  });

  it("XSD-validates FPS with SSP, SMP YTD, unpaid absence, and starter", () => {
    const line = calculatePeriodPay(
      baseEmp({
        firstFpsSent: false,
        starterDeclaration: "B",
        gender: "F",
        forename: "Joan",
        surname: "Surname",
        adjustments: {
          sickDays: 3,
          maternityWeeks: 2,
          maternityWeekFrom: 1,
          unpaidAbsence: true,
        },
      }),
      "M1",
    );
    expect(line.sspPence).toBeGreaterThan(0);
    expect(line.smpPence).toBeGreaterThan(0);
    expect(line.ytdSmpPence).toBe(line.smpPence);
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-11-28",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    expect(fps.bodyInner).toContain("<SMPYTD>");
    expect(fps.bodyInner).toContain("<UnpaidAbsence>yes</UnpaidAbsence>");
    expect(fps.bodyInner).toContain("<StartDec>B</StartDec>");
    xsdValidate("fps", "26-27", fps.bodyInner);
  });

  it("XSD-validates FPS with SPP/ShPP/SAP/SPBP/SNCP YTD and on-strike", () => {
    const line = calculatePeriodPay(
      baseEmp({
        adjustments: {
          paternityWeeks: 1,
          adoptionWeeks: 1,
          sharedParentalWeeks: 1,
          parentalBereavementWeeks: 1,
          neonatalCareWeeks: 1,
          onStrike: true,
        },
      }),
      "M1",
    );
    expect(line.sppPence).toBeGreaterThan(0);
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-11-28",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    expect(fps.bodyInner).toContain("<SPPYTD>");
    expect(fps.bodyInner).toContain("<SAPYTD>");
    expect(fps.bodyInner).toContain("<ShPPYTD>");
    expect(fps.bodyInner).toContain("<SPBPYTD>");
    expect(fps.bodyInner).toContain("<SNCPYTD>");
    expect(fps.bodyInner).toContain("<OnStrike>yes</OnStrike>");
    xsdValidate("fps", "26-27", fps.bodyInner);
  });

  it("XSD-validates a multi-employee FPS (scale path)", () => {
    const lines: PayLine[] = Array.from({ length: 12 }, (_, i) =>
      calculatePeriodPay(
        baseEmp({
          id: `e${i}`,
          payrollId: `HY${String(i).padStart(6, "0")}`,
          forename: i % 2 === 0 ? "Sam" : "Alex",
          surname: `Worker${i}`,
          nino: `AB12345${i % 10}C`,
          gender: i % 2 === 0 ? "M" : "F",
          firstFpsSent: true,
        }),
        "M1",
      ),
    );
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-11-28",
      taxYear: "26-27",
      frequency: "M1",
      lines,
    });
    expect((fps.bodyInner.match(/<Employee>/g) || []).length).toBe(12);
    xsdValidate("fps", "26-27", fps.bodyInner);
  });

  it("refuses FPS build when Gender is missing", () => {
    const line = calculatePeriodPay(baseEmp({ gender: null }), "M1");
    expect(line.gender).toBeNull();
    expect(() =>
      buildFpsXml({
        employerPayeRef: "123/AB45678",
        accountsOfficeRef: "123PA00045678",
        payDate: "2026-11-28",
        taxYear: "26-27",
        frequency: "M1",
        lines: [line],
      }),
    ).toThrow(/Gender/);
  });
});
