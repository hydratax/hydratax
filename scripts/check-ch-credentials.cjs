const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
const raw = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
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

function mask(v) {
  if (!v) return "(empty)";
  const s = String(v);
  if (s.length <= 6) return `**** (len ${s.length})`;
  return `${s.slice(0, 2)}…${s.slice(-2)} (len ${s.length})`;
}

const keys = [
  "COMPANIES_HOUSE_API_KEY",
  "COMPANIES_HOUSE_ENV",
  "COMPANIES_HOUSE_PRESENTER_ID",
  "COMPANIES_HOUSE_PRESENTER_AUTH_CODE",
  "COMPANIES_HOUSE_CREDIT_ACCOUNT",
  "COMPANIES_HOUSE_OAUTH_CLIENT_ID",
  "COMPANIES_HOUSE_OAUTH_CLIENT_SECRET",
  "COMPANIES_HOUSE_XML_GATEWAY_URL",
];

console.log("=== Presence (masked) ===");
for (const k of keys) {
  console.log(`${k}: ${env[k] !== undefined ? mask(env[k]) : "(missing)"}`);
}

const chEnv = (env.COMPANIES_HOUSE_ENV || "test").toLowerCase();
const live = chEnv === "live" || chEnv === "production";
const apiBase = live
  ? "https://api.company-information.service.gov.uk"
  : "https://api-sandbox.company-information.service.gov.uk";
const gateway =
  env.COMPANIES_HOUSE_XML_GATEWAY_URL?.trim() ||
  "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";

async function testRest() {
  console.log("\n=== REST Public Data API ===");
  const key = env.COMPANIES_HOUSE_API_KEY?.trim();
  if (!key) {
    console.log("SKIP: no COMPANIES_HOUSE_API_KEY");
    return;
  }
  console.log(`Host: ${apiBase} (${live ? "live" : "test"})`);
  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`${apiBase}/company/00000006`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const text = await res.text();
  console.log(`GET /company/00000006 → HTTP ${res.status}`);
  if (res.ok) {
    try {
      const j = JSON.parse(text);
      console.log(`OK company_name=${j.company_name || "(none)"}`);
    } catch {
      console.log("OK (non-JSON body)");
    }
  } else {
    console.log(`FAIL body: ${text.slice(0, 180)}`);
  }

  const search = await fetch(
    `${apiBase}/search/companies?q=${encodeURIComponent("Hydra")}&items_per_page=1`,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
  );
  const sText = await search.text();
  console.log(`GET /search/companies?q=Hydra → HTTP ${search.status}`);
  if (search.ok) {
    try {
      const j = JSON.parse(sText);
      console.log(`OK total_results=${j.total_results ?? "n/a"}`);
    } catch {
      console.log("OK");
    }
  } else {
    console.log(`FAIL body: ${sText.slice(0, 180)}`);
  }
}

async function testGatewayAuth() {
  console.log("\n=== XML Gateway (presenter / credit account) ===");
  const presenterId = env.COMPANIES_HOUSE_PRESENTER_ID?.trim();
  const presenterAuth = env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE?.trim();
  const credit = env.COMPANIES_HOUSE_CREDIT_ACCOUNT?.trim();
  if (!presenterId || !presenterAuth) {
    console.log("SKIP: presenter id/auth code missing");
    return;
  }
  console.log(`Gateway: ${gateway}`);
  console.log(`Credit account set: ${credit ? "yes" : "no"}`);

  // Minimal GovTalk ping-style request. Expect an auth or schema error XML,
  // not a network failure — proves credentials reach the live gateway.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
        <SenderID>${presenterId.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${presenterAuth.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body>
    <FormSubmission>
      <FormHeader>
        <CompanyNumber>00000006</CompanyNumber>
        <CompanyName>TEST</CompanyName>
        <CompanyAuthenticationCode>XXXXXX</CompanyAuthenticationCode>
        <PackageReference>HydraTax-AuthCheck</PackageReference>
        <FormIdentifier>ConfirmationStatement</FormIdentifier>
        <SubmissionNumber>AUTH-CHECK-1</SubmissionNumber>
      </FormHeader>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;

  try {
    const res = await fetch(gateway, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        Accept: "application/xml",
      },
      body: xml,
    });
    const raw = await res.text();
    console.log(`POST gateway → HTTP ${res.status}`);

    const qualifier =
      raw.match(/<Qualifier>([^<]+)<\/Qualifier>/i)?.[1] ?? "(none)";
    const functionName =
      raw.match(/<Function>([^<]+)<\/Function>/i)?.[1] ?? "(none)";
    const correlation =
      raw.match(/<CorrelationID>([^<]*)<\/CorrelationID>/i)?.[1] ?? "";
    const raisedBy =
      raw.match(/<RaisedBy>([^<]+)<\/RaisedBy>/i)?.[1] ?? "";
    const errorNumber =
      raw.match(/<Number>([^<]+)<\/Number>/i)?.[1] ??
      raw.match(/<ErrorNumber>([^<]+)<\/ErrorNumber>/i)?.[1] ??
      "";
    const errorText =
      raw.match(/<Text>([^<]+)<\/Text>/i)?.[1] ??
      raw.match(/<ErrorText>([^<]+)<\/ErrorText>/i)?.[1] ??
      "";
    const gatewayErrors = [
      ...raw.matchAll(
        /<Error>([\s\S]*?)<\/Error>/gi,
      ),
    ]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 5);

    console.log(`Qualifier: ${qualifier}`);
    console.log(`Function: ${functionName}`);
    if (correlation) console.log(`CorrelationID: ${correlation}`);
    if (raisedBy) console.log(`RaisedBy: ${raisedBy}`);
    if (errorNumber) console.log(`Error number: ${errorNumber}`);
    if (errorText) console.log(`Error text: ${errorText}`);
    if (gatewayErrors.length) {
      console.log("Errors:");
      for (const e of gatewayErrors) console.log(`  - ${e}`);
    }

    const joined = `${errorText} ${gatewayErrors.join(" ")}`.toLowerCase();
    if (
      /authentication|unauthoris|unauthoriz|invalid presenter|sender id|auth code|credential|not authenticated/i.test(
        joined,
      )
    ) {
      console.log(
        "RESULT: AUTH PROBLEM — presenter ID or auth code rejected",
      );
    } else if (/credit.?account|payment|account.?number/i.test(joined)) {
      console.log(
        "RESULT: credentials reached gateway — credit account / payment related message",
      );
    } else if (
      qualifier.toLowerCase().includes("error") ||
      gatewayErrors.length ||
      errorText
    ) {
      console.log(
        "RESULT: credentials reached gateway (auth OK enough to process) — dummy body rejected as expected",
      );
    } else if (qualifier.toLowerCase().includes("acknowledgement") || res.ok) {
      console.log("RESULT: unexpected success-like response for dummy payload");
    } else {
      console.log("RESULT: unclear — see fields above");
    }
  } catch (err) {
    console.log(
      `RESULT: network error — ${err instanceof Error ? err.message : err}`,
    );
  }
}

(async () => {
  await testRest();
  await testGatewayAuth();
})();
