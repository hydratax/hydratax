import { pence, multiplyPence, type Pence } from "@/server/money/pence";
import { sha256Hex } from "./crypto";
import { getHmrcConfig } from "./config";
import {
  autoEnrolmentPension,
  buildStatutoryElements,
  TAX_YEAR_2026_27,
  type TimesheetAdjustments,
} from "@/server/payroll/statutory";
import {
  wrapRtiGovTalk,
  submitAndPollRtiXml,
  parsePayeRef,
  escapeXml,
} from "@/server/hmrc/rti-submit";
import { computeRtiIrmark, injectRtiIrmark } from "@/server/hmrc/rti-irmark";
import {
  approximateNiBandsYtd,
  fpsAddressFromText,
  fpsNameToken,
  hoursWorkedCode,
  periodsElapsedInTaxYear,
  rtiTaxMonthNo,
  rtiTaxWeekNo,
} from "@/server/hmrc/rti-fps-fields";

export type PayFrequency = "M1" | "W1";

export type EmployeeGender = "M" | "F";

export type EmployeePayInput = {
  id: string;
  payrollId: string;
  previousPayrollId?: string | null;
  payrollIdChanged?: boolean;
  forename: string;
  surname: string;
  nino: string;
  /** Required by HMRC FPS EmployeeDetails.Gender */
  gender?: EmployeeGender | null;
  dateOfBirth?: string | null;
  address?: string | null;
  taxCode: string;
  annualSalaryPence: number;
  startDate?: string;
  leaveDate?: string | null;
  starterDeclaration?: "A" | "B" | "C" | null;
  firstFpsSent?: boolean;
  niCategory?: string;
  hoursPerWeekHundredths?: number;
  hourlyRatePence?: number;
  payBasis?: "salary" | "hourly";
  pensionOptOut?: boolean;
  sspQualifyingDays?: number;
  adjustments?: TimesheetAdjustments | null;
};

export type PayLine = {
  employeeId: string;
  payrollId: string;
  previousPayrollId?: string | null;
  payrollIdChanged?: boolean;
  forename: string;
  surname: string;
  nino: string;
  gender: EmployeeGender | null;
  dateOfBirth: string | null;
  address: string | null;
  taxCode: string;
  niCategory: string;
  hoursPerWeekHundredths: number;
  startDate: string;
  leaveDate?: string | null;
  starterDeclaration?: "A" | "B" | "C" | null;
  isStarterThisRun: boolean;
  ordinaryPence: number;
  overtimePence: number;
  holidayPence: number;
  sspPence: number;
  smpPence: number;
  sppPence: number;
  sapPence: number;
  shppPence: number;
  spbpPence: number;
  sncpPence: number;
  unpaidAbsence: boolean;
  onStrike: boolean;
  grossPence: number;
  taxablePence: number;
  taxPence: number;
  employeeNiPence: number;
  employerNiPence: number;
  pensionEmployeePence: number;
  pensionEmployerPence: number;
  netPence: number;
  ytdGrossPence: number;
  ytdTaxablePence: number;
  ytdTaxPence: number;
  ytdEmployeeNiPence: number;
  ytdEmployerNiPence: number;
  ytdSmpPence: number;
  ytdSppPence: number;
  ytdSapPence: number;
  ytdShppPence: number;
  ytdSpbpPence: number;
  ytdSncpPence: number;
  notes: string[];
};

export type YtdTotals = {
  grossPence: number;
  taxablePence?: number;
  taxPence: number;
  employeeNiPence: number;
  employerNiPence?: number;
  smpPence?: number;
  sppPence?: number;
  sapPence?: number;
  shppPence?: number;
  spbpPence?: number;
  sncpPence?: number;
};

/** Simplified UK PAYE calculator (not a full HMRC tax engine). Monthly default. */
export function calculateMonthlyPay(
  emp: Omit<EmployeePayInput, "payrollId"> & { payrollId?: string },
  ytd?: YtdTotals,
): PayLine {
  return calculatePeriodPay(
    {
      ...emp,
      payrollId: emp.payrollId ?? emp.id.slice(0, 8).toUpperCase(),
    },
    "M1",
    ytd,
  );
}

