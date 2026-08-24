import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { getAccountProfile } from "@/server/actions/account";
import { AccountProfileForm } from "@/components/forms/account-profile-form";

export const metadata = { title: "Account — HydraTax" };

export default async function AccountSettingsPage() {
  const session = await requireSession();
  const profile = await getAccountProfile();
  const canManageTeam = session.moduleAccess === "full";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Account</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Amend your name and practice details. Create a team and assign PAYE,
          VAT, or Corporation Tax access from Team & roles.
        </p>
      </div>

      <AccountProfileForm profile={profile} />

      {canManageTeam ? (
        <div className="panel p-5">
          <h2 className="display text-2xl text-ink">Team & roles</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Add colleagues and limit each person to payroll (PAYE), VAT, or
            corporation tax across all clients. One teammate can handle PAYE
            while another handles VAT.
          </p>
          <Link href="/settings/team" className="btn btn-primary mt-4 inline-flex">
            Manage team
          </Link>
        </div>
      ) : (
        <div className="panel p-5 text-sm text-ink-soft">
          Your login is limited to{" "}
          <span className="font-medium text-ink">
            {session.moduleAccess.replace("_", " ")}
          </span>
          . Ask the practice owner if you need different access.
        </div>
      )}
    </div>
  );
}
