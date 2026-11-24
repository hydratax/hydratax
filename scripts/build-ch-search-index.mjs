/**
 * Build local name/number typeahead shards from Basic Company Data CSV.
 * Free-tier safe: disk only, no cloud.
 *
 *   npm run ch:build-search-index
 *
 * Writes data/companies-house/search/{aa}.jsonl and num/{ab}.jsonl
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "data", "companies-house");
const csvPath = path.join(outDir, "BasicCompanyDataAsOneFile-2026-11-01.csv");
const searchDir = path.join(outDir, "search");
const numDir = path.join(searchDir, "num");
const metaPath = path.join(outDir, "search-meta.json");

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

function nameKey(name) {
  const alnum = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (alnum.length >= 2) return alnum.slice(0, 2);
  if (alnum.length === 1) return `${alnum}_`;
  return "__";
}

function numKey(number) {
  const n = String(number || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (n.length >= 2) return n.slice(0, 2).toLowerCase();
  if (n.length === 1) return `${n.toLowerCase()}_`;
  return "__";
}

async function main() {
  if (!fs.existsSync(csvPath) || fs.statSync(csvPath).size < 1_000_000_000) {
    console.error(
      "Missing extracted CSV at",
      csvPath,
      "\nRun npm run ch:import-directory first (extracts the zip).",
    );
    process.exit(1);
  }

  fs.mkdirSync(searchDir, { recursive: true });
  fs.mkdirSync(numDir, { recursive: true });
  for (const f of fs.readdirSync(searchDir)) {
    const p = path.join(searchDir, f);
    if (f.endsWith(".jsonl")) fs.unlinkSync(p);
  }
  for (const f of fs.readdirSync(numDir)) {
    if (f.endsWith(".jsonl")) fs.unlinkSync(path.join(numDir, f));
  }

  /** @type {Map<string, fs.WriteStream>} */
  const writers = new Map();
  /** @type {Map<string, number>} */
  const counts = new Map();

  function streamFor(dir, key) {
    const id = `${dir}::${key}`;
    let w = writers.get(id);
    if (!w) {
      w = fs.createWriteStream(path.join(dir, `${key}.jsonl`), {
        encoding: "utf8",
      });
      writers.set(id, w);
      counts.set(id, 0);
    }
    return { w, id };
  }

  function writeRow(dir, key, row) {
    const { w, id } = streamFor(dir, key);
    w.write(`${JSON.stringify(row)}\n`);
    counts.set(id, (counts.get(id) || 0) + 1);
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
  const t0 = Date.now();

  console.log("Building typeahead search shards from CSV…");
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
        `  scanned ${n.toLocaleString()} · active ${active.toLocaleString()} · ${Math.round((Date.now() - t0) / 1000)}s`,
      );
    }
    const cols = parseCsvLine(line);
    const status = (cols[idx["CompanyStatus"]] || "").trim();
    if (!/^active$/i.test(status)) continue;
    active++;
    const number = (cols[idx["CompanyNumber"]] || "").trim().toUpperCase();
    const name = (cols[idx["CompanyName"]] || "").trim();
    if (!number || !name) continue;
    const row = {
      n: number,
      t: name,
      town: (cols[idx["RegAddress.PostTown"]] || "").trim(),
      pc: (cols[idx["RegAddress.PostCode"]] || "").trim(),
      a1: (cols[idx["RegAddress.AddressLine1"]] || "").trim(),
      a2: (cols[idx["RegAddress.AddressLine2"]] || "").trim(),
    };
    writeRow(searchDir, nameKey(name), row);
    writeRow(numDir, numKey(number), row);
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
    shards: Object.fromEntries(
      [...counts.entries()].map(([k, v]) => [k.replace(/^.*::/, ""), v]),
    ),
    source: "BasicCompanyDataAsOneFile (local search index)",
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`Done. Active ${active.toLocaleString()} indexed.`);
  console.log(`Search dir: ${searchDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
