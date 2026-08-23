import { isSupabaseConfigured } from "@/lib/env";

/**
 * Authenticated server-side Supabase client for application data.
 * Returns null so callers can retain their Drizzle fallback.
 */
export async function getSupabaseDataClient() {
  if (!isSupabaseConfigured()) return null;
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

export function mapSnakeCaseRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}
