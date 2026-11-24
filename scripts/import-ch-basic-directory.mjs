/**
 * Import Companies House BasicCompanyData → local hub JSONL files.
 * Free-tier safe: no Supabase / R2 / network / native SQLite.
 *
 *   npm run ch:import-directory
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "data", "companies-house");
const hubsDir = path.join(outDir, "hubs");
const csvPath = path.join(outDir, "BasicCompanyDataAsOneFile-2026-11-01.csv");
const metaPath = path.join(outDir, "directory-meta.json");

const SEO_INDUSTRY = new Set([
  "86101",
  "62012",
  "62020",
  "69201",
  "70229",
  "68310",
  "68209",
  "56101",
  "41202",
  "43210",
  "47910",
  "49320",
  "85590",
  "96020",
  "86900",
]);
const SEO_TOWNS = new Set(
  [
    "London",
    "Manchester",
    "Birmingham",
    "Leeds",
    "Glasgow",
    "Edinburgh",
    "Bristol",
    "Liverpool",
    "Sheffield",
    "Leicester",
    "Nottingham",
    "Cardiff",
    "Belfast",
    "Luton",
    "Reading",
    "Cambridge",
    "Oxford",
    "Brighton",
    "Coventry",
    "Newcastle",
    "Bradford",
  ].map((t) => t.toLowerCase()),
);

const ZIP_CANDIDATES = [
  path.join(root, "data", "Companies House"),
  path.join(root, "data", "companies-house"),
  path.join(process.env.USERPROFILE || "", "Downloads"),
];

function findZip() {
  for (const dir of ZIP_CANDIDATES) {
    if (!fs.existsSync(dir)) continue;
    const hits = fs
      .readdirSync(dir)
      .filter((n) => /^BasicCompanyDataAsOneFile-.*\.zip$/i.test(n))
      .map((n) => ({
        p: path.join(dir, n),
        m: fs.statSync(path.join(dir, n)).mtimeMs,
      }))
      .sort((a, b) => b.m - a.m);
    if (hits[0]) return hits[0].p;
  }
  return null;
}

function extractCsv(zipPath) {
  if (fs.existsSync(csvPath) && fs.statSync(csvPath).size > 1_000_000_000) {
    console.log("Reusing extracted CSV:", csvPath);
    return Promise.resolve();
  }
  fs.mkdirSync(outDir, { recursive: true });
  console.log("Extracting CSV from zip (one-time, local only)…");
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err || new Error("Could not open zip"));
      let found = false;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!/BasicCompanyDataAsOneFile-.*\.csv$/i.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        found = true;
        zip.openReadStream(entry, (e2, readStream) => {
          if (e2 || !readStream) return reject(e2 || new Error("No CSV stream"));
          const out = fs.createWriteStream(csvPath);
          pipeline(readStream, out)
            .then(() => {
              zip.close();
              resolve();
            })
            .catch(reject);
        });
      });
      zip.on("end", () => {
        if (!found) reject(new Error("CSV entry not found inside zip"));
      });
      zip.on("error", reject);
    });
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function sicCodesFromTexts(texts) {
  const codes = [];
  for (const t of texts) {
    const m = String(t || "").match(/^(\d{4,5})\b/);
    if (m) codes.push(m[1].padStart(5, "0").slice(-5));
  }
  return [...new Set(codes)];
}

function townSlug(town) {
  return town
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const zipPath = findZip();
  if (!zipPath) {
    console.error(
      "No BasicCompanyDataAsOneFile-*.zip found under data/Companies House, data/companies-house, or Downloads.",
    );
    process.exit(1);
  }
  console.log("Zip:", zipPath);
  await extractCsv(zipPath);

  fs.mkdirSync(hubsDir, { recursive: true });
  for (const f of fs.readdirSync(hubsDir)) {
    fs.unlinkSync(path.join(hubsDir, f));
  }

  /** @type {Map<string, fs.WriteStream>} */
  const writers = new Map();
  /** @type {Map<string, number>} */
  const counts = new Map();

  function streamFor(key) {
    let w = writers.get(key);
    if (!w) {
      w = fs.createWriteStream(path.join(hubsDir, `${key}.jsonl`), {
        encoding: "utf8",
      });
      writers.set(key, w);
      counts.set(key, 0);
    }
    return w;
  }

  function writeRow(key, row) {
    streamFor(key).write(`${JSON.stringify(row)}\n`);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let header = null;
  /** @type {Record<string, number>} */
  let idx = {};
  let n = 0;
  let active = 0;
  let hubbed = 0;
  const t0 = Date.now();

  console.log("Streaming Active companies into local hub JSONL…");
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.trim());
      header.forEach((h, i) => {
        idx[h] = i;
      });
      continue;
    }
    n++;
    if (n % 250_000 === 0) {
      console.log(
        `  scanned ${n.toLocaleString()} · active ${active.toLocaleString()} · hub rows ${hubbed.toLocaleString()} · ${Math.round((Date.now() - t0) / 1000)}s`,
      );
    }
    const cols = parseCsvLine(line);
    const status = (cols[idx["CompanyStatus"]] || "").trim();
    if (!/^active$/i.test(status)) continue;
    active++;
    const number = (cols[idx["CompanyNumber"]] || "").trim().toUpperCase();
    const name = (cols[idx["CompanyName"]] || "").trim();
    if (!number || !name) continue;
    const sics = sicCodesFromTexts([
      cols[idx["SICCode.SicText_1"]],
      cols[idx["SICCode.SicText_2"]],
      cols[idx["SICCode.SicText_3"]],
      cols[idx["SICCode.SicText_4"]],
    ]);
    const town = (cols[idx["RegAddress.PostTown"]] || "").trim();
    const row = {
      n: number,
      t: name,
      town,
      pc: (cols[idx["RegAddress.PostCode"]] || "").trim(),
      a1: (cols[idx["RegAddress.AddressLine1"]] || "").trim(),
      a2: (cols[idx["RegAddress.AddressLine2"]] || "").trim(),
      sic: sics,
    };

    let used = false;
    for (const sic of sics) {
      if (SEO_INDUSTRY.has(sic)) {
        writeRow(`sic-${sic}`, row);
        used = true;
      }
    }
    if (town && SEO_TOWNS.has(town.toLowerCase())) {
      writeRow(`town-${townSlug(town)}`, row);
      used = true;
    }
    if (used) hubbed++;
  }

  await Promise.all(
    [...writers.values()].map(
      (w) =>
        new Promise((resolve, reject) => {
          w.end(() => resolve());
          w.on("error", reject);
        }),
    ),
  );

  const meta = {
    generatedAt: new Date().toISOString(),
    scanned: n,
    active,
    hubRows: hubbed,
    hubs: Object.fromEntries(counts),
    source: "BasicCompanyDataAsOneFile (local)",
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`Done. Active ${active.toLocaleString()} / scanned ${n.toLocaleString()}`);
  console.log(`Hub files: ${hubsDir}`);
  console.log(`Meta: ${metaPath}`);
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${k}: ${v.toLocaleString()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
