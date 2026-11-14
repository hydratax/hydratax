import { safeErr } from "@/lib/redact";
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
  if (event.type === "invoice.paid") {
    await handleInvoicePaid(event.data.object as Stripe.Invoice);
    return;
  }
  if (event.type === "invoice.payment_failed") {
    console.warn("[stripe] invoice.payment_failed", {
      id: (event.data.object as Stripe.Invoice).id,
      customer: (event.data.object as Stripe.Invoice).customer,
    });
    return;
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return;
  }

  let session = event.data.object as Stripe.Checkout.Session;

  // Synthetic events come from fulfillCheckoutSession(), which has already
  // retrieved the session from Stripe. Real webhook events are re-verified.
  const isSynthetic = event.id.startsWith("evt_local_");
  let alreadyRecorded = false;
  if (!isSynthetic) {
    // Idempotency: Stripe retries / duplicate deliveries of the same event.
    if (processedEventIds.has(event.id)) return;
    // Do not trust the event payload's metadata: re-read the session from
    // Stripe by id and use the Stripe-side data (throws => 500 => Stripe retries).
    const { getStripe } = await import("@/server/stripe/client");
    session = await getStripe().checkout.sessions.retrieve(session.id);
    // Async payment methods: only fulfil once the money has actually landed.
    if (session.payment_status === "unpaid") return;
    alreadyRecorded = Boolean(await getCheckoutBySessionId(session.id));
  }

  const practiceId = session.metadata?.practiceId || undefined;
  const chRequestId = session.metadata?.chRequestId?.trim() || undefined;
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
    await activatePlanFromCheckout(record, practiceId, chRequestId);
    return;
  }

  if (isSupabaseConfigured()) {
    try {
      // Server-only write (service role): browser clients have no write access.
      const { getBillingWriteClient } = await import(
        "@/server/billing/admin-client"
      );
      const supabase = await getBillingWriteClient();
      if (!supabase) throw new Error("billing write client unavailable");
      await supabase.from("checkout_orders").upsert(
        {
          stripe_session_id: record.stripeSessionId,
          stripe_customer_id: record.stripeCustomerId,
          stripe_subscription_id: record.stripeSubscriptionId,
          plan_key: record.planKey,
          amount_total: record.amountTotal,
          currency: record.currency,
          customer_email: record.customerEmail,
          status: record.status,
          mode: record.mode,
          metadata: session.metadata ?? {},
          practice_id: practiceId ?? null,
        },
        { onConflict: "stripe_session_id" },
      );
    } catch (err) {
      console.warn("[stripe] checkout_orders upsert failed", safeErr(err));
    }
  }

  if (!isMemoryStore()) {
    const { hasDatabase } = await import("@/server/db");
    if (hasDatabase()) {
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
    }
  }

  await activatePlanFromCheckout(record, practiceId, chRequestId);
  // Duplicate deliveries must not re-send the welcome email.
  if (!alreadyRecorded) await maybeSendSubscriptionWelcome(record);
  if (!isSynthetic) rememberProcessedEvent(event.id);
}

/** In-process dedupe of recent webhook event ids (DB upserts cover the rest). */
const processedEventIds = new Set<string>();
function rememberProcessedEvent(id: string) {
  processedEventIds.add(id);
  if (processedEventIds.size > 2000) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  let recipient = invoice.customer_email?.trim() || null;
  if (!recipient && typeof invoice.customer === "string" && isStripeReady()) {
    try {
      const { getStripe } = await import("@/server/stripe/client");
      const customer = await getStripe().customers.retrieve(invoice.customer);
      if (!customer.deleted && customer.email) recipient = customer.email;
    } catch {
      /* ignore */
    }
  }
  if (!recipient) return;

  const amount =
    typeof invoice.amount_paid === "number"
      ? invoice.amount_paid
      : invoice.total ?? 0;
  const currency = (invoice.currency ?? "gbp").toUpperCase();
  const amountLabel = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency === "GBP" ? "GBP" : currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);

  const description =
    invoice.lines?.data?.[0]?.description ||
    invoice.description ||
    "HydraTax subscription";

  try {
    const { sendPurchaseInvoiceEmail } = await import(
      "@/server/email/purchase-invoice"
    );
    await sendPurchaseInvoiceEmail({
      to: recipient,
      amountLabel,
      description,
      invoiceNumber: invoice.number,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdfUrl: invoice.invoice_pdf,
      oneTime: invoice.billing_reason === "manual",
    });
  } catch (err) {
    console.warn("[stripe] purchase invoice email failed", safeErr(err));
  }
}

