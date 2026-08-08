import { isSupabaseConfigured } from "@/lib/env";

/**
 * Ensures the signed-in Supabase user owns a practice row + membership.
 * Fixes accounts that signed up before practice provisioning ran — without
 * this, practiceId falls back to auth.users.id and Stripe unlocks fail FK/RLS.
 */
export async function ensureSupabasePractice(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<{ practiceId: string; practiceName: string; role: string }> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("practice_members")
    .select("practice_id, role, practices(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.practice_id) {
    const practice = membership.practices as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
    const row = Array.isArray(practice) ? practice[0] : practice;
    return {
      practiceId: membership.practice_id as string,
      practiceName: row?.name ?? "Your practice",
      role: (membership.role as string) ?? "owner",
    };
  }

  const meta = user.user_metadata ?? {};
  const orgSearch =
    typeof meta.org_search === "string" ? meta.org_search.trim() : "";
  const firstName =
    typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const orgType =
    typeof meta.org_type === "string" ? meta.org_type : "practice";
  const { displayPracticeName } = await import("@/lib/practice-name");
  const practiceName =
    displayPracticeName(orgSearch) ||
    (firstName ? `${firstName} practice` : null) ||
    user.email?.split("@")[0] ||
    "Your practice";

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .insert({
      name: practiceName,
      org_type: ["company", "sole_trader", "partnership", "practice"].includes(
        orgType,
      )
        ? orgType
        : "practice",
    })
    .select("id, name")
    .single();

  if (practiceError || !practice) {
    throw new Error(
      practiceError?.message ??
        "Could not create practice — run the practices migration in Supabase.",
    );
  }

  const { error: memberError } = await supabase.from("practice_members").insert({
    practice_id: practice.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    // Race: another request created membership — re-read
    const { data: again } = await supabase
      .from("practice_members")
      .select("practice_id, role, practices(id, name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (again?.practice_id) {
      const practiceRel = again.practices as
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null;
      const row = Array.isArray(practiceRel) ? practiceRel[0] : practiceRel;
      return {
        practiceId: again.practice_id as string,
        practiceName: row?.name ?? practice.name,
        role: (again.role as string) ?? "owner",
      };
    }
    throw new Error(memberError.message);
  }

  // Best-effort profile row
  if (isSupabaseConfigured()) {
    await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email ?? null,
      first_name: firstName || null,
      surname: typeof meta.surname === "string" ? meta.surname : null,
      org_type: orgType,
    });
  }

  return {
    practiceId: practice.id as string,
    practiceName: practice.name as string,
    role: "owner",
  };
}
