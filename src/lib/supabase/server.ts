import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  DEVICE_TRUSTED_COOKIE,
  isDeviceTrustedCookie,
  isSupabaseAuthSessionCookie,
  withDeskPersistence,
} from "@/lib/session-policy";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const trusted = isDeviceTrustedCookie(
    cookieStore.get(DEVICE_TRUSTED_COOKIE)?.value,
  );

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts =
              isSupabaseAuthSessionCookie(name) && options
                ? withDeskPersistence(options, trusted)
                : isSupabaseAuthSessionCookie(name)
                  ? withDeskPersistence({}, trusted)
                  : options;
            cookieStore.set(name, value, opts);
          });
        } catch {
          // Called from a Server Component — proxy refreshes sessions.
        }
      },
    },
  });
}
