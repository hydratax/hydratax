import Link from "next/link";
import { listPromoCodes } from "@/server/actions/promo-codes";
import { PromoCodeAdmin } from "@/components/admin/promo-code-admin";
import { isStripeConfigured } from "@/lib/env";
import { requireAdmin } from "@/server/auth/admin";

export const metadata = {
  title: "Admin — Promo codes",
};

export default async function AdminPromoCodesPage() {
  await requireAdmin();
  const codes = await listPromoCodes();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Billing
        </p>
        <h1 className="display mt-2 text-4xl text-ink">Promo codes</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Create Stripe promotion codes — percent or fixed GBP off. Customers
          apply them on Checkout when paying for a plan.
        </p>
      </div>

      <PromoCodeAdmin initial={codes} stripeReady={isStripeConfigured()} />

      <p className="text-xs text-ink-soft">
        <Link href="/admin" className="font-semibold text-sea">
          ← Back to admin
        </Link>
      </p>
    </div>
  );
}
