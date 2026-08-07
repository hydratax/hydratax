"use client";

import { useState } from "react";

const REVIEWS = [
  {
    quote:
      "We stopped juggling five portals. VAT, CT600 and payroll for every client now live on one desk — filing week finally feels manageable.",
    name: "Priya N.",
    role: "Practice manager, 28-client firm",
  },
  {
    quote:
      "The prepare → review → submit flow is exactly how my juniors need to work. Fraud headers and audit history mean I can sleep at night.",
    name: "James O.",
    role: "Partner, London boutique",
  },
  {
    quote:
      "Integer pence books feeding VAT and SA removed a whole class of rounding arguments. Clients get answers faster; we rebill less cleanup.",
    name: "Amira K.",
    role: "Sole practitioner",
  },
  {
    quote:
      "FPS on payday without leaving the client workspace is the detail that sold the team. HydraTax feels built for accountants, not hobby bookkeeping.",
    name: "Tom R.",
    role: "Payroll lead, multi-client practice",
  },
] as const;

export function ReviewsCarousel() {
  const [index, setIndex] = useState(0);
  const review = REVIEWS[index];

  return (
    <section id="reviews" className="border-t border-line bg-sand/60 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-3xl text-ink md:text-5xl">
              Loved by practices that live in deadlines
            </h2>
            <p className="mt-3 max-w-xl text-ink-soft">
              Accountants using HydraTax to keep every client filing on one
              HMRC-ready desk.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous review"
              className="btn btn-secondary px-3"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next review"
              className="btn btn-secondary px-3"
              disabled={index === REVIEWS.length - 1}
              onClick={() => setIndex((i) => Math.min(REVIEWS.length - 1, i + 1))}
            >
              →
            </button>
          </div>
        </div>

        <figure className="gloss-card panel mt-10 p-8 md:p-10" key={review.name}>
          <div className="gloss-shine" aria-hidden />
          <blockquote className="relative display text-2xl leading-snug text-ink md:text-3xl">
            “{review.quote}”
          </blockquote>
          <figcaption className="mt-6">
            <p className="font-semibold text-ink">{review.name}</p>
            <p className="text-sm text-ink-soft">{review.role}</p>
          </figcaption>
        </figure>

        <div className="mt-5 flex gap-2">
          {REVIEWS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to review ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2.5 rounded-full transition ${
                i === index ? "w-8 bg-sea" : "w-2.5 bg-mist hover:bg-sea/50"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
