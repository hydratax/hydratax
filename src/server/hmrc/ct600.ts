import { ct600FiguresSchema } from "@/server/money/schemas";
import { penceToPounds, subtractPence, type Pence } from "@/server/money/pence";
import { sha256Hex } from "./crypto";
import { getHmrcConfig } from "./config";
import { appendAuditEvent } from "@/server/audit/log";
import { z } from "zod";

export type Ct600Figures = z.infer<typeof ct600FiguresSchema>;

export function computeTaxableProfit(figures: Ct600Figures): Pence {
  const f = ct600FiguresSchema.parse(figures);
  const costs = Number(f.costOfSalesPence) + Number(f.administrativeExpensesPence);
  const income = Number(f.turnoverPence) + Number(f.otherIncomePence);
  return subtractPence(income, costs);
}

/**
 * Builds a simplified CT600 XML envelope for Corporation Tax Online.
 * Full RIM artefact validation is done via HMRC LTS/TPVS in production.
 */
export function buildCt600Xml(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
}): { xml: string; hash: string; taxableProfitPence: number } {
  const figures = ct600FiguresSchema.parse(opts.figures);
  const taxable = computeTaxableProfit(figures);
  const taxCharge = Math.round(Number(taxable) * 0.19);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>HydraTax</SenderID>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <Body>
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys>
          <Key Type="UTR">${escapeXml(opts.utr)}</Key>
        </Keys>
        <Period>
          <Start>${figures.periodStart}</Start>
          <End>${figures.periodEnd}</End>
        </Period>
        <DefaultCurrency>GBP</DefaultCurrency>
      </IRheader>
      <CompanyTaxReturn>
        <CompanyInformation>
          <CompanyName>${escapeXml(opts.companyName)}</CompanyName>
          <RegistrationNumber>${escapeXml(opts.companyNumber)}</RegistrationNumber>
        </CompanyInformation>
        <ReturnInfoBody>
          <CompanyInformation>
            <PeriodOfReturnFrom>${figures.periodStart}</PeriodOfReturnFrom>
            <PeriodOfReturnTo>${figures.periodEnd}</PeriodOfReturnTo>
          </CompanyInformation>
          <ReturnInfoSummary>
            <Turnover>${penceToPounds(figures.turnoverPence)}</Turnover>
            <TradingProfits>${penceToPounds(taxable)}</TradingProfits>
            <CorporationTaxChargeable>${penceToPounds(taxCharge)}</CorporationTaxChargeable>
          </ReturnInfoSummary>
          <Accounts>
            <TangibleAssets>${penceToPounds(figures.tangibleAssetsPence)}</TangibleAssets>
            <CashAtBank>${penceToPounds(figures.cashAtBankPence)}</CashAtBank>
            <Debtors>${penceToPounds(figures.debtorsPence)}</Debtors>
            <Creditors>${penceToPounds(figures.creditorsPence)}</Creditors>
            <CalledUpShareCapital>${penceToPounds(figures.calledUpShareCapitalPence)}</CalledUpShareCapital>
            <ProfitAndLossAccount>${penceToPounds(figures.profitAndLossAccountPence)}</ProfitAndLossAccount>
          </Accounts>
        </ReturnInfoBody>
      </CompanyTaxReturn>
    </IRenvelope>
  </Body>
</GovTalkMessage>`;

  return {
    xml,
    hash: sha256Hex(xml),
    taxableProfitPence: Number(taxable),
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function submitCt600Xml(opts: {
  xml: string;
  actorId: string;
  clientId: string;
  practiceId?: string;
  demo?: boolean;
}) {
  const cfg = getHmrcConfig();
  const hash = sha256Hex(opts.xml);

  if (opts.demo || !cfg.clientId) {
    const correlationId = `demo-ct600-${Date.now()}`;
    await appendAuditEvent({
      practiceId: opts.practiceId,
      clientId: opts.clientId,
      actorId: opts.actorId,
      action: "hmrc.ct600.submit.demo",
      entityType: "ct600_return",
      entityId: opts.clientId,
      payloadHash: hash,
      hmrcStatusCode: 200,
      hmrcCorrelationId: correlationId,
      detail: { mode: "demo", env: cfg.env },
    });
    return {
      ok: true,
      status: 200,
      correlationId,
      receipt: "DEMO_ACCEPTANCE",
      hash,
    };
  }

  const res = await fetch(cfg.ctSubmissionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      Accept: "application/xml",
    },
    body: opts.xml,
  });

  const text = await res.text();
  const correlationId = res.headers.get("X-Correlation-ID");

  await appendAuditEvent({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    actorId: opts.actorId,
    action: "hmrc.ct600.submit",
    entityType: "ct600_return",
    entityId: opts.clientId,
    payloadHash: hash,
    hmrcStatusCode: res.status,
    hmrcCorrelationId: correlationId,
    detail: { responseSnippet: text.slice(0, 2000), env: cfg.env },
  });

  return {
    ok: res.ok,
    status: res.status,
    correlationId,
    receipt: text.slice(0, 500),
    hash,
  };
}
