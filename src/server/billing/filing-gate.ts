import { revalidatePath } from "next/cache";
import { isMemoryStore, isStripeConfigured, isSupabaseConfigured } from "@/lib/env";
import {
  FILING_GATE,
  filingGateUserMessage,
} from "@/lib/filing-gate";
import { memoryStore } from "@/server/demo/store";
import { getPracticeTrialStatus } from "@/server/billing/trial-status";

export type EndTrialResult =
  | { ok: true; charged: boolean }
  | { ok: false; code: keyof typeof FILING_GATE; message: string };

/**
 * Live HMRC / Companies House submissions are blocked while the practice is
 * on a Small Firm / Enterprise free trial — unless the caller has already
 * ended the trial and charged the card (`confirmEndTrial`).
 */
export async function requireLiveFilingAllowed(
  practiceId: string,
  opts?: { confirmEndTrial?: boolean },
): Promise<void> {
  const trial = await getPracticeTrialStatus(practiceId);
  if (!trial.onTrial) return;

  if (!opts?.confirmEndTrial) {
    throw new Error(filingGateUserMessage(FILING_GATE.TRIAL_BLOCKED));
  }

  const ended = await endTrialAndChargeNow(practiceId);
  if (!ended.ok) {
    throw new Error(ended.message);
  }
}

async function resolveTrialSubscription(practiceId: string): Promise<{
  stripeSubscriptionId: string | null;
  planKey: string | null;
} | null> {
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practice_subscriptions")
        .select("plan_key, status, stripe_subscription_id, trial_ends_at")
        .eq("practice_id", practiceId)
        .eq("status", "trialing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        return {
          stripeSubscriptionId:
            (data.stripe_subscription_id as string | null) ?? null,
          planKey: (data.plan_key as string | null) ?? null,
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (isMemoryStore()) {
    const sub = memoryStore.subscriptions.find(
      (s) =>
        s.practiceId === practiceId &&
        s.status === "trialing",
    );
    if (sub) {
      return { stripeSubscriptionId: null, planKey: sub.planKey };
    }
  }

  return null;
}

async function markSubscriptionActive(practiceId: string) {
  if (isMemoryStore()) {
    for (const s of memoryStore.subscriptions) {
      if (s.practiceId === practiceId && s.status === "trialing") {
        s.status = "active";
        s.trialEndsAt = new Date().toISOString();
      }
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practice_subscriptions")
        .update({
          status: "active",
          trial_ends_at: new Date().toISOString(),
        })
        .eq("practice_id", practiceId)
        .eq("status", "trialing");
    } catch (err) {
      console.warn("[filing-gate] mark active failed", err);
    }
  }

  revalidatePath("/settings/account");
  revalidatePath("/dashboard");
  revalidatePath("/pricing");
}

/**
 * Ends the Stripe trial immediately (charges the card on file) and marks the
 * local subscription active. Used when the practice confirms a live submit.
 */
export async function endTrialAndChargeNow(
  practiceId: string,
): Promise<EndTrialResult> {
  const row = await resolveTrialSubscription(practiceId);

  // Local / demo without Stripe: activate immediately.
  if (!isStripeConfigured()) {
    await markSubscriptionActive(practiceId);
    return { ok: true, charged: false };
  }

  const subId = row?.stripeSubscriptionId;
  if (!subId) {
    // Trial row without Stripe id — cannot charge; ask for card via portal.
    return {
      ok: false,
      code: "PAYMENT_METHOD_REQUIRED",
      message: filingGateUserMessage(FILING_GATE.PAYMENT_METHOD_REQUIRED),
    };
  }

  try {
    const { getStripe } = await import("@/server/stripe/client");
    const stripe = getStripe();

    const updated = await stripe.subscriptions.update(subId, {
      trial_end: "now",
      proration_behavior: "none",
    });

    const latestInvoiceId =
      typeof updated.latest_invoice === "string"
        ? updated.latest_invoice
        : updated.latest_invoice?.id ?? null;

    if (latestInvoiceId) {
      let invoice = await stripe.invoices.retrieve(latestInvoiceId);
      if (invoice.status === "draft") {
        invoice = await stripe.invoices.finalizeInvoice(latestInvoiceId);
      }
      if (invoice.status === "open") {
        try {
          invoice = await stripe.invoices.pay(latestInvoiceId);
        } catch {
          return {
            ok: false,
            code: "PAYMENT_FAILED",
            message: filingGateUserMessage(FILING_GATE.PAYMENT_FAILED),
          };
        }
      }
      if (invoice.status !== "paid" && invoice.amount_due > 0) {
        return {
          ok: false,
          code: "PAYMENT_FAILED",
          message: filingGateUserMessage(FILING_GATE.PAYMENT_FAILED),
        };
      }
    }

    const refreshed = await stripe.subscriptions.retrieve(subId);
    if (
      refreshed.status === "past_due" ||
      refreshed.status === "unpaid" ||
      refreshed.status === "incomplete" ||
      refreshed.status === "incomplete_expired"
    ) {
      return {
        ok: false,
        code: "PAYMENT_FAILED",
        message: filingGateUserMessage(FILING_GATE.PAYMENT_FAILED),
      };
    }

    await markSubscriptionActive(practiceId);
    return { ok: true, charged: true };
  } catch (err) {
    console.error("[filing-gate] endTrialAndChargeNow", err);
    return {
      ok: false,
      code: "PAYMENT_FAILED",
      message: filingGateUserMessage(FILING_GATE.PAYMENT_FAILED),
    };
  }
}
