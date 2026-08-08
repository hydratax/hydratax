"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ACCOUNTANT_REVIEWS } from "@/lib/accountant-reviews";

function Stars({ rating }: { rating: number }) {
  return (
    <p className="flex gap-0.5 text-accent" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden>
          {i < rating ? "★" : "☆"}
        </span>
      ))}
    </p>
  );
}

export function ReviewsCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = ACCOUNTANT_REVIEWS.length;
  const review = ACCOUNTANT_REVIEWS[index];

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, 6500);
    return () => window.clearInterval(id);
  }, [paused, total]);

  function go(delta: number) {
    setIndex((i) => (i + delta + total) % total);
  }

  return (
    <section
      id="reviews"
      className="relative overflow-hidden border-t border-line bg-sand/50 py-16 md:py-20"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Accountant reviews of HydraTax"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_0%,rgba(15,118,110,0.08),transparent_50%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
              Accountant reviews
            </p>
            <h2 className="display mt-2 text-3xl text-ink md:text-5xl">
              Why UK accountants choose HydraTax for CT600, MTD VAT &amp; PAYE
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-soft">
              Practice managers, partners and sole practitioners on the UK’s most
              user-friendly accounting software — Self Assessment, RTI payroll,
              confirmation statements and corporation tax from one desk.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous review"
              className="btn btn-secondary h-11 w-11 px-0"
              onClick={() => go(-1)}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next review"
              className="btn btn-secondary h-11 w-11 px-0"
              onClick={() => go(1)}
            >
              →
            </button>
          </div>
        </div>

        <div className="mt-10 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {ACCOUNTANT_REVIEWS.map((r) => (
              <article
                key={r.id}
                className="w-full shrink-0 px-0.5"
                aria-hidden={r.id !== review.id}
              >
                <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_20px_50px_-40px_rgba(10,10,10,0.3)] md:p-8">
                  <Stars rating={r.rating} />
                  <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-sea">
                    {r.topic}
                  </p>
                  <blockquote className="mt-4 text-base leading-relaxed text-ink md:text-lg md:leading-relaxed">
                    “{r.quote}”
                  </blockquote>
                  <footer className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-line bg-sand">
                      <Image
                        src={r.photo}
                        alt={`${r.name}, ${r.role} at ${r.firm}`}
                        fill
                        className="object-cover object-top"
                        sizes="48px"
                        priority={r.id === ACCOUNTANT_REVIEWS[0].id}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="truncate text-sm text-ink-soft">
                        {r.role} · {r.firm}, {r.location}
                      </p>
                    </div>
                  </footer>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {ACCOUNTANT_REVIEWS.map((r, i) => (
              <button
                key={r.id}
                type="button"
                aria-label={`Show review from ${r.name}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={`relative h-11 w-11 overflow-hidden rounded-full border-2 transition ${
                  i === index
                    ? "border-sea ring-2 ring-sea/25"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <Image
                  src={r.photo}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="44px"
                />
              </button>
            ))}
          </div>
          <p className="mono text-xs text-ink-soft">
            {index + 1} / {total}
          </p>
        </div>

        <p className="mt-10 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Looking for{" "}
          <strong className="font-semibold text-ink">
            CT600 software
          </strong>
          ,{" "}
          <strong className="font-semibold text-ink">MTD VAT filing</strong>,{" "}
          <strong className="font-semibold text-ink">
            Self Assessment software
          </strong>
          ,{" "}
          <strong className="font-semibold text-ink">PAYE RTI</strong> or{" "}
          <strong className="font-semibold text-ink">
            confirmation statement filing
          </strong>{" "}
          built for UK accountants? These reviews reflect how practices use
          HydraTax day to day — not a consumer bookkeeping app.
        </p>
      </div>
    </section>
  );
}
