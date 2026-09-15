import {
  addIsoCalendarYears,
  enrichLimitedCompanyFromCh,
  type ClientCompaniesHouseSnapshot,
} from "@/server/companies-house/enrich-client";
import {
  isDemoMode,
  isMemoryStore,
  isSupabaseConfigured,
} from "@/lib/env";

function addCalendarDays(iso: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m?.[1] ?? null;
}

/**
 * When CH public API still shows the pre-filing CS dates, advance the snapshot
 * so the clients dashboard reflects the filed confirmation statement.
 */
export function applyOptimisticCsFiling(
  snapshot: ClientCompaniesHouseSnapshot,
  confirmationDate: string,
): ClientCompaniesHouseSnapshot {
  const filed = isoDay(confirmationDate);
  if (!filed) return snapshot;

  const last = isoDay(snapshot.confirmationStatementLastMadeUpTo);
  const nextDue = isoDay(snapshot.confirmationStatementNextDue);

  // Register already moved past this filing — keep CH values.
  if (last && last >= filed) return snapshot;
  if (nextDue && nextDue > filed && (!last || last >= filed)) return snapshot;

  const nextMadeUp = addIsoCalendarYears(filed, 1);
  const nextDueOptimistic = nextMadeUp
    ? addCalendarDays(nextMadeUp, 14)
    : addIsoCalendarYears(filed, 1);

  return {
    ...snapshot,
    confirmationStatementLastMadeUpTo: filed,
    confirmationStatementNextDue:
      nextDueOptimistic ?? snapshot.confirmationStatementNextDue,
    confirmationStatementNextMadeUpTo:
      nextMadeUp ?? snapshot.confirmationStatementNextMadeUpTo ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * After accounts filing, if CH still shows the old period, advance period end /
 * next due for dashboard display until the register catches up.
 */
export function applyOptimisticAccountsFiling(
  snapshot: ClientCompaniesHouseSnapshot,
  periodEnd: string,
): ClientCompaniesHouseSnapshot {
  const filedEnd = isoDay(periodEnd);
  if (!filedEnd) return snapshot;

  const last = isoDay(snapshot.lastAccountsMadeUpTo);
  if (last && last >= filedEnd) return snapshot;

  const nextPeriodEnd = addIsoCalendarYears(filedEnd, 1);
  // Soft due estimate: 9 months after period end (private ltd companies).
  const nextDueOptimistic = nextPeriodEnd
    ? addCalendarDays(nextPeriodEnd, 273)
    : null;

  return {
    ...snapshot,
    lastAccountsMadeUpTo: filedEnd,
    accountsPeriodEnd: nextPeriodEnd ?? snapshot.accountsPeriodEnd,
    accountsNextDue: nextDueOptimistic ?? snapshot.accountsNextDue,
    fetchedAt: new Date().toISOString(),
  };
}

export type SyncChClientsResult = {
  updated: number;
  companyNumber: string;
};

/**
 * Re-fetch Companies House for every matching limited company client in a
 * practice and write the snapshot. Best-effort — never throws to callers.
 */
export async function syncPracticeClientsFromCompaniesHouse(opts: {
  companyNumber: string;
  practiceId: string;
  confirmationDate?: string | null;
  accountsPeriodEnd?: string | null;
}): Promise<SyncChClientsResult> {
  const companyNumber = opts.companyNumber.trim().toUpperCase();
  if (!companyNumber || !opts.practiceId) {
    return { updated: 0, companyNumber };
  }

  try {
    let snapshot = await enrichLimitedCompanyFromCh(companyNumber);
    if (!snapshot) return { updated: 0, companyNumber };

    if (opts.confirmationDate) {
      snapshot = applyOptimisticCsFiling(snapshot, opts.confirmationDate);
    }
    if (opts.accountsPeriodEnd) {
      snapshot = applyOptimisticAccountsFiling(
        snapshot,
        opts.accountsPeriodEnd,
      );
    }

    let updated = 0;

    if (isDemoMode() || isMemoryStore()) {
      const { memoryStore } = await import("@/server/demo/store");
      for (const row of memoryStore.clients) {
        if (
          row.practiceId === opts.practiceId &&
          row.companyNumber?.toUpperCase() === companyNumber
        ) {
          row.companiesHouse = snapshot;
          row.name = snapshot.companyName || row.name;
          row.companyNumber = snapshot.companyNumber;
          row.updatedAt = new Date().toISOString();
          updated += 1;
        }
      }
      return { updated, companyNumber };
    }

    if (isSupabaseConfigured()) {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const supabase = getSupabaseAdmin();
      const { data: rows } = await supabase
        .from("clients")
        .select("id")
        .eq("practice_id", opts.practiceId)
        .eq("company_number", companyNumber);

      for (const row of rows ?? []) {
        const { error } = await supabase
          .from("clients")
          .update({
            companies_house: snapshot,
            name: snapshot.companyName,
            company_number: snapshot.companyNumber,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("practice_id", opts.practiceId);
        if (!error) updated += 1;
      }
      return { updated, companyNumber };
    }

    const { getDb } = await import("@/server/db");
    const { clients } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const result = await getDb()
      .update(clients)
      .set({
        companiesHouse: snapshot,
        name: snapshot.companyName,
        companyNumber: snapshot.companyNumber,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clients.practiceId, opts.practiceId),
          eq(clients.companyNumber, companyNumber),
        ),
      )
      .returning({ id: clients.id });
    updated = result.length;
    return { updated, companyNumber };
  } catch (err) {
    console.warn("[ch.sync] practice client refresh failed", err);
    return { updated: 0, companyNumber };
  }
}
