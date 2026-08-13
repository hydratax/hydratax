"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { entitlementsForPlans } from "@/lib/entitlements";
import {
  isMemoryStore,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { memoryStore } from "@/server/demo/store";

const profileSchema = z.object({
  orgType: z.enum(["company", "sole_trader", "partnership", "practice"]),
  orgSearch: z.string().max(200).optional(),
  firstName: z.string().min(1).max(80),
  surname: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
});

export async function createAccountProfile(
  input: z.infer<typeof profileSchema>,
) {
  const data = profileSchema.parse(input);
  if (data.password !== data.confirmPassword) {
    throw new Error("Passwords do not match");
  }

  const practiceName =
    data.orgType === "practice"
      ? `${data.firstName} ${data.surname} Practice`
      : data.orgSearch?.trim() ||
        `${data.firstName} ${data.surname}${
          data.orgType === "company" ? " Ltd" : ""
        }`;

  if (isMemoryStore()) {
    memoryStore.accountProfile = {
      orgType: data.orgType,
      orgSearch: data.orgSearch?.trim() ?? "",
      firstName: data.firstName,
      createdAt: new Date().toISOString(),
    };
    memoryStore.practice.name =
      data.orgType === "practice" ? practiceName : practiceName;

    // Soft trial only when Stripe isn't available (local/demo)
    if (data.orgType === "practice" && !isStripeConfigured()) {
      const { startPracticeTrial } = await import(
        "@/server/billing/start-practice-trial"
      );
      await startPracticeTrial(memoryStore.practice.id);
    }

    revalidatePath("/dashboard");
    return {
      ok: true as const,
      redirectTo: data.orgType === "practice" ? "/dashboard" : "/pricing",
      message:
        data.orgType === "practice"
          ? isStripeConfigured()
            ? "Account ready — add a card to start your 7-day free trial."
            : "Practice desk ready — your 7-day free trial is on. No Hydra fees while you trial."
          : "Account created — choose a plan to unlock filing services.",
    };
  }

  // With Clerk + DB: profile metadata is stored against the practice after org creation
  const { getOptionalSession } = await import("@/server/auth/session");
  const session = await getOptionalSession();
  if (!session) {
    return {
      ok: true as const,
      redirectTo: `/sign-up?email=${encodeURIComponent(data.email)}&orgType=${data.orgType}`,
      message: "Continue with secure Clerk sign-up to finish.",
    };
  }

  const { getDb } = await import("@/server/db");
  const { practices } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(practices)
    .set({ name: practiceName })
    .where(eq(practices.id, session.practiceId));

  if (data.orgType === "practice" && !isStripeConfigured()) {
    const { startPracticeTrial } = await import(
      "@/server/billing/start-practice-trial"
    );
    await startPracticeTrial(session.practiceId);
  }

  revalidatePath("/dashboard");
  return {
    ok: true as const,
    redirectTo: data.orgType === "practice" ? "/dashboard" : "/pricing",
    message:
      data.orgType === "practice"
        ? isStripeConfigured()
          ? "Account ready — add a card to start your 7-day free trial."
          : "Practice desk ready — your 7-day free trial is on. No Hydra fees while you trial."
        : "Practice named — select a plan to unlock services.",
  };
}

export async function getPracticeEntitlements() {
  const session = await requireSession();

  // Recover paid Stripe checkouts for this account (email match)
  if (isStripeConfigured()) {
    try {
      let email: string | null = null;
      if (isSupabaseConfigured()) {
        const { createClient } = await import("@/lib/supabase/server");
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        email = user?.email ?? null;
      }
      if (email) {
        const { syncPaidCheckoutsForEmail } = await import(
          "@/server/stripe/orders"
        );
        await syncPaidCheckoutsForEmail(email, session.practiceId);
      }
    } catch {
      /* Stripe sync is best-effort */
    }
  }

  const planKeys: string[] = [];

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: subs } = await supabase
        .from("practice_subscriptions")
        .select("plan_key, status")
        .eq("practice_id", session.practiceId)
        .in("status", ["active", "trialing"]);
      for (const s of subs ?? []) {
        if (s.plan_key) planKeys.push(s.plan_key);
      }
    } catch {
      /* table may not exist yet */
    }
  }

  // Memory desk (local / DEMO_MODE): match this practice, or claim orphans
  {
    const mine = memoryStore.subscriptions.filter(
      (s) =>
        (s.status === "active" || s.status === "trialing") &&
        (s.practiceId === session.practiceId ||
          s.practiceId === memoryStore.practice.id),
    );
    for (const s of mine) {
      if (s.practiceId !== session.practiceId) {
        s.practiceId = session.practiceId;
      }
      if (!planKeys.includes(s.planKey)) planKeys.push(s.planKey);
    }

    for (const r of memoryStore.chRequests) {
      if (
        (r.practiceId === session.practiceId ||
          r.practiceId === memoryStore.practice.id) &&
        r.paymentStatus === "paid" &&
        r.planKey &&
        !planKeys.includes(r.planKey)
      ) {
        planKeys.push(r.planKey);
      }
    }
  }

  if (!isMemoryStore()) {
    try {
      const { getDb } = await import("@/server/db");
      const { practiceSubscriptions, companiesHouseRequests } = await import(
        "@/server/db/schema"
      );
      const { and, eq, or } = await import("drizzle-orm");

      const subs = await getDb()
        .select()
        .from(practiceSubscriptions)
        .where(
          and(
            eq(practiceSubscriptions.practiceId, session.practiceId),
            or(
              eq(practiceSubscriptions.status, "active"),
              eq(practiceSubscriptions.status, "trialing"),
            ),
          ),
        );

      const chPaid = await getDb()
        .select()
        .from(companiesHouseRequests)
        .where(
          and(
            eq(companiesHouseRequests.practiceId, session.practiceId),
            eq(companiesHouseRequests.paymentStatus, "paid"),
          ),
        );

      for (const s of subs) {
        if (!planKeys.includes(s.planKey)) planKeys.push(s.planKey);
      }
      for (const r of chPaid) {
        if (r.planKey && !planKeys.includes(r.planKey)) planKeys.push(r.planKey);
      }
    } catch {
      /* no DATABASE_URL path */
    }
  }

  // Local/demo only: seed a soft trial when Stripe isn't available.
  // Production trials require a card via Stripe Checkout (day-8 charge).
  if (planKeys.length === 0 && !isStripeConfigured()) {
    try {
      const { startPracticeTrial } = await import(
        "@/server/billing/start-practice-trial"
      );
      const started = await startPracticeTrial(session.practiceId);
      if (started.created) {
        planKeys.push("practice:Practice");
      } else if (
        memoryStore.subscriptions.some(
          (s) =>
            s.practiceId === session.practiceId &&
            (s.status === "active" || s.status === "trialing"),
        )
      ) {
        for (const s of memoryStore.subscriptions) {
          if (
            s.practiceId === session.practiceId &&
            (s.status === "active" || s.status === "trialing") &&
            !planKeys.includes(s.planKey)
          ) {
            planKeys.push(s.planKey);
          }
        }
      }
    } catch {
      /* best-effort */
    }
  }

  const ent = entitlementsForPlans(planKeys);
  return {
    ...ent,
    planKeys,
    modules: [...ent.modules],
    orgType: memoryStore.accountProfile?.orgType ?? null,
  };
}

