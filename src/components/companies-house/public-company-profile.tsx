"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  companyProfileFacts,
  daysUntil,
  formatUkDate,
  type PublicCompanyInput,
} from "@/lib/company-profile-facts";
import {
  industryHubPath,
  locationHubPath,
  shortSicLabel,
  type DirectoryCompanyLink,
} from "@/lib/company-directory";

function deadlineTone(days: number | null) {
  if (days == null) return "muted" as const;
  if (days < 0) return "overdue" as const;
  if (days <= 30) return "soon" as const;
  return "ok" as const;
}

function DeadlineTile({
  label,
  iso,
  now,
  actionHref,
  actionLabel,
  index,
}: {
  label: string;
  iso: string | null;
  now: Date;
  actionHref: string;
  actionLabel: string;
  index: number;
}) {
  const days = daysUntil(iso, now);
  const tone = deadlineTone(days);
  const dateLabel = formatUkDate(iso) ?? "Not listed";
  const countdown =
    days == null
      ? "—"
      : days < 0
        ? `${Math.abs(days)} overdue`
        : days === 0
          ? "Due today"
          : `${days} days`;

  return (
    <Link
      href={actionHref}
      className="company-deadline-tile gloss-card group relative block overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition duration-300 hover:-translate-y-1.5 hover:border-sea/40 hover:shadow-[0_22px_44px_-22px_rgba(15,118,110,0.4)]"
      style={{ animationDelay: `${0.05 + index * 0.07}s` }}
    >
      <div className="gloss-shine" aria-hidden />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
        {label}
      </p>
      <p className="display relative mt-3 text-3xl text-ink transition group-hover:text-sea-deep">
        {dateLabel}
      </p>
      <p
        className={`relative mt-2 text-sm font-semibold ${
          tone === "overdue"
            ? "text-amber-700"
            : tone === "soon"
              ? "text-sea"
              : "text-ink-soft"
        }`}
      >
        {countdown}
      </p>
      <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-sea transition group-hover:gap-2">
        {actionLabel}
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

function RelatedStream({
  heading,
  links,
}: {
  heading: string;
  links: DirectoryCompanyLink[];
}) {
  if (links.length === 0) return null;
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
        {heading}
      </h3>
      <ul className="mt-3 space-y-1">
        {links.map((c, i) => (
          <li key={c.companyNumber}>
            <Link
              href={c.href}
              className="company-related-link group flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white hover:shadow-[0_10px_28px_-18px_rgba(15,118,110,0.35)]"
              style={{ animationDelay: `${0.12 + i * 0.03}s` }}
            >
              <span className="min-w-0 font-semibold text-ink line-clamp-1 group-hover:text-sea">
                {c.title}
              </span>
              <span className="mono shrink-0 text-xs text-ink-soft transition group-hover:text-sea">
                {c.companyNumber}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicCompanyProfile({
  profile,
  similarByIndustry = [],
  similarByLocation = [],
  now = new Date(),
}: {
  profile: PublicCompanyInput;
  similarByIndustry?: DirectoryCompanyLink[];
  similarByLocation?: DirectoryCompanyLink[];
  now?: Date;
}) {
  const facts = companyProfileFacts(profile, now);
  const number = encodeURIComponent(facts.companyNumber);
  const registerUrl = `https://find-and-update.company-information.service.gov.uk/company/${number}`;
  const fileHref = `/companies-house/year-end?mode=both&company=${number}`;
  const confirmationHref = `/companies-house/confirmation-statement?company=${number}`;
  const accountsHref = `/companies-house/accounts-ixbrl?company=${number}`;
  const sicCode = profile.sic_codes?.[0] ?? null;
  const industryLabel = shortSicLabel(sicCode);
  const location = facts.location;
  const ageLabel =
    facts.ageYears == null
      ? null
      : facts.ageYears === 1
        ? "1 year on the register"
        : `${facts.ageYears} years on the register`;

  const related =
    similarByLocation.length > 0 ? similarByLocation : similarByIndustry;
  const relatedExtra =
    similarByLocation.length > 0 && similarByIndustry.length > 0
      ? similarByIndustry
      : [];

  const heroRef = useRef<HTMLElement>(null);
  const [spotlight, setSpotlight] = useState({ x: 58, y: 28 });

  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const el = heroRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setSpotlight({
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
        });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <article className="company-profile">
      <header
        ref={heroRef}
        className="company-profile-hero relative overflow-hidden border-b border-line/70"
        style={{
          background: `
            radial-gradient(ellipse 70% 55% at ${spotlight.x}% ${spotlight.y}%, rgba(15,118,110,0.16), transparent 58%),
            linear-gradient(165deg, #f4fbfa 0%, #f7f9fa 45%, #eef7f6 100%)
          `,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.32]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,118,110,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.055) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pb-14 md:pt-10">
          <nav className="text-sm text-ink-soft">
            <Link href="/" className="font-semibold text-sea hover:underline">
              Home
            </Link>
            <span className="mx-2 text-line">/</span>
            <Link
              href="/companies"
              className="font-semibold text-sea hover:underline"
            >
              Companies
            </Link>
            {location ? (
              <>
                <span className="mx-2 text-line">/</span>
                <Link
                  href={locationHubPath(location)}
                  className="font-semibold text-sea hover:underline"
                >
                  {location}
                </Link>
              </>
            ) : null}
          </nav>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.75fr)] lg:items-stretch">
            <div className="company-profile-hero-copy">
              <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                Companies House · HydraTax
              </p>
              <h1 className="display mt-4 text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight text-ink">
                {facts.companyName}
              </h1>
              <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                <span className="mono font-semibold text-ink">
                  {facts.companyNumber}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                    facts.active
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sand text-ink-soft"
                  }`}
                >
                  {facts.statusLabel}
                </span>
                {ageLabel ? <span>{ageLabel}</span> : null}
              </p>
              <p className="mt-3 max-w-xl text-base text-ink-soft">
                {[industryLabel !== "Industry" ? industryLabel : null, location]
                  .filter(Boolean)
                  .join(" · ") || "UK limited company on the public register"}
              </p>
            </div>

            <div className="company-profile-actions gloss-card relative flex flex-col justify-center overflow-hidden rounded-2xl border border-sea/25 bg-white/90 p-6 shadow-[0_20px_50px_-28px_rgba(15,118,110,0.35)]">
              <div className="gloss-shine" aria-hidden />
              <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                File with HydraTax
              </p>
              <p className="relative mt-2 text-sm text-ink-soft">
                Confirmation statement, annual accounts, or CT600 — guided from
                this company record.
              </p>
              <div className="relative mt-5 flex flex-col gap-2.5">
                <Link
                  href={fileHref}
                  className="btn btn-primary company-cta-primary inline-flex justify-center rounded-xl px-4 py-3 text-center text-sm font-bold"
                >
                  File CT600 &amp; accounts
                </Link>
                <Link
                  href={confirmationHref}
                  className="btn btn-secondary inline-flex justify-center rounded-xl px-4 py-3 text-center text-sm font-semibold transition hover:-translate-y-0.5"
                >
                  Confirmation statement
                </Link>
                <Link
                  href={accountsHref}
                  className="pt-1 text-center text-sm font-semibold text-sea transition hover:text-sea-deep"
                >
                  Accounts only →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="border-b border-line/70 bg-gradient-to-b from-white to-[#f7fbfa]">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
          <div className="mb-5">
            <h2 className="display text-2xl text-ink">Filing deadlines</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Tap a deadline to open the matching filing flow.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <DeadlineTile
              label="Accounts due"
              iso={facts.accountsDue}
              now={now}
              actionHref={accountsHref}
              actionLabel="File accounts"
              index={0}
            />
            <DeadlineTile
              label="Corporation tax (CT600)"
              iso={facts.ct600Due}
              now={now}
              actionHref={fileHref}
              actionLabel="Start CT600"
              index={1}
            />
            <DeadlineTile
              label="Confirmation statement"
              iso={facts.confirmationDate}
              now={now}
              actionHref={confirmationHref}
              actionLabel="File CS01"
              index={2}
            />
          </div>
        </div>
      </section>

      <div className="company-profile-body mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-12">
            <section className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-6 md:p-7">
              <div className="gloss-shine" aria-hidden />
              <h2 className="display relative text-3xl text-ink">
                On the register
              </h2>
              <dl className="relative mt-6 space-y-0">
                {[
                  {
                    dt: "Registered office",
                    dd: facts.address ?? "Not listed",
                  },
                  {
                    dt: "Industry (SIC)",
                    dd: sicCode
                      ? `${sicCode}${industryLabel !== "Industry" ? ` — ${industryLabel}` : ""}`
                      : "Not listed",
                    href: sicCode ? industryHubPath(sicCode) : undefined,
                  },
                  {
                    dt: "Last accounts filed",
                    dd:
                      formatUkDate(facts.lastAccountsFiled) ??
                      "None on the register",
                  },
                  {
                    dt: "Financial year end",
                    dd: formatUkDate(facts.yearEnd) ?? "Not on the register",
                  },
                  {
                    dt: "Official record",
                    dd: "Companies House",
                    href: registerUrl,
                    external: true,
                  },
                ].map((row) => (
                  <div
                    key={row.dt}
                    className="grid gap-1 border-b border-line/80 py-4 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-6"
                  >
                    <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                      {row.dt}
                    </dt>
                    <dd className="text-base text-ink">
                      {row.href ? (
                        <a
                          href={row.href}
                          className="font-semibold text-sea transition hover:text-sea-deep hover:underline"
                          {...(row.external
                            ? { rel: "noreferrer", target: "_blank" }
                            : {})}
                        >
                          {row.dd}
                          {row.external ? " ↗" : ""}
                        </a>
                      ) : (
                        row.dd
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="max-w-2xl">
              <h2 className="display text-3xl text-ink">
                When are {facts.companyName}&apos;s filings due?
              </h2>
              <div className="mt-5 space-y-4 text-[1.05rem] leading-relaxed text-ink-soft">
                <p>
                  {facts.companyName}&apos;s next accounts are due by{" "}
                  <strong className="text-ink">
                    {formatUkDate(facts.accountsDue) ??
                      "the Companies House due date"}
                  </strong>
                  . The CT600 for the year ending{" "}
                  <strong className="text-ink">
                    {formatUkDate(facts.yearEnd) ?? "the current year"}
                  </strong>{" "}
                  is due by{" "}
                  <strong className="text-ink">
                    {formatUkDate(facts.ct600Due) ??
                      "12 months after that year end"}
                  </strong>
                  .
                </p>
                <p>
                  File the confirmation statement, accounts, or corporation tax
                  return for {facts.companyName} ({facts.companyNumber}) through
                  HydraTax — one guided flow to Companies House and HMRC.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href={fileHref}
                  className="btn btn-primary company-cta-primary text-sm"
                >
                  Start filing
                </Link>
                <Link href="/companies" className="btn btn-secondary text-sm">
                  Search another company
                </Link>
              </div>
            </section>
          </div>

          <aside className="space-y-8">
            {(sicCode || location) && (
              <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,118,110,0.3)]">
                <div className="gloss-shine" aria-hidden />
                <h2 className="display relative text-2xl text-ink">
                  Explore nearby
                </h2>
                <p className="relative mt-2 text-sm text-ink-soft">
                  Jump to other companies in the same trade or town.
                </p>
                <div className="relative mt-4 flex flex-col gap-2">
                  {sicCode ? (
                    <Link
                      href={industryHubPath(sicCode)}
                      className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-3 transition hover:border-sea/25 hover:bg-sea/5"
                    >
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-sea">
                          Industry
                        </span>
                        <span className="mt-0.5 block font-semibold text-ink group-hover:text-sea">
                          {industryLabel}
                        </span>
                      </span>
                      <span
                        className="text-sea transition group-hover:translate-x-0.5"
                        aria-hidden
                      >
                        →
                      </span>
                    </Link>
                  ) : null}
                  {location ? (
                    <Link
                      href={locationHubPath(location)}
                      className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-3 transition hover:border-sea/25 hover:bg-sea/5"
                    >
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-sea">
                          Location
                        </span>
                        <span className="mt-0.5 block font-semibold text-ink group-hover:text-sea">
                          {location}
                        </span>
                      </span>
                      <span
                        className="text-sea transition group-hover:translate-x-0.5"
                        aria-hidden
                      >
                        →
                      </span>
                    </Link>
                  ) : null}
                </div>
              </div>
            )}

            <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5">
              <RelatedStream
                heading={
                  location
                    ? `Also registered in ${location}`
                    : "Related on the register"
                }
                links={related}
              />
              {relatedExtra.length > 0 ? (
                <div className="mt-8 border-t border-line/80 pt-6">
                  <RelatedStream
                    heading={`More ${industryLabel.toLowerCase()} companies`}
                    links={relatedExtra}
                  />
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}
