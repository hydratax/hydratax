import Link from "next/link";
import { requireAdmin } from "@/server/auth/admin";
import { getAdminEmailStats } from "@/server/actions/admin-email";
import { EmailAdmin } from "@/components/admin/email-admin";

export const metadata = {
  title: "Email — Admin — HydraTax",
};

export default async function AdminEmailsPage() {
  await requireAdmin();
  const stats = await getAdminEmailStats();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-sea">
          ← Admin
        </Link>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Operations
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
          Email &amp; reminders
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Send filing reminder emails, custom broadcasts, and monitor R2 storage
          quota alerts.
        </p>
      </div>
      <EmailAdmin initialStats={stats} />
    </div>
  );
}
