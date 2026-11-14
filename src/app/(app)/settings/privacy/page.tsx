import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { RETENTION_DAYS } from "@/lib/retention-policy";
import { requireSession } from "@/server/auth/session";
import { PrivacyDataPanel } from "@/components/settings/privacy-data-panel";
import { getPendingDeletion } from "@/server/privacy/account-deletion";
import { privacyAdminClient } from "@/server/privacy/db";
import { buildErasurePlan } from "@/server/privacy/user-erasure";

export const metadata = { title: "Privacy & data — HydraTax" };
export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  const session = await requireSession();

  let erasePractices: string[] = [];
  let blockedPractices: string[] = [];
  let pending: { scheduledFor: string } | null = null;

  const admin = privacyAdminClient();
  if (admin && !session.local && isSupabaseConfigured()) {
    try {
      const plan = await buildErasurePlan(admin, session.userId);
      erasePractices = plan.practices
        .filter((p) => p.classification === "sole_member")
        .map((p) => p.practiceName);
      blockedPractices = plan.blocked.map((p) => p.practiceName);
      const p = await getPendingDeletion(session.userId);
      pending = p ? { scheduledFor: p.scheduledFor } : null;
    } catch {
      /* the panel still works; server action re-checks everything */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Your rights
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Privacy &amp; data</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Download or delete the personal data HydraTax holds about you. See the{" "}
          <Link href="/privacy" className="font-semibold text-sea">
            Privacy Notice
          </Link>{" "}
          for what we collect, why and how long we keep it. Client data is
          exported or erased per client from each client&apos;s page.
        </p>
      </div>

      <PrivacyDataPanel
        email={session.email}
        local={session.local}
        graceDays={RETENTION_DAYS.accountDeletionGraceDays}
        pending={pending}
        erasePractices={erasePractices}
        blockedPractices={blockedPractices}
      />
    </div>
  );
}
