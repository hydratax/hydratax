/**
 * bankbee + accubee — find bank outflows that look like mortgage / loan
 * interest (near a target period or monthly amount) so they can be clubbed
 * under the finance / interest head.
 */

export type InterestClubCandidate = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  /** Absolute pence distance from target payment. */
  distancePence: number;
};

/**
 * Pick outflows whose absolute amount is within `tolerancePct` of the
 * expected interest payment (or 1/12 of annual interest for monthly clubs).
 */
export function findInterestLikePayments(
  lines: Array<{
    id: string;
    dated: string;
    description: string;
    amountPence: number;
    category?: string;
  }>,
  opts: {
    /** Period interest due (pence, absolute). */
    periodInterestPence: number;
    periodStart: string;
    periodEnd: string;
    /** Match within this % of target (default 8). */
    tolerancePct?: number;
    /** Also try monthly slice of annual interest. */
    tryMonthly?: boolean;
  },
): InterestClubCandidate[] {
  const due = Math.abs(opts.periodInterestPence);
  if (!due) return [];
  const tol = (opts.tolerancePct ?? 8) / 100;
  const targets = [due];
  if (opts.tryMonthly !== false) {
    targets.push(Math.round(due / 12));
  }

  const out: InterestClubCandidate[] = [];
  for (const line of lines) {
    if (line.amountPence >= 0) continue;
    if (line.dated < opts.periodStart || line.dated > opts.periodEnd) continue;
    const abs = Math.abs(line.amountPence);
    let best = Number.POSITIVE_INFINITY;
    for (const t of targets) {
      if (!t) continue;
      const dist = Math.abs(abs - t);
      if (dist / t <= tol && dist < best) best = dist;
    }
    if (!Number.isFinite(best)) continue;
    // Skip already-finance if exact; still include for review when close
    out.push({
      id: line.id,
      dated: line.dated,
      description: line.description,
      amountPence: line.amountPence,
      distancePence: best,
    });
  }
  out.sort((a, b) => a.distancePence - b.distancePence || b.dated.localeCompare(a.dated));
  return out;
}
