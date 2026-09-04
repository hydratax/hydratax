/**
 * Retry CS01 fulfillment for a paid companies_house_requests row.
 * Usage: npx tsx scripts/fulfill-cs01-retry.ts [requestId]
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

const requestId = process.argv[2] || "4b609d0f-3214-4016-941f-4f8f68bd29cf";

async function main() {
  const { fulfillPaidChRequest } = await import(
    "../src/server/companies-house/fulfill-ch-request"
  );

  const result = await fulfillPaidChRequest({
    requestId,
    customerEmail: "haidary555@gmail.com",
    stripeSessionId: "cs_live_b16u7qPkAZUKCOHc0gg5k9xuotfPXfrkPI6XAkHXg6eMeA70bZjIdUwvQu",
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.submitted) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
