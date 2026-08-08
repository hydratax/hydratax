import Link from "next/link";
import { requireAdmin } from "@/server/auth/admin";

export const metadata = {
  title: "Admin — HydraTax",
};

export default async function AdminHomePage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Operations
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">Admin</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Operational boards for the practice — payment and status only, no
          personal filing data.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/companies-house"
          className="panel panel-interactive block p-6 transition hover:border-sea"
        >
          <h2 className="display text-2xl text-ink">Companies House</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Review filing requests, payment status, and workflow state.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-sea">
            Open board →
          </span>
        </Link>
        <Link
          href="/admin/promo-codes"
          className="panel panel-interactive block p-6 transition hover:border-sea"
        >
          <h2 className="display text-2xl text-ink">Promo codes</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Create Stripe promo codes (percent or fixed amount) for Checkout.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-sea">
            Manage codes →
          </span>
        </Link>
        <Link
          href="/dashboard"
          className="panel panel-interactive block p-6 transition hover:border-sea"
        >
          <h2 className="display text-2xl text-ink">Practice desk</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Return to clients, rails, and HMRC settings.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-sea">
            Back to dashboard →
          </span>
        </Link>
      </div>
    </div>
  );
}
