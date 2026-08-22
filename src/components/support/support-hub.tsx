"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  SUPPORT_ARTICLES,
  SUPPORT_CATEGORIES,
  popularArticles,
  searchArticles,
} from "@/lib/support-content";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export function SupportHub() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchArticles(query), [query]);
  const popular = popularArticles();

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl bg-ink px-6 py-12 text-white md:px-10 md:py-16">
        <div className="pointer-events-none absolute -right-10 top-0 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl animate-float" />
        <div className="pointer-events-none absolute -left-8 bottom-0 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl animate-float-delayed" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-300/80">
            Hydra Support
          </p>
          <h1 className="display mt-3 text-4xl md:text-5xl">
            Answers for every head of the practice
          </h1>
          <p className="mt-3 text-white/65">
            Search guides for CT600, MTD VAT, Self Assessment, payroll, and HMRC
            connection issues — written for accountants using HydraTax.
          </p>
          <label className="mt-8 block">
            <span className="sr-only">Search support</span>
            <input
              className="input border-0 bg-white/95 text-ink shadow-lg"
              placeholder="Describe your issue, question, or idea…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      </section>

      {query.trim() ? (
        <section>
          <h2 className="display text-2xl text-ink">
            Results ({results.length})
          </h2>
          <ul className="mt-4 grid gap-3">
            {results.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/support/${a.slug}`}
                  className="gloss-card panel panel-interactive block p-5"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-sea">
                    {SUPPORT_CATEGORIES.find((c) => c.id === a.category)?.title}
                  </p>
                  <h3 className="mt-1 font-semibold text-ink">{a.title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{a.summary}</p>
                </Link>
              </li>
            ))}
            {results.length === 0 && (
              <li className="panel p-6 text-ink-soft">
                No articles match that search. Try “CT600”, “VAT”, “FPS”, or
                “authentication”.
              </li>
            )}
          </ul>
        </section>
      ) : (
        <>
          <section>
            <h2 className="display text-3xl text-ink">Browse by topic</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SUPPORT_CATEGORIES.map((cat) => {
                const count = SUPPORT_ARTICLES.filter(
                  (a) => a.category === cat.id,
                ).length;
                return (
                  <Link
                    key={cat.id}
                    href={`/support/category/${cat.id}`}
                    className="gloss-card panel panel-interactive block p-5"
                  >
                    <h3 className="display text-xl text-ink">{cat.title}</h3>
                    <p className="mt-2 text-sm text-ink-soft">{cat.blurb}</p>
                    <p className="mt-3 text-xs font-semibold text-sea">
                      {count} articles →
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="display text-3xl text-ink">Popular right now</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {popular.map((a) => (
                <Link
                  key={a.slug}
                  href={`/support/${a.slug}`}
                  className="gloss-card panel panel-interactive block p-5"
                >
                  <h3 className="font-semibold text-ink">{a.title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{a.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="panel gloss-card p-6 md:flex md:items-center md:justify-between md:gap-6">
        <div>
          <h2 className="display text-2xl text-ink">Still stuck?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Send the client name, filing type, period, and correlation ID from
            the audit trail — Hydra support can move faster with those details.
          </p>
        </div>
        <a
          href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=HydraTax%20support`}
          className="btn btn-primary mt-4 shrink-0 md:mt-0"
        >
          Email support
        </a>
      </section>
    </div>
  );
}
