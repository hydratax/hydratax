/**
 * Build hub-focused company sitemap shards from local hub JSONL files.
 * Free-tier safe: local disk only.
 *
 *   npm run ch:generate-sitemaps
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubsDir = path.join(root, "data", "companies-house", "hubs");
const outDir = path.join(root, "data", "companies-house", "sitemaps");
const SITE = (process.env.NEXT_PUBLIC_APP_URL || "https://hydratax.uk").replace(
  /\/$/,
  "",
);
const SHARD = 5_000;

function slugifyName(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company"
  );
}

function companyHref(name, number) {
  return `/company/${slugifyName(name)}-${String(number).toLowerCase()}`;
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function readAllHubCompanies() {
  if (!fs.existsSync(hubsDir)) {
    throw new Error(`Missing ${hubsDir} — run npm run ch:import-directory first.`);
  }
  const byNumber = new Map();
  for (const file of fs.readdirSync(hubsDir).filter((f) => f.endsWith(".jsonl"))) {
    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(hubsDir, file), { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row?.n && row?.t && !byNumber.has(row.n)) {
          byNumber.set(row.n, row);
        }
      } catch {
        // skip
      }
    }
  }
  return [...byNumber.values()].sort((a, b) =>
    String(a.n).localeCompare(String(b.n)),
  );
}

async function main() {
  const companies = await readAllHubCompanies();
  console.log(`Unique hub-related companies: ${companies.length.toLocaleString()}`);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) {
    fs.unlinkSync(path.join(outDir, f));
  }

  const shards = [];
  for (let i = 0; i < companies.length; i += SHARD) {
    const slice = companies.slice(i, i + SHARD);
    const shardNo = Math.floor(i / SHARD) + 1;
    const file = `companies-${String(shardNo).padStart(3, "0")}.xml`;
    const body = slice
      .map((c) => {
        const loc = `${SITE}${companyHref(c.t, c.n)}`;
        return `  <url><loc>${escapeXml(loc)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
      })
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
    fs.writeFileSync(path.join(outDir, file), xml, "utf8");
    shards.push(file);
  }

  const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${shards
    .map((f) => `  <sitemap><loc>${SITE}/company-sitemaps/${f}</loc></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`;
  fs.writeFileSync(path.join(outDir, "sitemap-index.xml"), index, "utf8");

  const totalBytes = shards.reduce(
    (sum, f) => sum + fs.statSync(path.join(outDir, f)).size,
    0,
  );
  console.log(`Wrote ${shards.length} shards + sitemap-index.xml → ${outDir}`);
  console.log(`Total size: ${(totalBytes / 1_048_576).toFixed(1)} MB (gitignored).`);
  console.log(
    "To publish later: copy into public/company-sitemaps/ only when you accept that deploy size, then submit the index in Search Console.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
