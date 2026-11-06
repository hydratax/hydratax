import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import {
  getDefaultBulkEmailDraft,
  getDefaultSaBulkEmailDraft,
  getDefaultVatBulkEmailDraft,
  listBulkEmailCandidates,
  listBulkSaEmailCandidates,
  listBulkVatEmailCandidates,
} from "@/server/actions/client-communications";
import { BulkClientEmailForm } from "@/components/forms/bulk-client-email";
import { BulkVatEmailForm } from "@/components/forms/bulk-vat-email";
import { formatDueShort } from "@/lib/filing-due";

type Props = {
  searchParams: Promise<{ desk?: string }>;
};

export default async function BulkClientEmailPage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const desk = sp.desk === "sa" || sp.desk === "vat" ? sp.desk : "accounts";
  const backHref =
    desk === "sa"
      ? "/clients?desk=sa"
      : desk === "vat"
        ? "/clients?desk=vat"
        : "/clients";
  const backLabel =
    desk === "sa"
      ? "Back to Self Assessment"
      : desk === "vat"
        ? "Back to VAT"
        : "Back";

  if (session.role === "readonly") redirect(backHref);

  try {
    if (desk === "sa") {
      const [draft, data] = await Promise.all([
        getDefaultSaBulkEmailDraft(),
        listBulkSaEmailCandidates(),
      ]);
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
                Self Assessment
              </p>
              <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
                Bulk email
              </h1>
              <p className="mt-1 text-ink-soft">
                Tax year {data.taxYear} · file online by{" "}
                {formatDueShort(data.filingDue) ?? data.filingDue}.
              </p>
            </div>
            <Link href={backHref} className="btn btn-secondary">
              {backLabel}
            </Link>
          </div>

          <BulkClientEmailForm
            mode="sa"
            candidates={data.candidates}
            taxYear={data.taxYear}
            filingDue={data.filingDue}
            defaultSubject={draft.subject}
            defaultMessage={draft.messageTemplate}
            senderEmail={draft.senderEmail}
          />
        </div>
      );
    }

    if (desk === "vat") {
      const [draft, data] = await Promise.all([
        getDefaultVatBulkEmailDraft(),
        listBulkVatEmailCandidates(),
      ]);
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
                VAT
              </p>
              <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
                Bulk email
              </h1>
              <p className="mt-1 text-ink-soft">
                Monthly list for quarterly VAT return reminders.
              </p>
            </div>
            <Link href={backHref} className="btn btn-secondary">
              {backLabel}
            </Link>
          </div>

          <BulkVatEmailForm
            candidates={data.candidates}
            months={data.months}
            defaultSubject={draft.subject}
            defaultMessage={draft.messageTemplate}
            senderEmail={draft.senderEmail}
          />
        </div>
      );
    }

    const [draft, data] = await Promise.all([
      getDefaultBulkEmailDraft(),
      listBulkEmailCandidates(),
    ]);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
              Companies
            </p>
            <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
              Bulk email
            </h1>
            <p className="mt-1 text-ink-soft">
              Accounts due in {data.nextMonthLabel} or {data.monthAfterLabel}.
            </p>
          </div>
          <Link href={backHref} className="btn btn-secondary">
            {backLabel}
          </Link>
        </div>

        <BulkClientEmailForm
          mode="accounts"
          candidates={data.candidates}
          nextMonthLabel={data.nextMonthLabel}
          monthAfterLabel={data.monthAfterLabel}
          defaultSubject={draft.subject}
          defaultMessage={draft.messageTemplate}
          senderEmail={draft.senderEmail}
        />
      </div>
    );
  } catch {
    return (
      <div className="space-y-4">
        <h1 className="display text-4xl text-ink">Bulk email</h1>
        <div className="panel p-5 text-sm text-ink-soft">
          <p>
            Your account needs an email address before you can send client
            messages. Sign in with email or add one to your team profile.
          </p>
          <Link href={backHref} className="btn btn-secondary mt-4 inline-flex">
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }
}
