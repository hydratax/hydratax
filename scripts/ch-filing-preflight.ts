/**
 * Pre-flight checks for Companies House CS01 + IN01 before live submit.
 *
 * Usage: npx tsx scripts/ch-filing-preflight.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildConfirmationStatementXml } from "../src/server/companies-house/filing/xml-gateway";
import { buildCompanyIncorporationXml } from "../src/server/companies-house/filing/incorporation-xml";
import {
  describeChCredentialsForFiling,
  resolveChPackageReference,
  xmlEscape,
} from "../src/server/companies-house/filing/gateway-auth";
import { getChFilingEnv } from "../src/server/companies-house/filing/config";
import type { ParsedIncorporationInput } from "../src/server/companies-house/filing/incorporation-schema";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");

function loadEnvLocal() {
  if (!fs.existsSync(ENV_PATH)) throw new Error(`Missing ${ENV_PATH}`);
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
    if (!process.env[key]) process.env[key] = val;
  }
}

type ProbeResult = {
  label: string;
  http: number;
  qualifier: string | null;
  errorNumber: string | null;
  errorText: string | null;
  accepted: boolean;
};

async function postGateway(label: string, xml: string): Promise<ProbeResult> {
  const cfg = getChFilingEnv();
  const res = await fetch(cfg.xmlGatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  const qualifier = raw.match(/<Qualifier>([^<]+)<\/Qualifier>/i)?.[1] ?? null;
  const errorNumber = raw.match(/<Number>(\d+)<\/Number>/i)?.[1] ?? null;
  const errorText = raw.match(/<Text>([^<]+)<\/Text>/i)?.[1] ?? null;
  const accepted =
    qualifier === "acknowledgement" ||
    (qualifier === "response" && !/Authorisation Failure|fatal/i.test(raw));
  return {
    label,
    http: res.status,
    qualifier,
    errorNumber,
    errorText,
    accepted,
  };
}

function presenterAuthXml(presenterId: string, auth: string) {
  return `<IDAuthentication>
        <SenderID>${xmlEscape(presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${xmlEscape(auth)}</Value>
        </Authentication>
      </IDAuthentication>`;
}

async function probeSchemaStatus() {
  const cfg = getChFilingEnv();
  if (!cfg.presenterId || !cfg.presenterAuthCode) {
    return { label: "SchemaStatus", skipped: true as const };
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
      ${presenterAuthXml(cfg.presenterId, cfg.presenterAuthCode)}
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
  const result = await postGateway("SchemaStatus (presenter auth)", xml);
  return { label: "SchemaStatus", skipped: false as const, result };
}

const sampleIn01: ParsedIncorporationInput = {
  companyName: "Hydra Preflight Test Ltd",
  countryOfIncorporation: "EW",
  registeredOffice: {
    premise: "1",
    street: "Test Street",
    thoroughfare: "",
    postTown: "London",
    county: "",
    postcode: "EC1A 1BB",
    country: "GBR",
  },
  registeredEmail: "preflight@example.com",
  sicCodes: ["62012"],
  shareClass: "Ordinary",
  shareCurrency: "GBP",
  nominalValue: 1,
  amountPaidPerShare: 1,
  directors: [
    {
      forename: "Test",
      surname: "Director",
      dateOfBirth: "1990-01-15",
      nationality: "British",
      countryOfResidence: "United Kingdom",
      personalCode: "TESTCODE123",
      serviceAddressSameAsRo: true,
      residentialAddress: {
        premise: "1",
        street: "Test Street",
        thoroughfare: "",
        postTown: "London",
        county: "",
        postcode: "EC1A 1BB",
        country: "GBR",
      },
      isSubscriber: true,
      shares: 100,
    },
  ],
  subscribers: [
    {
      forename: "Test",
      surname: "Director",
      address: {
        premise: "1",
        street: "Test Street",
        thoroughfare: "",
        postTown: "London",
        county: "",
        postcode: "EC1A 1BB",
        country: "GBR",
      },
      shares: 100,
      personalCode: "TESTCODE123",
      dateOfBirth: "1990-01-15",
      nationality: "British",
      countryOfResidence: "United Kingdom",
      residentialAddress: {
        premise: "1",
        street: "Test Street",
        thoroughfare: "",
        postTown: "London",
        county: "",
        postcode: "EC1A 1BB",
        country: "GBR",
      },
      isPsc: true,
    },
  ],
  sameDay: false,
  lawfulPurposeConfirmed: true,
  personalCodesConfirmed: true,
  authoriserForename: "Test",
  authoriserSurname: "Director",
};

function assertCs01Structure(xml: string) {
  const required = [
    "<PackageReference>",
    "<CompanyAuthenticationCode>",
    "<ReviewDate>",
    "<RegisteredEmailAddress>",
    "<AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>",
    "<StateConfirmation>true</StateConfirmation>",
    "<FormSubmission",
    "<Method>clear</Method>",
  ];
  const missing = required.filter((f) => !xml.includes(f));
  const classOk =
    xml.includes("<Class>ConfirmationAndVerificationStatement</Class>") ||
    xml.includes("<Class>ConfirmationStatement</Class>");
  const idOk =
    xml.includes(
      "<FormIdentifier>ConfirmationAndVerificationStatement</FormIdentifier>",
    ) || xml.includes("<FormIdentifier>ConfirmationStatement</FormIdentifier>");
  if (!classOk) missing.push("<Class>Confirmation…</Class>");
  if (!idOk) missing.push("<FormIdentifier>Confirmation…</FormIdentifier>");
  return missing;
}

function assertIn01Structure(xml: string) {
  const required = [
    "<Class>CompanyIncorporation</Class>",
    "<FormIdentifier>CompanyIncorporation</FormIdentifier>",
    "<CompanyType>BYSHR</CompanyType>",
    "<Articles>BYSHRMODEL</Articles>",
    "<PackageReference>",
    "TESTCODE123",
  ];
  const missing = required.filter((f) => !xml.includes(f));
  return missing;
}

async function main() {
  loadEnvLocal();
  const cfg = getChFilingEnv();
  const creds = describeChCredentialsForFiling();

  console.log("=== Companies House filing preflight ===\n");
  console.log(`Environment: ${cfg.label}`);
  console.log(`Gateway:     ${cfg.xmlGatewayUrl}`);
  console.log(`Package ref: ${resolveChPackageReference()}`);
  console.log(`Presenter:   ${creds.presenterConfigured ? "configured" : "MISSING"}`);
  console.log(`Credit acct: ${creds.creditAccountConfigured ? "configured" : "MISSING"}`);
  console.log(`Can file fee:  ${creds.canFileFeeBearing ? "yes" : "no"}\n`);

  // --- XML build (offline) ---
  const cs01Xml = buildConfirmationStatementXml({
    companyNumber: "15855034",
    companyName: "GLAM BY YUMNA LTD",
    confirmationDate: "2026-07-22",
    companyAuthCode: "XXXXXX",
    registeredEmail: "preflight@example.com",
    lawfulPurposeConfirmed: true,
    sicCodes: ["96090"],
    directors: [
      {
        fullName: "TEST, Director",
        dateOfBirth: "1990-01-01",
        personalCode: "TESTCODE123",
      },
    ],
    clientId: "",
    practiceId: "",
  });
  const cs01Missing = assertCs01Structure(cs01Xml);
  console.log("--- CS01 XML build ---");
  console.log(cs01Missing.length ? `FAIL missing: ${cs01Missing.join(", ")}` : "OK structure");

  const in01Built = buildCompanyIncorporationXml(sampleIn01);
  const in01Missing = assertIn01Structure(in01Built.xml);
  console.log("\n--- IN01 XML build ---");
  console.log(in01Missing.length ? `FAIL missing: ${in01Missing.join(", ")}` : "OK structure");
  console.log(`Submission number: ${in01Built.submissionNumber}, bytes: ${in01Built.xml.length}`);

  if (!creds.presenterConfigured) {
    console.log("\nSKIP gateway probes — presenter credentials missing.");
    process.exit(1);
  }

  // --- Gateway probes ---
  console.log("\n--- Gateway probes ---");
  const schema = await probeSchemaStatus();
  if (!schema.skipped) {
    const r = schema.result;
    console.log(
      `${r.label}: HTTP ${r.http}, qualifier=${r.qualifier}, ${r.errorNumber ?? ""} ${r.errorText ?? "accepted"}`,
    );
  }

  const cs01WithTestPackage = cs01Xml.replace(
    /<PackageReference>[^<]+<\/PackageReference>/,
    "<PackageReference>0012</PackageReference>",
  );
  const cs01Test = await postGateway("CS01 (PackageReference 0012)", cs01WithTestPackage);
  console.log(
    `${cs01Test.label}: HTTP ${cs01Test.http}, ${cs01Test.errorNumber ?? ""} ${cs01Test.errorText ?? cs01Test.qualifier}`,
  );

  const cs01LivePackage = cs01Xml.replace(
    /<PackageReference>[^<]+<\/PackageReference>/,
    `<PackageReference>${xmlEscape(resolveChPackageReference())}</PackageReference>`,
  );
  const cs01Live = await postGateway(
    `CS01 (PackageReference ${resolveChPackageReference()})`,
    cs01LivePackage,
  );
  console.log(
    `${cs01Live.label}: HTTP ${cs01Live.http}, ${cs01Live.errorNumber ?? ""} ${cs01Live.errorText ?? cs01Live.qualifier}`,
  );

  const in01Test = in01Built.xml.replace(
    /<PackageReference>[^<]+<\/PackageReference>/,
    "<PackageReference>0012</PackageReference>",
  );
  const in01Probe = await postGateway("IN01 (PackageReference 0012)", in01Test);
  console.log(
    `${in01Probe.label}: HTTP ${in01Probe.http}, ${in01Probe.errorNumber ?? ""} ${in01Probe.errorText ?? in01Probe.qualifier}`,
  );

  console.log("\n--- Summary ---");
  const xmlOk = cs01Missing.length === 0 && in01Missing.length === 0;
  const gatewayOk =
    schema.skipped === false &&
    schema.result.accepted &&
    (cs01Test.accepted || cs01Live.accepted || in01Probe.accepted);

  if (xmlOk) console.log("XML packages: OK");
  else console.log("XML packages: FAIL");

  if (schema.skipped === false && schema.result.errorNumber === "502") {
    console.log("Presenter auth: FAIL (502 on SchemaStatus)");
  } else if (schema.skipped === false && schema.result.accepted) {
    console.log("Presenter auth: OK (SchemaStatus accepted)");
  } else if (cs01Test.errorNumber === "502" && cs01Live.errorNumber === "502") {
    console.log(
      "Presenter auth: FAIL for fee filings (502 Authorisation Failure on CS01/IN01)",
    );
    console.log(
      "  → Check presenter is registered for software filing and PackageReference matches CH registration.",
    );
  } else if (cs01Test.accepted || cs01Live.accepted) {
    console.log("CS01 gateway: OK (accepted)");
  } else if (cs01Test.errorNumber !== "502") {
    console.log(
      `CS01 gateway: business/schema response (${cs01Test.errorText ?? "see above"}) — auth likely OK`,
    );
  }

  if (in01Probe.accepted) console.log("IN01 gateway: OK (accepted)");
  else if (in01Probe.errorNumber === "502") console.log("IN01 gateway: auth failure (502)");
  else console.log(`IN01 gateway: ${in01Probe.errorText ?? in01Probe.qualifier}`);

  const ready =
    xmlOk &&
    creds.canFileFeeBearing &&
    (cs01Test.accepted ||
      cs01Live.accepted ||
      (cs01Test.errorNumber !== "502" && cs01Live.errorNumber !== "502"));

  console.log(`\nReady for live submit: ${ready ? "LIKELY YES" : "NO — fix blockers above"}`);
  process.exit(ready ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
