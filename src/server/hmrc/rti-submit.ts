import { getHmrcConfig } from "@/server/hmrc/config";
import { appendAuditEvent } from "@/server/audit/log";
import { sha256Hex } from "@/server/hmrc/crypto";
import { extractXmlTag, escapeXml } from "@/server/hmrc/ct600/xml-utils";

function pollUrlFromSubmit(submitUrl: string): string {
  return submitUrl.replace(/\/submission\/?$/i, "/poll");
}

/** Prefer ChRIS / Body ErrorResponse text over the generic GovTalk 3001 wrapper. */
export function extractRtiErrorMessage(receipt: string): string | null {
  const errors: Array<{ number: string | null; text: string; location: string | null }> =
    [];
  const blockRe =
    /<Error\b[^>]*>([\s\S]*?)<\/Error>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(receipt)) !== null) {
    const inner = block[1];
    const text = extractXmlTag("Text", inner)?.trim();
    if (!text) continue;
    errors.push({
      number: extractXmlTag("Number", inner),
      text,
      location: extractXmlTag("Location", inner),
    });
  }
  if (!errors.length) {
    return (
      extractXmlTag("Text", receipt) ||
      extractXmlTag("Error", receipt) ||
      null
    );
  }
  const generic = /departmental specific business logic/i;
  const specific = errors.filter((e) => !generic.test(e.text));
  const chosen = (specific.length ? specific : errors).map((e) => {
    const loc = e.location ? ` @ ${e.location}` : "";
    const num = e.number ? ` (${e.number})` : "";
    return `${e.text}${loc}${num}`;
  });
  return [...new Set(chosen)].join(" · ");
}

async function postXml(url: string, xml: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      Accept: "application/xml, text/xml, */*",
    },
    body: xml,
  });
  const text = await res.text();
  return { status: res.status, text, ok: res.ok };
}

function parsePayeRef(payeRef: string): { officeNo: string; reference: string } {
  const cleaned = payeRef.replace(/\s+/g, "");
  const [officeNo = "", ...rest] = cleaned.split("/");
  return { officeNo, reference: rest.join("/") || cleaned };
}

/** Wrap IR body in a full GovTalk submit envelope for RTI Transaction Engine. */
export function wrapRtiGovTalk(opts: {
  className: "HMRC-PAYE-RTI-FPS" | "HMRC-PAYE-RTI-EPS";
  bodyInner: string;
  payeRef: string;
  senderId: string;
  senderPassword: string;
  gatewayTest: boolean;
}): string {
  const cfg = getHmrcConfig();
  const { officeNo, reference } = parsePayeRef(opts.payeRef);
  const vendorId = cfg.ctVendorId;
  const channel = vendorId
    ? `
    <ChannelRouting>
      <Channel>
        <URI>${escapeXml(vendorId)}</URI>
        <Product>${escapeXml(cfg.ctProductName)}</Product>
        <Version>${escapeXml(cfg.vendorVersion)}</Version>
      </Channel>
    </ChannelRouting>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${opts.className}</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
      <GatewayTest>${opts.gatewayTest ? "1" : "0"}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(opts.senderId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${escapeXml(opts.senderPassword)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="TaxOfficeNumber">${escapeXml(officeNo)}</Key>
      <Key Type="TaxOfficeReference">${escapeXml(reference)}</Key>
    </Keys>${channel}
  </GovTalkDetails>
  <Body>${opts.bodyInner}</Body>
</GovTalkMessage>`;
}

