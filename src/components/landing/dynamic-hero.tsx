"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const FILINGS = [
  { name: "VAT return", period: "Q3 2025", state: "Ready to file" },
  { name: "Corporation Tax", period: "Year ended 31 Mar 2025", state: "In progress" },
  { name: "PAYE · FPS", period: "Due this Friday", state: "Queued" },
  { name: "Self Assessment", period: "Tax year 2024–25", state: "Open" },
] as const;

export function DynamicHero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % FILINGS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="hero-lumen relative overflow-x-clip">
      <div className="hero-lumen__grid" aria-hidden />
      <div className="hero-lumen__aurora" aria-hidden />
      <div className="hero-lumen__beam" aria-hidden />

      <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-6xl items-center gap-14 px-4 pb-20 pt-36 md:px-6 md:pt-32 lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-16">
        <div className="max-w-xl">
          <p className="animate-rise hero-lumen__brand display text-[clamp(2.85rem,7.5vw,4.85rem)] font-semibold leading-[1.05] tracking-tight text-ink">
            HydraTax
          </p>
          <h1 className="animate-rise-delay mt-5 text-[clamp(1.4rem,3.2vw,1.95rem)] font-semibold leading-snug tracking-tight text-ink">
            File UK tax online —{" "}
            <span className="text-sea">clear, calm, and easy</span>
          </h1>
          <p className="animate-rise-late mt-4 max-w-md text-base leading-relaxed text-ink-soft md:text-[1.05rem]">
            Built for limited companies, sole traders, and anyone who wants
            HMRC filing without the complexity. VAT, Corporation Tax, PAYE and
            Self Assessment in one workspace.
          </p>

          <div className="animate-rise-late mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/create-account"
              className="btn btn-primary w-full justify-center sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              href="/pricing"
              className="btn btn-secondary w-full justify-center sm:w-auto"
            >
              See pricing
            </Link>
          </div>

          <p className="animate-rise-late mt-8 text-sm text-ink-soft">
            VAT · Corporation Tax · PAYE · Self Assessment
          </p>
        </div>

        <div className="hero-lumen__preview animate-rise-late" aria-hidden>
          <div className="hero-lumen__preview-bar">
            <span className="hero-lumen__preview-dots" />
            <span className="hero-lumen__preview-title">Your filings</span>
          </div>
          <ul className="hero-lumen__preview-list">
            {FILINGS.map((row, i) => (
              <li
                key={row.name}
                className={
                  i === active
                    ? "hero-lumen__preview-row is-active"
                    : "hero-lumen__preview-row"
                }
              >
                <div>
                  <p className="hero-lumen__preview-name">{row.name}</p>
                  <p className="hero-lumen__preview-period">{row.period}</p>
                </div>
                <span className="hero-lumen__preview-state">{row.state}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
