"use client";

import Link from "next/link";
import {
  SECRETARIAL_CATEGORY_LABELS,
  SECRETARIAL_FILING_OPTIONS,
  type SecretarialFilingOption,
} from "@/lib/company-secretarial";

function filingHref(
  option: SecretarialFilingOption,
  companyNumber: string | null,
  clientId: string,
): string | null {
  if (!option.href) return null;
  if (option.href.startsWith("/filings/") || !companyNumber) {
    if (option.href.startsWith("/filings/confirmation-statement")) {
      return `/filings/confirmation-statement/${clientId}`;
    }
    return option.href;
  }
  const params = new URLSearchParams({
    company: companyNumber,
    clientId,
  });
  return `${option.href}?${params.toString()}`;
}

export function SecretarialFilingGrid({
  companyNumber,
  clientId,
}: {
  companyNumber: string | null;
  clientId: string;
}) {
  const categories = (
    Object.keys(SECRETARIAL_CATEGORY_LABELS) as Array<
      SecretarialFilingOption["category"]
    >
  ).map((category) => ({
    category,
    label: SECRETARIAL_CATEGORY_LABELS[category],
    options: SECRETARIAL_FILING_OPTIONS.filter((o) => o.category === category),
  }));

  return (
    <div className="space-y-10">
      {categories.map((group) => (
        <section key={group.category}>
          <h2 className="display text-2xl text-ink">{group.label}</h2>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.options.map((option) => {
              const href = filingHref(option, companyNumber, clientId);
              const inner = (
                <>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sea">
                    Companies House
                  </p>
                  <p className="display mt-2 text-lg leading-snug text-ink">
                    {option.title}
                  </p>
                  <p className="mt-2 text-sm leading-snug text-ink-soft">
                    {option.summary}
                  </p>
                </>
              );

              if (href) {
                return (
                  <Link
                    key={option.id}
                    href={href}
                    className="panel panel-interactive flex h-full flex-col p-4 transition hover:border-sea/40"
                  >
                    {inner}
                  </Link>
                );
              }

              return (
                <div
                  key={option.id}
                  className="panel flex h-full flex-col p-4"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
