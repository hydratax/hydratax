/** Deadline helpers for Companies House next_due dates (YYYY-MM-DD). */

export type FilingUrgency = "ok" | "attention";

function parseDue(iso?: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function startOfUtcToday() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Green when comfortably ahead; red when due today, overdue, or within 30 days.
 */
export function filingUrgency(nextDue?: string | null): FilingUrgency {
  const due = parseDue(nextDue);
  if (!due) return "ok";
  const today = startOfUtcToday();
  const ms = due.getTime() - today.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 30) return "attention";
  return "ok";
}

export function formatDueLabel(nextDue?: string | null): string {
  const due = parseDue(nextDue);
  if (!due || !nextDue) return "No date on register";
  const today = startOfUtcToday();
  const days = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
  const pretty = nextDue.slice(0, 10);
  if (days < 0) return `Overdue · was due ${pretty}`;
  if (days === 0) return `Due today · ${pretty}`;
  if (days <= 30) return `Due in ${days} day${days === 1 ? "" : "s"} · ${pretty}`;
  return `Next due ${pretty}`;
}

export function formatAddress(
  addr?: Record<string, string | undefined> | null,
): string {
  if (!addr) return "";
  return [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .join(", ");
}
