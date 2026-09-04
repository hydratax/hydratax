import fs from "fs";
import path from "path";
import crypto from "crypto";
import { randomBytes } from "crypto";

function loadEnv(file: string) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1]!.trim();
    let v = m[2]!.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(".env.local");

function md5(s: string) {
  return crypto.createHash("md5").update(s).digest("hex");
}

function sixChar() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  let o = "";
  for (let i = 0; i < 6; i++) o += a[b[i]! % a.length];
  return o;
}

function buildBody(formInner: string, packageRef: string) {
  const sub = sixChar();
  const today = new Date().toISOString().slice(0, 10);
  return `<FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk/Header http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd">
      <FormHeader>
        <CompanyNumber>15855034</CompanyNumber>
        <CompanyType>EW</CompanyType>
        <CompanyName>GLAM BY YUMNA LTD</CompanyName>
        <CompanyAuthenticationCode>FRUGC2</CompanyAuthenticationCode>
        <PackageReference>${packageRef}</PackageReference>
        <Language>EN</Language>
        <FormIdentifier>ConfirmationStatement</FormIdentifier>
        <SubmissionNumber>${sub}</SubmissionNumber>
      </FormHeader>
      <DateSigned>${today}</DateSigned>
      <Form>${formInner}</Form>
    </FormSubmission>`;
}

const plainForm = `<ConfirmationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationStatement-v1-3.xsd">
          <ReviewDate>2026-07-22</ReviewDate>
          <RegisteredEmailAddress>haidary555@gmail.com</RegisteredEmailAddress>
          <AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>
          <StateConfirmation>true</StateConfirmation>
        </ConfirmationStatement>`;

async function tryAuth(label: string, senderId: string, method: string, value: string) {
  const pid = process.env.COMPANIES_HOUSE_PRESENTER_ID!;
  const auth = process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE!;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>ConfirmationStatement</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${senderId}</SenderID>
        <Authentication><Method>${method}</Method><Value>${value}</Value></Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body>${buildBody(plainForm, "0012")}</Body>
</GovTalkMessage>`;

  const gateway =
    process.env.COMPANIES_HOUSE_XML_GATEWAY_URL ||
    "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";
  const res = await fetch(gateway, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  const err = raw.match(/<Text>([^<]+)<\/Text>/i)?.[1];
  const num = raw.match(/<Number>(\d+)<\/Number>/i)?.[1];
  console.log(`${label}: ${num} ${err}`);
}

async function main() {
  const pid = process.env.COMPANIES_HOUSE_PRESENTER_ID!;
  const auth = process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE!;
  await tryAuth("clear plain", pid, "clear", auth);
  await tryAuth("md5sign", md5(pid), "MD5SIGN", md5(auth));
  await tryAuth("md5 hash prefix", `md5#${md5(pid)}`, "MD5SIGN", `md5#${md5(auth)}`);
}

main().catch(console.error);
