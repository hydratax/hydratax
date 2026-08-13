"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isStripeConfigured } from "@/lib/env";
import { requireAdmin } from "@/server/auth/admin";
import { getStripe } from "@/server/stripe/client";
import { appendAuditEvent } from "@/server/audit/log";

const createSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(
        /^[A-Za-z0-9]+$/,
        "Use letters and numbers only (no spaces or symbols)",
      ),
    discountType: z.enum(["percent", "amount"]).default("percent"),
    percentOff: z.coerce.number().min(1).max(100).optional(),
    /** Pounds sterling, e.g. 10.50 */
    amountOffGbp: z.coerce.number().min(0.01).max(100000).optional(),
    /** once = first invoice only; forever = every invoice on the subscription */
    duration: z.enum(["once", "forever"]).default("once"),
    maxRedemptions: z.coerce.number().int().min(1).max(10000).optional(),
    expiresAt: z.string().optional(), // ISO date YYYY-MM-DD
    note: z.string().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "percent") {
      if (data.percentOff == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a percent off between 1 and 100",
          path: ["percentOff"],
        });
      }
    } else if (data.amountOffGbp == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter an amount off in GBP",
        path: ["amountOffGbp"],
      });
    }
  });

export type PromoCodeRow = {
  id: string;
  code: string;
  active: boolean;
  discountType: "percent" | "amount";
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: "once" | "forever" | "repeating" | string;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: string | null;
  couponId: string;
  created: number;
};

function mapPromo(
  promo: {
    id: string;
    code: string;
    active: boolean;
    max_redemptions: number | null;
    times_redeemed: number;
    expires_at: number | null;
    created: number;
    coupon:
      | string
      | {
          id: string;
          percent_off: number | null;
          amount_off: number | null;
          currency: string | null;
          duration?: string;
        };
  },
): PromoCodeRow {
  const coupon =
    typeof promo.coupon === "string"
      ? {
          id: promo.coupon,
          percent_off: null as number | null,
          amount_off: null as number | null,
          currency: null as string | null,
          duration: "once" as string,
        }
      : promo.coupon;
  const percentOff = coupon.percent_off;
  const amountOff = coupon.amount_off;
  return {
    id: promo.id,
    code: promo.code,
    active: promo.active,
    discountType: percentOff != null ? "percent" : "amount",
    percentOff,
    amountOff,
    currency: coupon.currency,
    duration: coupon.duration ?? "once",
    maxRedemptions: promo.max_redemptions,
    timesRedeemed: promo.times_redeemed,
    expiresAt: promo.expires_at
      ? new Date(promo.expires_at * 1000).toISOString()
      : null,
    couponId: coupon.id,
    created: promo.created,
  };
}

/** Create a Stripe coupon + promotion code (percent or fixed GBP). */
export async function createPromoCode(input: z.infer<typeof createSchema>) {
  const session = await requireAdmin();
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY first.");
  }

  const data = createSchema.parse(input);
  const code = data.code.trim().toUpperCase();
  const stripe = getStripe();

  const isPercent = data.discountType === "percent";
  const percentOff = isPercent ? data.percentOff! : undefined;
  const amountOffPence = !isPercent
    ? Math.round(data.amountOffGbp! * 100)
    : undefined;
  const duration = data.duration;

  const label = isPercent
    ? `${percentOff}%`
    : `£${(amountOffPence! / 100).toFixed(2)}`;
  const durationLabel = duration === "forever" ? "forever" : "first month";

  const coupon = await stripe.coupons.create({
    ...(isPercent
      ? { percent_off: percentOff }
      : { amount_off: amountOffPence, currency: "gbp" }),
    duration,
    name: `HydraTax ${label} ${durationLabel} — ${code}`,
    metadata: {
      createdBy: session.userId,
      note: data.note?.trim() ?? "",
      source: "hydratax_admin",
      duration,
    },
  });

  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code,
    active: true,
    max_redemptions: data.maxRedemptions,
    expires_at: data.expiresAt
      ? Math.floor(new Date(`${data.expiresAt}T23:59:59Z`).getTime() / 1000)
      : undefined,
  });

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: null,
    actorId: session.userId,
    action: "billing.promo_created",
    entityType: "promo_code",
    entityId: promo.id,
    detail: {
      code,
      couponId: coupon.id,
      discountType: data.discountType,
      percentOff: percentOff ?? null,
      amountOff: amountOffPence ?? null,
      currency: isPercent ? null : "gbp",
      duration,
    },
  });

  revalidatePath("/admin/promo-codes");
  return mapPromo({
    ...promo,
    coupon: {
      id: coupon.id,
      percent_off: coupon.percent_off,
      amount_off: coupon.amount_off,
      currency: coupon.currency,
      duration: coupon.duration,
    },
  });
}

/** @deprecated Prefer createPromoCode */
export async function createHundredPercentPromo(
  input: Omit<
    z.infer<typeof createSchema>,
    "discountType" | "percentOff" | "duration"
  > & { duration?: "once" | "forever" },
) {
  return createPromoCode({
    ...input,
    discountType: "percent",
    percentOff: 100,
    duration: input.duration ?? "once",
  });
}

export async function listPromoCodes() {
  await requireAdmin();
  if (!isStripeConfigured()) return [];

  const stripe = getStripe();
  const list = await stripe.promotionCodes.list({
    limit: 100,
    expand: ["data.coupon"],
  });

  return list.data
    .filter((p) => {
      const c = p.coupon;
      if (typeof c === "string") return true;
      // Prefer codes we created; still show others so existing Stripe codes appear
      return (
        c.metadata?.source === "hydratax_admin" ||
        c.percent_off != null ||
        c.amount_off != null
      );
    })
    .map((p) => mapPromo(p as Parameters<typeof mapPromo>[0]));
}

export async function deactivatePromoCode(promoId: string) {
  const session = await requireAdmin();
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }

  const stripe = getStripe();
  const promo = await stripe.promotionCodes.update(promoId, { active: false });
  const expanded = await stripe.promotionCodes.retrieve(promo.id, {
    expand: ["coupon"],
  });

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: null,
    actorId: session.userId,
    action: "billing.promo_deactivated",
    entityType: "promo_code",
    entityId: promo.id,
    detail: { code: promo.code },
  });

  revalidatePath("/admin/promo-codes");
  return mapPromo(expanded as Parameters<typeof mapPromo>[0]);
}
