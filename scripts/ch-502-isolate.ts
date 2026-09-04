/**
 * Isolate 502 causes when CH has confirmed presenter credentials.
 * Does not print secrets. Uses .env.local.
 *
 * Usage:
 *   npx tsx scripts/ch-502-isolate.ts [companyAuthCode]
 */
import fs from "fs";
import { getChFilingEnv } from "../src/server/companies-house/filing/config";
import { buildConfirmationStatementXml } from "../src/server/companies-house/filing/xml-gateway";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let v = m[2]!.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[m[1]!.trim()]) process.env[m[1]!.trim()] = v;
}

const companyAuth = (process.argv[2] ?? "moosa5").toUpperCase();
const cfg = getChFilingEnv();

function summarise(raw: string) {
  return {
    qualifier: raw.match(/<Qualifier>([^<]+)<\/Qualifier>/i)?.[1] ?? "",
    raisedBy: raw.match(/<RaisedBy>([^<]+)<\/RaisedBy>/i)?.[1] ?? "",
    number: raw.match(/<Number>([^<]+)<\/Number>/i)?.[1] ?? "",
    text: raw.match(/<Text>([^<]+)<\/Text>/i)?.[1] ?? "",
  };
}

async function post(label: string, xml: string, contentType: string) {
  const res = await fetch(cfg.xmlGatewayUrl, {
    method: "POST",
    headers: { "Content-Type": contentType, Accept: "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  const s = summarise(raw);
  console.log(
    `${label.padEnd(42)} HTTP ${res.status} → ${s.number || "-"} ${s.text || s.qualifier} (${s.raisedBy || "-"})`,
  );
  return s;
}

function companyAuthXml(opts: {
  companyNumber: string;
  companyName: string;
  companyAuth: string;
  packageRef: string;
}) {
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
        <SenderID>${cfg.presenterId}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${cfg.presenterAuthCode}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body>
    <FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk/Header http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd">
      <FormHeader>
        <CompanyNumber>${opts.companyNumber}</CompanyNumber>
        <CompanyType>EW</CompanyType>
        <CompanyName>${opts.companyName}</CompanyName>
        <CompanyAuthenticationCode>${opts.companyAuth}</CompanyAuthenticationCode>
        <PackageReference>${opts.packageRef}</PackageReference>
        <Language>EN</Language>
        <FormIdentifier>CompanyAuthorisation</FormIdentifier>
        <SubmissionNumber>AUTH01</SubmissionNumber>
      </FormHeader>
      <DateSigned>${new Date().toISOString().slice(0, 10)}</DateSigned>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

async function main() {
  console.log(
    `env=${cfg.label} host=${cfg.xmlGatewayHostKind} url=${cfg.xmlGatewayUrl}`,
  );
  console.log(
    `presenter=${cfg.presenterId} credit=${cfg.creditAccountNumber ? "set" : "missing"} packageDefault=${cfg.packageReference ?? "(presenter id)"}`,
  );
  console.log(`companyAuth under test=${companyAuth}`);
  if (cfg.gatewayMismatch) {
    console.error("MISMATCH:", cfg.gatewayMismatch);
    process.exit(1);
  }

  const packageCandidates = [
    cfg.presenterId!,
    cfg.creditAccountNumber ?? "",
    "0012",
  ].filter(Boolean);

  console.log("\n=== CompanyAuthorisation (isolates company auth vs package) ===");
  for (const pkg of packageCandidates) {
    await post(
      `CompanyAuth pkg=${pkg}`,
      companyAuthXml({
        companyNumber: "15855034",
        companyName: "GLAM BY YUMNA LTD",
        companyAuth,
        packageRef: pkg,
      }),
      "text/xml",
    );
  }

  console.log("\n=== CS01 PackageReference variants (moosa5) ===");
  const base = buildConfirmationStatementXml({
    companyNumber: "15855034",
    companyName: "GLAM BY YUMNA LTD",
    confirmationDate: "2026-07-22",
    companyAuthCode: companyAuth,
    registeredEmail: "haidary555@gmail.com",
    lawfulPurposeConfirmed: true,
    directors: [
      {
        fullName: "ALI, Yumna",
        dateOfBirth: "1994-08-13",
        personalCode: "X4PSFHL2223",
      },
    ],
    clientId: "",
    practiceId: "",
  });

  for (const pkg of packageCandidates) {
    const xml = base.replace(
      /<PackageReference>[^<]+<\/PackageReference>/,
      `<PackageReference>${pkg}</PackageReference>`,
    );
    await post(`CS01 pkg=${pkg} (text/xml)`, xml, "text/xml");
  }

  await post("CS01 default (application/xml)", base, "application/xml");

  console.log("\n=== Plain ConfirmationStatement (no personal codes) ===");
  const plain = buildConfirmationStatementXml({
    companyNumber: "15855034",
    companyName: "GLAM BY YUMNA LTD",
    confirmationDate: "2026-07-22",
    companyAuthCode: companyAuth,
    registeredEmail: "haidary555@gmail.com",
    lawfulPurposeConfirmed: true,
    directors: [
      {
        fullName: "ALI, Yumna",
        dateOfBirth: "1994-08-13",
      },
    ],
    clientId: "",
    practiceId: "",
  });
  await post("plain CS01", plain, "text/xml");

  console.log("\n=== Deliberately wrong company auth (control) ===");
  const badAuth = buildConfirmationStatementXml({
    companyNumber: "15855034",
    companyName: "GLAM BY YUMNA LTD",
    confirmationDate: "2026-07-22",
    companyAuthCode: "ZZZZZZ",
    registeredEmail: "haidary555@gmail.com",
    lawfulPurposeConfirmed: true,
    directors: [
      {
        fullName: "ALI, Yumna",
        dateOfBirth: "1994-08-13",
        personalCode: "X4PSFHL2223",
      },
    ],
    clientId: "",
    practiceId: "",
  });
  await post("CS01 companyAuth=ZZZZZZ", badAuth, "text/xml");

  console.log("\nDone.");
  console.log(
    "If CompanyAuthorisation returns schema 100 (not 502), presenter credentials are accepted.",
  );
  console.log(
    "If CS01 stays 502 for both good and bad company auth with the same text, CH is rejecting before company-auth check — usually package / form enablement / credit linkage.",
  );
}

main().catch(console.error);
