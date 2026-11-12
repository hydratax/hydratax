/**
 * Cluster unknown / low-confidence bank lines and spawn provisional review heads
 * when a counterparty is material (value or volume thresholds).
 */

import {
  customCategoryId,
  isCustomCategoryId,
} from "@/lib/bank-categories";
import { counterpartyKey, titleCaseKey } from "@/server/bank/counterparty-key";

export const PROVISIONAL_HEAD_THRESHOLDS = {
  /** Absolute cluster total (money in or out) ≥ £5,000 */
  materialTotalPence: 500_000,
  /** Any single line ≥ £5,000 */
  singleLinePence: 500_000,
  /** At least this many lines for the same key */
  minLineCount: 10,
  /** Or at least this share of the statement line count */
  minShareOfStatement: 0.03,
} as const;

export type ProvisionalCluster = {
  key: string;
  indices: number[];
  totalAbsPence: number;
  maxAbsPence: number;
  count: number;
};

export type ProvisionalHeadCreated = {
  key: string;
  label: string;
  category: string;
  totalAbsPence: number;
  count: number;
};

function isUnknownLine(line: {
  category: string;
  confidence: string;
  amountPence: number;
}): boolean {
  if (isCustomCategoryId(line.category)) {
    // Already on a custom / review head — leave alone.
    return false;
  }
  if (line.category === "expense_queries" || line.category === "uncategorised") {
    return true;
  }
  // Large low-confidence turnover / other buckets still need a review head.
  if (
    line.confidence === "low" &&
    (line.category === "turnover" || line.category === "other_income")
  ) {
    return true;
  }
  return false;
}

export function clusterUnknownLines(
  lines: Array<{
    description: string;
    amountPence: number;
    category: string;
    confidence: string;
  }>,
): ProvisionalCluster[] {
  const byKey = new Map<string, ProvisionalCluster>();
  lines.forEach((line, index) => {
    if (!isUnknownLine(line)) return;
    const key = counterpartyKey(line.description);
    const abs = Math.abs(line.amountPence);
    const existing = byKey.get(key);
    if (existing) {
      existing.indices.push(index);
      existing.totalAbsPence += abs;
      existing.maxAbsPence = Math.max(existing.maxAbsPence, abs);
      existing.count += 1;
    } else {
      byKey.set(key, {
        key,
        indices: [index],
        totalAbsPence: abs,
        maxAbsPence: abs,
        count: 1,
      });
    }
  });
  return [...byKey.values()];
}

export function clusterIsMaterial(
  cluster: ProvisionalCluster,
  statementLineCount: number,
  thresholds = PROVISIONAL_HEAD_THRESHOLDS,
): boolean {
  if (cluster.totalAbsPence >= thresholds.materialTotalPence) return true;
  if (cluster.maxAbsPence >= thresholds.singleLinePence) return true;
  if (cluster.count >= thresholds.minLineCount) return true;
  if (
    statementLineCount > 0 &&
    cluster.count / statementLineCount >= thresholds.minShareOfStatement &&
    cluster.count >= 3
  ) {
    return true;
  }
  return false;
}

function formatGbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export function provisionalHeadLabel(key: string, totalAbsPence: number): string {
  return `Review: ${titleCaseKey(key)} (${formatGbp(totalAbsPence)})`;
}

/**
 * Pure reassignment given a map of counterparty key → category id string.
 */
export function assignClustersToCategories<
  T extends {
    description: string;
    amountPence: number;
    category: string;
    confidence: string;
  },
>(
  lines: T[],
  keyToCategory: Map<string, string>,
): T[] {
  if (!keyToCategory.size) return lines;
  return lines.map((line) => {
    if (!isUnknownLine(line)) return line;
    const key = counterpartyKey(line.description);
    const category = keyToCategory.get(key);
    if (!category) return line;
    return { ...line, category, confidence: "medium" as const };
  });
}

export type EnsureCategoryFn = (
  label: string,
) => Promise<{ id: string; label: string }>;

export type UpsertIdentifierFn = (input: {
  pattern: string;
  category: string;
  label: string;
}) => Promise<void>;

/**
 * Create provisional custom categories for material unknown clusters and
 * reassign matching lines. Persists contains-rules so the next import sticks.
 */
export async function applyProvisionalHeads<
  T extends {
    description: string;
    amountPence: number;
    category: string;
    confidence: string;
  },
>(
  lines: T[],
  opts: {
    ensureCategory: EnsureCategoryFn;
    upsertIdentifier?: UpsertIdentifierFn;
    existingLabels?: Array<{ id: string; label: string }>;
    thresholds?: typeof PROVISIONAL_HEAD_THRESHOLDS;
  },
): Promise<{ lines: T[]; created: ProvisionalHeadCreated[] }> {
  const clusters = clusterUnknownLines(lines);
  const material = clusters.filter((c) =>
    clusterIsMaterial(c, lines.length, opts.thresholds),
  );
  if (!material.length) {
    return { lines, created: [] };
  }

  const existingByLower = new Map(
    (opts.existingLabels ?? []).map((r) => [r.label.toLowerCase(), r]),
  );
  const keyToCategory = new Map<string, string>();
  const created: ProvisionalHeadCreated[] = [];

  for (const cluster of material) {
    const label = provisionalHeadLabel(cluster.key, cluster.totalAbsPence);
    // Prefer an existing Review head for the same key (ignore amount suffix).
    const prefix = `review: ${titleCaseKey(cluster.key).toLowerCase()}`;
    let row =
      existingByLower.get(label.toLowerCase()) ??
      [...existingByLower.values()].find((r) =>
        r.label.toLowerCase().startsWith(prefix),
      );

    if (!row) {
      row = await opts.ensureCategory(label);
      existingByLower.set(row.label.toLowerCase(), row);
    }

    const category = customCategoryId(row.id);
    keyToCategory.set(cluster.key, category);
    created.push({
      key: cluster.key,
      label: row.label,
      category,
      totalAbsPence: cluster.totalAbsPence,
      count: cluster.count,
    });

    if (opts.upsertIdentifier && cluster.key !== "unknown payee") {
      await opts.upsertIdentifier({
        pattern: cluster.key,
        category,
        label: row.label,
      });
    }
  }

  return {
    lines: assignClustersToCategories(lines, keyToCategory),
    created,
  };
}

export { isProvisionalReviewLabel } from "@/lib/bank-categories";
