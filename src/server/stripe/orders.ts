import type Stripe from "stripe";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  planKeyHasPracticeTrial,
  practiceTrialEndsAt,
} from "@/lib/trial";

export type CheckoutRecord = {
  id: string;
  stripeSessionId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planKey: string;
  amountTotal: number | null;
  currency: string | null;
  customerEmail: string | null;
  status: string;
  mode: string;
  createdAt: string;
  trialEndsAt?: string | null;
};

const globalOrders = globalThis as unknown as {
  __hydrataxOrders?: CheckoutRecord[];
};

function orders(): CheckoutRecord[] {
  if (!globalOrders.__hydrataxOrders) {
    globalOrders.__hydrataxOrders = [];
  }
  return globalOrders.__hydrataxOrders;
}

function toRecord(session: Stripe.Checkout.Session): CheckoutRecord {
  const trialDays = Number(session.metadata?.trialDays ?? 0);
  const trialEndsAt =
    trialDays > 0 && planKeyHasPracticeTrial(session.metadata?.planKey ?? "")
      ? practiceTrialEndsAt().toISOString()
      : null;
  return {
    id: crypto.randomUUID(),
    stripeSessionId: session.id,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : null,
    stripeSubscriptionId:
      typeof session.subscription === "string" ? session.subscription : null,
    planKey: session.metadata?.planKey ?? "unknown",
    amountTotal: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email ?? session.customer_email,
    status: session.payment_status ?? "paid",
    mode: session.mode,
    createdAt: new Date().toISOString(),
    trialEndsAt,
  };
}

export async function recordCheckoutEvent(event: Stripe.Event) {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const practiceId = session.metadata?.practiceId || undefined;
  const record = toRecord(session);

  if (isMemoryStore()) {
    if (!orders().some((o) => o.stripeSessionId === record.stripeSessionId)) {
      orders().push(record);
    }
    memoryStore.auditEvents.push({
      action: "billing.checkout_completed",
      detail: {
        planKey: record.planKey,
        stripeSessionId: record.stripeSessionId,
        amountTotal: record.amountTotal,
      },
      createdAt: record.createdAt,
    });
    await activatePlanFromCheckout(record, practiceId);
    return;
  }

  const { getDb } = await import("@/server/db");
  const { checkoutOrders } = await import("@/server/db/schema");
  await getDb()
    .insert(checkoutOrders)
    .values({
      stripeSessionId: record.stripeSessionId,
      stripeCustomerId: record.stripeCustomerId,
      stripeSubscriptionId: record.stripeSubscriptionId,
      planKey: record.planKey,
      amountTotal: record.amountTotal,
      currency: record.currency,
      customerEmail: record.customerEmail,
      status: record.status,
      mode: record.mode,
      metadata: session.metadata ?? {},
      practiceId: practiceId ?? null,
    })
    .onConflictDoNothing();

  await activatePlanFromCheckout(record, practiceId);
}

async function activatePlanFromCheckout(
  record: CheckoutRecord,
  practiceId?: string,
) {
  const targetPracticeId = practiceId?.trim() || undefined;

  // Always keep a memory copy so local/demo desk unlocks immediately
  const already = memoryStore.subscriptions.some(
    (s) => s.stripeSessionId === record.stripeSessionId,
  );
  if (!already) {
    memoryStore.subscriptions.push({
      id: crypto.randomUUID(),
      practiceId: targetPracticeId ?? memoryStore.practice.id,
      planKey: record.planKey,
      status: record.trialEndsAt ? "trialing" : "active",
      stripeSessionId: record.stripeSessionId,
      trialEndsAt: record.trialEndsAt ?? null,
      createdAt: record.createdAt,
    });
  } else if (targetPracticeId) {
    for (const s of memoryStore.subscriptions) {
      if (s.stripeSessionId === record.stripeSessionId) {
        s.practiceId = targetPracticeId;
        if (record.trialEndsAt) s.trialEndsAt = record.trialEndsAt;
      }
    }
  }

  if (record.planKey.startsWith("companies-house:")) {
    const serviceId = record.planKey.replace("companies-house:", "");
    for (const req of memoryStore.chRequests) {
      if (req.serviceId === serviceId && req.paymentStatus === "unpaid") {
        req.paymentStatus = "paid";
        req.subscriptionActive = true;
        req.updatedAt = new Date().toISOString();
      }
    }
  }

  if (isSupabaseConfigured() && targetPracticeId) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { error } = await supabase.from("practice_subscriptions").upsert(
        {
          practice_id: targetPracticeId,
          plan_key: record.planKey,
          status: record.trialEndsAt ? "trialing" : "active",
          stripe_session_id: record.stripeSessionId,
          stripe_subscription_id: record.stripeSubscriptionId,
          trial_ends_at: record.trialEndsAt,
        },
        { onConflict: "stripe_session_id" },
      );
      if (error) {
        console.error("[stripe] practice_subscriptions upsert failed", error.message);
      }
    } catch (err) {
      console.error("[stripe] practice_subscriptions upsert error", err);
    }
  }

  if (!isMemoryStore() && targetPracticeId) {
    const { getDb } = await import("@/server/db");
    const { practiceSubscriptions, companiesHouseRequests } = await import(
      "@/server/db/schema"
    );

    await getDb().insert(practiceSubscriptions).values({
      practiceId: targetPracticeId,
      planKey: record.planKey,
      status: record.trialEndsAt ? "trialing" : "active",
      stripeSessionId: record.stripeSessionId,
      stripeSubscriptionId: record.stripeSubscriptionId,
      trialEndsAt: record.trialEndsAt ? new Date(record.trialEndsAt) : null,
    });

    if (record.planKey.startsWith("companies-house:")) {
      const serviceId = record.planKey.replace("companies-house:", "");
      const { eq, and } = await import("drizzle-orm");
      await getDb()
        .update(companiesHouseRequests)
        .set({
          paymentStatus: "paid",
          subscriptionActive: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companiesHouseRequests.serviceId, serviceId),
            eq(companiesHouseRequests.paymentStatus, "unpaid"),
          ),
        );
    }
  }
}

