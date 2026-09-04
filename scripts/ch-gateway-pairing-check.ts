import fs from "fs";
import {
  describeChFilingReadiness,
  getChFilingEnv,
} from "../src/server/companies-house/filing/config";

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

const cfg = getChFilingEnv();
console.log(
  JSON.stringify(
    {
      env: cfg.label,
      host: cfg.xmlGatewayHostKind,
      url: cfg.xmlGatewayUrl,
      gatewayTest: cfg.gatewayTest,
      mismatch: cfg.gatewayMismatch,
      override: cfg.xmlGatewayOverride,
    },
    null,
    2,
  ),
);
for (const n of describeChFilingReadiness().notes) {
  if (/gateway|aligned|BLOCKER|env=/i.test(n)) console.log("-", n);
}
