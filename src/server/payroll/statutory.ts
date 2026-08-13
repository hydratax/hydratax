import { multiplyPence, pence } from "@/server/money/pence";
import type { PayFrequency } from "@/server/hmrc/payroll";

/** HMRC / DWP employer rates for 2026/27 (from 6 April 2026). */
export const TAX_YEAR_2026_27 = {
  personalAllowancePence: 12_570_00,
  sspWeeklyPence: 123_25,
  sspAweCapBps: 8000, // 80% of AWE
  smpStandardWeeklyPence: 194_32,
  smpAweBps: 9000, // 90% of AWE
  smpFirstWeeks: 6,
  smpTotalWeeks: 39,
  lelWeeklyPence: 129_00,
  aeLowerWeeklyPence: 120_00,
  aeLowerMonthlyPence: 520_00,
  aeUpperWeeklyPence: 967_00,
  aeUpperMonthlyPence: 4_189_00,
  aeEmployeeBps: 500, // 5%
  aeEmployerBps: 300, // 3%
  statutoryHolidayWeeks: 5.6,
  workingWeeksAfterHoliday: 46.4,
  niEmployeeBps: 800,
  niEmployerBps: 1500,
  niPtWeeklyPence: 242_00,
  niPtMonthlyPence: 1_048_00,
  niStWeeklyPence: 96_00,
  niStMonthlyPence: 417_00,
} as const;

/** 5.6 / 46.4 — GOV.UK irregular-hours rolled-up holiday pay. */
export const HOLIDAY_ACCRUAL_RATE =
  TAX_YEAR_2026_27.statutoryHolidayWeeks /
  TAX_YEAR_2026_27.workingWeeksAfterHoliday;

export type TimesheetAdjustments = {
  ordinaryHours?: number;
  overtimeHours?: number;
  sickDays?: number;
  holidayHours?: number;
  irregularHours?: boolean;
  maternityWeeks?: number;
  maternityWeekFrom?: number;
  hourlyRatePence?: number;
};

export function averageWeeklyEarningsPence(opts: {
  annualSalaryPence: number;
  hoursPerWeekHundredths: number;
  hourlyRatePence: number;
}): number {
  if (opts.hourlyRatePence > 0 && opts.hoursPerWeekHundredths > 0) {
    return Math.round(
      (opts.hourlyRatePence * opts.hoursPerWeekHundredths) / 100,
    );
  }
  return Math.round(opts.annualSalaryPence / 52);
}

export function deriveHourlyRatePence(opts: {
  annualSalaryPence: number;
  hoursPerWeekHundredths: number;
  hourlyRatePence: number;
}): number {
  if (opts.hourlyRatePence > 0) return opts.hourlyRatePence;
  const hours = opts.hoursPerWeekHundredths || 3750;
  return Math.round((opts.annualSalaryPence * 100) / (hours * 52));
}

export function contractedHoursInPeriod(
  frequency: PayFrequency,
  hoursPerWeekHundredths: number,
): number {
  const weekly = (hoursPerWeekHundredths || 3750) / 100;
  return frequency === "W1" ? weekly : (weekly * 52) / 12;
}

export function sspForDays(opts: {
  sickDays: number;
  awePence: number;
  qualifyingDays: number;
}): { weeklyPence: number; dailyPence: number; periodPence: number } {
  const days = Math.max(0, opts.sickDays);
  const qDays = Math.max(1, opts.qualifyingDays || 5);
  const cap = multiplyPence(opts.awePence, TAX_YEAR_2026_27.sspAweCapBps / 10_000);
  const weekly = Math.min(TAX_YEAR_2026_27.sspWeeklyPence, Number(cap));
  const daily = Math.round(weekly / qDays);
  return {
    weeklyPence: weekly,
    dailyPence: daily,
    periodPence: daily * days,
  };
}

/** SMP for a stretch of maternity weeks, 1-indexed from the start of leave. */
export function smpForWeeks(opts: {
  awePence: number;
  weeks: number;
  weekFrom: number;
}): { periodPence: number; ineligible: boolean; breakdown: number[] } {
  const weeks = Math.max(0, Math.min(39, Math.floor(opts.weeks)));
  const from = Math.max(1, Math.floor(opts.weekFrom || 1));
  if (weeks === 0) {
    return { periodPence: 0, ineligible: false, breakdown: [] };
  }
  if (opts.awePence < TAX_YEAR_2026_27.lelWeeklyPence) {
    return { periodPence: 0, ineligible: true, breakdown: [] };
  }
  const ninety = Number(multiplyPence(opts.awePence, TAX_YEAR_2026_27.smpAweBps / 10_000));
  const remaining = Math.min(TAX_YEAR_2026_27.smpStandardWeeklyPence, ninety);
  const breakdown: number[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekNo = from + i;
    if (weekNo < 1 || weekNo > TAX_YEAR_2026_27.smpTotalWeeks) {
      breakdown.push(0);
    } else if (weekNo <= TAX_YEAR_2026_27.smpFirstWeeks) {
      breakdown.push(ninety);
    } else {
      breakdown.push(remaining);
    }
  }
  return {
    periodPence: breakdown.reduce((s, n) => s + n, 0),
    ineligible: false,
    breakdown,
  };
}

export function holidayPayPence(opts: {
  ordinaryPayPence: number;
  holidayHours: number;
  hourlyRatePence: number;
  irregularHours: boolean;
}): number {
  if (opts.holidayHours > 0 && opts.hourlyRatePence > 0) {
    return Number(multiplyPence(opts.hourlyRatePence, opts.holidayHours));
  }
  if (opts.irregularHours && opts.ordinaryPayPence > 0) {
    return Number(multiplyPence(opts.ordinaryPayPence, HOLIDAY_ACCRUAL_RATE));
  }
  return 0;
}

