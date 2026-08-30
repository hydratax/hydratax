/**
 * Build a real CT600 package and submit to HMRC ETS (sandbox).
 *
 * Usage: npx tsx scripts/ct600-package-ets-runner.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildCt600Package } from "../src/server/hmrc/ct600/build-envelope";
import { assertCt600XmlStructure } from "../src/server/hmrc/ct600/validate-xml-structure";
import { submitAndPollCt600Xml } from "../src/server/hmrc/ct600/poll";
import { pence } from "../src/server/money/pence";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const OUT_DIR = path.join(ROOT, ".ct-test");

function loadEnvLocal(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH}`);
  }
  const out: Record<string, string> = {};
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
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  process.env.HMRC_CT_VENDOR_ID = env.HMRC_CT_VENDOR_ID;
  process.env.HMRC_CT_PRODUCT_NAME = env.HMRC_CT_PRODUCT_NAME ?? "HydraTax";
  process.env.HMRC_VENDOR_VERSION = env.HMRC_VENDOR_VERSION ?? "HydraTax=0.1.0";
  process.env.HMRC_ENV = "sandbox";

  const utr = env.HMRC_CT_TEST_UTR?.trim() || "8596148860";
  const senderId = env.HMRC_CT_TEST_SENDER_ID?.trim();
  const senderPassword = env.HMRC_CT_TEST_PASSWORD?.trim();
  if (!senderId || !senderPassword) {
    throw new Error("Set HMRC_CT_TEST_SENDER_ID and HMRC_CT_TEST_PASSWORD in .env.local");
  }

  const built = buildCt600Package(
    {
      companyName: "HYDRA CONSULTANCY SERVICES LTD",
      companyNumber: "14633422",
      utr,
      figures: {
        clientId: "00000000-0000-0000-0000-000000000001",
        periodStart: "2024-03-01",
        periodEnd: "2025-02-28",
        turnoverPence: pence(0),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
      },
      questionnaire: {
        period_dates: true,
        accounts_attached: true,
        computations_attached: true,
        declaration: true,
        associated_companies: 0,
      },
      declarantName: "Test Director",
      declarantStatus: "Director",
      contact: { email: "test@example.com", telephone: "01234567890" },
      senderId,
      senderPassword,
      gatewayTest: true,
    },
    { strict: false },
  );

  assertCt600XmlStructure(built.xml);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "last-submit.xml"), built.xml, "utf8");
  console.log("Built package OK — IRmark:", built.irmark);
  console.log("Wrote", path.join(OUT_DIR, "last-submit.xml"));

  const polled = await submitAndPollCt600Xml({
    xml: built.xml,
    utr,
    senderId,
    senderPassword,
    maxPolls: 15,
    pollDelayMs: 10_000,
  });

  fs.writeFileSync(path.join(OUT_DIR, "last-response.xml"), polled.submitResponse, "utf8");
  if (polled.pollResponse) {
    fs.writeFileSync(path.join(OUT_DIR, "last-poll.xml"), polled.pollResponse, "utf8");
  }

  console.log("\n--- ETS result ---");
  console.log("OK:", polled.ok);
  console.log("Status:", polled.status);
  console.log("CorrelationID:", polled.correlationId);
  console.log("Qualifier:", polled.qualifier);
  const snippet = (polled.pollResponse ?? polled.submitResponse).slice(0, 6000);
  console.log(snippet);

  if (!polled.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
