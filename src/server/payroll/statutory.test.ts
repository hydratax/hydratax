import { describe, expect, it } from "vitest";
import {
  autoEnrolmentPension,
  holidayPayPence,
  HOLIDAY_ACCRUAL_RATE,
  smpForWeeks,
  sspForDays,
  TAX_YEAR_2026_27,
} from "@/server/payroll/statutory";
import { calculatePeriodPay } from "@/server/hmrc/payroll";
import { parseTimesheetBuffer, matchTimesheetRow } from "@/server/payroll/timesheet";
import {
  createPasswordProtectedZip,
  decryptZipCrypto,
} from "@/server/payroll/zip-crypto";
import * as XLSX from "xlsx";

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

describe("HMRC 2026/27 statutory pay", () => {
  it("pays SSP from day 1 at the lower of £123.25 or 80% of AWE", () => {
    const high = sspForDays({ sickDays: 5, awePence: 500_00, qualifyingDays: 5 });
    expect(high.weeklyPence).toBe(TAX_YEAR_2026_27.sspWeeklyPence);
    expect(high.periodPence).toBe(TAX_YEAR_2026_27.sspWeeklyPence);

    const low = sspForDays({ sickDays: 5, awePence: 100_00, qualifyingDays: 5 });
    expect(low.weeklyPence).toBe(80_00);
    expect(low.periodPence).toBe(80_00);
  });

  it("pays SMP at 90% AWE for weeks 1–6 then the standard rate cap", () => {
    const first = smpForWeeks({ awePence: 500_00, weeks: 6, weekFrom: 1 });
    expect(first.ineligible).toBe(false);
    expect(first.periodPence).toBe(450_00 * 6);

    const rest = smpForWeeks({ awePence: 500_00, weeks: 1, weekFrom: 7 });
    expect(rest.periodPence).toBe(TAX_YEAR_2026_27.smpStandardWeeklyPence);

    const poor = smpForWeeks({ awePence: 100_00, weeks: 6, weekFrom: 1 });
    expect(poor.ineligible).toBe(true);
    expect(poor.periodPence).toBe(0);
  });

  it("accrues holiday at 5.6/46.4 for irregular hours", () => {
    expect(HOLIDAY_ACCRUAL_RATE).toBeCloseTo(0.120689, 5);
    const rolled = holidayPayPence({
      ordinaryPayPence: 1000_00,
      holidayHours: 0,
      hourlyRatePence: 0,
      irregularHours: true,
    });
    expect(rolled).toBe(Math.round(1000_00 * (5.6 / 46.4)));
  });

  it("takes 5% worker and 3% employer of auto-enrolment qualifying earnings", () => {
    const mid = autoEnrolmentPension({
      grossPence: 3000_00,
      frequency: "M1",
      optedOut: false,
    });
    expect(mid.qualifyingPence).toBe(3000_00 - 520_00);
    expect(mid.employeePence).toBe(Math.round(mid.qualifyingPence * 0.05));
    expect(mid.employerPence).toBe(Math.round(mid.qualifyingPence * 0.03));

    const below = autoEnrolmentPension({
      grossPence: 400_00,
      frequency: "M1",
      optedOut: false,
    });
    expect(below.employeePence).toBe(0);

    const out = autoEnrolmentPension({
      grossPence: 3000_00,
      frequency: "M1",
      optedOut: true,
    });
    expect(out.employeePence).toBe(0);
  });

  it("builds payslips from timesheet hours including SSP", () => {
    const line = calculatePeriodPay(
      {
        ...emp,
        payBasis: "hourly",
        hoursPerWeekHundredths: 3750,
        hourlyRatePence: 1500,
        adjustments: { ordinaryHours: 30, sickDays: 2 },
      },
      "W1",
    );
    expect(line.ordinaryPence).toBe(450_00);
    expect(line.sspPence).toBeGreaterThan(0);
    expect(line.grossPence).toBe(line.ordinaryPence + line.sspPence);
    expect(line.pensionEmployeePence).toBeGreaterThan(0);
    expect(line.netPence).toBe(
      line.grossPence -
        line.taxPence -
        line.employeeNiPence -
        line.pensionEmployeePence,
    );
  });
});

describe("timesheet import", () => {
  it("maps flexible Excel headers to hours and statutory columns", () => {
    const sheet = XLSX.utils.json_to_sheet([
      {
        "Payroll ID": "HYABC123",
        NINO: "AB123456C",
        Hours: 37.5,
        "Sick days": 2,
        "Holiday hours": 7.5,
        "Maternity weeks": 1,
        "Hourly rate": 12.5,
      },
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Timesheet");
    const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseTimesheetBuffer(buf);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.payrollId).toBe("HYABC123");
    expect(parsed.rows[0]?.ordinaryHours).toBe(37.5);
    expect(parsed.rows[0]?.sickDays).toBe(2);
    expect(parsed.rows[0]?.holidayHours).toBe(7.5);
    expect(parsed.rows[0]?.hourlyRatePence).toBe(1250);
    const hit = matchTimesheetRow(parsed.rows[0]!, [emp]);
    expect(hit?.payrollId).toBe("HYABC123");
  });
});

describe("password-protected payroll pack", () => {
  it("builds a ZipCrypto archive the client can open with the accountant password", () => {
    const zip = createPasswordProtectedZip(
      [{ name: "summary.html", data: "<p>net pay</p>" }],
      "office-pack-99",
    );
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    const nameLen = zip.readUInt16LE(26);
    const encLen = zip.readUInt32LE(18);
    const payload = zip.subarray(30 + nameLen, 30 + nameLen + encLen);
    expect(decryptZipCrypto(payload, "office-pack-99").toString()).toBe(
      "<p>net pay</p>",
    );
  });
});
