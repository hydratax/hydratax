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
 *
 * Mandatory GovTalk credentials (TEST and LIVE):
 * - Vendor ID in ChannelRouting/URI + Product name
 * - Company UTR in GovTalkDetails/Keys (Key Type="UTR") — required for gateway auth
 * - Same UTR also in IRheader/Keys
 */
export function buildCt600Xml(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  /** Override SDST test SenderID; live filings use the end-user GG ID */
  senderId?: string;
  /** Override SDST test password / GG password */
  senderPassword?: string;
}): { xml: string; hash: string; taxableProfitPence: number } {
  const utr = requireCtUtr(opts.utr);
  const figures = ct600FiguresSchema.parse(opts.figures);
  const taxable = computeTaxableProfit(figures);
  const taxCharge = Math.round(Number(taxable) * 0.19);
  const cfg = getHmrcConfig();
  const vendorId = cfg.ctVendorId;
  const product = cfg.ctProductName;
  const senderId = opts.senderId?.trim() || cfg.ctTestSenderId || "HydraTax";
  const senderPassword = opts.senderPassword?.trim() || cfg.ctTestPassword;
  const gatewayTest = cfg.env === "production" ? "0" : "1";
  const channel =
    vendorId
      ? `
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>
    <ChannelRouting>
      <Channel>
        <URI>${escapeXml(vendorId)}</URI>
        <Product>${escapeXml(product)}</Product>
        <Version>${escapeXml(cfg.vendorVersion)}</Version>
      </Channel>
    </ChannelRouting>
  </GovTalkDetails>`
      : `
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>
  </GovTalkDetails>`;
  const authValue = senderPassword
    ? `
          <Authentication>
            <Method>clear</Method>
            <Role>principal</Role>
            <Value>${escapeXml(senderPassword)}</Value>
          </Authentication>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
      <GatewayTest>${gatewayTest}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(senderId)}</SenderID>${authValue}
      </IDAuthentication>
    </SenderDetails>
  </Header>${channel}
  <Body>
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys>
          <Key Type="UTR">${escapeXml(utr)}</Key>
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

function requireCtUtr(raw: string): string {
  const utr = String(raw ?? "").replace(/\s+/g, "").trim();
  if (!/^\d{10}$/.test(utr)) {
    throw new Error(
      "A valid 10-digit company UTR is required for every CT600 submission (GovTalkDetails Keys and IRheader).",
    );
  }
  return utr;
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
