import { listTeamMembers, getActingMemberId } from "@/server/actions/team";
import { requireSession } from "@/server/auth/session";
import { TeamAdmin } from "@/components/team/team-admin";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Team — HydraTax" };

export default async function TeamSettingsPage() {
  const session = await requireSession();
  if (session.moduleAccess !== "full") {
    redirect("/dashboard");
  }

  const [members, actingMemberId] = await Promise.all([
    listTeamMembers(),
    getActingMemberId(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Team</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Add staff and limit them to payroll, VAT, or corporation tax across
          all clients. You keep full access as the account holder.
        </p>
      </div>

      <TeamAdmin
        members={members}
        actingMemberId={actingMemberId}
        isLocal={session.local}
      />

      <p className="text-sm text-ink-soft">
        <Link href="/dashboard" className="font-semibold text-sea">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
