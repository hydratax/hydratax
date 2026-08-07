"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { entitlementsForPlans } from "@/lib/entitlements";
import { isMemoryStore } from "@/lib/env";
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

    // Seed a starter subscription unlock based on org type for empty desk UX
    if (data.orgType === "practice") {
      memoryStore.subscriptions.push({
        id: crypto.randomUUID(),
        practiceId: memoryStore.practice.id,
        planKey: "practice:Solo",
        status: "active",
        stripeSessionId: null,
        createdAt: new Date().toISOString(),
      });
    }

    revalidatePath("/dashboard");
    return {
      ok: true as const,
      redirectTo: data.orgType === "practice" ? "/dashboard" : "/pricing",
      message:
        data.orgType === "practice"
          ? "Practice desk ready — choose a plan to unlock every rail, or continue with Solo starter."
          : "Account created — choose a plan to unlock filing services.",
    };
  }

  // With Clerk + DB: profile metadata is stored against the practice after org creation
  const session = await requireSession().catch(() => null);
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

  revalidatePath("/dashboard");
  return {
    ok: true as const,
    redirectTo: "/pricing",
    message: "Practice named — select a plan to unlock services.",
  };
}

export async function getPracticeEntitlements() {
  const session = await requireSession();

  if (isMemoryStore()) {
    const planKeys = memoryStore.subscriptions
      .filter(
        (s) =>
          s.practiceId === session.practiceId && s.status === "active",
      )
      .map((s) => s.planKey);

    // Paid CH requests also count
    for (const r of memoryStore.chRequests) {
      if (
        r.practiceId === session.practiceId &&
        r.paymentStatus === "paid" &&
        r.planKey
      ) {
        planKeys.push(r.planKey);
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

  const { getDb } = await import("@/server/db");
  const { practiceSubscriptions, companiesHouseRequests } = await import(
    "@/server/db/schema"
  );
  const { and, eq } = await import("drizzle-orm");

  const subs = await getDb()
    .select()
    .from(practiceSubscriptions)
    .where(
      and(
        eq(practiceSubscriptions.practiceId, session.practiceId),
        eq(practiceSubscriptions.status, "active"),
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

  const planKeys = [
    ...subs.map((s) => s.planKey),
    ...chPaid.map((r) => r.planKey).filter(Boolean),
  ] as string[];

  const ent = entitlementsForPlans(planKeys);
  return {
    ...ent,
    planKeys,
    modules: [...ent.modules],
    orgType: null as string | null,
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
