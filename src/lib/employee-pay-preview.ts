import { multiplyPence, pence } from "@/server/money/pence";
import {
  autoEnrolmentPension,
  buildStatutoryElements,
  TAX_YEAR_2026_27,
  type TimesheetAdjustments,
} from "@/server/payroll/statutory";
import type { PayFrequency } from "@/server/hmrc/payroll";

/** Live desk preview of this month’s pay for one person (not a filed payslip). */
export function previewEmployeeMonthPay(opts: {
  annualSalaryPence: number;
  hoursPerWeekHundredths: number;
  hourlyRatePence: number;
  payBasis: "salary" | "hourly";
  pensionOptOut?: boolean;
  frequency?: PayFrequency;
  sickDays?: number;
  maternityWeeks?: number;
  ordinaryHours?: number;
}) {
  const frequency = opts.frequency ?? "M1";
  const periods = frequency === "W1" ? 52 : 12;
  const adjustments: TimesheetAdjustments = {
    sickDays: opts.sickDays,
    maternityWeeks: opts.maternityWeeks,
    ordinaryHours: opts.ordinaryHours,
  };
  const elements = buildStatutoryElements({
    frequency,
    annualSalaryPence: opts.annualSalaryPence,
    hoursPerWeekHundredths: opts.hoursPerWeekHundredths || 3750,
    hourlyRatePence: opts.hourlyRatePence || 0,
    payBasis: opts.payBasis,
    pensionOptOut: Boolean(opts.pensionOptOut),
    qualifyingDays: 5,
    adjustments,
  });
  const gross = pence(
    elements.ordinaryPence +
      elements.overtimePence +
      elements.holidayPence +
      elements.sspPence +
      elements.smpPence +
      elements.sppPence +
      elements.sapPence +
      elements.shppPence +
      elements.spbpPence +
      elements.sncpPence,
  );
  const pension = autoEnrolmentPension({
    grossPence: Number(gross),
    frequency,
    optedOut: Boolean(opts.pensionOptOut),
  });
  const taxablePay = pence(Math.max(0, Number(gross) - pension.employeePence));
  const personalAllowancePeriod = pence(
    Math.round(TAX_YEAR_2026_27.personalAllowancePence / periods),
  );
  const taxBand = pence(
    Math.max(0, Number(taxablePay) - Number(personalAllowancePeriod)),
  );
  const tax = multiplyPence(taxBand, 0.2);
  const pt =
    frequency === "W1"
      ? TAX_YEAR_2026_27.niPtWeeklyPence
      : TAX_YEAR_2026_27.niPtMonthlyPence;
  const employeeNi = multiplyPence(
    pence(Math.max(0, Number(gross) - pt)),
    TAX_YEAR_2026_27.niEmployeeBps / 10_000,
  );
  const net = pence(
    Number(gross) - Number(tax) - Number(employeeNi) - pension.employeePence,
  );
  return {
    grossPence: Number(gross),
    taxPence: Number(tax),
    employeeNiPence: Number(employeeNi),
    pensionEmployeePence: pension.employeePence,
    sspPence: elements.sspPence,
    smpPence: elements.smpPence,
    netPence: Number(net),
  };
}
