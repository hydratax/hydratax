import { ratesForTaxYear, TAX_YEAR_LABEL } from "./rates-by-year";
import {
  employmentBenefitsTotal,
  employmentExpensesTotal,
  propCapitalAllowancesTotal,
  propExpensesBreakdownTotal,
  seCapitalAllowancesBreakdownTotal,
  seDisallowableBreakdownTotal,
  seExpensesBreakdownTotal,
  type Sa100Draft,
} from "./schema";

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
  /** Income tax charged on employment (PAYE) income after allowances. */
  employmentIncomeTax: number;
  /** Income tax charged on self-employment profit. */
  selfEmploymentIncomeTax: number;
  /** Income tax charged on UK property / rental profit (after finance-cost relief). */
  propertyIncomeTax: number;
  /** Income tax charged on savings interest. */
  savingsIncomeTax: number;
  /** Income tax charged on dividends. */
  dividendIncomeTax: number;
  /** Income tax on pensions and other taxable income. */
  otherIncomeTax: number;
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

/** Approximate SA302-style calculation (estimate before submit). Uses draft.taxYear rates. */
export function calculateSa302(d: Sa100Draft): Sa302Result {
  const R = ratesForTaxYear(d.taxYear);
  const employmentIncome = d.employments.reduce((s, e) => {
    const gross = e.pay + e.tips + employmentBenefitsTotal(e);
    return s + Math.max(0, gross - employmentExpensesTotal(e));
  }, 0);
  const employmentTax = d.employments.reduce((s, e) => s + e.taxTakenOff, 0);

  const seExpenseTotal = (() => {
    const broken = seExpensesBreakdownTotal(d);
    return broken > 0 ? broken : d.seExpenses;
  })();
  const seCaTotal = (() => {
    const broken = seCapitalAllowancesBreakdownTotal(d);
    return broken > 0 ? broken : d.seCapitalAllowances;
  })();
  const seIncome =
    d.seTurnover +
    d.seOtherBusinessIncome +
    d.seBalancingCharges +
    d.seGoodsOwnUse;
  const seDisallowable = (() => {
    const broken = seDisallowableBreakdownTotal(d);
    return broken > 0 ? broken : d.seDisallowableTotal;
  })();
  const seProfit = Math.max(
    0,
    seIncome -
      Math.max(0, seExpenseTotal - seDisallowable) -
      seCaTotal -
      d.seTradingAllowance,
  );
  const propExpenseTotal = (() => {
    const broken = propExpensesBreakdownTotal(d);
    return broken > 0 ? broken : d.propExpenses;
  })();
  const propIncome =
    d.propRents +
    d.propOtherIncome +
    d.propLeasePremiums +
    d.propReversePremiums +
    d.propBalancingCharges;
  const propertyProfit = Math.max(
    0,
    propIncome -
      d.propIncomeAllowance -
      propExpenseTotal -
      d.propPrivateUse -
      propCapitalAllowancesTotal(d) -
      d.propRentARoomExempt,
  );
  // Residential finance costs (box 44) give tax reduction, not a profit deduction —
  // kept on the draft for SA105; basic 20% relief approximated below after income tax.

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

  // Personal allowance stacks against income in HMRC order so we can
  // attribute tax by source for the estimate panel.
  const nsSlices: { key: string; label: string; amount: number }[] = [
    { key: "employment", label: "Employment (PAYE)", amount: employmentIncome },
    { key: "selfEmployment", label: "Self-employment", amount: seProfit },
    { key: "property", label: "UK property / rental", amount: propertyProfit },
    { key: "pension", label: "Pensions", amount: pensions },
    { key: "other", label: "Other income", amount: other },
  ];
  let allow = pa;
  const nsTaxableSlices = nsSlices.map((s) => {
    const used = Math.min(s.amount, allow);
    allow -= used;
    return { ...s, taxable: Math.max(0, s.amount - used) };
  });
  const nsTaxable = nsTaxableSlices.reduce((s, x) => s + x.taxable, 0);
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
  let employmentIncomeTax = 0;
  let selfEmploymentIncomeTax = 0;
  let propertyIncomeTax = 0;
  let savingsIncomeTax = 0;
  let dividendIncomeTax = 0;
  let otherIncomeTax = 0;

  const addSourceTax = (key: string, t: number) => {
    if (key === "employment") employmentIncomeTax += t;
    else if (key === "selfEmployment") selfEmploymentIncomeTax += t;
    else if (key === "property") propertyIncomeTax += t;
    else otherIncomeTax += t;
  };

  let cursor = 0;
  for (const slice of nsTaxableSlices) {
    let left = slice.taxable;
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
        addSourceTax(slice.key, t);
        breakdown.push({
          label: `${slice.label} ${Math.round(band.rate * 100)}% (${band.label}) on £${fmt(take)}`,
          amount: r2(t),
        });
        left -= take;
        cursor += take;
      } else if (band.cap !== Number.POSITIVE_INFINITY) {
        cursor = Math.max(cursor, band.cap);
      }
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
  let left = sav;
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
      savingsIncomeTax += t;
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
      dividendIncomeTax += t;
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
  employmentIncomeTax = r2(employmentIncomeTax);
  selfEmploymentIncomeTax = r2(selfEmploymentIncomeTax);
  propertyIncomeTax = r2(propertyIncomeTax);
  savingsIncomeTax = r2(savingsIncomeTax);
  dividendIncomeTax = r2(dividendIncomeTax);
  otherIncomeTax = r2(otherIncomeTax);

  const residentialFinanceRelief = r2(
    Math.min(
      incomeTax,
      (d.propFinanceCosts + d.propFinanceCostsBroughtForward) * 0.2,
    ),
  );
  if (residentialFinanceRelief > 0) {
    const againstProperty = Math.min(
      propertyIncomeTax,
      residentialFinanceRelief,
    );
    propertyIncomeTax = r2(propertyIncomeTax - againstProperty);
    const remainder = residentialFinanceRelief - againstProperty;
    if (remainder > 0) {
      // Relief can reduce other income tax if property tax alone is insufficient.
      const againstOther = Math.min(otherIncomeTax, remainder);
      otherIncomeTax = r2(otherIncomeTax - againstOther);
      const rest = remainder - againstOther;
      if (rest > 0) {
        const againstEmp = Math.min(employmentIncomeTax, rest);
        employmentIncomeTax = r2(employmentIncomeTax - againstEmp);
        const rest2 = rest - againstEmp;
        if (rest2 > 0) {
          const againstSe = Math.min(selfEmploymentIncomeTax, rest2);
          selfEmploymentIncomeTax = r2(selfEmploymentIncomeTax - againstSe);
          const rest3 = rest2 - againstSe;
          if (rest3 > 0) {
            savingsIncomeTax = r2(
              Math.max(0, savingsIncomeTax - rest3),
            );
          }
        }
      }
    }
    incomeTax = r2(incomeTax - residentialFinanceRelief);
    breakdown.push({
      label: `Residential property finance costs relief (20%)`,
      amount: -residentialFinanceRelief,
    });
  }

  let class4Nic = 0;
  if (!d.seClass4Exempt && seProfit > R.class4Lower) {
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
        ? R.studentLoanPlan1Threshold
        : d.studentLoanPlan === "plan4"
          ? R.studentLoanPlan4Threshold
          : d.studentLoanPlan === "plan5"
            ? R.studentLoanPlan5Threshold
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
      d.seCisDeductions +
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
    { label: "PAYE / employment tax", amount: employmentIncomeTax },
    { label: "Self-employment tax", amount: selfEmploymentIncomeTax },
    { label: "Rental income tax", amount: propertyIncomeTax },
    { label: "Savings tax", amount: savingsIncomeTax },
    { label: "Dividend tax", amount: dividendIncomeTax },
    { label: "Other income tax", amount: otherIncomeTax },
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
    employmentIncomeTax,
    selfEmploymentIncomeTax,
    propertyIncomeTax,
    savingsIncomeTax,
    dividendIncomeTax,
    otherIncomeTax,
    class4Nic,
    studentLoan,
    postgraduateLoan,
    hicbc,
    taxDeducted,
    totalLiability,
    balance,
    amountDue: balance > 0 ? balance : 0,
    refundDue: balance < 0 ? -balance : 0,
    // HMRC payments on account (s59A TMA 1970 / SALF303):
    // each PoA = 50% of the "relevant amount" = (Income Tax + Class 4 NIC)
    // minus tax deducted at source. No PoA if relevant amount < £1,000 or
    // if ≥80% of the assessed IT+C4 was collected at source. Student loan,
    // postgraduate loan and HICBC are not part of the PoA base.
    paymentsOnAccountEach: (() => {
      const assessed = r2(incomeTax + class4Nic);
      const relevant = r2(Math.max(0, assessed - taxDeducted));
      if (relevant < 1000) return 0;
      if (assessed > 0 && taxDeducted / assessed >= 0.8) return 0;
      return r2(relevant / 2);
    })(),
    breakdown,
    summary,
  };
}
