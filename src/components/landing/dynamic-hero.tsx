"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SLIDES = [
  {
    tag: "MTD VAT",
    title: "Nine boxes from one ledger",
    detail: "Prepare, review and submit — fraud headers locked in.",
  },
  {
    tag: "CT600",
    title: "Corporation Tax without portal-hopping",
    detail: "Pence-perfect figures, XML built, acceptance on file.",
  },
  {
    tag: "PAYE / RTI",
    title: "FPS that ships on payday",
    detail: "Employees, pay runs and RTI in the same client workspace.",
  },
  {
    tag: "Self Assessment",
    title: "Sole-trader updates that stay digital",
    detail: "Quarterly records from the books — checked before HMRC.",
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
            <h1 className="animate-rise display text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-[1.02] tracking-tight">
              Loved by UK accountants
            </h1>
            <p className="animate-rise-delay mt-5 max-w-lg text-lg leading-relaxed text-white/75 md:text-xl">
              The practice desk that makes your job feel simple — built for how
              firms actually work.
            </p>
            <div className="animate-rise-late mt-8 flex flex-wrap gap-3">
              <Link href="/create-account" className="btn btn-light">
                Start your practice
              </Link>
              <Link href="/#reviews" className="btn btn-ghost-light">
                Read reviews
              </Link>
            </div>
          </div>

          <div className="animate-fade relative w-full">
            <div className="gloss-slider panel-dark relative flex h-[360px] w-full flex-col overflow-hidden rounded-2xl p-6 md:h-[380px] md:p-7">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                  Filing desk
                </p>
                <div className="flex gap-1.5">
                  {SLIDES.map((s, i) => (
                    <button
                      key={s.tag}
                      type="button"
                      aria-label={`Show ${s.tag}`}
                      onClick={() => setIndex(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === index ? "w-7 bg-teal-300" : "w-2 bg-white/30"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div
                key={slide.tag}
                className="animate-slide-swap mt-6 flex min-h-0 flex-1 flex-col"
              >
                <span className="inline-flex h-7 w-fit items-center rounded-md border border-white/15 bg-white/10 px-3 text-xs font-bold tracking-wide text-teal-200">
                  {slide.tag}
                </span>
                <p className="display mt-4 line-clamp-3 min-h-[5.25rem] text-3xl leading-tight md:min-h-[6rem] md:text-4xl">
                  {slide.title}
                </p>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] max-w-sm text-sm text-white/65">
                  {slide.detail}
                </p>
              </div>

              <div className="mt-auto grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 pt-5 sm:grid-cols-4">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.tag}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`flex h-9 w-full items-center justify-center rounded-md px-2 text-center text-[11px] font-semibold leading-tight transition ${
                      i === index
                        ? "bg-white/15 text-white"
                        : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/75"
                    }`}
                  >
                    {s.tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
