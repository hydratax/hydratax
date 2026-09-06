import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 * - PKCE verifier must live in cookies (not localStorage) so /auth/callback can exchange.
 * - detectSessionInUrl is OFF: we exchange the code ourselves in the route handler.
 *   Leaving it on races with the callback and clears the verifier (Strict Mode makes it worse).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured");
  }

  return createBrowserClient(url, key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure:
        typeof window !== "undefined"
          ? window.location.protocol === "https:"
          : process.env.NODE_ENV === "production",
    },
    auth: {
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
