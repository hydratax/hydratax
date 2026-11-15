import { getPaymentGatewayStatus } from "@/server/actions/payment-gateways";
import { PaymentGatewaysPanel } from "@/components/settings/payment-gateways-panel";
import { requireSession } from "@/server/auth/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Payment gateways — HydraTax" };

export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  try {
    await requireSession();
  } catch {
    redirect("/sign-in?next=%2Fsettings%2Fpayments");
  }

  const query = await searchParams;
  const status = await getPaymentGatewayStatus();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Payment gateways</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Connect Stripe so clients can pay your invoices by card. HydraTax uses
          Stripe Connect — funds land in your Stripe account.
        </p>
      </div>
      <PaymentGatewaysPanel
        initial={status}
        queryConnected={query.connected === "1"}
        queryError={query.error ?? null}
      />
    </div>
  );
}
