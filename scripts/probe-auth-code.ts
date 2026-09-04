import fs from "fs";
import { getChFilingEnv } from "../src/server/companies-house/filing/config";
import { redactChGatewayXml } from "../src/server/companies-house/filing/ch-xml-log";
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

const authCode = process.argv[2] ?? "moosa5";
const cfg = getChFilingEnv();

const xml = buildConfirmationStatementXml({
  companyNumber: "15855034",
  companyName: "GLAM BY YUMNA LTD",
  confirmationDate: "2026-07-22",
  companyAuthCode: authCode,
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

async function main() {
  console.log(
    `Env=${cfg.label} host=${cfg.xmlGatewayHostKind} gatewayTest=${cfg.gatewayTest ? 1 : 0}`,
  );
  console.log(`URL=${cfg.xmlGatewayUrl}`);
  if (cfg.gatewayMismatch) {
    console.error("MISMATCH:", cfg.gatewayMismatch);
    process.exit(1);
  }

  const res = await fetch(cfg.xmlGatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  console.log(
    "Auth code tested:",
    authCode,
    "→ uppercased in XML as",
    authCode.toUpperCase(),
  );
  console.log("HTTP", res.status);
  console.log(raw.slice(0, 2500));
  if (/Authorisation Failure|fatal/i.test(raw)) {
    console.log("\n--- REDACTED REQUEST XML ---\n");
    console.log(redactChGatewayXml(xml));
  }
}

main().catch(console.error);
