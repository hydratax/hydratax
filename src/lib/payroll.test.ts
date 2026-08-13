import { describe, expect, it } from "vitest";
import { calculatePeriodPay, buildFpsXml } from "@/server/hmrc/payroll";
import { generatePayrollId, preflightPayRun } from "@/lib/payroll";

const emp = {
  id: "e1",
  payrollId: "HYABC123",
  forename: "Sam",
  surname: "Taylor",
  nino: "AB123456C",
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
    expect(fps.xml).toContain("TaxablePayToDate");
  });

  it("blocks reused payroll IDs and missing PAYE", () => {
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
  });

  it("never reissues a payroll ID", () => {
    const id = generatePayrollId(["HYAAAA1", "HYBBBB2"]);
    expect(id).not.toBe("HYAAAA1");
    expect(id.startsWith("HY")).toBe(true);
  });
});
