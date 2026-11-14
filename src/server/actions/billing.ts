"use server";
import { safeErr } from "@/lib/redact";

import { revalidatePath } from "next/cache";
import {
  isMemoryStore,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import {
  collapseSubscriptionSummaries,
  featuresForPlanKey,
  type SubscriptionFeatureSummary,
} from "@/lib/subscription-features";
import { requireSession } from "@/server/auth/session";
import { memoryStore } from "@/server/demo/store";

function requireOwner() {
  return requireSession().then((session) => {
    if (session.role !== "owner") {
      throw new Error("Only the practice owner can manage the subscription.");
    }
    return session;
  });
}

export type AccountBillingSummary = {
  isOwner: boolean;
  subscriptions: SubscriptionFeatureSummary[];
  canManageBilling: boolean;
  stripeConfigured: boolean;
};

export async function getAccountBillingSummary(): Promise<AccountBillingSummary> {
  const session = await requireSession();
  const isOwner = session.role === "owner";
  const stripeConfigured = isStripeConfigured();

  if (!isOwner) {
    return {
      isOwner: false,
      subscriptions: [],
      canManageBilling: false,
      stripeConfigured,
    };
  }

  const subscriptions: SubscriptionFeatureSummary[] = [];

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: subs } = await supabase
        .from("practice_subscriptions")
        .select(
          "plan_key, status, trial_ends_at, stripe_subscription_id",
        )
        .eq("practice_id", session.practiceId)
        .in("status", ["active", "trialing", "canceling"]);

      for (const row of subs ?? []) {
        if (!row.plan_key) continue;
        const meta = featuresForPlanKey(row.plan_key);
        subscriptions.push({
          planKey: row.plan_key,
          label: meta.label,
          status: row.status ?? "active",
          features: meta.features,
          trialEndsAt: row.trial_ends_at ?? null,
          stripeSubscriptionId: row.stripe_subscription_id ?? null,
        });
      }
    } catch {
      /* table may not exist */
    }
  }

  if (isMemoryStore()) {
    for (const s of memoryStore.subscriptions) {
      if (
        s.practiceId !== session.practiceId &&
        s.practiceId !== memoryStore.practice.id
      ) {
        continue;
      }
      if (
        s.status !== "active" &&
        s.status !== "trialing" &&
        s.status !== "canceling"
      ) {
        continue;
      }
      const meta = featuresForPlanKey(s.planKey);
      if (subscriptions.some((x) => x.planKey === s.planKey)) continue;
      subscriptions.push({
        planKey: s.planKey,
        label: meta.label,
        status: s.status,
        features: meta.features,
        trialEndsAt: null,
        stripeSubscriptionId: null,
      });
    }
  }

  return {
    isOwner: true,
    subscriptions: collapseSubscriptionSummaries(subscriptions),
    canManageBilling: true,
    stripeConfigured,
  };
}

async function resolveStripeCustomerId(practiceId: string, email: string | null) {
  if (!isSupabaseConfigured()) return null;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: byPractice } = await supabase
    .from("checkout_orders")
    .select("stripe_customer_id")
    .eq("practice_id", practiceId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byPractice?.stripe_customer_id) return byPractice.stripe_customer_id as string;

  if (email) {
    const { data: byEmail } = await supabase
      .from("checkout_orders")
      .select("stripe_customer_id")
      .eq("customer_email", email)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEmail?.stripe_customer_id) return byEmail.stripe_customer_id as string;
  }
  return null;
}

