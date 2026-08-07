"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SERVICES = [
  {
    id: "vat",
    title: "MTD VAT",
    tagline: "Obligations → boxes → submit",
    summary:
      "Draft returns from the client ledger, review the nine boxes, and file with mandatory fraud-prevention headers.",
    points: [
      "Auto-map income & expenses to VAT boxes",
      "Sandbox and production HMRC endpoints",
      "Acceptance receipts in the audit trail",
    ],
  },
  {
    id: "ct600",
    title: "CT600",
    tagline: "Corporation Tax without the panic",
    summary:
      "Capture P&L and balance sheet in pence, build CT Online XML, and submit with a clear acceptance state.",
    points: [
      "Micro-entity friendly data entry",
      "Taxable profit computed in integer pence",
      "Correlation ID stored for the file",
    ],
  },
  {
    id: "paye",
    title: "PAYE / RTI",
    tagline: "Payroll that files on payday",
    summary:
      "Run monthly pay, calculate PAYE & NI in pence, and push FPS — plus EPS when there’s nothing to pay.",
    points: [
      "Employee records per client employer",
      "FPS on every payday",
      "EPS for no-payment periods",
    ],
  },
  {
    id: "sa",
    title: "Self Assessment",
    tagline: "Sole trader MTD updates",
    summary:
      "Quarterly digital records from the same books — validated before they ever hit the HMRC gateway.",
    points: [
      "Turnover & expenses from the ledger",
      "Zod-checked statutory payloads",
      "Sandbox or production ITSA submit",
    ],
  },
] as const;

export function ServiceCards() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = SERVICES[active];

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % SERVICES.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section
      id="services"
      className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Hydra rails
        </p>
        <h2 className="display mt-2 text-3xl text-ink md:text-5xl">
          Four filing heads. One practice body.
        </h2>
        <p className="mt-3 text-ink-soft">
          Gloss through the rails Hydra keeps awake for every client — hover to
          pause the slider, click to lock a head.
        </p>
      </div>

      <div className="gloss-track mt-10 flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory">
        {SERVICES.map((service, i) => {
          const selected = i === active;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => setActive(i)}
              className={`gloss-card snap-start relative min-w-[260px] flex-1 overflow-hidden rounded-xl border p-5 text-left transition duration-300 md:min-w-0 ${
                selected
                  ? "border-sea scale-[1.03] shadow-[0_22px_50px_-28px_rgba(15,118,110,0.65)]"
                  : "border-line bg-white/70 hover:-translate-y-1"
              }`}
            >
              <div className="gloss-shine" aria-hidden />
              <p className="mono text-xs font-semibold uppercase tracking-wide text-sea">
                {service.id}
              </p>
              <h3 className="display mt-2 text-2xl text-ink">{service.title}</h3>
              <p className="mt-1 text-sm font-medium text-ink-soft">
                {service.tagline}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft/90">
                {service.summary}
              </p>
            </button>
          );
        })}
      </div>

      <div className="gloss-card panel mt-6 flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div key={current.id} className="animate-slide-swap">
          <p className="display text-2xl text-ink">{current.title} in practice</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
            {current.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="text-sea">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <Link href="/pricing" className="btn btn-primary shrink-0">
          See {current.title} pricing
        </Link>
      </div>
    </section>
  );
}
