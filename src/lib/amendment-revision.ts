/**
 * Shared AR1–AR5 amendment revision helpers for SA / CT600 / VAT desks.
 * Original = index 0; amendments are editable copies of a locked submitted return.
 */

export const MAX_AMENDMENT_INDEX = 5;

export type AmendmentIndex = 0 | 1 | 2 | 3 | 4 | 5;

export function clampAmendmentIndex(n: unknown): AmendmentIndex {
  const v = Math.floor(Number(n) || 0);
  if (v <= 0) return 0;
  if (v >= MAX_AMENDMENT_INDEX) return MAX_AMENDMENT_INDEX as AmendmentIndex;
  return v as AmendmentIndex;
}

/** "AR1" … "AR5"; empty string for the original. */
export function amendmentSuffix(index: number | null | undefined): string {
  const i = clampAmendmentIndex(index);
  return i > 0 ? `AR${i}` : "";
}

/**
 * Card title fragment: `2025-26`, `2025-26 AR 1`, period / quarter labels.
 * `baseLabel` is the tax year, AP dates, or VAT period label without AR.
 */
export function amendmentCardLabel(
  baseLabel: string,
  index: number | null | undefined,
): string {
  const base = String(baseLabel ?? "").trim() || "Return";
  const i = clampAmendmentIndex(index);
  return i > 0 ? `${base} AR ${i}` : base;
}

export function nextAmendmentIndex(existingIndexes: number[]): AmendmentIndex | null {
  const used = new Set(
    existingIndexes.map((n) => clampAmendmentIndex(n)).filter((n) => n > 0),
  );
  for (let i = 1; i <= MAX_AMENDMENT_INDEX; i++) {
    if (!used.has(i as AmendmentIndex)) return i as AmendmentIndex;
  }
  return null;
}

export function canCreateAmendment(existingIndexes: number[]): boolean {
  return nextAmendmentIndex(existingIndexes) != null;
}

/** VAT period_key encoding so AR rows don't collide with unique(client, period_key). */
export function vatPeriodKeyWithAmendment(
  basePeriodKey: string,
  index: number | null | undefined,
): string {
  const base = String(basePeriodKey ?? "").replace(/::AR\d+$/i, "").trim();
  const i = clampAmendmentIndex(index);
  return i > 0 ? `${base}::AR${i}` : base;
}

export function parseVatPeriodKeyAmendment(periodKey: string): {
  basePeriodKey: string;
  amendmentIndex: AmendmentIndex;
} {
  const raw = String(periodKey ?? "").trim();
  const m = /^(.*)::AR([1-5])$/i.exec(raw);
  if (m) {
    return {
      basePeriodKey: m[1]!,
      amendmentIndex: Number(m[2]) as AmendmentIndex,
    };
  }
  return { basePeriodKey: raw, amendmentIndex: 0 };
}

export function isSubmittedFilingStatus(
  status: string | null | undefined,
): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "submitted" || s === "accepted";
}

/** Original submitted/accepted rows are locked; AR drafts stay editable until filed. */
export function isFilingRevisionLocked(input: {
  status: string | null | undefined;
  amendmentIndex?: number | null;
  locked?: boolean | null;
}): boolean {
  if (input.locked === true) return true;
  const i = clampAmendmentIndex(input.amendmentIndex);
  if (i > 0) {
    return isSubmittedFilingStatus(input.status);
  }
  return isSubmittedFilingStatus(input.status);
}
