"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STEPS = [
  {
    id: "enter",
    label: "1 Enter",
    title: "Pick the company & period",
    body: "Open the limited company from your practice desk, choose the accounting period, and pull P&L and balance sheet figures from integer-pence books — ready for CT600.",
    preview: {
      heading: "CT600 · company selected",
      rows: [
        ["Company", "Northbridge Studio Ltd"],
        ["UTR", "••••••••••"],
        ["Period", "1 Apr 2025 – 31 Mar 2026"],
        ["Source", "Digital books (pence)"],
      ],
      success: false,
    },
  },
  {
    id: "review",
    label: "2 Review",
    title: "Check CT600 totals before you commit",
    body: "HydraTax validates the Corporation Tax figures with Zod, shows turnover, expenses and tax payable clearly, and blocks incomplete fraud-prevention metadata before you file.",
    preview: {
      heading: "CT600 draft ready",
      rows: [
        ["Turnover", "£248,000.00"],
        ["Expenses", "£161,400.00"],
        ["Taxable profit", "£86,600.00"],
        ["Fraud headers", "Complete"],
      ],
      success: false,
    },
  },
  {
    id: "submit",
    label: "3 Submit",
    title: "File CT600 straight to HMRC",
    body: "Submit the CT Online XML with one deliberate click. Track acceptance and keep an immutable audit receipt on the client file.",
    preview: {
      heading: "CT600 filed",
      rows: [
        ["Company", "Northbridge Studio Ltd"],
        ["UTR", "••••••••••"],
        ["Period ending", "31 March 2026"],
        ["Status", "Accepted"],
      ],
      success: true,
    },
  },
] as const;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = STEPS[active];

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(
      () => setActive((i) => (i + 1) % STEPS.length),
      4500,
    );
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section
      id="how-it-works"
      className="border-t border-line bg-white/80 py-16 md:py-20"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="display text-3xl text-ink md:text-5xl">How it works</h2>
          <p className="mt-3 text-ink-soft">
            Three steps from company books to an accepted CT600.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                active === i
                  ? "bg-sea text-white shadow-[0_10px_24px_-12px_rgba(15,118,110,0.8)]"
                  : "border border-line bg-white text-ink-soft hover:border-sea/40 hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-4 h-1 max-w-xs overflow-hidden rounded-full bg-mist">
          <div
            key={active}
            className="h-full bg-sea"
            style={{
              animation: paused ? undefined : "progress-fill 4.5s linear",
              width: paused
                ? `${((active + 1) / STEPS.length) * 100}%`
                : undefined,
            }}
          />
        </div>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="animate-slide-swap lg:pt-1" key={step.id + "-copy"}>
            <h3 className="display text-3xl text-ink md:text-4xl">
              {step.title}
            </h3>
            <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft">
              {step.body}
            </p>
            <Link href="/create-account" className="btn btn-primary mt-6">
              Start filing with Hydra
            </Link>
          </div>

          <div
            className="how-preview-card relative overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-[0_28px_60px_-36px_rgba(10,10,10,0.4)] lg:min-h-[320px]"
            key={step.id + "-preview"}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sea via-teal-400 to-accent" />
            {step.preview.success && (
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ok/12 text-xl font-semibold text-ok">
                ✓
              </div>
            )}
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
              Corporation Tax · CT600
            </p>
            <p className="display mt-2 text-2xl text-ink md:text-3xl">
              {step.preview.heading}
            </p>
            <dl className="mt-5 space-y-0">
              {step.preview.rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-line/70 py-3 last:border-0"
                >
                  <dt className="text-sm text-ink-soft">{label}</dt>
                  <dd
                    className={`text-right text-base font-semibold tracking-tight ${
                      value === "Accepted" || value === "Complete"
                        ? "text-ok"
                        : "how-preview-value text-ink"
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {step.preview.success && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary text-sm">
                  Download PDF
                </button>
                <Link href="/create-account" className="btn btn-primary text-sm">
                  Done
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