export function calculatePeriodPay(
  emp: EmployeePayInput,
  frequency: PayFrequency,
  ytd?: YtdTotals,
): PayLine {
  const periods = frequency === "W1" ? 52 : 12;
  const elements = buildStatutoryElements({
    frequency,
    annualSalaryPence: emp.annualSalaryPence,
    hoursPerWeekHundredths: emp.hoursPerWeekHundredths ?? 3750,
    hourlyRatePence: emp.hourlyRatePence ?? 0,
    payBasis: emp.payBasis ?? "salary",
    pensionOptOut: Boolean(emp.pensionOptOut),
    qualifyingDays: emp.sspQualifyingDays ?? 5,
    adjustments: emp.adjustments,
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
    optedOut: Boolean(emp.pensionOptOut),
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
  const st =
    frequency === "W1"
      ? TAX_YEAR_2026_27.niStWeeklyPence
      : TAX_YEAR_2026_27.niStMonthlyPence;
  const employeeNi = multiplyPence(
    pence(Math.max(0, Number(gross) - pt)),
    TAX_YEAR_2026_27.niEmployeeBps / 10_000,
  );
  const employerNi = multiplyPence(
    pence(Math.max(0, Number(gross) - st)),
    TAX_YEAR_2026_27.niEmployerBps / 10_000,
  );
  const net = pence(
    Number(gross) -
      Number(tax) -
      Number(employeeNi) -
      pension.employeePence,
  );
  const prior = ytd ?? {
    grossPence: 0,
    taxablePence: 0,
    taxPence: 0,
    employeeNiPence: 0,
    employerNiPence: 0,
    smpPence: 0,
    sppPence: 0,
    sapPence: 0,
    shppPence: 0,
    spbpPence: 0,
    sncpPence: 0,
  };

  return {
    employeeId: emp.id,
    payrollId: emp.payrollId,
    previousPayrollId: emp.previousPayrollId ?? null,
    payrollIdChanged: Boolean(emp.payrollIdChanged && emp.previousPayrollId),
    forename: emp.forename,
    surname: emp.surname,
    nino: emp.nino,
    gender: emp.gender === "M" || emp.gender === "F" ? emp.gender : null,
    dateOfBirth: emp.dateOfBirth ?? null,
    address: emp.address ?? null,
    taxCode: emp.taxCode,
    niCategory: emp.niCategory || "A",
    hoursPerWeekHundredths: emp.hoursPerWeekHundredths ?? 3750,
    startDate: emp.startDate || "",
    leaveDate: emp.leaveDate ?? null,
    starterDeclaration: emp.firstFpsSent ? null : emp.starterDeclaration ?? "A",
    isStarterThisRun: !emp.firstFpsSent,
    ordinaryPence: elements.ordinaryPence,
    overtimePence: elements.overtimePence,
    holidayPence: elements.holidayPence,
    sspPence: elements.sspPence,
    smpPence: elements.smpPence,
    sppPence: elements.sppPence,
    sapPence: elements.sapPence,
    shppPence: elements.shppPence,
    spbpPence: elements.spbpPence,
    sncpPence: elements.sncpPence,
    unpaidAbsence: elements.unpaidAbsence,
    onStrike: elements.onStrike,
    grossPence: Number(gross),
    taxablePence: Number(taxablePay),
    taxPence: Number(tax),
    employeeNiPence: Number(employeeNi),
    employerNiPence: Number(employerNi),
    pensionEmployeePence: pension.employeePence,
    pensionEmployerPence: pension.employerPence,
    netPence: Number(net),
    ytdGrossPence: prior.grossPence + Number(gross),
    ytdTaxablePence: (prior.taxablePence ?? prior.grossPence) + Number(taxablePay),
    ytdTaxPence: prior.taxPence + Number(tax),
    ytdEmployeeNiPence: prior.employeeNiPence + Number(employeeNi),
    ytdEmployerNiPence: (prior.employerNiPence ?? 0) + Number(employerNi),
    ytdSmpPence: (prior.smpPence ?? 0) + elements.smpPence,
    ytdSppPence: (prior.sppPence ?? 0) + elements.sppPence,
    ytdSapPence: (prior.sapPence ?? 0) + elements.sapPence,
    ytdShppPence: (prior.shppPence ?? 0) + elements.shppPence,
    ytdSpbpPence: (prior.spbpPence ?? 0) + elements.spbpPence,
    ytdSncpPence: (prior.sncpPence ?? 0) + elements.sncpPence,
    notes: elements.notes,
  };
}

function penceXml(amount: number) {
  return (amount / 100).toFixed(2);
}

function rtiSchemaNs(
  kind: "FullPaymentSubmission" | "EmployerPaymentSummary",
  taxYear: string,
): string {
  const year = taxYear.trim() || "25-26";
  return `http://www.govtalk.gov.uk/taxation/PAYE/RTI/${kind}/${year}/1`;
}

/** IRheader PeriodEnd for RTI = tax year end (5 April), not the pay/no-pay month end. */
export function rtiTaxYearPeriodEnd(taxYear: string): string {
  const m = /^(\d{2})-(\d{2})$/.exec(taxYear.trim());
  if (!m) {
    // Accept 2026-27
    const full = /^(\d{4})-(\d{2})$/.exec(taxYear.trim());
    if (full) return `${Number(full[1]) + 1}-04-05`;
    throw new Error(`Invalid RTI tax year: ${taxYear}`);
  }
  const endCentury = Number(m[1]) >= 70 ? 1900 : 2000;
  const endYear = endCentury + Number(m[2]);
  return `${endYear}-04-05`;
}

function buildRtiIrHeader(opts: {
  employerPayeRef: string;
  /** Tax year end ISO date (YYYY-04-05) */
  periodEnd: string;
}): string {
  const { officeNo, reference } = parsePayeRef(opts.employerPayeRef);
  return `<IRheader>
        <Keys>
          <Key Type="TaxOfficeNumber">${escapeXml(officeNo)}</Key>
          <Key Type="TaxOfficeReference">${escapeXml(reference)}</Key>
        </Keys>
        <PeriodEnd>${escapeXml(opts.periodEnd)}</PeriodEnd>
        <DefaultCurrency>GBP</DefaultCurrency>
        <Sender>Employer</Sender>
      </IRheader>`;
}

function withIrmark(bodyWithoutMark: string): {
  bodyInner: string;
  irmark: string;
} {
  const irmark = computeRtiIrmark(bodyWithoutMark);
  return { bodyInner: injectRtiIrmark(bodyWithoutMark, irmark), irmark };
}

function optionalMoneyXml(tag: string, amountPence: number): string {
  if (amountPence <= 0) return "";
  return `\n                            <${tag}>${penceXml(amountPence)}</${tag}>`;
}

function buildFpsEmployeeXml(
  l: PayLine,
  opts: { payDate: string; frequency: PayFrequency },
): string {
  if (l.gender !== "M" && l.gender !== "F") {
    throw new Error(
      `FPS requires Gender (M/F) for ${l.forename} ${l.surname}. Add gender on the employee record before submitting.`,
    );
  }
  const fore = fpsNameToken(l.forename);
  const sur = fpsNameToken(l.surname);
  const addr = fpsAddressFromText(l.address);
  const addressXml = addr
    ? `
          <Address>
            ${addr.lines.map((line) => `<Line>${escapeXml(line)}</Line>`).join("\n            ")}
            ${addr.ukPostcode ? `<UKPostcode>${escapeXml(addr.ukPostcode)}</UKPostcode>` : ""}
          </Address>`
    : "";
  const birthXml = l.dateOfBirth
    ? `
          <BirthDate>${escapeXml(l.dateOfBirth)}</BirthDate>`
    : "";

  const starter =
    l.isStarterThisRun && l.starterDeclaration
      ? `
          <Starter>
            ${l.startDate ? `<StartDate>${escapeXml(l.startDate)}</StartDate>` : ""}
            <StartDec>${escapeXml(l.starterDeclaration)}</StartDec>
          </Starter>`
      : "";
  const pidChange =
    l.payrollIdChanged && l.previousPayrollId
      ? `
          <PayIdChgd>
            <PayrollIdChangedIndicator>yes</PayrollIdChangedIndicator>
            <OldPayrollId>${escapeXml(l.previousPayrollId)}</OldPayrollId>
          </PayIdChgd>`
      : "";
  const leaver = l.leaveDate
    ? `
          <LeavingDate>${escapeXml(l.leaveDate)}</LeavingDate>`
    : "";

  const periodNo =
    opts.frequency === "W1"
      ? `<WeekNo>${rtiTaxWeekNo(opts.payDate)}</WeekNo>`
      : `<MonthNo>${rtiTaxMonthNo(opts.payDate)}</MonthNo>`;
  const hours = hoursWorkedCode(l.hoursPerWeekHundredths);
  const payAfterStat = Math.max(
    0,
    (l.taxablePence ?? l.grossPence) - l.taxPence - l.employeeNiPence,
  );
  const pensionPaid =
    l.pensionEmployeePence > 0
      ? `
                            <EmpeePenContribnsPaid>${penceXml(l.pensionEmployeePence)}</EmpeePenContribnsPaid>`
      : "";
  const unpaid = l.unpaidAbsence
    ? `
                            <UnpaidAbsence>yes</UnpaidAbsence>`
    : "";
  const strike = l.onStrike
    ? `
                            <OnStrike>yes</OnStrike>`
    : "";

  const periods = periodsElapsedInTaxYear(opts.frequency, opts.payDate);
  const lel =
    opts.frequency === "W1"
      ? TAX_YEAR_2026_27.lelWeeklyPence
      : Math.round((TAX_YEAR_2026_27.lelWeeklyPence * 52) / 12);
  const pt =
    opts.frequency === "W1"
      ? TAX_YEAR_2026_27.niPtWeeklyPence
      : TAX_YEAR_2026_27.niPtMonthlyPence;
  const uel =
    opts.frequency === "W1"
      ? TAX_YEAR_2026_27.niUelWeeklyPence
      : TAX_YEAR_2026_27.niUelMonthlyPence;
  const bands = approximateNiBandsYtd({
    frequency: opts.frequency,
    ytdGrossPence: l.ytdGrossPence,
    periodsElapsed: periods,
    lelPeriodPence: lel,
    ptPeriodPence: pt,
    uelPeriodPence: uel,
  });

  return `
      <Employee>
        <EmployeeDetails>
          <NINO>${escapeXml(l.nino.replace(/\s+/g, "").toUpperCase())}</NINO>
          <Name>
            <Fore>${escapeXml(fore)}</Fore>
            <Sur>${escapeXml(sur)}</Sur>
          </Name>${addressXml}${birthXml}
          <Gender>${l.gender}</Gender>
        </EmployeeDetails>
        <Employment>${starter}
          <PayId>${escapeXml(l.payrollId)}</PayId>${pidChange}${leaver}
          <FiguresToDate>
            <TaxablePay>${penceXml(l.ytdTaxablePence ?? l.ytdGrossPence)}</TaxablePay>
            <TotalTax>${penceXml(l.ytdTaxPence)}</TotalTax>
          </FiguresToDate>
          <Payment>
            <PayFreq>${opts.frequency}</PayFreq>
            <PmtDate>${escapeXml(opts.payDate)}</PmtDate>
            ${periodNo}
            <PeriodsCovered>1</PeriodsCovered>
            <HoursWorked>${hours}</HoursWorked>
            <TaxCode>${escapeXml(l.taxCode)}</TaxCode>
            <TaxablePay>${penceXml(l.taxablePence ?? l.grossPence)}</TaxablePay>
            <PayAfterStatDedns>${penceXml(payAfterStat)}</PayAfterStatDedns>${pensionPaid}
            <TaxDeductedOrRefunded>${penceXml(l.taxPence)}</TaxDeductedOrRefunded>${strike}${unpaid}${optionalMoneyXml("SMPYTD", l.ytdSmpPence)}${optionalMoneyXml("SPPYTD", l.ytdSppPence)}${optionalMoneyXml("SAPYTD", l.ytdSapPence)}${optionalMoneyXml("ShPPYTD", l.ytdShppPence)}${optionalMoneyXml("SPBPYTD", l.ytdSpbpPence)}${optionalMoneyXml("SNCPYTD", l.ytdSncpPence)}
          </Payment>
          <NIlettersAndValues>
            <NIletter>${escapeXml(l.niCategory)}</NIletter>
            <GrossEarningsForNICsInPd>${penceXml(l.grossPence)}</GrossEarningsForNICsInPd>
            <GrossEarningsForNICsYTD>${penceXml(l.ytdGrossPence)}</GrossEarningsForNICsYTD>
            <AtLELYTD>${penceXml(bands.atLelYtdPence)}</AtLELYTD>
            <LELtoPTYTD>${penceXml(bands.lelToPtYtdPence)}</LELtoPTYTD>
            <PTtoUELYTD>${penceXml(bands.ptToUelYtdPence)}</PTtoUELYTD>
            <TotalEmpNICInPd>${penceXml(l.employerNiPence)}</TotalEmpNICInPd>
            <TotalEmpNICYTD>${penceXml(l.ytdEmployerNiPence)}</TotalEmpNICYTD>
            <EmpeeContribnsInPd>${penceXml(l.employeeNiPence)}</EmpeeContribnsInPd>
            <EmpeeContribnsYTD>${penceXml(l.ytdEmployeeNiPence)}</EmpeeContribnsYTD>
          </NIlettersAndValues>
        </Employment>
      </Employee>`;
}

function buildFpsBodyInner(opts: {
  employerPayeRef: string;
  accountsOfficeRef: string;
  payDate: string;
  taxYear: string;
  frequency: PayFrequency;
  lines: PayLine[];
}): { bodyInner: string; irmark: string } {
  const { officeNo, reference } = parsePayeRef(opts.employerPayeRef);
  if (!opts.lines.length) {
    throw new Error("FPS requires at least one Employee (use EPS for no payment).");
  }
  const employeeXml = opts.lines
    .map((l) =>
      buildFpsEmployeeXml(l, {
        payDate: opts.payDate,
        frequency: opts.frequency,
      }),
    )
    .join("\n");

  // XSD order: EmpRefs → RelatedTaxYear → Employee+ (no root EmpPayment)
  const draft = `<IRenvelope xmlns="${rtiSchemaNs("FullPaymentSubmission", opts.taxYear)}">
      ${buildRtiIrHeader({
        employerPayeRef: opts.employerPayeRef,
        periodEnd: rtiTaxYearPeriodEnd(opts.taxYear),
      })}
      <FullPaymentSubmission>
        <EmpRefs>
          <OfficeNo>${escapeXml(officeNo)}</OfficeNo>
          <PayeRef>${escapeXml(reference)}</PayeRef>
          <AORef>${escapeXml(opts.accountsOfficeRef)}</AORef>
        </EmpRefs>
        <RelatedTaxYear>${escapeXml(opts.taxYear)}</RelatedTaxYear>
        ${employeeXml}
      </FullPaymentSubmission>
    </IRenvelope>`;
  return withIrmark(draft);
}

function buildEpsBodyInner(opts: {
  employerPayeRef: string;
  accountsOfficeRef: string;
  taxYear: string;
  periodStart: string;
  periodEnd: string;
  noPaymentForPeriod?: boolean;
}): { bodyInner: string; irmark: string } {
  const { officeNo, reference } = parsePayeRef(opts.employerPayeRef);
  // HMRC EPS schema: NoPaymentForPeriod + NoPaymentDates/From|To (no NoPaymentPeriod wrapper).
  // From day must be 06; To day must be 05 (tax-month bounds).
  const noPay = opts.noPaymentForPeriod
    ? `<NoPaymentForPeriod>yes</NoPaymentForPeriod>
        <NoPaymentDates>
          <From>${escapeXml(opts.periodStart)}</From>
          <To>${escapeXml(opts.periodEnd)}</To>
        </NoPaymentDates>`
    : "";

  // Element order is schema-fixed (HMRC EmployerPaymentSummary XSD):
  // EmpRefs → optional NoPayment* → … → RelatedTaxYear (required, near end).
  const draft = `<IRenvelope xmlns="${rtiSchemaNs("EmployerPaymentSummary", opts.taxYear)}">
      ${buildRtiIrHeader({
        employerPayeRef: opts.employerPayeRef,
        periodEnd: rtiTaxYearPeriodEnd(opts.taxYear),
      })}
      <EmployerPaymentSummary>
        <EmpRefs>
          <OfficeNo>${escapeXml(officeNo)}</OfficeNo>
          <PayeRef>${escapeXml(reference)}</PayeRef>
          <AORef>${escapeXml(opts.accountsOfficeRef)}</AORef>
        </EmpRefs>
        ${noPay}
        <RelatedTaxYear>${escapeXml(opts.taxYear)}</RelatedTaxYear>
      </EmployerPaymentSummary>
    </IRenvelope>`;
  return withIrmark(draft);
}

export function buildFpsXml(opts: {
  employerPayeRef: string;
  accountsOfficeRef: string;
  payDate: string;
  taxYear: string;
  frequency: PayFrequency;
  lines: PayLine[];
  senderId?: string;
  senderPassword?: string;
  gatewayTest?: boolean;
}): { xml: string; hash: string; bodyInner: string; irmark: string } {
  const { bodyInner, irmark } = buildFpsBodyInner(opts);
  const cfg = getHmrcConfig();
  const gatewayTest = opts.gatewayTest ?? cfg.env !== "production";
  const xml =
    opts.senderId && opts.senderPassword
      ? wrapRtiGovTalk({
          className: "HMRC-PAYE-RTI-FPS",
          bodyInner,
          payeRef: opts.employerPayeRef,
          senderId: opts.senderId,
          senderPassword: opts.senderPassword,
          gatewayTest,
        })
      : `<?xml version="1.0" encoding="UTF-8"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><Body>${bodyInner}</Body></GovTalkMessage>`;
  return { xml, hash: sha256Hex(xml), bodyInner, irmark };
}

/**
 * HydraTax EPS live path is no-payment only. Recoverable SMP/SPP, apprenticeship
 * levy and Bacs Account blocks are not collected — refuse rather than omit.
 */
export function assertEpsLiveSupported(opts: {
  noPaymentForPeriod?: boolean;
  recoverableAmountsRequested?: boolean;
  apprenticeshipLevyRequested?: boolean;
}): void {
  if (opts.recoverableAmountsRequested) {
    throw new Error(
      "EPS RecoverableAmountsYTD is not supported yet. File recoverables in another RTI product, or send a no-payment EPS only.",
    );
  }
  if (opts.apprenticeshipLevyRequested) {
    throw new Error(
      "EPS apprenticeship levy is not supported yet. File levy in another RTI product.",
    );
  }
  if (!opts.noPaymentForPeriod) {
    throw new Error(
      "Only no-payment EPS is supported. Ordinary payment EPS (with recoverables/levy) is not available.",
    );
  }
}

export function buildEpsXml(opts: {
  employerPayeRef: string;
  accountsOfficeRef: string;
  taxYear: string;
  periodStart: string;
  periodEnd: string;
  noPaymentForPeriod?: boolean;
  senderId?: string;
  senderPassword?: string;
  gatewayTest?: boolean;
}): { xml: string; hash: string; bodyInner: string; irmark: string } {
  assertEpsLiveSupported({
    noPaymentForPeriod: opts.noPaymentForPeriod,
  });
  const { bodyInner, irmark } = buildEpsBodyInner(opts);
  const cfg = getHmrcConfig();
  const gatewayTest = opts.gatewayTest ?? cfg.env !== "production";
  const xml =
    opts.senderId && opts.senderPassword
      ? wrapRtiGovTalk({
          className: "HMRC-PAYE-RTI-EPS",
          bodyInner,
          payeRef: opts.employerPayeRef,
          senderId: opts.senderId,
          senderPassword: opts.senderPassword,
          gatewayTest,
        })
      : `<?xml version="1.0" encoding="UTF-8"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><Body>${bodyInner}</Body></GovTalkMessage>`;
  return { xml, hash: sha256Hex(xml), bodyInner, irmark };
}

export async function submitRtiXml(opts: {
  xml: string;
  kind: "FPS" | "EPS";
  payeRef: string;
  senderId: string;
  senderPassword: string;
  actorId: string;
  clientId: string;
  practiceId?: string;
  demo?: boolean;
}) {
  return submitAndPollRtiXml({
    xml: opts.xml,
    kind: opts.kind,
    payeRef: opts.payeRef,
    senderId: opts.senderId,
    senderPassword: opts.senderPassword,
    actorId: opts.actorId,
    clientId: opts.clientId,
    practiceId: opts.practiceId,
    demo: opts.demo,
  });
}

export type { Pence };
