"use client";

import { useMemo, useState } from "react";
import {
  ALL_RATES,
  type TaxDomain,
} from "@/lib/hmrc-rulebook/rates";
import {
  DOMAIN_LABEL,
  faqsForDomain,
  type RuleFaq,
} from "@/lib/hmrc-rulebook/faqs";

const DOMAINS: Array<TaxDomain | "all"> = [
  "all",
  "ct",
  "vat",
  "sa",
  "paye",
  "ni",
];

export function HmrcRulebookPanel() {
  const [domain, setDomain] = useState<TaxDomain | "all">("all");
  const [q, setQ] = useState("");

  const rates = useMemo(() => {
    const list =
      domain === "all" ? ALL_RATES : ALL_RATES.filter((r) => r.domain === domain);
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (r) =>
        r.label.toLowerCase().includes(needle) ||
        r.value.toLowerCase().includes(needle) ||
        (r.detail ?? "").toLowerCase().includes(needle),
    );
  }, [domain, q]);

  const faqs = useMemo(() => {
    let list: RuleFaq[] = faqsForDomain(domain);
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (f) =>
        f.question.toLowerCase().includes(needle) ||
        f.answer.toLowerCase().includes(needle),
    );
  }, [domain, q]);

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-5">
        <p className="text-sm text-ink-soft">
          HydraTax calculates tax using these HMRC figures so accountants are not
          left blanking boxes. Every entry cites GOV.UK — refresh this book when
          Budget or April updates land. Calculations in CT600, year-end accounts,
          VAT, PAYE and SA must follow these rates, not invented shortcuts.
        </p>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((d) => (
            <button
              key={d}
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                domain === d
                  ? "bg-ink text-white"
                  : "bg-sand text-ink-soft hover:text-ink"
              }`}
              onClick={() => setDomain(d)}
            >
              {d === "all" ? "All domains" : DOMAIN_LABEL[d]}
            </button>
          ))}
        </div>
        <label className="block max-w-md">
          <span className="label">Search rates &amp; FAQs</span>
          <input
            className="input mt-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. marginal relief, 1257L, flat rate…"
          />
        </label>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-sand/60 px-4 py-3">
          <h2 className="font-semibold text-ink">Rates &amp; thresholds</h2>
        </div>
        <ul className="divide-y divide-line">
          {rates.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{r.label}</p>
                <p className="mono text-sea">{r.value}</p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-ink-soft">
                {DOMAIN_LABEL[r.domain]}
                {r.period ? ` · ${r.period}` : ""}
              </p>
              {r.detail ? (
                <p className="mt-1 text-ink-soft">{r.detail}</p>
              ) : null}
              <a
                href={r.source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-semibold text-sea"
              >
                {r.source.title} →
              </a>
            </li>
          ))}
          {rates.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-soft">No rates match.</li>
          ) : null}
        </ul>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-sand/60 px-4 py-3">
          <h2 className="font-semibold text-ink">FAQs by domain</h2>
        </div>
        <ul className="divide-y divide-line">
          {faqs.map((f) => (
            <li key={f.id} className="px-4 py-4 text-sm">
              <p className="text-xs font-bold uppercase text-ink-soft">
                {DOMAIN_LABEL[f.domain]}
              </p>
              <h3 className="mt-1 font-semibold text-ink">{f.question}</h3>
              <p className="mt-2 text-ink-soft">{f.answer}</p>
              {f.sourceUrl ? (
                <a
                  href={f.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-sea"
                >
                  Official GOV.UK source →
                </a>
              ) : null}
            </li>
          ))}
          {faqs.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-soft">No FAQs match.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
