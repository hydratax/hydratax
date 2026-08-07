import type Stripe from "stripe";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";

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

export async function recordCheckoutEvent(event: Stripe.Event) {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const practiceId = session.metadata?.practiceId || undefined;
  const record: CheckoutRecord = {
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
  };

  if (isMemoryStore()) {
    orders().push(record);
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
  if (isMemoryStore()) {
    memoryStore.subscriptions.push({
      id: crypto.randomUUID(),
      practiceId: memoryStore.practice.id,
      planKey: record.planKey,
      status: "active",
      stripeSessionId: record.stripeSessionId,
      createdAt: record.createdAt,
    });

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
    return;
  }

  const { getDb } = await import("@/server/db");
  const { practiceSubscriptions, companiesHouseRequests } = await import(
    "@/server/db/schema"
  );

  if (practiceId) {
    await getDb().insert(practiceSubscriptions).values({
      practiceId,
      planKey: record.planKey,
      status: "active",
      stripeSessionId: record.stripeSessionId,
      stripeSubscriptionId: record.stripeSubscriptionId,
    });
  }

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

export async function getCheckoutBySessionId(sessionId: string) {
  if (isMemoryStore()) {
    return orders().find((o) => o.stripeSessionId === sessionId) ?? null;
  }

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
  if (existing) return existing;

  const { getStripe } = await import("@/server/stripe/client");
  const session = await getStripe().checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw new Error("Checkout is not complete yet");
  }

  // Reuse webhook recorder shape
  const synthetic = {
    id: `evt_local_${sessionId}`,
    object: "event" as const,
    type: "checkout.session.completed" as const,
    data: { object: session },
  } as unknown as Stripe.Event;

  await recordCheckoutEvent(synthetic);
  return getCheckoutBySessionId(sessionId);
}