/** Opens Stripe Customer Portal so the owner can cancel / update payment. */
export async function openBillingPortal(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const session = await requireOwner();
  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Billing is not configured on this environment.",
    };
  }

  try {
    const customerId = await resolveStripeCustomerId(
      session.practiceId,
      session.email,
    );
    if (!customerId) {
      return {
        ok: false,
        error:
          "No Stripe customer is linked yet. Start a plan from Pricing first, then you can manage or cancel billing here.",
      };
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk"
    ).replace(/\/$/, "");
    const { getStripe } = await import("@/server/stripe/client");
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings/account`,
    });
    if (!portal.url) {
      return { ok: false, error: "Could not open the billing portal." };
    }
    return { ok: true, url: portal.url };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not open billing. Try again or contact support.",
    };
  }
}

/**
 * Cancel subscriptions at period / trial end — never cut access immediately.
 * During free trial: Stripe cancel_at_period_end (no charge), local status
 * "canceling", desk stays open until trialEndsAt, confirmation email sent.
 * After trial / paid: same — access until current period ends.
 */
export async function cancelPracticeSubscriptions(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  const session = await requireOwner();

  const { getPracticeTrialStatus } = await import(
    "@/server/billing/trial-status"
  );
  const trial = await getPracticeTrialStatus(session.practiceId);
  const onTrial = trial.onTrial;

  if (isMemoryStore()) {
    let n = 0;
    let planKey: string | null = null;
    for (const s of memoryStore.subscriptions) {
      if (
        (s.practiceId === session.practiceId ||
          s.practiceId === memoryStore.practice.id) &&
        (s.status === "active" || s.status === "trialing")
      ) {
        s.status = "canceling";
        planKey = s.planKey;
        n += 1;
      }
    }
    if (n > 0 && onTrial && trial.trialEndsAt) {
      await sendTrialCancelledNotice({
        practiceId: session.practiceId,
        practiceName: memoryStore.practice.name,
        trialEndsAt: new Date(trial.trialEndsAt),
        planKey: planKey ?? trial.planKey,
        emailOverride:
          (process.env.ADMIN_EMAIL ?? "").split(",")[0]?.trim() || null,
      });
    }
    revalidatePath("/settings/account");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        n > 0
          ? onTrial
            ? "Subscription cancelled. You can keep using HydraTax until your free trial ends — no charge."
            : "Cancellation scheduled. You keep access until the end of the current billing period."
          : "No active subscription to cancel.",
    };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Account storage is not configured." };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: subs } = await supabase
    .from("practice_subscriptions")
    .select("id, plan_key, status, stripe_subscription_id, trial_ends_at")
    .eq("practice_id", session.practiceId)
    .in("status", ["active", "trialing"]);

  if (!subs?.length) {
    return { ok: false, error: "No active subscription to cancel." };
  }

  let canceledViaStripe = 0;
  if (isStripeConfigured()) {
    const { getStripe } = await import("@/server/stripe/client");
    const stripe = getStripe();
    for (const row of subs) {
      const subId = row.stripe_subscription_id as string | null;
      if (!subId) continue;
      try {
        // Always end at period/trial boundary — never revoke mid-trial.
        await stripe.subscriptions.update(subId, {
          cancel_at_period_end: true,
        });
        canceledViaStripe += 1;
      } catch {
        /* fall through to local status update */
      }
    }
  }

  // Status changes are server-only (service role). Scoped to the caller's own
  // practice, and requireOwner() above has already authorised this user.
  const { getBillingWriteClient } = await import(
    "@/server/billing/admin-client"
  );
  const writer = await getBillingWriteClient();
  if (!writer) {
    return { ok: false, error: "Billing storage is not configured." };
  }
  const { error } = await writer
    .from("practice_subscriptions")
    .update({ status: "canceling" })
    .eq("practice_id", session.practiceId)
    .in("status", ["active", "trialing"]);

  if (error) {
    return { ok: false, error: error.message };
  }

  const primary = subs[0];
  const trialEndsRaw =
    trial.trialEndsAt ??
    (primary?.trial_ends_at as string | null | undefined) ??
    null;
  if (onTrial && trialEndsRaw) {
    const { data: practice } = await supabase
      .from("practices")
      .select("name")
      .eq("id", session.practiceId)
      .maybeSingle();
    await sendTrialCancelledNotice({
      practiceId: session.practiceId,
      practiceName: (practice?.name as string | undefined) ?? "your practice",
      trialEndsAt: new Date(trialEndsRaw),
      planKey:
        (primary?.plan_key as string | null | undefined) ?? trial.planKey,
    });
  }

  revalidatePath("/settings/account");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: onTrial
      ? "Subscription cancelled. You can keep using HydraTax until your free trial ends — no charge."
      : canceledViaStripe > 0
        ? "Cancellation scheduled. You keep access until the end of the current billing period."
        : "Subscription marked for cancellation. You keep access until the period ends where applicable.",
  };
}

async function sendTrialCancelledNotice(opts: {
  practiceId: string;
  practiceName: string;
  trialEndsAt: Date;
  planKey?: string | null;
  emailOverride?: string | null;
}) {
  try {
    const { getEnv } = await import("@/lib/env");
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      getEnv().NEXT_PUBLIC_APP_URL ||
      "https://hydratax.uk"
    ).replace(/\/$/, "");

    let to = opts.emailOverride?.trim() || null;
    if (!to && isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const admin = getSupabaseAdmin();
      const { data: members } = await admin
        .from("practice_members")
        .select("user_id, email, role")
        .eq("practice_id", opts.practiceId)
        .in("role", ["owner", "admin"]);
      const rows = (members ?? []) as {
        user_id?: string;
        email?: string | null;
        role?: string;
      }[];
      const owner = rows.find((r) => r.role === "owner") ?? rows[0];
      if (owner?.email) to = owner.email;
      if (!to && owner?.user_id) {
        const { data: profile } = await admin
          .from("profiles")
          .select("email")
          .eq("id", owner.user_id)
          .maybeSingle();
        if (profile?.email && typeof profile.email === "string") {
          to = profile.email;
        }
      }
      if (!to && owner?.user_id) {
        const { data: userData } = await admin.auth.admin.getUserById(
          owner.user_id,
        );
        to = userData.user?.email ?? null;
      }
    }
    if (!to?.includes("@")) return;

    const { trialCancelledEmailContent, sendTransactionalEmail } = await import(
      "@/server/email/transactional"
    );
    const content = trialCancelledEmailContent({
      practiceName: opts.practiceName,
      trialEndsAt: opts.trialEndsAt,
      appUrl,
      planKey: opts.planKey,
    });
    await sendTransactionalEmail({
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  } catch (err) {
    console.error("[billing] trial cancelled email failed", safeErr(err));
  }
}

/**
 * Owner confirms ending the free trial and charging the card on file
 * (required before the first live HMRC / Companies House submission).
 */
export async function confirmEndTrialAndCharge(): Promise<
  { ok: true; charged: boolean } | { ok: false; error: string }
> {
  const session = await requireOwner();
  const { endTrialAndChargeNow } = await import(
    "@/server/billing/filing-gate"
  );
  const res = await endTrialAndChargeNow(session.practiceId);
  if (!res.ok) return { ok: false, error: res.message };
  return { ok: true, charged: res.charged };
}

/** Whether this practice is on a free trial (for submit UI). */
export async function getFilingTrialGate() {
  const session = await requireSession();
  const { getPracticeTrialStatus } = await import(
    "@/server/billing/trial-status"
  );
  const trial = await getPracticeTrialStatus(session.practiceId);
  return {
    onTrial: trial.onTrial,
    trialEndsAt: trial.trialEndsAt,
    planKey: trial.planKey,
  };
}
