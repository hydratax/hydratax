"use server";

import { createClient } from "@/lib/supabase/server";

const ORG_TYPES = new Set([
  "company",
  "sole_trader",
  "partnership",
  "practice",
]);

/** After browser OAuth exchange — provision practice + name fields. Soft-fails. */
export async function finishOAuthSignup(orgType?: string | null) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false as const };

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    if (orgType && ORG_TYPES.has(orgType)) updates.org_type = orgType;

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

    const { ensureSupabasePractice } = await import(
      "@/server/auth/ensure-practice"
    );
    await ensureSupabasePractice({
      ...user,
      user_metadata: { ...meta, ...updates },
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}
