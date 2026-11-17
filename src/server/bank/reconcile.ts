/**
 * bankbee — statement balance reconciliation.
 * Opening + Σ movements ≈ closing → trusted extract.
 */

import { parseMoneyToPence } from "@/server/bank/categorise";

export type ReconcileStatus = "reconciled" | "not_reconciled" | "unknown";

export type StatementBalances = {
  openingPence: number | null;
  closingPence: number | null;
};

export type ReconcileResult = {
  status: ReconcileStatus;
  openingPence: number | null;
  closingPence: number | null;
  movementsPence: number;
  expectedClosingPence: number | null;
  deltaPence: number | null;
  /** Human line for UI / CSV notes */
  message: string;
};

const TOLERANCE_PENCE = 2;

/** Pull opening / closing from statement text when printed. */
export function extractStatementBalances(text: string): StatementBalances {
  const opening = matchBalance(
    text,
    /opening\s+balance[^0-9\-\(]*([£(]?\s*-?\d[\d,]*(?:\.\d{2})?\)?)/i,
  );
  const closing =
    matchBalance(
      text,
      /closing\s+balance[^0-9\-\(]*([£(]?\s*-?\d[\d,]*(?:\.\d{2})?\)?)/i,
    ) ??
    matchBalance(
      text,
      /balance\s+carried\s+forward[^0-9\-\(]*([£(]?\s*-?\d[\d,]*(?:\.\d{2})?\)?)/i,
    );
  return { openingPence: opening, closingPence: closing };
}

function matchBalance(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  const pence = parseMoneyToPence(m[1]);
  return Number.isFinite(pence) ? pence : null;
}

export function reconcileStatement(input: {
  openingPence: number | null;
  closingPence: number | null;
  lines: Array<{ amountPence: number }>;
}): ReconcileResult {
  const movementsPence = input.lines.reduce((s, l) => s + l.amountPence, 0);
  const { openingPence, closingPence } = input;

  if (openingPence == null || closingPence == null) {
    return {
      status: "unknown",
      openingPence,
      closingPence,
      movementsPence,
      expectedClosingPence: openingPence != null ? openingPence + movementsPence : null,
      deltaPence: null,
      message:
        openingPence == null && closingPence == null
          ? "Opening and closing balances not found — check the extract manually."
          : openingPence == null
            ? "Opening balance not found — cannot reconcile yet."
            : "Closing balance not found — cannot reconcile yet.",
    };
  }

  const expectedClosingPence = openingPence + movementsPence;
  const deltaPence = expectedClosingPence - closingPence;
  const ok = Math.abs(deltaPence) <= TOLERANCE_PENCE;

  return {
    status: ok ? "reconciled" : "not_reconciled",
    openingPence,
    closingPence,
    movementsPence,
    expectedClosingPence,
    deltaPence,
    message: ok
      ? "Reconciled — opening + transactions match closing."
      : `Not reconciled — expected closing ${formatPounds(expectedClosingPence)} vs statement ${formatPounds(closingPence)} (Δ ${formatPounds(deltaPence)}). Check missing or misread lines.`,
  };
}

function formatPounds(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toFixed(2)}`;
}
