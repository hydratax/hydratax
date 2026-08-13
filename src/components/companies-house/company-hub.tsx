import Link from "next/link";
import type { ReactNode } from "react";
import {
  filingUrgency,
  formatAddress,
  formatDueLabel,
} from "@/lib/ch-deadlines";
import type { ChOfficer, ChPsc } from "@/server/companies-house/api";

type Profile = {
  company_number: string;
  company_name: string;
  company_status?: string;
  type?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: Record<string, string | undefined>;
  confirmation_statement?: { next_due?: string };
  accounts?: { next_due?: string };
};

const OTHER_SERVICES = [
  {
    id: "appoint-director",
    title: "Add director",
    blurb: "Appoint a new director with personal code.",
  },
  {
    id: "resign-director",
    title: "Remove director",
    blurb: "File a director resignation (TM01).",
  },
  {
    id: "change-of-name",
    title: "Change company name",
    blurb: "Propose a new name on the register.",
  },
  {
    id: "dissolve-company",
    title: "Dissolve company",
    blurb: "Apply for voluntary strike-off when eligible.",
  },
] as const;

/** Companies House nature codes → readable shareholding line */
function formatShareholding(natures?: string[]): string {
  if (!natures?.length) return "Shareholding not stated";
  const ownership = natures.filter((n) =>
    n.toLowerCase().startsWith("ownership-of-shares"),
  );
  const source = ownership.length ? ownership : natures;
  return source
    .map((n) =>
      n
        .replace(/^ownership-of-shares-/i, "Ownership of shares ")
        .replace(/^voting-rights-/i, "Voting rights ")
        .replace(/^right-to-/i, "Right to ")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\bTo\b/g, "to")
        .replace(/\bOf\b/g, "of")
        .replace(/\bAnd\b/g, "and"),
    )
    .join(" · ");
}

function DeadlineCard({
  title,
  nextDue,
  href,
  cta,
  action,
}: {
  title: string;
  nextDue?: string;
  href?: string;
  cta?: string;
  action?: ReactNode;
}) {
  const urgency = filingUrgency(nextDue);
  const attention = urgency === "attention";

  return (
    <article
      className={`flex flex-col rounded-2xl border p-5 shadow-sm ${
        attention
          ? "border-red-300/80 bg-gradient-to-br from-red-50 to-white"
          : "border-emerald-300/70 bg-gradient-to-br from-emerald-50 to-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="display text-xl text-ink">{title}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
            attention
              ? "bg-red-600 text-white"
              : "bg-emerald-600 text-white"
          }`}
        >
          {attention ? "Action needed" : "On track"}
        </span>
      </div>
      <p
        className={`mt-3 text-sm font-semibold ${
          attention ? "text-red-700" : "text-emerald-800"
        }`}
      >
        {formatDueLabel(nextDue)}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {attention
          ? "Deadline is due, overdue, or within 30 days."
          : "More than 30 days until the next due date."}
      </p>
      <div className="mt-auto pt-5">
        {action ? (
          action
        ) : href && cta ? (
          <Link
            href={href}
            className={`btn w-full justify-center ${
              attention ? "btn-primary" : "btn-secondary"
            }`}
          >
            {cta}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function CompanyHub({
  profile,
  officers,
  pscs,
  registerUrl,
}: {
  profile: Profile;
  officers: ChOfficer[];
  pscs: ChPsc[];
  registerUrl: string;
}) {
  const number = profile.company_number;
  const office = formatAddress(profile.registered_office_address);
  const activeOfficers = officers.filter((o) => !o.resigned_on);
  const currentPscs = pscs.filter((p) => !p.ceased && !p.ceased_on);

  return (
    <div className="space-y-10">
      <header className="rounded-3xl border border-line bg-white px-6 py-8 shadow-sm md:px-10 md:py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sea">
          Company hub
        </p>
        <h1 className="display mt-2 text-3xl text-ink sm:text-4xl md:text-5xl">
          {profile.company_name}
        </h1>
        <p className="mono mt-3 text-sm text-ink-soft">
          {number}
          {profile.company_status ? ` · ${profile.company_status}` : ""}
          {profile.date_of_creation
            ? ` · formed ${profile.date_of_creation}`
            : ""}
        </p>
        {office && (
          <p className="mt-3 max-w-2xl text-sm text-ink-soft">{office}</p>
        )}
        {profile.sic_codes?.length ? (
          <p className="mt-2 text-sm text-ink-soft">
            SIC: {profile.sic_codes.join(", ")}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/companies-house" className="btn btn-secondary text-sm">
            ← Search again
          </Link>
          <a
            href={registerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary text-sm"
          >
            View on Companies House
          </a>
        </div>
      </header>

      <section>
        <h2 className="display text-2xl text-ink">Filing deadlines</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Red means due or overdue (or within 30 days). Green means on track.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <DeadlineCard
            title="Confirmation statement"
            nextDue={profile.confirmation_statement?.next_due}
            href={`/companies-house/confirmation-statement?company=${encodeURIComponent(number)}`}
            cta="File confirmation statement"
          />
          <DeadlineCard
            title="Annual accounts"
            nextDue={profile.accounts?.next_due}
            href={`/companies-house/accounts-ixbrl?company=${encodeURIComponent(number)}`}
            cta="File Accounts"
          />
        </div>
      </section>

      <section>
        <h2 className="display text-2xl text-ink">Other filings</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Open a request form with this company number pre-filled.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OTHER_SERVICES.map((s) => {
            const qs = new URLSearchParams({
              company: number,
              name: profile.company_name,
            });
            return (
              <Link
                key={s.id}
                href={`/companies-house/${s.id}?${qs.toString()}`}
                className="group flex flex-col rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:border-sea hover:shadow-md"
              >
                <h3 className="font-semibold text-ink group-hover:text-sea">
                  {s.title}
                </h3>
                <p className="mt-2 flex-1 text-sm text-ink-soft">{s.blurb}</p>
                <span className="mt-4 text-sm font-semibold text-sea">
                  Open form →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">
            Directors / officers ({activeOfficers.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {activeOfficers.slice(0, 12).map((o) => (
              <li
                key={`${o.name}-${o.appointed_on}`}
                className="rounded-lg border border-line/80 bg-sand/40 px-3 py-2"
              >
                <p className="font-semibold text-ink">{o.name}</p>
                <p className="text-xs text-ink-soft">
                  {o.officer_role}
                  {o.appointed_on ? ` · appointed ${o.appointed_on}` : ""}
                </p>
              </li>
            ))}
            {!activeOfficers.length && (
              <li className="text-ink-soft">No active officers returned.</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">
            Current shareholders ({currentPscs.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {currentPscs.map((p, i) => (
              <li
                key={`${p.name}-${i}`}
                className="rounded-lg border border-line/80 bg-sand/40 px-3 py-2"
              >
                <p className="font-semibold text-ink">
                  {p.name ?? "Name protected / unavailable"}
                </p>
                <p className="text-xs text-ink-soft">
                  {formatShareholding(p.natures_of_control)}
                </p>
              </li>
            ))}
            {!currentPscs.length && (
              <li className="text-ink-soft">
                No current shareholders on the PSC register.
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
