/**
 * Resolve a bureau pack (zip bytes or already-unzipped path→text map)
 * into per-company CSV items keyed by company number / client id / PAYE ref.
 *
 * Expected zip layout:
 *   bureau-takeon.zip
 *     12345678/employees.csv
 *     87654321/employees.csv
 *     OR flat: 12345678-employees.csv / employees-12345678.csv
 *     OR manifest.json listing { matchKey, matchKind?, path }
 */

import { BULK_IMPORT_MAX_COMPANIES, BULK_IMPORT_MAX_CSV_CHARS } from "./constants";
import { extractZipEntries, zipEntriesAsTextMap } from "./zip-pack";

export type PackMatchKind = "company_number" | "client_id" | "paye_ref";

export type PackCompanyItem = {
  matchKey: string;
  matchKind: PackMatchKind;
  filename: string;
  csvText: string;
};

export type PackParseResult = {
  items: PackCompanyItem[];
  errors: string[];
};

function isEmployeesCsv(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() || "";
  return base === "employees.csv" || base.endsWith("-employees.csv");
}

function folderKeyFromPath(path: string): string | null {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 2 && isEmployeesCsv(path)) {
    return parts[parts.length - 2] || null;
  }
  const base = parts[parts.length - 1] || "";
  const m =
    /^([0-9A-Za-z-]{6,40})-employees\.csv$/i.exec(base) ||
    /^employees-([0-9A-Za-z-]{6,40})\.csv$/i.exec(base);
  return m?.[1] || null;
}

function detectMatchKind(key: string): PackMatchKind {
  const k = key.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      k,
    )
  ) {
    return "client_id";
  }
  if (/^\d{3}\/[A-Z0-9]+$/i.test(k.replace(/\s+/g, ""))) {
    return "paye_ref";
  }
  // UK company numbers are typically 8 chars (leading zeros)
  return "company_number";
}

function normalizeCompanyNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Build items from a path→csv map (already unzipped or built by caller).
 */
export function parsePackFromFileMap(
  files: Map<string, string> | Record<string, string>,
): PackParseResult {
  const map =
    files instanceof Map ? files : new Map(Object.entries(files ?? {}));
  const errors: string[] = [];
  const items: PackCompanyItem[] = [];

  const manifestRaw = map.get("manifest.json") || map.get("MANIFEST.json");
  if (manifestRaw) {
    try {
      const parsed = JSON.parse(manifestRaw) as {
        companies?: Array<{
          matchKey?: string;
          match_key?: string;
          companyNumber?: string;
          company_number?: string;
          clientId?: string;
          client_id?: string;
          payeRef?: string;
          paye_ref?: string;
          matchKind?: PackMatchKind;
          match_kind?: PackMatchKind;
          path?: string;
          csvPath?: string;
        }>;
      };
      for (const row of parsed.companies || []) {
        const path = row.path || row.csvPath || "";
        const csvText = path ? map.get(path) : undefined;
        if (!csvText) {
          errors.push(`Manifest path missing in pack: ${path || "(empty)"}`);
          continue;
        }
        let matchKey =
          row.matchKey ||
          row.match_key ||
          row.clientId ||
          row.client_id ||
          row.payeRef ||
          row.paye_ref ||
          row.companyNumber ||
          row.company_number ||
          "";
        let matchKind: PackMatchKind =
          row.matchKind ||
          row.match_kind ||
          (row.clientId || row.client_id
            ? "client_id"
            : row.payeRef || row.paye_ref
              ? "paye_ref"
              : "company_number");
        if (!matchKey) {
          errors.push(`Manifest entry missing match key for ${path}`);
          continue;
        }
        if (matchKind === "company_number") {
          matchKey = normalizeCompanyNumber(matchKey);
        }
        if (csvText.length > BULK_IMPORT_MAX_CSV_CHARS) {
          errors.push(`CSV too large for ${matchKey}`);
          continue;
        }
        items.push({
          matchKey,
          matchKind,
          filename: path,
          csvText,
        });
      }
    } catch {
      errors.push("manifest.json is not valid JSON");
    }
  } else {
    for (const [path, csvText] of map) {
      if (!/\.csv$/i.test(path)) continue;
      if (!isEmployeesCsv(path) && !folderKeyFromPath(path)) continue;
      const key = folderKeyFromPath(path);
      if (!key) {
        errors.push(`Could not derive company key from path: ${path}`);
        continue;
      }
      if (csvText.length > BULK_IMPORT_MAX_CSV_CHARS) {
        errors.push(`CSV too large for ${key}`);
        continue;
      }
      const matchKind = detectMatchKind(key);
      items.push({
        matchKey:
          matchKind === "company_number" ? normalizeCompanyNumber(key) : key.trim(),
        matchKind,
        filename: path,
        csvText,
      });
    }
  }

  if (items.length > BULK_IMPORT_MAX_COMPANIES) {
    errors.push(
      `Too many companies (${items.length}); max ${BULK_IMPORT_MAX_COMPANIES}.`,
    );
    return { items: [], errors };
  }

  // Dedupe by matchKey (last wins)
  const byKey = new Map<string, PackCompanyItem>();
  for (const item of items) {
    byKey.set(`${item.matchKind}:${item.matchKey}`, item);
  }

  return { items: [...byKey.values()], errors };
}

/** Parse a zip buffer into pack items. */
export function parsePackFromZip(zipBytes: Buffer | Uint8Array): PackParseResult {
  const entries = extractZipEntries(zipBytes);
  if (!entries.length) {
    return { items: [], errors: ["ZIP contained no readable files."] };
  }
  return parsePackFromFileMap(zipEntriesAsTextMap(entries));
}
