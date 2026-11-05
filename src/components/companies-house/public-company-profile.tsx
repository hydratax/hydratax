import Link from "next/link";
import {
  companyProfileFacts,
  daysUntil,
  formatUkDate,
  type PublicCompanyInput,
} from "@/lib/company-profile-facts";

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-4">
      <p className="display text-lg text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </p>
    </div>
  );
}

function DueCard({
  iso,
  label,
  now,
}: {
  iso: string | null;
  label: string;
  now: Date;
}) {
  const days = daysUntil(iso, now);
  const overdue = days != null && days < 0;
  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-6 text-center">
      <p className="display text-5xl text-ink">
        {days == null ? "—" : Math.abs(days)}
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
        {overdue ? "Days overdue" : "Days"}
      </p>
      <p className="mt-3 font-semibold text-ink">{label}</p>
      <p className="text-sm text-ink-soft">{formatUkDate(iso) ?? "Not on the register"}</p>
    </div>
  );
}

export function PublicCompanyProfile({
  profile,
  now = new Date(),
}: {
  profile: PublicCompanyInput;
  now?: Date;
}) {
  const facts = companyProfileFacts(profile, now);
  const number = encodeURIComponent(facts.companyNumber);
  const registerUrl = `https://find-and-update.company-information.service.gov.uk/company/${number}`;
  const fileHref = `/companies-house/year-end?mode=both&company=${number}`;
  const confirmationHref = `/companies-house/confirmation-statement?company=${number}`;

  return (
    <article>
      <nav className="text-sm text-ink-soft">
        <Link href="/" className="font-semibold text-sea">
          Home
        </Link>
        <span> / </span>
        <Link href="/companies-house" className="font-semibold text-sea">
          Companies House
        </Link>
        <span> / </span>
        <span className="text-ink">{facts.companyName}</span>
      </nav>

      <h1 className="display mt-4 text-4xl text-ink md:text-5xl">{facts.companyName}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mono text-sm text-ink-soft">{facts.companyNumber}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
            facts.active ? "bg-emerald-100 text-emerald-800" : "bg-sand text-ink-soft"
          }`}
        >
          {facts.statusLabel}
        </span>
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Company age"
          value={facts.ageYears == null ? "—" : `${facts.ageYears} years`}
        />
        <Stat label="Status" value={facts.statusLabel} />
        <Stat label="Industry" value={facts.sic ?? "—"} />
        <Stat label="Location" value={facts.location ?? "—"} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <DueCard iso={facts.accountsDue} label="Accounts due" now={now} />
        <DueCard iso={facts.ct600Due} label="CT600 due" now={now} />
        <div className="flex flex-col justify-center rounded-2xl border border-line bg-white px-5 py-6">
          <h2 className="text-lg font-semibold text-ink">Is this your company?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            File the Company Tax Return and the accounts for {facts.companyName} from
            the Companies House dates on this page.
          </p>
          <Link href={fileHref} className="btn btn-primary mt-4 inline-flex">
            Start filing
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold text-ink">Key dates</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-ink">Last accounts filed</dt>
              <dd className="text-ink-soft">
                {formatUkDate(facts.lastAccountsFiled) ?? "None on the register"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Confirmation statement</dt>
              <dd className="text-ink-soft">
                {formatUkDate(facts.confirmationDate) ?? "Not on the register"}
                {facts.confirmationDate && (
                  <span className="ml-2 rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-ink">
                    {(() => {
                      const days = daysUntil(facts.confirmationDate, now);
                      if (days == null) return null;
                      if (days < 0) return `${Math.abs(days)} days overdue`;
                      return `${days} days`;
                    })()}
                  </span>
                )}
              </dd>
              <dd className="mt-1">
                <Link href={confirmationHref} className="font-semibold text-sea">
                  File the confirmation statement
                </Link>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Financial year end</dt>
              <dd className="text-ink-soft">
                {formatUkDate(facts.yearEnd) ?? "Not on the register"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold text-ink">Official records</h2>
          {facts.address && (
            <p className="mt-3 text-sm text-ink-soft">{facts.address}</p>
          )}
          <a
            href={registerUrl}
            className="mt-4 inline-flex font-semibold text-sea"
            rel="noreferrer"
            target="_blank"
          >
            View on Companies House
          </a>
        </section>
      </div>

      <section className="mt-8 max-w-3xl space-y-3 text-sm text-ink-soft">
        <h2 className="text-lg font-semibold text-ink">
          When are {facts.companyName}&apos;s accounts due?
        </h2>
        <p>
          {facts.companyName}&apos;s next accounts are due by{" "}
          {formatUkDate(facts.accountsDue) ?? "the date on the Companies House register"}
          . The Company Tax Return (CT600) for the year ending{" "}
          {formatUkDate(facts.yearEnd) ?? "the current year"} is due by{" "}
          {formatUkDate(facts.ct600Due) ?? "12 months after that year end"}.
        </p>
        <p>
          {facts.companyName} ({facts.companyNumber}) is {facts.statusLabel.toLowerCase()}{" "}
          on the Companies House register
          {facts.location ? `, registered in ${facts.location}` : ""}.
          {facts.sic ? ` The recorded SIC code is ${facts.sic}.` : ""}
        </p>
      </section>
    </article>
  );
}
