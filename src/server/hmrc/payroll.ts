import { pence, multiplyPence, type Pence } from "@/server/money/pence";
import { sha256Hex } from "./crypto";
import { getHmrcConfig } from "./config";
import { appendAuditEvent } from "@/server/audit/log";

export type EmployeePayInput = {
  id: string;
  forename: string;
  surname: string;
  nino: string;
  taxCode: string;
  annualSalaryPence: number;
};

export type PayLine = {
  employeeId: string;
  forename: string;
  surname: string;
  nino: string;
  taxCode: string;
  grossPence: number;
  taxPence: number;
  employeeNiPence: number;
  employerNiPence: number;
  netPence: number;
};

/** Simplified UK PAYE monthly calculator for MVP (not a full tax engine). */
export function calculateMonthlyPay(emp: EmployeePayInput): PayLine {
  const gross = multiplyPence(emp.annualSalaryPence, 1 / 12);
  const personalAllowanceMonthly = pence(12570_00 / 12); // approx
  const taxable = pence(
    Math.max(0, Number(gross) - Number(personalAllowanceMonthly)),
  );
  const tax = multiplyPence(taxable, 0.2);
  const niBand = pence(Math.max(0, Number(gross) - 1048_00)); // simplified PT
  const employeeNi = multiplyPence(niBand, 0.08);
  const employerNi = multiplyPence(
    pence(Math.max(0, Number(gross) - 758_00)),
    0.15,
  );
  const net = pence(Number(gross) - Number(tax) - Number(employeeNi));

  return {
    employeeId: emp.id,
    forename: emp.forename,
    surname: emp.surname,
    nino: emp.nino,
    taxCode: emp.taxCode,
    grossPence: Number(gross),
    taxPence: Number(tax),
    employeeNiPence: Number(employeeNi),
    employerNiPence: Number(employerNi),
    netPence: Number(net),
  };
}

export function buildFpsXml(opts: {
  employerPayeRef: string;
  accountsOfficeRef: string;
  payDate: string;
  taxYear: string;
  lines: PayLine[];
}): { xml: string; hash: string } {
  const employeeXml = opts.lines
    .map(
      (l) => `
      <Employee>
        <EmployeeDetails>
          <NINO>${escapeXml(l.nino)}</NINO>
          <Name>
            <Forename>${escapeXml(l.forename)}</Forename>
            <Surname>${escapeXml(l.surname)}</Surname>
          </Name>
        </EmployeeDetails>
        <Employment>
          <Pay>
            <TaxCode>${escapeXml(l.taxCode)}</TaxCode>
            <TaxablePay>${(l.grossPence / 100).toFixed(2)}</TaxablePay>
            <TaxDeductedOrRefunded>${(l.taxPence / 100).toFixed(2)}</TaxDeductedOrRefunded>
          </Pay>
          <NIlettersAndValues>
            <NIletter>A</NIletter>
            <GrossEarningsForNICsInPd>${(l.grossPence / 100).toFixed(2)}</GrossEarningsForNICsInPd>
            <EmployeeContribution>${(l.employeeNiPence / 100).toFixed(2)}</EmployeeContribution>
            <EmployerContribution>${(l.employerNiPence / 100).toFixed(2)}</EmployerContribution>
          </NIlettersAndValues>
        </Employment>
      </Employee>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-PAYE-RTI-FPS</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
    </MessageDetails>
  </Header>
  <Body>
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/24-25/1">
      <FullPaymentSubmission>
        <EmpRefs>
          <OfficeNo>${escapeXml(opts.employerPayeRef.split("/")[0] ?? "")}</OfficeNo>
          <PayeRef>${escapeXml(opts.employerPayeRef)}</PayeRef>
          <AORef>${escapeXml(opts.accountsOfficeRef)}</AORef>
        </EmpRefs>
        <RelatedTaxYear>${escapeXml(opts.taxYear)}</RelatedTaxYear>
        <EmpPayment>
          <PayFreq>M1</PayFreq>
          <PmtDate>${opts.payDate}</PmtDate>
        </EmpPayment>
        ${employeeXml}
      </FullPaymentSubmission>
    </IRenvelope>
  </Body>
</GovTalkMessage>`;

  return { xml, hash: sha256Hex(xml) };
}

export function buildEpsXml(opts: {
  employerPayeRef: string;
  accountsOfficeRef: string;
  taxYear: string;
  noPaymentForPeriod?: boolean;
}): { xml: string; hash: string } {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-PAYE-RTI-EPS</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
    </MessageDetails>
  </Header>
  <Body>
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/EmployerPaymentSummary/24-25/1">
      <EmployerPaymentSummary>
        <EmpRefs>
          <PayeRef>${escapeXml(opts.employerPayeRef)}</PayeRef>
          <AORef>${escapeXml(opts.accountsOfficeRef)}</AORef>
        </EmpRefs>
        <RelatedTaxYear>${escapeXml(opts.taxYear)}</RelatedTaxYear>
        ${opts.noPaymentForPeriod ? "<NoPaymentForPeriod>yes</NoPaymentForPeriod>" : ""}
      </EmployerPaymentSummary>
    </IRenvelope>
  </Body>
</GovTalkMessage>`;

  return { xml, hash: sha256Hex(xml) };
}

export async function submitRtiXml(opts: {
  xml: string;
  kind: "FPS" | "EPS";
  actorId: string;
  clientId: string;
  practiceId?: string;
  demo?: boolean;
}) {
  const cfg = getHmrcConfig();
  const hash = sha256Hex(opts.xml);

  if (opts.demo || !cfg.clientId) {
    const correlationId = `demo-rti-${opts.kind}-${Date.now()}`;
    await appendAuditEvent({
      practiceId: opts.practiceId,
      clientId: opts.clientId,
      actorId: opts.actorId,
      action: `hmrc.rti.${opts.kind.toLowerCase()}.demo`,
      entityType: "pay_run",
      entityId: opts.clientId,
      payloadHash: hash,
      hmrcStatusCode: 200,
      hmrcCorrelationId: correlationId,
      detail: { mode: "demo", kind: opts.kind },
    });
    return { ok: true, status: 200, correlationId, hash };
  }

  const res = await fetch(`${cfg.rtiSubmissionUrl}/rti/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: opts.xml,
  });
  const text = await res.text();
  const correlationId = res.headers.get("X-Correlation-ID");

  await appendAuditEvent({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    actorId: opts.actorId,
    action: `hmrc.rti.${opts.kind.toLowerCase()}`,
    entityType: "pay_run",
    entityId: opts.clientId,
    payloadHash: hash,
    hmrcStatusCode: res.status,
    hmrcCorrelationId: correlationId,
    detail: { responseSnippet: text.slice(0, 2000) },
  });

  return { ok: res.ok, status: res.status, correlationId, hash };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type { Pence };
