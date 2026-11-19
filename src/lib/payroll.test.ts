import { describe, expect, it } from "vitest";
import { calculatePeriodPay, buildFpsXml } from "@/server/hmrc/payroll";
import { generatePayrollId, preflightPayRun } from "@/lib/payroll";

const emp = {
  id: "e1",
  payrollId: "HYABC123",
  forename: "Sam",
  surname: "Taylor",
  nino: "AB123456C",
  gender: "M" as const,
  taxCode: "1257L",
  annualSalaryPence: 3600000,
  startDate: "2026-04-06",
  firstFpsSent: false,
  starterDeclaration: "A" as const,
};

describe("payroll engine", () => {
  it("splits annual salary weekly vs monthly", () => {
    const m = calculatePeriodPay(emp, "M1");
    const w = calculatePeriodPay(emp, "W1");
    expect(m.grossPence).toBe(300000);
    expect(w.grossPence).toBe(Math.round(3600000 / 52));
    expect(m.isStarterThisRun).toBe(true);
  });

  it("puts YTD and payroll id on the FPS", () => {
    const line = calculatePeriodPay(emp, "W1", {
      grossPence: 100000,
      taxPence: 0,
      employeeNiPence: 0,
    });
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-08-14",
      taxYear: "26-27",
      frequency: "W1",
      lines: [line],
    });
    expect(fps.xml).toContain("<PayFreq>W1</PayFreq>");
    expect(fps.xml).toContain("<PayId>HYABC123</PayId>");
    expect(fps.xml).toContain("<StartDec>A</StartDec>");
    expect(fps.xml).toContain("<FiguresToDate>");
    expect(fps.xml).toContain("<WeekNo>");
    expect(fps.xml).toContain("<Gender>M</Gender>");
  });

  it("blocks reused payroll IDs, missing PAYE, and missing gender", () => {
    const checks = preflightPayRun({
      isEmployer: true,
      payeRef: null,
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-08-14",
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      frequency: "W1",
      employees: [
        { id: "1", payrollId: "AA", nino: "AB123456C", startDate: "2026-01-01", active: true },
        { id: "2", payrollId: "AA", nino: "AB123456C", startDate: "2026-01-01", active: true },
      ],
    });
    expect(checks.some((c) => c.code === "paye_ref")).toBe(true);
    expect(checks.some((c) => c.code === "dup_pid")).toBe(true);
    expect(checks.some((c) => c.code === "gender")).toBe(true);
  });

  it("never reissues a payroll ID", () => {
    const id = generatePayrollId(["HYAAAA1", "HYBBBB2"]);
    expect(id).not.toBe("HYAAAA1");
    expect(id.startsWith("HY")).toBe(true);
  });

  it("allows directors and student loans on FPS preflight (engine supported)", () => {
    const director = preflightPayRun({
      isEmployer: true,
      payeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-08-14",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      frequency: "M1",
      employees: [
        {
          id: "1",
          payrollId: "HYDIR1",
          nino: "AB123456C",
          gender: "M",
          forename: "Dir",
          surname: "Ector",
          jobTitle: "Company Director",
          startDate: "2026-01-01",
          active: true,
        },
      ],
    });
    expect(director.some((c) => c.code === "directors_nic_unsupported")).toBe(
      false,
    );
    expect(director.some((c) => c.code === "ready")).toBe(true);

    const loans = preflightPayRun({
      isEmployer: true,
      payeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-08-14",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      frequency: "M1",
      hasStudentLoanEmployees: true,
      employees: [
        {
          id: "1",
          payrollId: "HYSL1",
          nino: "AB123456C",
          gender: "F",
          forename: "Lo",
          surname: "An",
          startDate: "2026-01-01",
          active: true,
        },
      ],
    });
    expect(loans.some((c) => c.code === "student_loan_unsupported")).toBe(
      false,
    );
  });

  it("emits student loan FPS elements when plan set", () => {
    const line = calculatePeriodPay(
      {
        ...emp,
        payDate: "2026-08-14",
        taxYear: "26-27",
        studentLoanPlan: "02",
        postgraduateLoan: true,
        firstFpsSent: true,
      },
      "M1",
    );
    expect(line.studentLoanPence).toBeGreaterThan(0);
    expect(line.postgraduateLoanPence).toBeGreaterThan(0);
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-08-14",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    expect(fps.xml).toContain('StudentLoanRecovered PlanType="02"');
    expect(fps.xml).toContain("<PostgradLoanRecovered>");
    expect(fps.xml).toContain("<StudentLoansTD>");
  });
});

describe("EPS live subset", () => {
  it("allows no-payment, recoverables, or apprenticeship levy", async () => {
    const { assertEpsLiveSupported, buildEpsXml } = await import(
      "@/server/hmrc/payroll"
    );
    expect(() =>
      assertEpsLiveSupported({ noPaymentForPeriod: false }),
    ).toThrow(/recoveries|levy|nobody paid/i);
    expect(() =>
      assertEpsLiveSupported({
        noPaymentForPeriod: false,
        recoverableAmountsRequested: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertEpsLiveSupported({
        noPaymentForPeriod: false,
        apprenticeshipLevyRequested: true,
      }),
    ).not.toThrow();
    const withRec = buildEpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      taxYear: "26-27",
      periodStart: "2026-08-06",
      periodEnd: "2026-09-05",
      noPaymentForPeriod: false,
      recoverables: { taxMonth: 5, smpRecoveredPence: 10_000 },
    });
    expect(withRec.bodyInner).toContain("<RecoverableAmountsYTD>");
    expect(withRec.bodyInner).toContain("<SMPRecovered>100.00</SMPRecovered>");
    expect(withRec.bodyInner).not.toContain("<NoPaymentForPeriod>");

    const withLevy = buildEpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      taxYear: "26-27",
      periodStart: "2026-08-06",
      periodEnd: "2026-09-05",
      noPaymentForPeriod: false,
      apprenticeshipLevy: {
        taxMonth: 5,
        levyDueYtdPence: 2_500_00,
        annualAllowancePence: 15_000_00,
      },
    });
    expect(withLevy.bodyInner).toContain("<ApprenticeshipLevy>");
    expect(withLevy.bodyInner).toContain("<LevyDueYTD>2500.00</LevyDueYTD>");
    expect(withLevy.bodyInner).toContain("<TaxMonth>5</TaxMonth>");
    expect(withLevy.bodyInner).toContain("<AnnualAllce>15000.00</AnnualAllce>");
  });
});

describe("Directors NIC AL", () => {
  it("emits DirectorsNIC AL and uses period NI", async () => {
    const { calculatePeriodPay, buildFpsXml } = await import(
      "@/server/hmrc/payroll"
    );
    const line = calculatePeriodPay(
      {
        id: "d1",
        forename: "Dir",
        surname: "Alton",
        nino: "AB123456C",
        gender: "M",
        dateOfBirth: "1980-01-01",
        taxCode: "1257L",
        annualSalaryPence: 60_000_00,
        startDate: "2026-04-06",
        payrollId: "DIR1",
        firstFpsSent: true,
        niCategory: "A",
        isDirector: true,
        directorsNicMethod: "AL",
        payDate: "2026-08-14",
        taxYear: "26-27",
      },
      "M1",
    );
    expect(line.directorsNic).toBe("AL");
    const fps = buildFpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      payDate: "2026-08-14",
      taxYear: "26-27",
      frequency: "M1",
      lines: [line],
    });
    expect(fps.xml).toContain("<DirectorsNIC>AL</DirectorsNIC>");
  });
});
