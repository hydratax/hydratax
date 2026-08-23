import { RATES_2025_26 as R, TAX_YEAR_LABEL } from "./rates-2025-26";
import type { Sa100Draft } from "./schema";

export type CalcLine = { label: string; amount: number };

export type Sa302Result = {
  taxYear: string;
  employmentIncome: number;
  selfEmploymentProfit: number;
  propertyProfit: number;
  savingsIncome: number;
  dividendIncome: number;
  pensionIncome: number;
  otherIncome: number;
  totalIncome: number;
  personalAllowance: number;
  taxableIncome: number;
  incomeTax: number;
  class4Nic: number;
  studentLoan: number;
  postgraduateLoan: number;
  hicbc: number;
  taxDeducted: number;
  totalLiability: number;
  balance: number;
  amountDue: number;
  refundDue: number;
  paymentsOnAccountEach: number;
  breakdown: CalcLine[];
  summary: CalcLine[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) =>
  n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

/** Approximate SA302-style calculation for SA100 2025–26 (estimate before submit). */
export function calculateSa302(d: Sa100Draft): Sa302Result {
  const employmentIncome = d.employments.reduce(
    (s, e) => s + e.pay + e.tips + e.benefits,
    0,
  );
  const employmentTax = d.employments.reduce((s, e) => s + e.taxTakenOff, 0);

  const seProfit = Math.max(
    0,
    d.seTurnover - d.seExpenses - d.seCapitalAllowances,
  );
  const propertyProfit = Math.max(
    0,
    d.propRents + d.propOtherIncome - d.propExpenses - d.propFinanceCosts,
  );

  const savings =
    d.interestTaxedUk + d.interestUntaxedUk + d.interestUntaxedForeign;
  const dividends = d.dividendsUk + d.dividendsOther + d.dividendsForeign;
  const pensions = d.statePension + d.statePensionLumpSum + d.otherPensions;
  const other = Math.max(
    0,
    d.incapacityEsa +
      d.jobseekersAllowance +
      d.otherStateBenefits +
      d.otherTaxableIncome +
      d.preOwnedAssets -
      d.otherIncomeExpenses,
  );

  const totalIncome = r2(
    employmentIncome +
      seProfit +
      propertyProfit +
      savings +
      dividends +
      pensions +
      other,
  );

  let pa: number = R.personalAllowance;
  if (totalIncome > R.paTaperFrom) {
    pa = Math.max(0, pa - Math.floor((totalIncome - R.paTaperFrom) / 2));
  }
  if (d.marriageReceive) pa += R.marriageAllowance;
  if (d.marriageTransferOut) pa = Math.max(0, pa - R.marriageAllowance);
  if (d.blindPerson) pa += R.blindPersonsAllowance;

  const giftAidGross = (d.giftAid + d.giftAidTreatAsThisYear) * (100 / 80);
  const pensionGross = d.pensionReliefAtSource * (100 / 80);
  const basicBand = R.basicRateBand + giftAidGross + pensionGross;
  const higherLimit = R.additionalRateThreshold - R.personalAllowance;

  const nonSavings =
    employmentIncome + seProfit + propertyProfit + pensions + other;

  let allow = pa;
  const nsTaxable = Math.max(0, nonSavings - allow);
  allow = Math.max(0, allow - nonSavings);
  const savTaxable0 = Math.max(0, savings - allow);
  allow = Math.max(0, allow - savings);
  const divTaxable0 = Math.max(0, dividends - allow);
  const taxableIncome = r2(nsTaxable + savTaxable0 + divTaxable0);

  const rateBands = [
    { cap: basicBand, rate: R.basicRate, label: "basic" },
    { cap: higherLimit, rate: R.higherRate, label: "higher" },
    {
      cap: Number.POSITIVE_INFINITY,
      rate: R.additionalRate,
      label: "additional",
    },
  ];

  const breakdown: CalcLine[] = [];
  let incomeTax = 0;

  let left = nsTaxable;
  let cursor = 0;
  for (const band of rateBands) {
    if (left <= 0) break;
    const room =
      band.cap === Number.POSITIVE_INFINITY
        ? left
        : Math.max(0, band.cap - cursor);
    const take = Math.min(left, room);
    if (take > 0) {
      const t = take * band.rate;
      incomeTax += t;
      breakdown.push({
        label: `Non-savings ${Math.round(band.rate * 100)}% (${band.label}) on £${fmt(take)}`,
        amount: r2(t),
      });
      left -= take;
      cursor += take;
    } else if (band.cap !== Number.POSITIVE_INFINITY) {
      cursor = Math.max(cursor, band.cap);
    }
  }

  let sav = savTaxable0;
  const startAvail = Math.max(0, R.savingsStartingRateBand - nsTaxable);
  const startUsed = Math.min(sav, startAvail);
  sav -= startUsed;
  if (startUsed) {
    breakdown.push({
      label: `Starting rate for savings 0% on £${fmt(startUsed)}`,
      amount: 0,
    });
  }
  const afterStart = nsTaxable + startUsed;
  const psa =
    afterStart + sav > higherLimit
      ? 0
      : afterStart + sav > basicBand
        ? R.psaHigher
        : R.psaBasic;
  const psaUsed = Math.min(sav, psa);
  sav -= psaUsed;
  if (psaUsed) {
    breakdown.push({
      label: `Personal Savings Allowance on £${fmt(psaUsed)}`,
      amount: 0,
    });
  }
  cursor = nsTaxable;
  left = sav;
  for (const band of rateBands) {
    if (left <= 0) break;
    const room =
      band.cap === Number.POSITIVE_INFINITY
        ? left
        : Math.max(0, band.cap - cursor);
    const take = Math.min(left, room);
    if (take > 0) {
      const t = take * band.rate;
      incomeTax += t;
      breakdown.push({
        label: `Savings ${Math.round(band.rate * 100)}% on £${fmt(take)}`,
        amount: r2(t),
      });
      left -= take;
      cursor += take;
    } else if (band.cap !== Number.POSITIVE_INFINITY) {
      cursor = Math.max(cursor, band.cap);
    }
  }

  let div = divTaxable0;
  const da = Math.min(div, R.dividendAllowance);
  div -= da;
  if (da) {
    breakdown.push({
      label: `Dividend allowance on £${fmt(da)}`,
      amount: 0,
    });
  }
  cursor = nsTaxable + savTaxable0;
  left = div;
  const divBands = [
    { cap: basicBand, rate: R.dividendBasic },
    { cap: higherLimit, rate: R.dividendHigher },
    { cap: Number.POSITIVE_INFINITY, rate: R.dividendAdditional },
  ];
  for (const band of divBands) {
    if (left <= 0) break;
    const room =
      band.cap === Number.POSITIVE_INFINITY
        ? left
        : Math.max(0, band.cap - cursor);
    const take = Math.min(left, room);
    if (take > 0) {
      const t = take * band.rate;
      incomeTax += t;
      breakdown.push({
        label: `Dividends ${(band.rate * 100).toFixed(2)}% on £${fmt(take)}`,
        amount: r2(t),
      });
      left -= take;
      cursor += take;
    } else if (band.cap !== Number.POSITIVE_INFINITY) {
      cursor = Math.max(cursor, band.cap);
    }
  }

  incomeTax = r2(incomeTax);

  let class4Nic = 0;
  if (seProfit > R.class4Lower) {
    class4Nic +=
      Math.max(0, Math.min(seProfit, R.class4Upper) - R.class4Lower) *
      R.class4Main;
    if (seProfit > R.class4Upper) {
      class4Nic += (seProfit - R.class4Upper) * R.class4Extra;
    }
  }
  class4Nic = r2(class4Nic);

  let studentLoan = 0;
  if (d.studentLoanPlan !== "none" || d.studentLoanNotification) {
    const thr =
      d.studentLoanPlan === "plan1"
        ? 26_065
        : d.studentLoanPlan === "plan4"
          ? 32_745
          : d.studentLoanPlan === "plan5"
            ? 25_000
            : R.studentLoanPlan2Threshold;
    studentLoan = Math.max(0, (totalIncome - thr) * R.studentLoanRate);
  }
  studentLoan = r2(Math.max(0, studentLoan - d.studentLoanDeducted));

  let postgraduateLoan = 0;
  if (d.hasPostgraduateLoan) {
    postgraduateLoan = Math.max(
      0,
      (totalIncome - R.pgLoanThreshold) * R.pgLoanRate -
        d.postgraduateLoanDeducted,
    );
  }
  postgraduateLoan = r2(postgraduateLoan);

  let hicbc = 0;
  if (d.childBenefitAmount > 0 && totalIncome > R.hicbcFrom) {
    if (totalIncome >= R.hicbcFullAt) hicbc = d.childBenefitAmount;
    else {
      const pct = (totalIncome - R.hicbcFrom) / 200;
      hicbc = d.childBenefitAmount * Math.min(1, pct / 100);
    }
  }
  hicbc = r2(hicbc);

  const taxDeducted = r2(
    employmentTax +
      d.seTaxTakenOff +
      d.propTaxTakenOff +
      d.dividendsForeignTax +
      d.statePensionLumpSumTax +
      d.otherPensionsTax +
      d.incapacityTax +
      d.otherIncomeTax +
      d.interestTaxedUk * (20 / 80) +
      d.taxRefunded,
  );

  const totalLiability = r2(
    incomeTax + class4Nic + studentLoan + postgraduateLoan + hicbc,
  );
  const balance = r2(totalLiability - taxDeducted);

  const summary: CalcLine[] = [
    { label: "Employment income", amount: r2(employmentIncome) },
    { label: "Self-employment profit", amount: r2(seProfit) },
    { label: "UK property profit", amount: r2(propertyProfit) },
    { label: "Savings income", amount: r2(savings) },
    { label: "Dividend income", amount: r2(dividends) },
    { label: "Pension income", amount: r2(pensions) },
    { label: "Other income", amount: r2(other) },
    { label: "Total income", amount: totalIncome },
    { label: "Allowances", amount: -r2(pa) },
    { label: "Taxable income", amount: taxableIncome },
    { label: "Income Tax", amount: incomeTax },
    { label: "Class 4 National Insurance", amount: class4Nic },
    ...(studentLoan ? [{ label: "Student Loan", amount: studentLoan }] : []),
    ...(postgraduateLoan
      ? [{ label: "Postgraduate Loan", amount: postgraduateLoan }]
      : []),
    ...(hicbc
      ? [{ label: "High Income Child Benefit Charge", amount: hicbc }]
      : []),
    { label: "Tax already paid / deducted", amount: -taxDeducted },
    {
      label: balance >= 0 ? "Amount to pay" : "Refund due",
      amount: Math.abs(balance),
    },
  ];

  return {
    taxYear: d.taxYear || TAX_YEAR_LABEL,
    employmentIncome: r2(employmentIncome),
    selfEmploymentProfit: r2(seProfit),
    propertyProfit: r2(propertyProfit),
    savingsIncome: r2(savings),
    dividendIncome: r2(dividends),
    pensionIncome: r2(pensions),
    otherIncome: r2(other),
    totalIncome,
    personalAllowance: r2(pa),
    taxableIncome,
    incomeTax,
    class4Nic,
    studentLoan,
    postgraduateLoan,
    hicbc,
    taxDeducted,
    totalLiability,
    balance,
    amountDue: balance > 0 ? balance : 0,
    refundDue: balance < 0 ? -balance : 0,
    paymentsOnAccountEach: balance > 0 ? r2(balance / 2) : 0,
    breakdown,
    summary,
  };
}