function isStripeReady() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function maybeSendSubscriptionWelcome(record: CheckoutRecord) {
  if (record.planKey.startsWith("companies-house:")) return;
  if (record.mode === "payment" && !record.planKey.startsWith("practice:")) {
    return;
  }
  const to = record.customerEmail?.trim();
  if (!to) return;
  try {
    const { sendSubscriptionWelcomeEmail } = await import(
      "@/server/email/subscription-welcome"
    );
    await sendSubscriptionWelcomeEmail({
      to,
      planKey: record.planKey,
      stripeSessionId: record.stripeSessionId,
      trialEndsAt: record.trialEndsAt,
    });
  } catch (err) {
    console.warn("[stripe] subscription welcome email failed", safeErr(err));
  }
}

async function activatePlanFromCheckout(
  record: CheckoutRecord,
  practiceId?: string,
  chRequestId?: string,
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
    const serviceId = record.planKey.replace("companies-house:", "").replace(/:desk$/, "");
    if (chRequestId) {
      for (const req of memoryStore.chRequests) {
        if (req.id === chRequestId) {
          req.paymentStatus = "paid";
          req.subscriptionActive = true;
          req.updatedAt = new Date().toISOString();
        }
      }
    } else {
      for (const req of memoryStore.chRequests) {
        if (req.serviceId === serviceId && req.paymentStatus === "unpaid") {
          req.paymentStatus = "paid";
          req.subscriptionActive = true;
          req.updatedAt = new Date().toISOString();
        }
      }
    }
  }

  if (isSupabaseConfigured() && targetPracticeId) {
    try {
      // Entitlement rows are written ONLY by the server (service role); the
      // practice_id comes from verified Stripe metadata / an authorised caller.
      const { getBillingWriteClient } = await import(
        "@/server/billing/admin-client"
      );
      const supabase = await getBillingWriteClient();
      if (!supabase) throw new Error("billing write client unavailable");
      const payload = {
        practice_id: targetPracticeId,
        plan_key: record.planKey,
        status: record.trialEndsAt ? "trialing" : "active",
        stripe_session_id: record.stripeSessionId,
        stripe_subscription_id: record.stripeSubscriptionId,
        trial_ends_at: record.trialEndsAt,
      };
      let { error } = await supabase
        .from("practice_subscriptions")
        .upsert(payload, { onConflict: "stripe_session_id" });

      // Column may be missing before migration — retry without trial fields
      if (error && /trial_ends_at/i.test(error.message)) {
        const { trial_ends_at: _trialEndsAt, ...withoutTrial } = payload;
        ({ error } = await supabase
          .from("practice_subscriptions")
          .upsert(withoutTrial, { onConflict: "stripe_session_id" }));
      }

      if (error) {
        console.warn("[stripe] practice_subscriptions upsert failed", error.message);
      }
    } catch (err) {
      console.warn("[stripe] practice_subscriptions upsert error", safeErr(err));
    }
  }

  if (!isMemoryStore() && targetPracticeId) {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (hasDatabase()) {
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
      }).onConflictDoNothing();

      if (record.planKey.startsWith("companies-house:")) {
        const serviceId = record.planKey
          .replace("companies-house:", "")
          .replace(/:desk$/, "");
        const { eq, and } = await import("drizzle-orm");
        if (chRequestId) {
          await getDb()
            .update(companiesHouseRequests)
            .set({
              paymentStatus: "paid",
              subscriptionActive: true,
              updatedAt: new Date(),
            })
            .where(eq(companiesHouseRequests.id, chRequestId));
        } else {
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
  }

  if (chRequestId && record.planKey.startsWith("companies-house:")) {
    try {
      const { fulfillPaidChRequest } = await import(
        "@/server/companies-house/fulfill-ch-request"
      );
      await fulfillPaidChRequest({
        requestId: chRequestId,
        customerEmail: record.customerEmail,
        stripeSessionId: record.stripeSessionId,
      });
    } catch (err) {
      console.error("[stripe] ch request fulfillment failed", safeErr(err));
    }
  }
}

