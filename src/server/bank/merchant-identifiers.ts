import { isD1Configured, d1Query } from "@/server/db/d1";
import { matchMerchant } from "@/server/bank/merchants";
import { matchOccupationHint } from "@/lib/occupation-hints";

export type MerchantIdentifierRow = {
  id: string;
  practice_id: string | null;
  pattern: string;
  match_type: "contains" | "regex";
  /** Built-in BankCategory or `custom:<uuid>` provisional / practice head. */
  category: string;
  label: string;
  priority: number;
};

let cachedGlobal: MerchantIdentifierRow[] | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

function normaliseDescription(description: string) {
  return description.toLowerCase();
}

function rowMatches(row: MerchantIdentifierRow, description: string): boolean {
  const hay = normaliseDescription(description);
  if (row.match_type === "regex") {
    try {
      return new RegExp(row.pattern, "i").test(description);
    } catch {
      return false;
    }
  }
  return hay.includes(row.pattern.toLowerCase());
}

async function loadIdentifiers(
  practiceId?: string | null,
): Promise<MerchantIdentifierRow[]> {
  if (!isD1Configured()) return [];
  const now = Date.now();
  if (!practiceId && cachedGlobal && now - cacheAt < CACHE_MS) {
    return cachedGlobal;
  }

  const rows = await d1Query<MerchantIdentifierRow>(
    `SELECT id, practice_id, pattern, match_type, category, label, priority
     FROM merchant_identifiers
     WHERE practice_id IS NULL OR practice_id = ?
     ORDER BY priority DESC, label ASC`,
    [practiceId ?? ""],
  );

  const mapped = rows.map((r) => ({
    ...r,
    category: String(r.category),
    match_type: (r.match_type === "regex" ? "regex" : "contains") as
      | "contains"
      | "regex",
  }));

  if (!practiceId) {
    cachedGlobal = mapped.filter((r) => !r.practice_id);
    cacheAt = now;
  }
  return mapped;
}

function matchFromRows(
  rows: MerchantIdentifierRow[],
  description: string,
): {
  category: string;
  confidence: "high" | "medium";
  label: string;
} | null {
  for (const row of rows) {
    if (rowMatches(row, description)) {
      return {
        category: row.category,
        confidence: row.priority >= 9 ? "high" : "medium",
        label: row.label,
      };
    }
  }
  return null;
}

export async function matchMerchantIdentifier(
  description: string,
  practiceId?: string | null,
): Promise<{
  category: string;
  confidence: "high" | "medium";
  label: string;
} | null> {
  const staticMatch = matchMerchant(description);
  if (staticMatch) return staticMatch;

  const rows = await loadIdentifiers(practiceId);
  return matchFromRows(rows, description);
}

/** Clear practice/global identifier cache after writes. */
export function invalidateMerchantIdentifierCache() {
  cachedGlobal = null;
  cacheAt = 0;
}

export async function applyIdentifierRules<
  T extends {
    description: string;
    amountPence: number;
    category: string;
    confidence: string;
  },
>(
  lines: T[],
  practiceId?: string | null,
  occupation?: string | null,
): Promise<T[]> {
  const rows = await loadIdentifiers(practiceId);
  return lines.map((line) => {
    const hit =
      matchFromRows(rows, line.description) ??
      matchOccupationHint(line.description, occupation) ??
      matchMerchant(line.description);
    if (hit) {
      return { ...line, category: hit.category, confidence: hit.confidence };
    }
    if (line.amountPence > 0) {
      return { ...line, category: "turnover", confidence: "low" };
    }
    return { ...line, category: "expense_queries", confidence: "low" };
  });
}

export async function categoriseWithIdentifiers(
  description: string,
  amountPence: number,
  practiceId?: string | null,
): Promise<{
  category: string;
  confidence: "high" | "medium" | "low";
}> {
  const hit = await matchMerchantIdentifier(description, practiceId);
  if (hit) {
    return { category: hit.category, confidence: hit.confidence };
  }
  if (amountPence > 0) {
    return { category: "turnover", confidence: "low" };
  }
  return { category: "expense_queries", confidence: "low" };
}

export async function listMerchantIdentifiers(practiceId?: string | null) {
  return loadIdentifiers(practiceId);
}
