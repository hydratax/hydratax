import fs from "fs";
import crypto from "crypto";
import { buildConfirmationStatementXml } from "../src/server/companies-house/filing/xml-gateway";

function loadEnv() {
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
}

loadEnv();

async function post(label: string, xml: string) {
  const gateway =
    process.env.COMPANIES_HOUSE_XML_GATEWAY_URL ||
    "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";
  const res = await fetch(gateway, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  const num = raw.match(/<Number>(\d+)<\/Number>/i)?.[1];
  const err = raw.match(/<Text>([^<]+)<\/Text>/i)?.[1];
  const reqMethod = xml.match(/<Method>([^<]+)<\/Method>/i)?.[1];
  console.log(`${label}: ${num} ${err} (request Method=${reqMethod})`);
}

function swapPresenterAuth(xml: string, auth: string) {
  return xml.replace(
    /<Authentication>\s*<Method>clear<\/Method>\s*<Value>[^<]*<\/Value>\s*<\/Authentication>/,
    `<Authentication><Method>clear</Method><Value>${auth}</Value></Authentication>`,
  );
}

async function main() {
  const base = buildConfirmationStatementXml({
    companyNumber: "15855034",
    companyName: "GLAM BY YUMNA LTD",
    confirmationDate: "2026-07-22",
    companyAuthCode: "FRUGC2",
    registeredEmail: "test@example.com",
    lawfulPurposeConfirmed: true,
    directors: [
      {
        fullName: "ALI, Yumna",
        dateOfBirth: "1997-08-13",
        personalCode: "X4PSFHL2223",
      },
    ],
    clientId: "",
    practiceId: "",
  });

  const goodAuth = process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE ?? "";
  await post("env presenter auth + FRUGC2", base);
  await post("wrong presenter auth + FRUGC2", swapPresenterAuth(base, "WRONGAUTH01"));
  await post(
    "wrong presenter id + FRUGC2",
    base.replace(
      `<SenderID>${process.env.COMPANIES_HOUSE_PRESENTER_ID}</SenderID>`,
      "<SenderID>00000000000</SenderID>",
    ),
  );
  await post(
    "env presenter auth + wrong company auth",
    base.replace("FRUGC2", "AAAAAA"),
  );

  const pid = process.env.COMPANIES_HOUSE_PRESENTER_ID ?? "";
  const auth = process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE ?? "";
  const txn = "12345678901";
  const digest = crypto
    .createHash("md5")
    .update(`${pid}${auth}${txn}`)
    .digest("hex");
  const chmd5Xml = base
    .replace(
      /<IDAuthentication>[\s\S]*?<\/IDAuthentication>/,
      `<IDAuthentication><SenderID>${pid}</SenderID><Authentication><Method>CHMD5</Method><Value>${digest}</Value></Authentication></IDAuthentication>`,
    )
    .replace(
      "<Transformation>XML</Transformation>",
      `<Transformation>XML</Transformation>\n      <TransactionID>${txn}</TransactionID>`,
    );
  await post("CHMD5 presenter auth + FRUGC2", chmd5Xml);

  console.log(
    `Presenter configured: id len=${process.env.COMPANIES_HOUSE_PRESENTER_ID?.length}, auth len=${goodAuth.length}`,
  );
}

main().catch(console.error);
