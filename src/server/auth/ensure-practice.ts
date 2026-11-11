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
    const practiceId = membership.practice_id as string;
    // Recover trial if signup raced ahead of seeding
    await seedTrialIfEligible(user, practiceId);
    await seedTaskInbox(practiceId, row?.name ?? "Your practice");
    return {
      practiceId,
      practiceName: row?.name ?? "Your practice",
      role: (membership.role as string) ?? "owner",
    };
  }

  // Team invite: join the inviting practice instead of creating a new one.
  const joined = await acceptPendingTeamInvite(supabase, user);
  if (joined) return joined;

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
      const practiceId = again.practice_id as string;
      await seedTrialIfEligible(user, practiceId);
      await seedTaskInbox(practiceId, row?.name ?? practice.name);
      return {
        practiceId,
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

  await seedTrialIfEligible(user, practice.id as string);
  await seedTaskInbox(practice.id as string, practice.name as string);

  return {
    practiceId: practice.id as string,
    practiceName: practice.name as string,
    role: "owner",
  };
}

async function acceptPendingTeamInvite(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  user: { id: string; email?: string | null },
): Promise<{ practiceId: string; practiceName: string; role: string } | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const { data: invite } = await supabase
    .from("practice_team_invites")
    .select("id, practice_id, display_name, module_access")
    .is("accepted_at", null)
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite?.practice_id) return null;

  const moduleAccess = (invite.module_access as string) || "payroll";
  const role = moduleAccess === "full" ? "admin" : "practitioner";

  const { error: memberError } = await supabase.from("practice_members").insert({
    practice_id: invite.practice_id,
    user_id: user.id,
    role,
    module_access: moduleAccess,
    email,
    display_name: invite.display_name,
  });

  if (memberError) {
    // Already a member of this practice
    if (!/duplicate|unique/i.test(memberError.message)) {
      console.error("[ensurePractice] invite join failed", memberError.message);
      return null;
    }
  }

  await supabase
    .from("practice_team_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  const { data: practiceRow } = await supabase
    .from("practices")
    .select("id, name")
    .eq("id", invite.practice_id)
    .maybeSingle();

  return {
    practiceId: invite.practice_id as string,
    practiceName: practiceRow?.name ?? "Practice",
    role,
  };
}

/** Assign a dedicated Tasks email when the practice is first created. */
async function seedTaskInbox(practiceId: string, practiceName: string) {
  try {
    const { ensurePracticeTaskInbox } = await import("@/server/tasks/inbox");
    await ensurePracticeTaskInbox({ practiceId, practiceName });
  } catch {
    /* inbox seed is best-effort */
  }
}

/** Idempotent: starts 7-day Practice desk trial when eligible (no Stripe / local only). */
async function seedTrialIfEligible(
  user: { user_metadata?: Record<string, unknown> | null },
  practiceId: string,
) {
  const { isStripeConfigured } = await import("@/lib/env");
  // With Stripe, trial starts only via Practice/Custom Checkout.
  if (isStripeConfigured()) return;

  const meta = user.user_metadata ?? {};
  const wantsTrial =
    meta.start_trial === true ||
    meta.start_trial === "true" ||
    meta.start_trial === "1";
  if (!wantsTrial) return;
  try {
    const { startPracticeTrial } = await import(
      "@/server/billing/start-practice-trial"
    );
    await startPracticeTrial(practiceId);
  } catch {
    /* trial seed is best-effort */
  }
}
