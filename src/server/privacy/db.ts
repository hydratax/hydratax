/**
 * Shared helpers for privacy services: a guarded service-role client and a
 * best-effort step runner that records what happened without leaking data.
 *
 * SERVICE ROLE BYPASSES RLS. Every caller must already have authorised the
 * subject from the verified server session (see authz.ts) and must scope
 * every query by that subject id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

export type StepResult = {
  step: string;
  ok: boolean;
  skipped?: boolean;
  count?: number;
  error?: string;
};

type PgError = { message: string; code?: string } | null;

/** Table / column not present (migration not applied) → treat as skipped. */
export function isMissingRelation(err: PgError): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "PGRST205" ||
    err.code === "PGRST204" ||
    /does not exist|could not find the (table|column)/i.test(err.message)
  );
}

export function privacyAdminClient(): SupabaseClient | null {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return getSupabaseAdmin();
}

export async function runStep(
  step: string,
  fn: () => PromiseLike<{ count?: number | null; error: PgError }>,
): Promise<StepResult> {
  try {
    const { count, error } = await fn();
    if (error) {
      if (isMissingRelation(error)) return { step, ok: true, skipped: true };
      return { step, ok: false, error: error.message.slice(0, 200) };
    }
    return { step, ok: true, count: count ?? undefined };
  } catch (err) {
    return {
      step,
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

export function failedSteps(results: StepResult[]): StepResult[] {
  return results.filter((r) => !r.ok);
}