/** Re-bind a fulfilled checkout to the logged-in practice (fixes guest → account). */
export async function attachCheckoutToPractice(
  sessionId: string,
  practiceId: string,
) {
  for (const s of memoryStore.subscriptions) {
    if (s.stripeSessionId === sessionId) {
      s.practiceId = practiceId;
    }
  }

  const order = orders().find((o) => o.stripeSessionId === sessionId);
  if (order) {
    await activatePlanFromCheckout(order, practiceId);
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practice_subscriptions")
        .update({ practice_id: practiceId })
        .eq("stripe_session_id", sessionId);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Recover paid Stripe checkouts for this email onto the practice.
 * Fixes purchases made before practiceId was stored in metadata.
 */
export async function syncPaidCheckoutsForEmail(
  email: string,
  practiceId: string,
) {
  if (!email.trim()) return [];

  const { isStripeConfigured } = await import("@/lib/env");
  if (!isStripeConfigured()) return [];

  const { getStripe } = await import("@/server/stripe/client");
  const stripe = getStripe();
  const list = await stripe.checkout.sessions.list({
    limit: 100,
    status: "complete",
  });

  const matched: string[] = [];
  const needle = email.trim().toLowerCase();

  for (const session of list.data) {
    const sessionEmail = (
      session.customer_details?.email ??
      session.customer_email ??
      session.metadata?.email ??
      ""
    ).toLowerCase();
    if (sessionEmail !== needle) continue;
    if (session.payment_status !== "paid" && session.status !== "complete") {
      continue;
    }
    const planKey = session.metadata?.planKey;
    if (!planKey) continue;

    const record = toRecord(session);
    if (!orders().some((o) => o.stripeSessionId === record.stripeSessionId)) {
      orders().push(record);
    }
    await activatePlanFromCheckout(record, practiceId);
    matched.push(planKey);
  }

  return matched;
}

export async function getCheckoutBySessionId(sessionId: string) {
  const mem = orders().find((o) => o.stripeSessionId === sessionId);
  if (mem) return mem;

  if (isMemoryStore()) return null;

  const { getDb } = await import("@/server/db");
  const { checkoutOrders } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.stripeSessionId, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fulfill a Checkout Session when the user lands on /checkout/success.
 * Works without webhooks (local / Netlify before webhook is configured).
 */
export async function fulfillCheckoutSession(sessionId: string) {
  const existing = await getCheckoutBySessionId(sessionId);
  if (existing) {
    const practiceId = undefined;
    // Still ensure memory activation exists
    await activatePlanFromCheckout(
      {
        id: existing.id ?? crypto.randomUUID(),
        stripeSessionId: existing.stripeSessionId ?? sessionId,
        stripeCustomerId: existing.stripeCustomerId ?? null,
        stripeSubscriptionId: existing.stripeSubscriptionId ?? null,
        planKey: existing.planKey,
        amountTotal: existing.amountTotal ?? null,
        currency: existing.currency ?? null,
        customerEmail: existing.customerEmail ?? null,
        status: existing.status ?? "paid",
        mode: existing.mode ?? "subscription",
        createdAt:
          typeof existing.createdAt === "string"
            ? existing.createdAt
            : new Date().toISOString(),
      },
      practiceId,
    );
    return existing;
  }

  const { getStripe } = await import("@/server/stripe/client");
  const session = await getStripe().checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw new Error("Checkout is not complete yet");
  }

  const synthetic = {
    id: `evt_local_${sessionId}`,
    object: "event" as const,
    type: "checkout.session.completed" as const,
    data: { object: session },
  } as unknown as Stripe.Event;

  await recordCheckoutEvent(synthetic);
  return getCheckoutBySessionId(sessionId);
}