/** Re-bind a fulfilled checkout to the logged-in practice (fixes guest → account). */
export async function attachCheckoutToPractice(
  sessionId: string,
  practiceId: string,
) {
  // Real deployments: never rebind a paid session to a practice that does not
  // own it (session ids leak via URLs/referrers). Local/memory desk is exempt.
  if (!isMemoryStore()) {
    try {
      if (!(await mayAttachCheckout(sessionId, practiceId))) return;
    } catch {
      return;
    }
  }

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
      // Authorised above (mayAttachCheckout) for real deployments; the service
      // role bypasses RLS so this must stay behind that check.
      if (isMemoryStore() && !(await mayAttachCheckout(sessionId, practiceId))) {
        return;
      }

      const { getBillingWriteClient } = await import(
        "@/server/billing/admin-client"
      );
      const supabase = await getBillingWriteClient();
      if (!supabase) return;
      await supabase
        .from("practice_subscriptions")
        .update({ practice_id: practiceId })
        .eq("stripe_session_id", sessionId);
    } catch {
      /* ignore */
    }
  }
}

/** Verified (confirmed) email of the signed-in user, lower-cased, or null. */
async function verifiedSessionEmail(): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
      return null;
    }
    return user.email.trim().toLowerCase();
  } catch {
    return null;
  }
}

async function mayAttachCheckout(
  sessionId: string,
  practiceId: string,
): Promise<boolean> {
  const { isStripeConfigured } = await import("@/lib/env");
  if (!isStripeConfigured()) return false;
  const { getStripe } = await import("@/server/stripe/client");
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const boundTo = session.metadata?.practiceId?.trim();
  if (boundTo) return boundTo === practiceId;

  const sessionEmail = (
    session.customer_details?.email ??
    session.customer_email ??
    session.metadata?.email ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!sessionEmail) return false;
  return sessionEmail === (await verifiedSessionEmail());
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
    // A checkout already bound to another practice is never re-bound by email.
    const boundTo = session.metadata?.practiceId?.trim();
    if (boundTo && boundTo !== practiceId) continue;

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

  if (isSupabaseConfigured()) {
    try {
      let supabase;
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { getSupabaseAdmin } = await import("@/lib/supabase");
        supabase = getSupabaseAdmin();
      } else {
        const { createClient } = await import("@/lib/supabase/server");
        supabase = await createClient();
      }
      const { data } = await supabase
        .from("checkout_orders")
        .select("*")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      if (data) {
        return {
          id: data.id,
          stripeSessionId: data.stripe_session_id,
          stripeCustomerId: data.stripe_customer_id,
          stripeSubscriptionId: data.stripe_subscription_id,
          planKey: data.plan_key,
          amountTotal: data.amount_total,
          currency: data.currency,
          customerEmail: data.customer_email,
          status: data.status,
          mode: data.mode,
          createdAt: data.created_at,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const { hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return null;

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
  const { getStripe } = await import("@/server/stripe/client");
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const chRequestId = session.metadata?.chRequestId?.trim() || undefined;

  if (existing) {
    const record: CheckoutRecord = {
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
      trialEndsAt:
        "trialEndsAt" in existing
          ? ((existing as { trialEndsAt?: string | null }).trialEndsAt ?? null)
          : null,
    };
    await activatePlanFromCheckout(
      record,
      session.metadata?.practiceId || undefined,
      chRequestId,
    );
    await maybeSendSubscriptionWelcome(record);
    return existing;
  }

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
