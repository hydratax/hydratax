import { isSupabaseConfigured } from "@/lib/env";

/**
 * Ensures the signed-in Supabase user owns a practice row + membership.
 * Fixes accounts that signed up before practice provisioning ran — without
 * this, practiceId falls back to auth.users.id and Stripe unlocks fail FK/RLS.
 */
export async function ensureSupabasePractice(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
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

  // Practice + owner membership are provisioned server-side (service role):
  // RLS no longer lets the browser create practices or self-insert as owner of
  // an arbitrary practice. Falls back to the user client only when no service
  // key is configured (local dev against a pre-hardening schema).
  const provisioner = await provisioningClient(supabase);

  // The signup trigger (handle_new_user) normally already created a practice +
  // owner membership. With the service role we can see it even when this call
  // has no user session (e.g. signup before email confirmation), so re-check
  // here to avoid creating a duplicate orphan practice.
  if (provisioner !== supabase) {
    const { data: existing } = await provisioner
      .from("practice_members")
      .select("practice_id, role, practices(id, name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existing?.practice_id) {
      const rel = existing.practices as
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null;
      const relRow = Array.isArray(rel) ? rel[0] : rel;
      return {
        practiceId: existing.practice_id as string,
        practiceName: relRow?.name ?? "Your practice",
        role: (existing.role as string) ?? "owner",
      };
    }
  }

  const { data: practice, error: practiceError } = await provisioner
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

  const { error: memberError } = await provisioner
    .from("practice_members")
    .insert({
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
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  },
): Promise<{ practiceId: string; practiceName: string; role: string } | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  // Joining a practice grants access to its data, so the invite is only
  // honoured for a VERIFIED email address and is applied server-side (the
  // browser can no longer self-insert into practice_members).
  if (!(await isEmailVerified(supabase, user))) return null;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[ensurePractice] invite join skipped: SUPABASE_SERVICE_ROLE_KEY not set",
    );
    return null;
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const admin = getSupabaseAdmin();

  const oldest = new Date(Date.now() - INVITE_MAX_AGE_MS).toISOString();
  const { data: invite } = await admin
    .from("practice_team_invites")
    .select("id, practice_id, display_name, module_access")
    .is("accepted_at", null)
    .eq("email", email)
    .gte("created_at", oldest)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite?.practice_id) return null;

  // Claim the invite first so concurrent requests cannot double-join.
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("practice_team_invites")
    .update({ accepted_at: claimedAt })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .select("id");
  if (!claimed?.length) return null;

  const moduleAccess = (invite.module_access as string) || "payroll";
  const role = moduleAccess === "full" ? "admin" : "practitioner";

  const { error: memberError } = await admin.from("practice_members").insert({
    practice_id: invite.practice_id,
    user_id: user.id,
    role,
    module_access: moduleAccess,
    email,
    display_name: invite.display_name,
  });

  if (memberError) {
    // Already a member of this practice is fine; anything else: release the invite.
    if (!/duplicate|unique/i.test(memberError.message)) {
      console.error("[ensurePractice] invite join failed", memberError.message);
      await admin
        .from("practice_team_invites")
        .update({ accepted_at: null })
        .eq("id", invite.id);
      return null;
    }
  }

  const { data: practiceRow } = await admin
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

const INVITE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type UserSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/** Service-role client for provisioning when configured, else the user client. */
async function provisioningClient(userClient: UserSupabase) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    return getSupabaseAdmin();
  }
  return userClient;
}

/** Verified email only (confirmation timestamp present). Never trusts unverified claims. */
async function isEmailVerified(
  supabase: UserSupabase,
  user: {
    id: string;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  },
): Promise<boolean> {
  if (user.email_confirmed_at || user.confirmed_at) return true;
  try {
    const {
      data: { user: fresh },
    } = await supabase.auth.getUser();
    return Boolean(
      fresh && fresh.id === user.id && (fresh.email_confirmed_at || fresh.confirmed_at),
    );
  } catch {
    return false;
  }
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
