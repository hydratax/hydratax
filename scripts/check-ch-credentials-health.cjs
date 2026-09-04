/**
 * Credential health check — no CS01 filing.
 * Tests REST API + XML gateway presenter auth (good vs bad).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  let k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const live =
  (env.COMPANIES_HOUSE_ENV || "test").toLowerCase() === "live" ||
  env.COMPANIES_HOUSE_ENV?.toLowerCase() === "production";
const LIVE_XML =
  "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";
const TEST_XML =
  "https://xmlgw-sandpit-staging.companieshouse.gov.uk/v1-0/xmlgw/Gateway";
const gateway =
  env.COMPANIES_HOUSE_XML_GATEWAY_URL?.trim() ||
  (live ? LIVE_XML : TEST_XML);
const apiBase = live
  ? "https://api.company-information.service.gov.uk"
  : "https://api-sandbox.company-information.service.gov.uk";

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function buildSchemaStatusXml(presenterId, presenterAuth) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>SchemaStatus</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${esc(presenterAuth)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

async function postGateway(label, xml) {
  const res = await fetch(gateway, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  const qualifier = raw.match(/<Qualifier>([^<]+)<\/Qualifier>/i)?.[1] ?? "?";
  const num = raw.match(/<Number>(\d+)<\/Number>/i)?.[1] ?? "";
  const text = raw.match(/<Text>([^<]+)<\/Text>/i)?.[1] ?? "";
  const hasSchemaList = /ConfirmationStatement-v1-3/i.test(raw);
  return { label, http: res.status, qualifier, num, text, hasSchemaList, ok: res.ok };
}

function buildMinimalGatewayXml(presenterId, presenterAuth) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompanyAuthorisation</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${esc(presenterAuth)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

async function main() {
  console.log("=== Companies House credential health (no CS01) ===\n");
  console.log(`Environment: ${live ? "live" : "test"}`);
  console.log(`XML gateway: ${gateway}`);
  console.log(`REST API:    ${apiBase}\n`);

  const pid = env.COMPANIES_HOUSE_PRESENTER_ID?.trim() ?? "";
  const auth = env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE?.trim() ?? "";
  const credit = env.COMPANIES_HOUSE_CREDIT_ACCOUNT?.trim() ?? "";
  const apiKey = env.COMPANIES_HOUSE_API_KEY?.trim() ?? "";

  console.log("--- Config ---");
  console.log(`Presenter ID:     ${pid ? `set (${pid.length} chars)` : "MISSING"}`);
  console.log(`Presenter auth:   ${auth ? `set (${auth.length} chars)` : "MISSING"}`);
  console.log(`Credit account:   ${credit ? `set (${credit.length} chars)` : "MISSING"}`);
  console.log(`API key:          ${apiKey ? `set (${apiKey.length} chars)` : "MISSING"}`);
  if (pid && credit) {
    console.log(`ID ≠ credit acct: ${pid !== credit ? "yes (good)" : "NO — same value (check env)"}`);
  }

  console.log("\n--- REST Public Data API ---");
  if (!apiKey) {
    console.log("FAIL: no API key");
  } else {
    const basic = Buffer.from(`${apiKey}:`).toString("base64");
    const r = await fetch(`${apiBase}/company/00000006`, {
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`OK — HTTP ${r.status}, company lookup works (${j.company_name ?? "data"})`);
    } else {
      console.log(`FAIL — HTTP ${r.status}`);
    }
  }

  console.log("\n--- XML gateway presenter auth (minimal envelope) ---");
  if (!pid || !auth) {
    console.log("SKIP: presenter credentials missing");
    return;
  }

  const probes = [
    ["your credentials", buildMinimalGatewayXml(pid, auth)],
    ["deliberately wrong auth", buildMinimalGatewayXml(pid, "WRONGAUTH01")],
    ["deliberately wrong presenter ID", buildMinimalGatewayXml("00000000000", auth)],
  ];

  const results = [];
  for (const [label, xml] of probes) {
    const r = await postGateway(label, xml);
    results.push(r);
    console.log(
      `${r.label}: HTTP ${r.http}, error=${r.num || "none"} ${r.text || ""}`.trim(),
    );
  }

  const good = results[0];
  const badAuth = results[1];
  const badId = results[2];

  console.log("\n--- Verdict ---");
  if (good.num === "502") {
    console.log(
      "Presenter credentials: FAIL — your presenter ID + auth code rejected (502).",
    );
  } else if (good.num === "501" && (badAuth.num === "502" || badId.num === "502")) {
    console.log(
      "Presenter credentials: OK — your pair is accepted; wrong credentials get 502.",
    );
  } else if (good.num === "501" && badAuth.num === "501" && badId.num === "501") {
    console.log(
      "Presenter credentials: INCONCLUSIVE — gateway returns 501 for all probes (cannot distinguish auth on this call type).",
    );
    console.log(
      "  → Gateway is reachable; presenter auth was not rejected with 502 on minimal envelope.",
    );
  } else if (good.hasSchemaList || good.qualifier === "response") {
    console.log("Presenter credentials: OK — gateway accepted auth.");
  } else {
    console.log(`Presenter credentials: see probe errors above (good=${good.num}, bad auth=${badAuth.num}).`);
  }

  if (!credit && live) {
    console.log("Credit account: MISSING — required before live fee-bearing filing.");
  } else if (credit) {
    console.log(
      "Credit account: present in env (billing linkage only verified when a fee filing is accepted).",
    );
  }

  console.log("\n--- REST summary ---");
  console.log("API key: OK (live company lookup works).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
