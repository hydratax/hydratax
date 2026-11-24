import fs from "node:fs";
import path from "node:path";
import {
  locationSlug,
  type DirectoryCompanyLink,
} from "@/lib/company-directory";
import { companyProfilePath } from "@/lib/company-slug";

type HubRow = {
  n: string;
  t: string;
  town?: string;
  pc?: string;
  a1?: string;
  a2?: string;
  sic?: string[];
};

function hubsDir() {
  return (
    process.env.COMPANY_DIRECTORY_HUBS?.trim() ||
    path.join(process.cwd(), "data", "companies-house", "hubs")
  );
}

export function directoryHubsPath() {
  return hubsDir();
}

export function isDirectoryDbAvailable() {
  try {
    const dir = hubsDir();
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some((f) => f.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

function readJsonl(filePath: string, limit: number): HubRow[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const rows: HubRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as HubRow);
      if (rows.length >= limit) break;
    } catch {
      // skip bad line
    }
  }
  return rows;
}

function toLink(row: HubRow): DirectoryCompanyLink {
  const addressSnippet = [row.a1, row.a2, row.town, row.pc]
    .filter(Boolean)
    .join(", ");
  return {
    companyNumber: row.n,
    title: row.t,
    href: companyProfilePath(row.t, row.n),
    status: "active",
    addressSnippet: addressSnippet || undefined,
  };
}

/**
 * Hub listing from local Basic Company Data JSONL (no CH API, no cloud).
 * Returns null when hub files are missing so callers can fall back to the API.
 */
export function listCompaniesFromDirectoryDb(opts: {
  sicCode?: string;
  location?: string;
  size?: number;
}): DirectoryCompanyLink[] | null {
  if (!isDirectoryDbAvailable()) return null;

  const size = Math.min(Math.max(opts.size ?? 40, 1), 500);
  const sic = opts.sicCode?.replace(/\D/g, "").slice(0, 5) || null;
  const town = opts.location?.trim() || null;
  const dir = hubsDir();

  let rows: HubRow[] = [];
  if (sic && town) {
    const sicPath = path.join(dir, `sic-${sic}.jsonl`);
    const townPath = path.join(dir, `town-${locationSlug(town)}.jsonl`);
    const sicExists = fs.existsSync(sicPath);
    const townExists = fs.existsSync(townPath);
    if (!sicExists && !townExists) return [];
    const primary = townExists
      ? readJsonl(townPath, Math.max(size * 20, 2000))
      : readJsonl(sicPath, Math.max(size * 20, 2000));
    rows = primary.filter((r) => {
      const sicOk = !sic || (r.sic ?? []).includes(sic);
      const townOk =
        !town || (r.town || "").toLowerCase() === town.toLowerCase();
      return sicOk && townOk;
    });
  } else if (sic) {
    rows = readJsonl(path.join(dir, `sic-${sic}.jsonl`), size);
  } else if (town) {
    rows = readJsonl(path.join(dir, `town-${locationSlug(town)}.jsonl`), size);
  } else {
    return [];
  }

  if (rows.length === 0) return [];
  return rows.slice(0, size).map(toLink);
}

function searchDir() {
  return (
    process.env.COMPANY_DIRECTORY_SEARCH?.trim() ||
    path.join(process.cwd(), "data", "companies-house", "search")
  );
}

function isSearchIndexAvailable() {
  try {
    const dir = searchDir();
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some((f) => f.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

function nameShardKey(text: string) {
  const alnum = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (alnum.length >= 2) return alnum.slice(0, 2);
  if (alnum.length === 1) return `${alnum}_`;
  return "__";
}

function numShardKey(text: string) {
  const n = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (n.length >= 2) return n.slice(0, 2).toLowerCase();
  if (n.length === 1) return `${n.toLowerCase()}_`;
  return "__";
}

function scoreNameMatch(name: string, num: string, q: string, tokens: string[]) {
  const phrase = tokens.join(" ");
  let score = 0;
  if (num === q.replace(/\s+/g, "").toUpperCase() || num.includes(q.replace(/\s+/g, ""))) {
    score += 5_000;
  }
  if (name === phrase) score += 4_000;
  else if (name.startsWith(phrase)) score += 3_000;
  else if (name.includes(phrase)) score += 2_000;
  for (const tok of tokens) {
    if (!tok) continue;
    if (name.startsWith(tok)) score += 400;
    else if (new RegExp(`(^|[^a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(name)) {
      score += 200;
    } else if (name.includes(tok)) score += 40;
    else return -1;
  }
  // Prefer shorter / tighter names when scores tie later.
  score -= Math.min(name.length, 80);
  return score;
}

function readShardMatches(
  filePath: string,
  q: string,
  tokens: string[],
  limit: number,
  scored: Map<string, { link: DirectoryCompanyLink; score: number }>,
) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  let lines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    lines++;
    if (lines > 200_000) break;
    try {
      const row = JSON.parse(line) as HubRow;
      const name = (row.t || "").toLowerCase();
      const num = (row.n || "").toUpperCase();
      const score = scoreNameMatch(name, num, q, tokens);
      if (score < 0) continue;
      const prev = scored.get(row.n);
      if (!prev || score > prev.score) {
        scored.set(row.n, { link: toLink(row), score });
      }
      if (scored.size >= limit * 8) break;
    } catch {
      // skip
    }
  }
}

/**
 * Name/number typeahead from local search shards (all active companies),
 * falling back to SEO hub JSONL when the search index is missing.
 */
export function searchCompaniesFromDirectoryHubs(
  query: string,
  limit = 20,
): DirectoryCompanyLink[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const scored = new Map<string, { link: DirectoryCompanyLink; score: number }>();
  const looksLikeNumber = /^[a-z]{0,2}\d{4,}/i.test(q.replace(/\s+/g, ""));

  if (isSearchIndexAvailable()) {
    const dir = searchDir();
    if (looksLikeNumber) {
      readShardMatches(
        path.join(dir, "num", `${numShardKey(q)}.jsonl`),
        q,
        tokens,
        limit,
        scored,
      );
    }
    // Prefer the longest token’s name shard (rarer / more selective).
    const byLen = [...tokens].sort((a, b) => b.length - a.length);
    const tried = new Set<string>();
    for (const tok of byLen) {
      const key = nameShardKey(tok);
      if (tried.has(key)) continue;
      tried.add(key);
      readShardMatches(path.join(dir, `${key}.jsonl`), q, tokens, limit, scored);
      if (scored.size >= limit) break;
    }
  } else if (isDirectoryDbAvailable()) {
    // Legacy hub scan — incomplete register, last resort only.
    const dir = hubsDir();
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const p = path.join(dir, f);
        return { p, size: fs.statSync(p).size };
      })
      .sort((a, b) => a.size - b.size)
      .slice(0, 12);
    for (const file of files) {
      readShardMatches(file.p, q, tokens, limit, scored);
      if (scored.size >= limit * 4) break;
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.link.title.localeCompare(b.link.title))
    .slice(0, limit)
    .map((x) => x.link);
}
