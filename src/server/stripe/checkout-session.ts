import { getCheckoutPlan } from "@/lib/checkout-plans";
import { getEnv, isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";
import {
  PRACTICE_TRIAL_DAYS,
  planKeyHasPracticeTrial,
} from "@/lib/trial";

export const TRIAL_CHECKOUT_PLAN_KEY = "practice:Practice";

export type CreateCheckoutOpts = {
  planKey: string;
  email?: string | null;
  practiceId?: string;
  userId?: string;
  cancelPath?: string;
};

/**
 * Shared Stripe Checkout session creator (used by /api/checkout and trial signup).
 */
export async function createStripeCheckoutSession(opts: CreateCheckoutOpts) {
  if (!isStripeConfigured()) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY to enable payments.",
    );
  }

  const plan = getCheckoutPlan(opts.planKey);
  if (!plan) throw new Error("Unknown plan");

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const stripe = getStripe();

  const withTrial =
    plan.interval === "month" && planKeyHasPracticeTrial(plan.key);

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: plan.interval === "month" ? "subscription" : "payment",
    customer_email: opts.email || undefined,
    ...(withTrial ? { payment_method_collection: "always" as const } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: plan.amountPence,
          product_data: {
            name: plan.name,
            description: withTrial
              ? `${plan.description} ${PRACTICE_TRIAL_DAYS}-day free trial — card saved now, first charge on day 8. Cancel anytime before then.`
              : plan.description,
          },
          ...(plan.interval === "month"
            ? { recurring: { interval: "month" as const } }
            : {}),
        },
      },
    ],
    ...(withTrial
      ? {
          subscription_data: {
            trial_period_days: PRACTICE_TRIAL_DAYS,
            trial_settings: {
              end_behavior: {
                missing_payment_method: "cancel" as const,
              },
            },
            metadata: {
              planKey: plan.key,
              trialDays: String(PRACTICE_TRIAL_DAYS),
            },
          },
        }
      : {}),
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}${
      opts.cancelPath ??
      (withTrial ? "/pricing#practice" : "/pricing?cancelled=1")
    }`,
    metadata: {
      planKey: plan.key,
      sectionId: plan.sectionId,
      interval: plan.interval,
      practiceId: opts.practiceId ?? "",
      userId: opts.userId ?? "",
      email: opts.email ?? "",
      trialDays: withTrial ? String(PRACTICE_TRIAL_DAYS) : "0",
    },
    allow_promotion_codes: true,
  });

  if (!checkoutSession.url) {
    throw new Error("Checkout session missing URL");
  }

  return {
    url: checkoutSession.url,
    sessionId: checkoutSession.id,
  };
}

export async function createPracticeTrialCheckout(opts: {
  email?: string | null;
  practiceId?: string;
  userId?: string;
}) {
  return createStripeCheckoutSession({
    planKey: TRIAL_CHECKOUT_PLAN_KEY,
    email: opts.email,
    practiceId: opts.practiceId,
    userId: opts.userId,
    cancelPath: "/pricing?cancelled=1",
  });
}
