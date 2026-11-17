import { requireSession } from "@/server/auth/session";
import { getDocumentPasswordPolicy } from "@/server/actions/document-password-policy";
import { DocumentPasswordPolicyForm } from "@/components/forms/document-password-policy-form";

export const metadata = { title: "Password protection — HydraTax" };

export default async function PasswordProtectionSettingsPage() {
  await requireSession();
  const policy = await getDocumentPasswordPolicy();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Settings
        </p>
        <h1 className="display mt-1 text-4xl text-ink">
          Password protection
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Pick an identifier per section — for example date of birth for Self
          Assessment packs, or company UTR for Corporation Tax packs.
        </p>
      </div>

      <DocumentPasswordPolicyForm initial={policy} />
    </div>
  );
}