/** Explicit one-click claim — starts Stripe Checkout with card + 7-day trial. */
export async function claimPracticeFreeTrial() {
  const session = await requireSession();
  const { isStripeConfigured } = await import("@/lib/env");

  if (!isStripeConfigured()) {
    // Local / demo without Stripe: unlock trial in-memory
    const { startPracticeTrial } = await import(
      "@/server/billing/start-practice-trial"
    );
    const result = await startPracticeTrial(session.practiceId);
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      created: result.created,
      trialEndsAt: result.trialEndsAt,
      checkoutUrl: null as string | null,
    };
  }

  const { createPracticeTrialCheckout } = await import(
    "@/server/stripe/checkout-session"
  );
  const checkout = await createPracticeTrialCheckout({
    email: session.email,
    practiceId: session.practiceId,
    userId: session.userId,
  });
  return {
    ok: true as const,
    created: false,
    trialEndsAt: null as string | null,
    checkoutUrl: checkout.url,
  };
}

export async function activatePlanLocally(planKey: string) {
  const session = await requireSession();
  if (!isMemoryStore()) {
    throw new Error("Use Stripe checkout for production plan activation");
  }
  memoryStore.subscriptions.push({
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    planKey,
    status: "active",
    stripeSessionId: null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath("/dashboard");
  return { ok: true };
}
