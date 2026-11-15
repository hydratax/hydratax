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

  it("hard-blocks directors NIC and student loan on FPS preflight", () => {
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
      true,
    );

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
          startDate: "2026-01-01",
          active: true,
        },
      ],
    });
    expect(loans.some((c) => c.code === "student_loan_unsupported")).toBe(
      true,
    );
  });
});

describe("EPS live subset", () => {
  it("refuses non no-payment EPS", async () => {
    const { assertEpsLiveSupported, buildEpsXml } = await import(
      "@/server/hmrc/payroll"
    );
    expect(() =>
      assertEpsLiveSupported({ noPaymentForPeriod: false }),
    ).toThrow(/no-payment EPS/i);
    expect(() =>
      assertEpsLiveSupported({
        noPaymentForPeriod: true,
        apprenticeshipLevyRequested: true,
      }),
    ).toThrow(/levy/i);
    expect(() =>
      buildEpsXml({
        employerPayeRef: "123/AB45678",
        accountsOfficeRef: "123PA00045678",
        taxYear: "26-27",
        periodStart: "2026-08-06",
        periodEnd: "2026-09-05",
        noPaymentForPeriod: false,
      }),
    ).toThrow(/no-payment EPS/i);
  });
});
