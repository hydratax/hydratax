/**
 * Compact accountant-facing glossaries for desk UI abbreviations.
 * Keep blurbs short — shown in AbbrInfo popups, not under-field essays.
 */

export type DeskAbbrEntry = {
  /** Short expanded title */
  title: string;
  /** One–two sentences: what it is and how it’s used here */
  blurb: string;
};

export const DESK_ABBREVIATIONS = {
  SMP: {
    title: "Statutory Maternity Pay",
    blurb:
      "Pay to an employee on maternity leave. Recover most of it (usually 92%) on the EPS for this tax month.",
  },
  SPP: {
    title: "Statutory Paternity Pay",
    blurb:
      "Pay for qualifying paternity leave. Enter the amount recovered from HMRC on this EPS.",
  },
  SAP: {
    title: "Statutory Adoption Pay",
    blurb:
      "Pay for qualifying adoption leave. Enter the amount recovered from HMRC on this EPS.",
  },
  ShPP: {
    title: "Shared Parental Pay",
    blurb:
      "Pay when parents share leave after birth or adoption. Enter the amount recovered on this EPS.",
  },
  SPBP: {
    title: "Statutory Parental Bereavement Pay",
    blurb:
      "Pay after the death of a child or stillbirth. Enter the amount recovered on this EPS.",
  },
  SNCP: {
    title: "Statutory Neonatal Care Pay",
    blurb:
      "Pay when a baby needs neonatal care and the parent qualifies. Enter the amount recovered on this EPS.",
  },
  SSP: {
    title: "Statutory Sick Pay",
    blurb:
      "Minimum sick pay for qualifying absence. Shown on the pay run; not recovered through EPS like family leave.",
  },
  NIC: {
    title: "National Insurance contributions",
    blurb:
      "Employee and employer NI for the period. Compensation on statutory pay can reduce what you pay HMRC.",
  },
  "NIC_SMP": {
    title: "NIC compensation on SMP",
    blurb:
      "Extra recovery some employers claim for employer NI on SMP. Only enter if the scheme qualifies.",
  },
  NI: {
    title: "National Insurance",
    blurb:
      "Employee National Insurance deducted in this pay run (Class 1).",
  },
  DIRECTOR: {
    title: "Company director",
    blurb:
      "Tick when this person is a director of the company. Directors’ NI is usually calculated annually (AN). Use alternative (AL) only if you apply the period method. Leave unticked for ordinary employees.",
  },
  AN: {
    title: "Directors’ NI — annual",
    blurb:
      "Default for most directors: NI is assessed on the year-to-date earnings against the annual thresholds.",
  },
  AL: {
    title: "Directors’ NI — alternative",
    blurb:
      "Period method for directors’ NI. Only use when you intentionally apply the alternative calculation.",
  },
  W1M1: {
    title: "Week 1 / Month 1",
    blurb:
      "Non-cumulative tax basis — each pay is taxed on its own, ignoring year-to-date. Use only when HMRC or a P45 instructs it.",
  },
  PGL: {
    title: "Postgraduate loan",
    blurb:
      "Deduct postgraduate loan repayments alongside any student loan plan when the notice says so.",
  },
  FPS: {
    title: "Full Payment Submission",
    blurb:
      "RTI filing that reports each employee’s pay, tax and NI for a pay date. File after you save the payslips.",
  },
  EPS: {
    title: "Employer Payment Summary",
    blurb:
      "RTI filing for periods with no pay, or to reclaim statutory payments, NIC compensation and apprenticeship levy.",
  },
  PAYE: {
    title: "Pay As You Earn",
    blurb:
      "The employer’s HMRC payroll scheme reference (office number / reference). Needed for every RTI filing.",
  },
  P60: {
    title: "P60 end-of-year certificate",
    blurb:
      "Year-end statement of pay, tax and NI for an employee still on the payroll at 5 April.",
  },
  P45: {
    title: "P45 leaving certificate",
    blurb:
      "Leaving statement with YTD figures for a leaver. Give Part 1A to the employee; file via FPS.",
  },
  P32: {
    title: "P32 Employer Payment Record",
    blurb:
      "Working sheet of PAYE, NI and recoveries due to HMRC for each tax month.",
  },
  P11D: {
    title: "P11D expenses and benefits",
    blurb:
      "Return of taxable benefits and expenses for an employee or director for the tax year.",
  },
  AE: {
    title: "Auto Enrolment",
    blurb:
      "Workplace pension duties — assess workers, enrol eligible staff and deduct contributions.",
  },
  UTR: {
    title: "Unique Taxpayer Reference",
    blurb:
      "HMRC 10-digit tax reference. Personal UTR for Self Assessment; company UTR for Corporation Tax — do not mix them.",
  },
  CT: {
    title: "Corporation Tax",
    blurb:
      "Company tax on profits. Filed on the CT600 with the accounts for the accounting period.",
  },
  NINO: {
    title: "National Insurance number",
    blurb:
      "The employee’s personal NI number (e.g. QQ 12 34 56 A). Required on the FPS for each worker.",
  },
  RTI: {
    title: "Real Time Information",
    blurb:
      "HMRC’s system for reporting PAYE as you pay — mainly FPS each pay date and EPS when needed.",
  },
  YTD: {
    title: "Year to date",
    blurb:
      "Totals from the start of the tax year (6 April) to this pay date or period end.",
  },
  CT600: {
    title: "Corporation Tax return (CT600)",
    blurb:
      "The company tax return filed to HMRC for an accounting period, usually with the accounts.",
  },
  VAT: {
    title: "Value Added Tax",
    blurb:
      "Tax on taxable supplies. MTD VAT returns report boxes 1–9 for each VAT period.",
  },
  VRN: {
    title: "VAT registration number",
    blurb:
      "Nine-digit VAT number (sometimes written with a GB prefix). Identifies the VAT scheme on returns.",
  },
  MTD: {
    title: "Making Tax Digital",
    blurb:
      "HMRC’s digital filing rules — keep digital records and submit VAT (and soon Income Tax) online.",
  },
  SA100: {
    title: "Self Assessment tax return",
    blurb:
      "Main personal tax return for an individual. Supplementary pages cover employment, trade and property.",
  },
  SA302: {
    title: "SA302 tax calculation",
    blurb:
      "HMRC-style calculation of Income Tax and Class 4 NI for the year — often needed for mortgages or packing.",
  },
  SA102: {
    title: "Employment page (SA102)",
    blurb:
      "Self Assessment page for employment income, tax deducted and benefits from a P60 / P11D.",
  },
  SA103: {
    title: "Self-employment page (SA103)",
    blurb:
      "Self Assessment page for sole-trader profits and allowable expenses.",
  },
  SA105: {
    title: "Property page (SA105)",
    blurb:
      "Self Assessment page for UK property income and expenses.",
  },
  SA800: {
    title: "Partnership tax return (SA800)",
    blurb:
      "Partnership return of profits. Each partner still files their own SA100 for their share.",
  },
  SA104: {
    title: "Partnership page (SA104)",
    blurb:
      "Self Assessment page for a partner’s share of partnership profits on their personal SA100.",
  },
} as const satisfies Record<string, DeskAbbrEntry>;

export type DeskAbbrCode = keyof typeof DESK_ABBREVIATIONS;

export function deskAbbr(code: string): DeskAbbrEntry | null {
  const entry = DESK_ABBREVIATIONS[code as DeskAbbrCode];
  return entry ?? null;
}
