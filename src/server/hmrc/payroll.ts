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
import { computeIrmark, injectIrmark } from "@/server/hmrc/ct600/irmark";

export type PayFrequency = "M1" | "W1";

export type EmployeePayInput = {
  id: string;
  payrollId: string;
  previousPayrollId?: string | null;
  payrollIdChanged?: boolean;
  forename: string;
  surname: string;
  nino: string;
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
  taxCode: string;
  niCategory: string;
  startDate: string;
  leaveDate?: string | null;
  starterDeclaration?: "A" | "B" | "C" | null;
  isStarterThisRun: boolean;
  ordinaryPence: number;
  overtimePence: number;
  holidayPence: number;
  sspPence: number;
  smpPence: number;
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
  notes: string[];
};

export type YtdTotals = {
  grossPence: number;
  taxablePence?: number;
  taxPence: number;
  employeeNiPence: number;
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
      elements.smpPence,
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
  };

  return {
    employeeId: emp.id,
    payrollId: emp.payrollId,
    previousPayrollId: emp.previousPayrollId ?? null,
    payrollIdChanged: Boolean(emp.payrollIdChanged && emp.previousPayrollId),
    forename: emp.forename,
    surname: emp.surname,
    nino: emp.nino,
    taxCode: emp.taxCode,
    niCategory: emp.niCategory || "A",
    startDate: emp.startDate || "",
    leaveDate: emp.leaveDate ?? null,
    starterDeclaration: emp.firstFpsSent ? null : emp.starterDeclaration ?? "A",
    isStarterThisRun: !emp.firstFpsSent,
    ordinaryPence: elements.ordinaryPence,
    overtimePence: elements.overtimePence,
    holidayPence: elements.holidayPence,
    sspPence: elements.sspPence,
    smpPence: elements.smpPence,
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

function buildRtiIrHeader(opts: {
  employerPayeRef: string;
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
  const irmark = computeIrmark(bodyWithoutMark);
  return { bodyInner: injectIrmark(bodyWithoutMark, irmark), irmark };
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
  const employeeXml = opts.lines
    .map((l) => {
      const starter =
        l.isStarterThisRun && l.starterDeclaration && l.startDate
          ? `
            <StartingDate>${escapeXml(l.startDate)}</StartingDate>
            <Starter>
              <StartDec>${escapeXml(l.starterDeclaration)}</StartDec>
            </Starter>`
          : "";
      const leaver = l.leaveDate
        ? `
            <LeavingDate>${escapeXml(l.leaveDate)}</LeavingDate>`
        : "";
      const pidChange =
        l.payrollIdChanged && l.previousPayrollId
          ? `
            <PayrollIdChanged>yes</PayrollIdChanged>
            <OldPayrollId>${escapeXml(l.previousPayrollId)}</OldPayrollId>`
          : "";
      return `
      <Employee>
        <EmployeeDetails>
          <NINO>${escapeXml(l.nino)}</NINO>
          <Name>
            <Forename>${escapeXml(l.forename)}</Forename>
            <Surname>${escapeXml(l.surname)}</Surname>
          </Name>
        </EmployeeDetails>
        <Employment>
          <PayId>${escapeXml(l.payrollId)}</PayId>${pidChange}${starter}${leaver}
          <Pay>
            <TaxCode>${escapeXml(l.taxCode)}</TaxCode>
            <TaxablePay>${penceXml(l.taxablePence ?? l.grossPence)}</TaxablePay>
            <TaxablePayToDate>${penceXml(l.ytdTaxablePence ?? l.ytdGrossPence)}</TaxablePayToDate>
            <TaxDeductedOrRefunded>${penceXml(l.taxPence)}</TaxDeductedOrRefunded>
            <TotalTaxToDate>${penceXml(l.ytdTaxPence)}</TotalTaxToDate>
          </Pay>
          <NIlettersAndValues>
            <NIletter>${escapeXml(l.niCategory)}</NIletter>
            <GrossEarningsForNICsInPd>${penceXml(l.grossPence)}</GrossEarningsForNICsInPd>
            <EmployeeContribution>${penceXml(l.employeeNiPence)}</EmployeeContribution>
            <EmployerContribution>${penceXml(l.employerNiPence)}</EmployerContribution>
          </NIlettersAndValues>
        </Employment>
      </Employee>`;
    })
    .join("\n");

  const draft = `<IRenvelope xmlns="${rtiSchemaNs("FullPaymentSubmission", opts.taxYear)}">
      ${buildRtiIrHeader({
        employerPayeRef: opts.employerPayeRef,
        periodEnd: opts.payDate,
      })}
      <FullPaymentSubmission>
        <EmpRefs>
          <OfficeNo>${escapeXml(officeNo)}</OfficeNo>
          <PayeRef>${escapeXml(reference)}</PayeRef>
          <AORef>${escapeXml(opts.accountsOfficeRef)}</AORef>
        </EmpRefs>
        <RelatedTaxYear>${escapeXml(opts.taxYear)}</RelatedTaxYear>
        <EmpPayment>
          <PayFreq>${opts.frequency}</PayFreq>
          <PmtDate>${opts.payDate}</PmtDate>
        </EmpPayment>
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
  const noPay = opts.noPaymentForPeriod
    ? `<NoPaymentDates>
        <NoPaymentPeriod>
          <From>${escapeXml(opts.periodStart)}</From>
          <To>${escapeXml(opts.periodEnd)}</To>
        </NoPaymentPeriod>
      </NoPaymentDates>`
    : "";

  const draft = `<IRenvelope xmlns="${rtiSchemaNs("EmployerPaymentSummary", opts.taxYear)}">
      ${buildRtiIrHeader({
        employerPayeRef: opts.employerPayeRef,
        periodEnd: opts.periodEnd,
      })}
      <EmployerPaymentSummary>
        <EmpRefs>
          <OfficeNo>${escapeXml(officeNo)}</OfficeNo>
          <PayeRef>${escapeXml(reference)}</PayeRef>
          <AORef>${escapeXml(opts.accountsOfficeRef)}</AORef>
        </EmpRefs>
        <RelatedTaxYear>${escapeXml(opts.taxYear)}</RelatedTaxYear>
        ${noPay}
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
