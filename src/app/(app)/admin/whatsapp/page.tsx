import { requireAdmin } from "@/server/auth/admin";
import { adminListWhatsAppAllocations } from "@/server/actions/whatsapp-desk";
import { WhatsAppAllocAdmin } from "@/components/admin/whatsapp-alloc-admin";
import Link from "next/link";

export const metadata = {
  title: "WhatsApp allocations — HydraTax Admin",
};

export default async function AdminWhatsAppPage() {
  await requireAdmin();
  const { allocations, practices, platformReady } =
    await adminListWhatsAppAllocations();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Admin
          </p>
          <h1 className="display mt-2 text-4xl text-ink">WhatsApp volume</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Assign HydraTax WhatsApp credentials and monthly send limits to
            practices. Messages go out on the shared HydraTax business number.
          </p>
        </div>
        <Link href="/admin" className="btn btn-secondary">
          Back
        </Link>
      </div>

      <WhatsAppAllocAdmin
        initial={allocations}
        practices={practices}
        platformReady={platformReady}
      />
    </div>
  );
}
