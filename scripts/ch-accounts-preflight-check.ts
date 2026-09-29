/**
 * Verify wrong-company director is rejected before gateway POST.
 */
import fs from "fs";
import path from "path";

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

async function main() {
  const { submitAccountsFromPayload } = await import(
    "../src/server/companies-house/filing/accounts-filing"
  );

  const wrongDirector = await submitAccountsFromPayload({
    companyNumber: "16230089",
    companyName: "THE TRAVEL BUDS LIMITED",
    companyAuthCode: "48CHYY",
    periodStart: "2026-03-01",
    periodEnd: "2027-02-28",
    accountsType: "micro",
    declarantName: "Yumna Ali",
  });
  console.log(
    "wrong director:",
    wrongDirector.ok ? "FAIL leaked" : "blocked",
    wrongDirector.error,
  );

  const wrongName = await submitAccountsFromPayload({
    companyNumber: "16230089",
    companyName: "GLAM BY YUMNA LTD",
    companyAuthCode: "48CHYY",
    periodStart: "2026-03-01",
    periodEnd: "2027-02-28",
    accountsType: "micro",
  });
  console.log(
    "wrong company name:",
    wrongName.ok ? "FAIL leaked" : "blocked",
    wrongName.error,
  );

  if (wrongDirector.ok || wrongName.ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
