import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import {
  getDefaultBulkEmailDraft,
  listBulkEmailCandidates,
} from "@/server/actions/client-communications";
import { BulkClientEmailForm } from "@/components/forms/bulk-client-email";

export default async function BulkClientEmailPage() {
  const session = await requireSession();
  if (session.role === "readonly") redirect("/clients");

  let draft;
  let data;
  try {
    [draft, data] = await Promise.all([
      getDefaultBulkEmailDraft(),
      listBulkEmailCandidates(),
    ]);
  } catch {
    return (
      <div className="space-y-4">
        <h1 className="display text-4xl text-ink">Bulk client email</h1>
        <div className="panel p-5 text-sm text-ink-soft">
          <p>
            Your account needs an email address before you can send client
            messages. Sign in with email or add one to your team profile.
          </p>
          <Link href="/clients" className="btn btn-secondary mt-4 inline-flex">
            Back to clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
            Bulk client email
          </h1>
          <p className="mt-1 text-ink-soft">
            Accounts due in {data.nextMonthLabel} or {data.monthAfterLabel}.
          </p>
        </div>
        <Link href="/clients" className="btn btn-secondary">
          Back to clients
        </Link>
      </div>

      <BulkClientEmailForm
        candidates={data.candidates}
        nextMonthLabel={data.nextMonthLabel}
        monthAfterLabel={data.monthAfterLabel}
        defaultSubject={draft.subject}
        defaultMessage={draft.messageTemplate}
        senderEmail={draft.senderEmail}
      />
    </div>
  );
}
