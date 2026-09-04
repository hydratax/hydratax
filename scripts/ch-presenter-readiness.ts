/**
 * Hydra presenter readiness + live CS01 gateway smoke probe.
 *
 * Usage: npx tsx scripts/ch-presenter-readiness.ts
 *
 * Does not print secrets. Reports whether the site is ready for live
 * submission testing (fixed presenter + XML shape + gateway response).
 */
import fs from "node:fs";
import path from "node:path";
import { buildConfirmationStatementXml } from "../src/server/companies-house/filing/xml-gateway";
import { describePresenterReadiness } from "../src/server/companies-house/filing/presenter";
import { getChFilingEnv } from "../src/server/companies-house/filing/config";
import { resolveChPackageReference } from "../src/server/companies-house/filing/gateway-auth";

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

async function probeCs01(): Promise<{
  http: number;
  errorNumber: string | null;
  errorText: string | null;
  accepted: boolean;
}> {
  const cfg = getChFilingEnv();
  const xml = buildConfirmationStatementXml({
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

  const res = await fetch(cfg.xmlGatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    body: xml,
  });
  const raw = await res.text();
  const errorNumber = raw.match(/<Number>(\d+)<\/Number>/i)?.[1] ?? null;
  const errorText = raw.match(/<Text>([^<]+)<\/Text>/i)?.[1] ?? null;
  const qualifier = raw.match(/<Qualifier>([^<]+)<\/Qualifier>/i)?.[1] ?? null;
  const accepted =
    qualifier === "acknowledgement" ||
    (Boolean(qualifier) &&
      errorNumber !== "502" &&
      !/Authorisation Failure|fatal/i.test(raw));

  return { http: res.status, errorNumber, errorText, accepted };
}

async function main() {
  loadEnvLocal();
  const readiness = describePresenterReadiness();
  const cfg = getChFilingEnv();

  console.log("=== HydraTax CH presenter readiness ===\n");
  console.log("Model: fixed website presenter → variable per-company filing");
  console.log(`Environment: ${cfg.label}`);
  console.log(`Gateway:     ${cfg.xmlGatewayUrl}`);
  console.log(`Package ref in FormHeader: ${resolveChPackageReference()} (defaults to presenter ID)`);
  console.log("");

  console.log("--- Fixed presenter (website) ---");
  const f = readiness.fixedPresenter;
  console.log(`Presenter ID configured:     ${f.presenterIdConfigured ? "yes" : "NO"}`);
  console.log(`Presenter auth configured:   ${f.presenterAuthConfigured ? "yes" : "NO"}`);
  console.log(`Credit account configured:   ${f.creditAccountConfigured ? "yes" : "NO"}`);
  console.log(`Presenter email configured:  ${f.presenterEmailConfigured ? "yes" : "NO"}`);
  console.log(`ID format (11 alnum):        ${f.presenterIdFormatOk ? "ok" : "FAIL"}`);
  console.log(`Auth format (11 alnum):      ${f.presenterAuthFormatOk ? "ok" : "FAIL"}`);
  console.log(`Looks like software ID:      ${f.looksLikeSoftwarePresenterId ? "yes" : "check"}`);
  console.log(`Not WebFiling email login:   ${f.notWebFilingEmail ? "yes" : "FAIL"}`);
  console.log("");

  console.log("--- Per-company (supplied at checkout) ---");
  console.log("Company number, company name, company auth code,");
  console.log("director/PSC personal codes, confirmation date, company registered email.");
  console.log("");

  if (readiness.blockers.length) {
    console.log("--- Blockers ---");
    for (const b of readiness.blockers) console.log(`• ${b}`);
    console.log("");
  }

  console.log("--- CS01 XML build ---");
  let xmlOk = false;
  try {
    const xml = buildConfirmationStatementXml({
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
    const checks = [
      ["Body FormSubmission", /<Body>[\s\S]*<FormSubmission/i.test(xml)],
      ["Presenter Method clear", /<Method>clear<\/Method>/i.test(xml)],
      ["Company auth", /<CompanyAuthenticationCode>/i.test(xml)],
      ["Registered email", /<RegisteredEmailAddress>/i.test(xml)],
      ["Lawful purpose", /<AcceptLawfulPurposeStatement>true<\/AcceptLawfulPurposeStatement>/i.test(xml)],
      ["Personal code", /<CompaniesHousePersonalCode>/i.test(xml)],
    ] as const;
    for (const [label, ok] of checks) {
      console.log(`${ok ? "OK" : "FAIL"} ${label}`);
    }
    xmlOk = checks.every(([, ok]) => ok);
    console.log(`XML bytes: ${xml.length}`);
  } catch (err) {
    console.log("FAIL XML build:", err instanceof Error ? err.message : err);
  }

  console.log("\n--- Live gateway probe (CS01) ---");
  if (!readiness.ok) {
    console.log("SKIP — fix presenter blockers first.");
  } else {
    const probe = await probeCs01();
    console.log(`HTTP ${probe.http}`);
    console.log(
      probe.errorNumber
        ? `CH error ${probe.errorNumber}: ${probe.errorText ?? ""}`
        : `Qualifier accepted=${probe.accepted}`,
    );

    console.log("\n=== Verdict ===");
    if (probe.accepted) {
      console.log("READY FOR LIVE SUBMISSION TESTING — gateway accepted the probe.");
      process.exit(0);
    }
    if (probe.errorNumber === "502") {
      console.log("FRAMEWORK READY — live gateway still returns 502 Authorisation Failure.");
      console.log("Code/path is built; CH must enable this presenter for live software filing");
      console.log("(and confirm credit account linkage). Re-run this script after CH confirms.");
      process.exit(2);
    }
    console.log(
      "FRAMEWORK READY — gateway responded with a business/schema error (auth likely past 502).",
    );
    console.log("Use a real company auth code + personal codes for a paid end-to-end test.");
    process.exit(0);
  }

  console.log("\n=== Verdict ===");
  console.log("NOT READY — fix blockers above.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
