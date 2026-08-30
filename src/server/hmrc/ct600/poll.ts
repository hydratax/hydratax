import { getHmrcConfig } from "@/server/hmrc/config";
import { extractXmlTag, escapeXml } from "@/server/hmrc/ct600/xml-utils";

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

function buildPollXml(opts: {
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
      <Class>HMRC-CT-CT600</Class>
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

export async function submitAndPollCt600Xml(opts: {
  xml: string;
  utr: string;
  senderId: string;
  senderPassword: string;
  maxPolls?: number;
  pollDelayMs?: number;
  initialDelayMs?: number;
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
  const pollXml = buildPollXml({
    correlationId,
    senderId: opts.senderId,
    senderPassword: opts.senderPassword,
    utr: opts.utr.replace(/\s+/g, ""),
    gatewayTest,
  });

  const delay = opts.pollDelayMs ?? 3_000;
  const max = opts.maxPolls ?? 8;
  const initialDelay = opts.initialDelayMs ?? 2_000;
  await new Promise((r) => setTimeout(r, initialDelay));

  let poll = await postXml(pollEndpoint, pollXml);
  for (let i = 0; i < max; i++) {
    const q = extractXmlTag("Qualifier", poll.text);
    if (q !== "acknowledgement") break;
    await new Promise((r) => setTimeout(r, delay));
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

  const ok =
    finalQualifier === "response" && hasSuccess && !hasBusinessError;

  return {
    ok,
    status: poll.status,
    correlationId,
    qualifier: finalQualifier,
    submitResponse: submit.text,
    pollResponse: poll.text,
  };
}
