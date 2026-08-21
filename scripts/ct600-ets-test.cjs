/**
 * Post a CT600 GovTalk envelope to HMRC External Test Service (ETS).
 *
 * Usage:
 *   node scripts/ct600-ets-test.cjs
 *
 * Requires in .env.local:
 *   HMRC_CT_VENDOR_ID=9621
 *   HMRC_CT_PRODUCT_NAME=HydraTax
 *   HMRC_CT_TEST_SENDER_ID=CTUser100
 *   HMRC_CT_TEST_PASSWORD=<password from SDST attachment>
 *   HMRC_CT_TEST_UTR=8596148860
 *
 * Endpoints (sandbox ETS):
 *   POST https://test-transaction-engine.tax.service.gov.uk/submission
 *   POST https://test-transaction-engine.tax.service.gov.uk/poll
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const SUBMIT_URL =
  "https://test-transaction-engine.tax.service.gov.uk/submission";
const POLL_URL = "https://test-transaction-engine.tax.service.gov.uk/poll";

function loadEnvLocal() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH}`);
  }
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildXml(env) {
  const vendorId = env.HMRC_CT_VENDOR_ID?.trim();
  const product = (env.HMRC_CT_PRODUCT_NAME || "HydraTax").trim();
  const version = (env.HMRC_VENDOR_VERSION || "HydraTax=0.1.0").trim();
  const senderId = env.HMRC_CT_TEST_SENDER_ID?.trim();
  const password = env.HMRC_CT_TEST_PASSWORD?.trim();
  const utr = env.HMRC_CT_TEST_UTR?.trim();

  const missing = [];
  if (!vendorId) missing.push("HMRC_CT_VENDOR_ID");
  if (!senderId) missing.push("HMRC_CT_TEST_SENDER_ID");
  if (!password) missing.push("HMRC_CT_TEST_PASSWORD");
  if (!utr) missing.push("HMRC_CT_TEST_UTR");
  if (missing.length) {
    throw new Error(
      `Set these in .env.local before testing:\n  ${missing.join("\n  ")}`,
    );
  }

  // Minimal envelope for connectivity / auth smoke test.
  // Expect schema / IRmark / body validation errors until full CT600 V3 RIM + iXBRL is built.
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
      <GatewayTest>1</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(senderId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${escapeXml(password)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>
    <ChannelRouting>
      <Channel>
        <URI>${escapeXml(vendorId)}</URI>
        <Product>${escapeXml(product)}</Product>
        <Version>${escapeXml(version)}</Version>
      </Channel>
    </ChannelRouting>
  </GovTalkDetails>
  <Body>
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys>
          <Key Type="UTR">${escapeXml(utr)}</Key>
        </Keys>
        <Period>
          <Start>2024-04-01</Start>
          <End>2025-03-31</End>
        </Period>
        <DefaultCurrency>GBP</DefaultCurrency>
      </IRheader>
      <CompanyTaxReturn>
        <CompanyInformation>
          <CompanyName>HydraTax CT Test Ltd</CompanyName>
          <RegistrationNumber>12345678</RegistrationNumber>
        </CompanyInformation>
        <ReturnInfoBody>
          <CompanyInformation>
            <PeriodOfReturnFrom>2024-04-01</PeriodOfReturnFrom>
            <PeriodOfReturnTo>2025-03-31</PeriodOfReturnTo>
          </CompanyInformation>
          <ReturnInfoSummary>
            <Turnover>100000.00</Turnover>
            <TradingProfits>70000.00</TradingProfits>
            <CorporationTaxChargeable>13300.00</CorporationTaxChargeable>
          </ReturnInfoSummary>
        </ReturnInfoBody>
      </CompanyTaxReturn>
    </IRenvelope>
  </Body>
</GovTalkMessage>`;
}

function extract(tag, xml) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1] : null;
}

async function postXml(url, xml) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      Accept: "application/xml, text/xml, */*",
    },
    body: xml,
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  const env = loadEnvLocal();
  const xml = buildXml(env);
  const outDir = path.join(ROOT, ".ct-test");
  fs.mkdirSync(outDir, { recursive: true });
  const submitPath = path.join(outDir, "last-submit.xml");
  const responsePath = path.join(outDir, "last-response.xml");
  fs.writeFileSync(submitPath, xml, "utf8");

  console.log("Vendor ID:", env.HMRC_CT_VENDOR_ID);
  console.log("SenderID:", env.HMRC_CT_TEST_SENDER_ID);
  console.log("UTR:", env.HMRC_CT_TEST_UTR);
  console.log("POST", SUBMIT_URL);
  console.log("Wrote", submitPath);

  const submit = await postXml(SUBMIT_URL, xml);
  fs.writeFileSync(responsePath, submit.text, "utf8");
  console.log("\n--- Submit HTTP", submit.status, "---");
  console.log(submit.text.slice(0, 4000));
  console.log("Wrote", responsePath);

  const correlationId = extract("CorrelationID", submit.text);
  const qualifier = extract("Qualifier", submit.text);
  const pollEndpoint = extract("ResponseEndPoint", submit.text) || POLL_URL;

  if (correlationId && (qualifier === "acknowledgement" || qualifier === "error")) {
    console.log("\nCorrelationID:", correlationId);
  }

  if (correlationId && qualifier === "acknowledgement") {
    const pollXml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>poll</Qualifier>
      <Function>submit</Function>
      <CorrelationID>${escapeXml(correlationId)}</CorrelationID>
      <Transformation>XML</Transformation>
      <GatewayTest>1</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(env.HMRC_CT_TEST_SENDER_ID)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${escapeXml(env.HMRC_CT_TEST_PASSWORD)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(env.HMRC_CT_TEST_UTR)}</Key>
    </Keys>
  </GovTalkDetails>
  <Body></Body>
</GovTalkMessage>`;

    console.log("\nPolling", pollEndpoint, "…");
    // Gateway asked for PollInterval=10
    await new Promise((r) => setTimeout(r, 10000));
    let poll = await postXml(pollEndpoint, pollXml);
    // acknowledgement on poll means still processing — try a couple more times
    for (let i = 0; i < 5; i++) {
      const q = extract("Qualifier", poll.text);
      if (q !== "acknowledgement") break;
      console.log(`  still processing (poll ${i + 1})…`);
      await new Promise((r) => setTimeout(r, 10000));
      poll = await postXml(pollEndpoint, pollXml);
    }
    fs.writeFileSync(path.join(outDir, "last-poll.xml"), poll.text, "utf8");
    console.log("\n--- Poll HTTP", poll.status, "---");
    console.log(poll.text.slice(0, 6000));
  }

  console.log(`
Notes:
- Auth / Vendor ID / ChannelRouting problems show up in this GovTalk header response.
- Body schema, IRmark and iXBRL errors are expected until the full CT600 V3 pack is implemented.
- Keep DEMO_MODE=true for normal UI demos; this script talks to ETS directly.
`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message || err);
  process.exit(1);
});
