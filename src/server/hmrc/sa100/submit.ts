import { appendAuditEvent } from "@/server/audit/log";
import { getHmrcConfig } from "@/server/hmrc/config";
import { sha256Hex } from "@/server/hmrc/crypto";
import {
  escapeXml,
  extractGovTalkErrorMessage,
  extractXmlTag,
} from "@/server/hmrc/ct600/xml-utils";
import {
  assertSaLivePayloadSupported,
  buildSa100BodyInner,
  wrapSa100GovTalk,
} from "@/server/hmrc/sa100/build-body";
import type { Sa100Draft } from "@/lib/sa100/schema";

export { assertSaLivePayloadSupported };

function pollUrlFromSubmit(submitUrl: string): string {
  return submitUrl.replace(/\/submission\/?$/i, "/poll");
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

function buildSaPollXml(opts: {
  correlationId: string;
  senderId: string;
  senderPassword: string;
  utr: string;
  gatewayTest: boolean;
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-SA-SA100</Class>
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
      <Key Type="UTR">${escapeXml(opts.utr)}</Key>
    </Keys>
  </GovTalkDetails>
  <Body></Body>
</GovTalkMessage>`;
}

async function submitAndPollSa100Xml(opts: {
  xml: string;
  utr: string;
  senderId: string;
  senderPassword: string;
}): Promise<{
  ok: boolean;
  status: number;
  correlationId: string | null;
  qualifier: string | null;
  submitResponse: string;
  pollResponse?: string;
}> {
  const cfg = getHmrcConfig();
  const submit = await postXml(cfg.ctSubmissionUrl, opts.xml);
  const correlationId = extractXmlTag("CorrelationID", submit.text);
  const qualifier = extractXmlTag("Qualifier", submit.text);
  const pollEndpoint =
    extractXmlTag("ResponseEndPoint", submit.text) ||
    pollUrlFromSubmit(cfg.ctSubmissionUrl);

  if (!correlationId || qualifier !== "acknowledgement") {
    const immediateOk =
      qualifier === "response" &&
      submit.text.includes("SuccessResponse") &&
      !submit.text.includes("ErrorResponse");
    return {
      ok: submit.ok && immediateOk,
      status: submit.status,
      correlationId,
      qualifier,
      submitResponse: submit.text,
    };
  }

  const gatewayTest = cfg.env !== "production";
  const pollXml = buildSaPollXml({
    correlationId,
    senderId: opts.senderId,
    senderPassword: opts.senderPassword,
    utr: opts.utr.replace(/\s+/g, ""),
    gatewayTest,
  });

  await new Promise((r) => setTimeout(r, 2_000));
  let poll = await postXml(pollEndpoint, pollXml);
  for (let i = 0; i < 8; i++) {
    const q = extractXmlTag("Qualifier", poll.text);
    if (q !== "acknowledgement") break;
    await new Promise((r) => setTimeout(r, 3_000));
    poll = await postXml(pollEndpoint, pollXml);
  }

  const finalQualifier = extractXmlTag("Qualifier", poll.text);
  const hasSuccess =
    poll.text.includes("SuccessResponse") ||
    poll.text.includes("successfully");
  const hasBusinessError =
    poll.text.includes("ErrorResponse") ||
    poll.text.includes("GovTalkErrors") ||
    /ChRIS/i.test(poll.text);

  return {
    ok: finalQualifier === "response" && hasSuccess && !hasBusinessError,
    status: poll.status,
    correlationId,
    qualifier: finalQualifier,
    submitResponse: submit.text,
    pollResponse: poll.text,
  };
}

export async function submitSa100ToHmrc(opts: {
  draft: Sa100Draft;
  taxpayerName: string;
  senderId: string;
  senderPassword: string;
  actorId: string;
  clientId: string;
  practiceId?: string;
  demo?: boolean;
}) {
  const cfg = getHmrcConfig();
  const utr = opts.draft.utr.replace(/\s/g, "");

  if (opts.demo) {
    const correlationId = `demo-sa100-${Date.now()}`;
    await appendAuditEvent({
      practiceId: opts.practiceId,
      clientId: opts.clientId,
      actorId: opts.actorId,
      action: "hmrc.sa100.submit.demo",
      entityType: "sa100_return",
      entityId: opts.clientId,
      hmrcCorrelationId: correlationId,
      detail: { mode: "demo", env: cfg.env, taxYear: opts.draft.taxYear },
    });
    return {
      ok: true as const,
      demo: true as const,
      status: 200,
      correlationId,
      receipt: "DEMO_ACCEPTANCE",
      errorMessage: null as string | null,
    };
  }

  // Live path: supported subset only (SA100 + SA102/103/105 + SA110).
  // Unsupported pages throw in assertSaLivePayloadSupported / buildSa100BodyInner.
  // XSD harness: scripts/validate-sa-xsd.py + fixtures/hmrc-sa/{taxYear}/.
  if (!cfg.ctVendorId) {
    throw new Error(
      "HMRC_CT_VENDOR_ID is not configured. Add your SDST Vendor ID before live SA submit.",
    );
  }
  if (!opts.senderId.trim() || !opts.senderPassword.trim()) {
    throw new Error(
      "Enter the client's Government Gateway User ID and password to submit live Self Assessment.",
    );
  }

  assertSaLivePayloadSupported(opts.draft);

  const bodyInner = buildSa100BodyInner({
    draft: opts.draft,
    taxpayerName: opts.taxpayerName,
  });
  const xml = wrapSa100GovTalk({
    bodyInner,
    utr,
    senderId: opts.senderId.trim(),
    senderPassword: opts.senderPassword.trim(),
    gatewayTest: cfg.env !== "production",
    vendorId: cfg.ctVendorId,
    productName: cfg.ctProductName,
    vendorVersion: cfg.vendorVersion,
  });
  const hash = sha256Hex(xml);

  const polled = await submitAndPollSa100Xml({
    xml,
    utr,
    senderId: opts.senderId.trim(),
    senderPassword: opts.senderPassword.trim(),
  });

  const receipt = polled.pollResponse ?? polled.submitResponse;
  const errorMessage = polled.ok
    ? null
    : extractGovTalkErrorMessage(receipt);

  await appendAuditEvent({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    actorId: opts.actorId,
    action: polled.ok ? "hmrc.sa100.submit" : "hmrc.sa100.submit.error",
    entityType: "sa100_return",
    entityId: opts.clientId,
    payloadHash: hash,
    hmrcStatusCode: polled.status,
    hmrcCorrelationId: polled.correlationId,
    detail: {
      qualifier: polled.qualifier,
      responseSnippet: receipt.slice(0, 2000),
      env: cfg.env,
      taxYear: opts.draft.taxYear,
      gatewayTest: cfg.env !== "production",
    },
  });

  return {
    ok: polled.ok,
    demo: false as const,
    status: polled.status,
    correlationId: polled.correlationId ?? `sa100-${Date.now()}`,
    receipt: receipt.slice(0, 4000),
    errorMessage,
  };
}

