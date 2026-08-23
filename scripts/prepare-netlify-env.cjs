/**
 * Build a Netlify-safe env file from .env.local (no secrets printed).
 * Usage: node scripts/prepare-netlify-env.cjs
 * Then on the NEW site: npx netlify env:import --replace-existing .env.netlify.production
 */
const fs = require("fs");
const path = require("path");

const src = path.join(process.cwd(), ".env.local");
const out = path.join(process.cwd(), ".env.netlify.production");

const SKIP = new Set([
  "DEMO_MODE",
  "MEMORY_STORE",
  "ADMIN_PASSWORD",
]);

if (!fs.existsSync(src)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const lines = fs.readFileSync(src, "utf8").split(/\r?\n/);
const kept = [];
for (const line of lines) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  const key = m[1];
  if (SKIP.has(key)) continue;
  kept.push(`${key}=${m[2]}`);
}

// Production canonical URL
if (!kept.some((l) => l.startsWith("NEXT_PUBLIC_APP_URL="))) {
  kept.unshift("NEXT_PUBLIC_APP_URL=https://hydratax.uk");
} else {
  for (let i = 0; i < kept.length; i++) {
    if (kept[i].startsWith("NEXT_PUBLIC_APP_URL=")) {
      kept[i] = "NEXT_PUBLIC_APP_URL=https://hydratax.uk";
    }
  }
}

fs.writeFileSync(out, kept.join("\n") + "\n");
console.log(`Wrote ${kept.length} vars to .env.netlify.production`);
console.log("Import on NEW Netlify site:");
console.log("  npx netlify login");
console.log("  npx netlify link   # pick the new site");
console.log("  npx netlify env:import --replace-existing .env.netlify.production");
