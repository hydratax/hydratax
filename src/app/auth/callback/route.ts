import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/lib/auth-return";

const ORG_TYPES = new Set([
  "company",
  "sole_trader",
  "partnership",
  "practice",
]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeReturnPath(searchParams.get("next"));
  const orgTypeRaw = searchParams.get("org_type");
  const orgType =
    orgTypeRaw && ORG_TYPES.has(orgTypeRaw) ? orgTypeRaw : null;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const updates: Record<string, string> = {};

        if (orgType) updates.org_type = orgType;

        const hasFirst =
          typeof meta.first_name === "string" && meta.first_name.trim();
        if (!hasFirst) {
          const full =
            (typeof meta.full_name === "string" && meta.full_name) ||
            (typeof meta.name === "string" && meta.name) ||
            "";
          const parts = full.trim().split(/\s+/).filter(Boolean);
          if (parts[0]) updates.first_name = parts[0];
          if (parts.length > 1) updates.surname = parts.slice(1).join(" ");
        }

        if (Object.keys(updates).length > 0) {
          await supabase.auth.updateUser({ data: updates });
        }

        try {
          const { ensureSupabasePractice } = await import(
            "@/server/auth/ensure-practice"
          );
          await ensureSupabasePractice({
            ...user,
            user_metadata: { ...meta, ...updates },
          });
        } catch {
          /* practice seeded on first desk visit */
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
