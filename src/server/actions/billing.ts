"use server";

import { revalidatePath } from "next/cache";
import {
  isMemoryStore,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import {
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
      if (s.status !== "active" && s.status !== "trialing") continue;
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
    subscriptions,
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
 * Cancel active subscriptions at period end (or immediately in memory/demo).
 * Prefer the Stripe portal when available; this is the in-app fallback.
 */
export async function cancelPracticeSubscriptions(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  const session = await requireOwner();

  if (isMemoryStore()) {
    let n = 0;
    for (const s of memoryStore.subscriptions) {
      if (
        (s.practiceId === session.practiceId ||
          s.practiceId === memoryStore.practice.id) &&
        (s.status === "active" || s.status === "trialing")
      ) {
        s.status = "cancelled";
        n += 1;
      }
    }
    revalidatePath("/settings/account");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        n > 0
          ? "Subscription cancelled. Paid features will no longer be available."
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
    .select("id, plan_key, status, stripe_subscription_id")
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
        await stripe.subscriptions.update(subId, {
          cancel_at_period_end: true,
        });
        canceledViaStripe += 1;
      } catch {
        /* fall through to local status update */
      }
    }
  }

  const { error } = await supabase
    .from("practice_subscriptions")
    .update({ status: "canceling" })
    .eq("practice_id", session.practiceId)
    .in("status", ["active", "trialing"]);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings/account");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message:
      canceledViaStripe > 0
        ? "Cancellation scheduled. You keep access until the end of the current billing period (or trial)."
        : "Subscription marked for cancellation. You keep access until the period ends where applicable.",
  };
}
