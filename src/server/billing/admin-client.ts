import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Service-role Supabase client for BILLING / ENTITLEMENT writes
 * (practice_subscriptions, checkout_orders).
 *
 * RLS gives the browser read-only access to these tables: a user-scoped client
 * could previously insert/update its own plan_key/status via PostgREST. All
 * writes now go through the server with this client — which BYPASSES RLS — so
 * every caller MUST scope by an explicit practice_id (or Stripe session id)
 * that it has already authorised server-side.
 *
 * Returns null (and warns) when Supabase / the service key is not configured so
 * callers can fall back to their Drizzle / in-memory paths instead of silently
 * writing through a client that RLS would reject.
 */
export async function getBillingWriteClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[billing] SUPABASE_SERVICE_ROLE_KEY not set — billing writes to Supabase skipped",
    );
    return null;
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin();
}