function buildRtiPollXml(opts: {
  className: string;
  correlationId: string;
  senderId: string;
  senderPassword: string;
  payeRef: string;
  gatewayTest: boolean;
}) {
  const { officeNo, reference } = parsePayeRef(opts.payeRef);
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${escapeXml(opts.className)}</Class>
      <Qualifier>poll</Qualifier>
      <Function>submit</Function>
      <CorrelationID>${escapeXml(opts.correlationId)}</CorrelationID>
      <Transformation>XML</Transformation>
      <GatewayTest>${opts.gatewayTest ? "1" : "0"}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(opts.senderId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${escapeXml(opts.senderPassword)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="TaxOfficeNumber">${escapeXml(officeNo)}</Key>
      <Key Type="TaxOfficeReference">${escapeXml(reference)}</Key>
    </Keys>
  </GovTalkDetails>
  <Body></Body>
</GovTalkMessage>`;
}

export async function submitAndPollRtiXml(opts: {
  xml: string;
  kind: "FPS" | "EPS";
  payeRef: string;
  senderId: string;
  senderPassword: string;
  actorId: string;
  clientId: string;
  practiceId?: string;
  demo?: boolean;
  maxPolls?: number;
  pollDelayMs?: number;
}): Promise<{
  ok: boolean;
  status: number;
  correlationId: string | null;
  qualifier: string | null;
  hash: string;
  receipt: string;
}> {
  const cfg = getHmrcConfig();
  const hash = sha256Hex(opts.xml);
  const className =
    opts.kind === "FPS" ? "HMRC-PAYE-RTI-FPS" : "HMRC-PAYE-RTI-EPS";

  if (opts.demo) {
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
    return {
      ok: true,
      status: 200,
      correlationId,
      qualifier: "response",
      hash,
      receipt: "DEMO_ACCEPTANCE",
    };
  }

  if (!opts.senderId?.trim() || !opts.senderPassword?.trim()) {
    throw new Error(
      cfg.env === "production"
        ? "Enter the employer's Government Gateway User ID and password to submit PAYE RTI."
        : "RTI test credentials missing — set HMRC_CT_TEST_SENDER_ID / PASSWORD or enter them at submit.",
    );
  }

  // RTI uses the same Transaction Engine as CT Online — not api.service.hmrc.gov.uk/rti/submit.
  const submit = await postXml(cfg.ctSubmissionUrl, opts.xml);
  let correlationId = extractXmlTag("CorrelationID", submit.text);
  let qualifier = extractXmlTag("Qualifier", submit.text);
  const pollEndpoint =
    extractXmlTag("ResponseEndPoint", submit.text) ||
    pollUrlFromSubmit(cfg.ctSubmissionUrl);

  let receipt = submit.text;
  const gatewayTest = cfg.env !== "production";

  if (correlationId && qualifier === "acknowledgement") {
    const maxPolls = opts.maxPolls ?? 8;
    const delay = opts.pollDelayMs ?? 1500;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, delay));
      const pollXml = buildRtiPollXml({
        className,
        correlationId,
        senderId: opts.senderId,
        senderPassword: opts.senderPassword,
        payeRef: opts.payeRef,
        gatewayTest,
      });
      const polled = await postXml(pollEndpoint, pollXml);
      receipt = polled.text;
      qualifier = extractXmlTag("Qualifier", polled.text) ?? qualifier;
      correlationId =
        extractXmlTag("CorrelationID", polled.text) ?? correlationId;
      if (qualifier === "response" || qualifier === "error") break;
    }
  }

  const ok =
    (submit.ok || Boolean(correlationId)) &&
    qualifier !== "error" &&
    (qualifier === "response" || qualifier === "acknowledgement");

  const errorText = extractRtiErrorMessage(receipt);

  await appendAuditEvent({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    actorId: opts.actorId,
    action: ok
      ? `hmrc.rti.${opts.kind.toLowerCase()}`
      : `hmrc.rti.${opts.kind.toLowerCase()}.error`,
    entityType: "pay_run",
    entityId: opts.clientId,
    payloadHash: hash,
    hmrcStatusCode: submit.status,
    hmrcCorrelationId: correlationId,
    detail: {
      qualifier,
      responseSnippet: receipt.slice(0, 4000),
      errorText,
      env: cfg.env,
      gatewayTest,
    },
  });

  if (!ok) {
    throw new Error(
      errorText?.trim() ||
        `HMRC rejected the ${opts.kind} (qualifier: ${qualifier ?? "unknown"}). Check PAYE enrolment and Gateway credentials.`,
    );
  }

  return {
    ok: true,
    status: submit.status,
    correlationId,
    qualifier,
    hash,
    receipt: receipt.slice(0, 4000),
  };
}

export { parsePayeRef, escapeXml, sha256Hex };
