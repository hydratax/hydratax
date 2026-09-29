/**
 * Live Accounts submit — requires explicit CH_PROBE_* env vars.
 * Signing director is ALWAYS resolved from Companies House officers for
 * that company number (never hardcoded from another company).
 *
 * Usage:
 *   CH_PROBE_COMPANY_NUMBER=16230089 \
 *   CH_PROBE_COMPANY_AUTH=******** \
 *   CH_PROBE_PERIOD_START=2025-02-05 \
 *   CH_PROBE_PERIOD_END=2026-02-28 \
 *   npx tsx scripts/ch-accounts-live-submit.ts
 */
import fs from "fs";
import path from "path";
import { submitAccountsFromPayload } from "../src/server/companies-house/filing/accounts-filing";

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

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  // No hardcoded company / director defaults — that caused the Travel Buds
  // filing to use Glam By Yumna's director.
  const companyNumber = requireEnv("CH_PROBE_COMPANY_NUMBER");
  const companyAuthCode = requireEnv("CH_PROBE_COMPANY_AUTH");
  const periodStart = requireEnv("CH_PROBE_PERIOD_START");
  const periodEnd = requireEnv("CH_PROBE_PERIOD_END");
  const companyName = process.env.CH_PROBE_COMPANY_NAME?.trim() || "";
  // Optional: if set, must match an active CH director for THIS company.
  // If omitted, sole active director on the register is used.
  const claimedDirector = process.env.CH_PROBE_DIRECTOR?.trim() || null;
  const accountsType = process.env.CH_PROBE_ACCOUNTS_TYPE?.trim() || "micro";

  if (!companyName) {
    console.error(
      "CH_PROBE_COMPANY_NAME is required (must match Companies House register name).",
    );
    process.exit(1);
  }

  console.log("Submitting Accounts to Companies House");
  console.log("  env:", process.env.COMPANIES_HOUSE_ENV);
  console.log("  company:", companyNumber, companyName);
  console.log("  period:", periodStart, "→", periodEnd);
  console.log(
    "  claimedDirector:",
    claimedDirector || "(resolve sole active CH director)",
  );
  console.log("  feeBearing: false");
  console.log(
    "  preflight: company identity + director must match CH officers for this number",
  );

  const result = await submitAccountsFromPayload({
    companyNumber,
    companyName,
    companyAuthCode,
    periodStart,
    periodEnd,
    accountsType,
    declarantName: claimedDirector,
    yearEndFigures: {
      companyNumber,
      periodStart,
      periodEnd,
      ...(claimedDirector ? { directorName: claimedDirector } : {}),
      pl: {
        turnover: "0",
        interestIncome: "0",
        costOfMaterials: "0",
        staffCosts: "0",
        depreciation: "0",
        otherCharges: "0",
        corporationTax: "0",
      },
      bs: {
        fixedAssets: "0",
        totalCurrentAssets: "1",
        creditorsWithinOneYear: "0",
        corporationTaxPayable: "0",
        creditorsAfterOneYear: "0",
        shareCapital: "1",
        retainedEarnings: "0",
      },
    },
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