export function autoEnrolmentPension(opts: {
  grossPence: number;
  frequency: PayFrequency;
  optedOut: boolean;
}): { qualifyingPence: number; employeePence: number; employerPence: number } {
  if (opts.optedOut || opts.grossPence <= 0) {
    return { qualifyingPence: 0, employeePence: 0, employerPence: 0 };
  }
  const lower =
    opts.frequency === "W1"
      ? TAX_YEAR_2026_27.aeLowerWeeklyPence
      : TAX_YEAR_2026_27.aeLowerMonthlyPence;
  const upper =
    opts.frequency === "W1"
      ? TAX_YEAR_2026_27.aeUpperWeeklyPence
      : TAX_YEAR_2026_27.aeUpperMonthlyPence;
  const banded = Math.min(opts.grossPence, upper);
  const qe = Math.max(0, banded - lower);
  if (qe <= 0) {
    return { qualifyingPence: 0, employeePence: 0, employerPence: 0 };
  }
  return {
    qualifyingPence: qe,
    employeePence: Number(
      multiplyPence(qe, TAX_YEAR_2026_27.aeEmployeeBps / 10_000),
    ),
    employerPence: Number(
      multiplyPence(qe, TAX_YEAR_2026_27.aeEmployerBps / 10_000),
    ),
  };
}

export function buildStatutoryElements(opts: {
  frequency: PayFrequency;
  annualSalaryPence: number;
  hoursPerWeekHundredths: number;
  hourlyRatePence: number;
  payBasis: "salary" | "hourly";
  pensionOptOut: boolean;
  qualifyingDays: number;
  adjustments?: TimesheetAdjustments | null;
}): {
  ordinaryPence: number;
  overtimePence: number;
  holidayPence: number;
  sspPence: number;
  smpPence: number;
  notes: string[];
} {
  const notes: string[] = [];
  const adj = opts.adjustments ?? {};
  const rate = deriveHourlyRatePence({
    annualSalaryPence: opts.annualSalaryPence,
    hoursPerWeekHundredths: opts.hoursPerWeekHundredths,
    hourlyRatePence: adj.hourlyRatePence || opts.hourlyRatePence,
  });
  const awe = averageWeeklyEarningsPence({
    annualSalaryPence: opts.annualSalaryPence,
    hoursPerWeekHundredths: opts.hoursPerWeekHundredths,
    hourlyRatePence: rate,
  });
  const periods = opts.frequency === "W1" ? 52 : 12;
  const salaryPeriod = Number(
    multiplyPence(opts.annualSalaryPence, 1 / periods),
  );
  const qDays = Math.max(1, opts.qualifyingDays || 5);
  const sickDays = Math.max(0, adj.sickDays ?? 0);
  const hasHours =
    adj.ordinaryHours != null ||
    opts.payBasis === "hourly" ||
    (adj.holidayHours != null && adj.holidayHours > 0);

  let ordinaryPence = 0;
  if (hasHours) {
    const hours =
      adj.ordinaryHours != null
        ? adj.ordinaryHours
        : contractedHoursInPeriod(opts.frequency, opts.hoursPerWeekHundredths);
    ordinaryPence = Number(multiplyPence(rate, hours));
  } else {
    const dailySalary = Math.round(opts.annualSalaryPence / (52 * qDays));
    ordinaryPence = Math.max(0, salaryPeriod - dailySalary * sickDays);
  }

  const overtimePence = Number(
    multiplyPence(rate, Math.max(0, adj.overtimeHours ?? 0)),
  );

  const holidayPence = holidayPayPence({
    ordinaryPayPence: ordinaryPence,
    holidayHours: Math.max(0, adj.holidayHours ?? 0),
    hourlyRatePence: rate,
    irregularHours: Boolean(adj.irregularHours),
  });

  const ssp =
    sickDays > 0
      ? sspForDays({
          sickDays,
          awePence: awe,
          qualifyingDays: qDays,
        })
      : { weeklyPence: 0, dailyPence: 0, periodPence: 0 };
  if (sickDays > 0) {
    notes.push(
      `SSP ${sickDays} qualifying day${sickDays === 1 ? "" : "s"} at ${formatPounds(ssp.dailyPence)}/day (lower of £123.25/week or 80% of average weekly earnings, from day 1 of sickness in 2026/27).`,
    );
  }

  const smp = smpForWeeks({
    awePence: awe,
    weeks: adj.maternityWeeks ?? 0,
    weekFrom: adj.maternityWeekFrom ?? 1,
  });
  if (smp.ineligible) {
    notes.push(
      "Statutory maternity pay not applied — average weekly earnings are below the Lower Earnings Limit (£129 a week in 2026/27).",
    );
  } else if (smp.periodPence > 0) {
    notes.push(
      "SMP: 90% of average weekly earnings for the first 6 weeks, then the lower of £194.32 or 90% of AWE for weeks 7–39.",
    );
  }

  if (holidayPence > 0 && adj.irregularHours && !(adj.holidayHours && adj.holidayHours > 0)) {
    notes.push(
      "Holiday pay accrued at 12.07% of ordinary hours (5.6 statutory weeks / 46.4 working weeks) for irregular-hours workers.",
    );
  }

  return {
    ordinaryPence: Number(pence(ordinaryPence)),
    overtimePence: Number(pence(overtimePence)),
    holidayPence: Number(pence(holidayPence)),
    sspPence: Number(pence(ssp.periodPence)),
    smpPence: Number(pence(smp.periodPence)),
    notes,
  };
}

function formatPounds(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n / 100);
}
