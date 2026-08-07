"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const SLIDES = [
  {
    rail: "VAT",
    title: "Nine boxes from one ledger",
    detail: "Prepare → review → submit with fraud headers locked in.",
  },
  {
    rail: "CT600",
    title: "Corporation Tax without portal-hopping",
    detail: "Pence-perfect figures, XML built, acceptance on the audit chain.",
  },
  {
    rail: "PAYE",
    title: "FPS that ships on payday",
    detail: "Employees, pay runs, and RTI from the same client workspace.",
  },
  {
    rail: "SA",
    title: "Sole-trader updates that stay digital",
    detail: "Quarterly records drawn from books — validated before HMRC.",
  },
] as const;

export function DynamicHero() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const slide = SLIDES[index];

  return (
    <section className="hero-hydra relative min-h-[100svh] overflow-hidden text-white">
      <div className="hero-sheen" aria-hidden />
      <div className="hero-orbs" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-4 pb-16 pt-28 md:px-6 md:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Link
              href="/"
              className="animate-mark gloss-badge mb-7 inline-flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-2xl bg-white p-3 md:h-24 md:w-24"
            >
              <Image
                src="/brand/logo.png"
                alt="HydraTax home"
                width={78}
                height={78}
                priority
                className="object-contain"
              />
            </Link>

            <p className="animate-rise display text-[clamp(3rem,9vw,5.75rem)] font-semibold leading-[0.92] tracking-tight">
              HydraTax
            </p>
            <p className="animate-rise-delay mt-2 text-sm font-bold uppercase tracking-[0.22em] text-teal-300/90">
              Many heads. One desk.
            </p>
            <h1 className="animate-rise-delay mt-5 max-w-xl text-xl font-medium leading-snug text-white/88 md:text-2xl">
              The practice OS for accountants who file VAT, CT600, PAYE and Self
              Assessment without splitting their brain across portals.
            </h1>
            <p className="animate-rise-late mt-4 max-w-lg text-base text-white/60">
              Hydra keeps every client rail alive at once — integer-pence books,
              HMRC-ready submit, immutable proof for the partner review.
            </p>
              <div className="animate-rise-late mt-8 flex flex-wrap gap-3">
                <Link href="/create-account" className="btn btn-light">
                  Start your practice
                </Link>
                <Link href="/pricing" className="btn btn-ghost-light">
                  View pricing
                </Link>
              </div>
          </div>

          <div className="animate-fade relative">
            <div className="gloss-slider panel-dark relative min-h-[340px] overflow-hidden rounded-2xl p-6 md:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                  Hydra rail · live
                </p>
                <div className="flex gap-1.5">
                  {SLIDES.map((s, i) => (
                    <button
                      key={s.rail}
                      type="button"
                      aria-label={`Show ${s.rail}`}
                      onClick={() => setIndex(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === index ? "w-7 bg-teal-300" : "w-2 bg-white/30"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div key={slide.rail} className="animate-slide-swap mt-8">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-teal-200">
                  {slide.rail}
                </span>
                <p className="display mt-4 text-3xl leading-tight md:text-4xl">
                  {slide.title}
                </p>
                <p className="mt-3 max-w-sm text-sm text-white/65">
                  {slide.detail}
                </p>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 text-center text-xs">
                {[
                  ["Clients", "∞"],
                  ["Rails", "4"],
                  ["Proof", "Audit"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white/5 py-3">
                    <p className="display text-lg text-white">{value}</p>
                    <p className="mt-0.5 text-white/45">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
