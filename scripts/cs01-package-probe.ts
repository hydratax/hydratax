import fs from "fs";
import path from "path";
import { buildConfirmationStatementXml } from "../src/server/companies-house/filing/xml-gateway";

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

async function tryPackage(packageRef: string, label: string) {
  const base = buildConfirmationStatementXml({
    companyNumber: "15855034",
    companyName: "GLAM BY YUMNA LTD",
    confirmationDate: "2026-07-22",
    companyAuthCode: "FRUGC2",
    registeredEmail: "haidary555@gmail.com",
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
  const xml = base.replace(
    /<PackageReference>[^<]+<\/PackageReference>/,
    `<PackageReference>${packageRef}</PackageReference>`,
  );
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
  console.log(`${label}: ${err ?? "accepted"}`);
}

async function main() {
  const credit = process.env.COMPANIES_HOUSE_CREDIT_ACCOUNT ?? "";
  const presenter = process.env.COMPANIES_HOUSE_PRESENTER_ID ?? "";
  await tryPackage(presenter, "presenter-id");
  await tryPackage(credit, "credit-account");
  await tryPackage("0012", "test-0012");
}

main().catch(console.error);
