import { sha256Hex } from "@/server/hmrc/crypto";
import { getHmrcConfig } from "@/server/hmrc/config";
import { buildCt600BodyInner } from "@/server/hmrc/ct600/build-body";
import { computeIrmark, injectIrmark } from "@/server/hmrc/ct600/irmark";
import type { Ct600BuiltPackage, Ct600PackageInput } from "@/server/hmrc/ct600/types";
import { validateCt600Package } from "@/server/hmrc/ct600/validate-package";
import { escapeXml } from "@/server/hmrc/ct600/xml-utils";

export function buildCt600Package(
  input: Ct600PackageInput,
  opts?: { strict?: boolean },
): Ct600BuiltPackage {
  const validation = validateCt600Package(input, opts);
  const cfg = getHmrcConfig();
  const utr = String(input.utr).replace(/\s+/g, "");
  const senderId = input.senderId?.trim() || cfg.ctTestSenderId || "HydraTax";
  const senderPassword = input.senderPassword?.trim() || cfg.ctTestPassword;
  const gatewayTest =
    input.gatewayTest ?? (cfg.env === "production" ? false : true);

  const { bodyInner, taxableProfitPence, taxChargePence, attachments } =
    buildCt600BodyInner({
      companyName: input.companyName,
      companyNumber: input.companyNumber,
      utr,
      figures: input.figures,
      accountsDraft: input.accountsDraft,
      includeAttachments: validation.ok || opts?.strict === false,
    });

  const irmark = computeIrmark(bodyInner);
  const bodyWithMark = injectIrmark(bodyInner, irmark);

  const vendorId = cfg.ctVendorId;
  const channel = vendorId
    ? `<GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>
    <ChannelRouting>
      <Channel>
        <URI>${escapeXml(vendorId)}</URI>
        <Product>${escapeXml(cfg.ctProductName)}</Product>
        <Version>${escapeXml(cfg.vendorVersion)}</Version>
      </Channel>
    </ChannelRouting>
  </GovTalkDetails>`
    : `<GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>
  </GovTalkDetails>`;

  const authValue = senderPassword
    ? `<Authentication>
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
      <GatewayTest>${gatewayTest ? "1" : "0"}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(senderId)}</SenderID>${authValue}
      </IDAuthentication>
    </SenderDetails>
  </Header>${channel}
  <Body>${bodyWithMark}</Body>
</GovTalkMessage>`;

  return {
    xml,
    hash: sha256Hex(xml),
    taxableProfitPence,
    taxChargePence,
    attachments,
    validation,
    irmark,
  };
}

/** Back-compat wrapper used by older call sites. */
export function buildCt600Xml(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600PackageInput["figures"];
  senderId?: string;
  senderPassword?: string;
  questionnaire?: Ct600PackageInput["questionnaire"];
  accountsDraft?: Ct600PackageInput["accountsDraft"];
}): { xml: string; hash: string; taxableProfitPence: number } {
  const built = buildCt600Package({
    companyName: opts.companyName,
    companyNumber: opts.companyNumber,
    utr: opts.utr,
    figures: opts.figures,
    questionnaire: opts.questionnaire ?? {
      period_dates: true,
      accounts_attached: true,
      computations_attached: true,
      declaration: true,
      repayments: false,
      estimated_figures: false,
      close_company_loans: false,
      group_relief: false,
      rd_claim: false,
      capital_allowances: false,
      associated_companies: 0,
    },
    accountsDraft: opts.accountsDraft,
    senderId: opts.senderId,
    senderPassword: opts.senderPassword,
  }, { strict: false });
  return {
    xml: built.xml,
    hash: built.hash,
    taxableProfitPence: built.taxableProfitPence,
  };
}
