"use client";

import { useEffect, useState } from "react";

const DIFFERENTIATORS = [
  {
    title: "Practice-first, not single-company",
    body: "Multi-client desk, deadlines, and staff roles — built for firms juggling dozens of entities, not a solo micro-company wizard.",
  },
  {
    title: "Four rails, one ledger",
    body: "VAT, Self Assessment, CT600 and PAYE share integer-pence books. Enter once; file everywhere without retyping.",
  },
  {
    title: "Compliance engineered in",
    body: "OAuth token encryption, fraud-prevention headers blocked if incomplete, sandbox/production isolation, immutable audit hash chain.",
  },
  {
    title: "Guided filing UX",
    body: "Hydra’s prepare → review → submit rhythm keeps juniors safe, while partners jump between clients without losing the thread.",
  },
] as const;

const FEATURES = [
  {
    title: "Multi-client dashboard",
    body: "Search clients, surface deadlines, jump straight into the right filing rail.",
  },
  {
    title: "Digital books in pence",
    body: "Income and expenses without floating-point drift — the source of truth for every return.",
  },
  {
    title: "HMRC OAuth per client",
    body: "Connect once, refresh securely, keep tokens AES-256 encrypted at rest.",
  },
  {
    title: "Fraud-prevention headers",
    body: "Collected at submit time, validated locally, attached on every MTD call.",
  },
  {
    title: "Immutable audit log",
    body: "Every mutation and gateway response is append-only — ready for partner review.",
  },
  {
    title: "Companies House filings",
    body: "Confirmation statements, accounts, incorporation and more — CH fee plus a flat Hydra service charge.",
  },
] as const;

export function FeaturesAndDifference() {
  const [featureIndex, setFeatureIndex] = useState(0);
  const [whyIndex, setWhyIndex] = useState(0);
  const [pausedFeatures, setPausedFeatures] = useState(false);
  const [pausedWhy, setPausedWhy] = useState(false);

  useEffect(() => {
    if (pausedFeatures) return;
    const id = window.setInterval(
      () => setFeatureIndex((i) => (i + 1) % FEATURES.length),
      3800,
    );
    return () => window.clearInterval(id);
  }, [pausedFeatures]);

  useEffect(() => {
    if (pausedWhy) return;
    const id = window.setInterval(
      () => setWhyIndex((i) => (i + 1) % DIFFERENTIATORS.length),
      4200,
    );
    return () => window.clearInterval(id);
  }, [pausedWhy]);

  const feature = FEATURES[featureIndex];
  const why = DIFFERENTIATORS[whyIndex];

  return (
    <>
      <section
        id="features"
        className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20"
        onMouseEnter={() => setPausedFeatures(true)}
        onMouseLeave={() => setPausedFeatures(false)}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="display text-3xl text-ink md:text-5xl">
              Features that cut filing friction
            </h2>
            <p className="mt-3 text-ink-soft">
              Interactive Hydra feature rail — auto-advances, click any chip to
              lock focus.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary px-3"
              aria-label="Previous feature"
              onClick={() =>
                setFeatureIndex(
                  (i) => (i - 1 + FEATURES.length) % FEATURES.length,
                )
              }
            >
              ←
            </button>
            <button
              type="button"
              className="btn btn-secondary px-3"
              aria-label="Next feature"
              onClick={() => setFeatureIndex((i) => (i + 1) % FEATURES.length)}
            >
              →
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              type="button"
              onClick={() => setFeatureIndex(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                i === featureIndex
                  ? "bg-ink text-white"
                  : "border border-line bg-white text-ink-soft hover:border-sea"
              }`}
            >
              {f.title}
            </button>
          ))}
        </div>

        <div
          key={feature.title}
          className="gloss-card panel animate-slide-swap mt-6 p-8 md:p-10"
        >
          <div className="gloss-shine" aria-hidden />
          <p className="relative mono text-xs text-sea">
            {String(featureIndex + 1).padStart(2, "0")} /{" "}
            {String(FEATURES.length).padStart(2, "0")}
          </p>
          <h3 className="relative display mt-3 text-3xl text-ink md:text-4xl">
            {feature.title}
          </h3>
          <p className="relative mt-3 max-w-2xl text-base leading-relaxed text-ink-soft md:text-lg">
            {feature.body}
          </p>
        </div>
      </section>

      <section
        id="why-hydratax"
        className="border-t border-line bg-ink text-white"
        onMouseEnter={() => setPausedWhy(true)}
        onMouseLeave={() => setPausedWhy(false)}
      >
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-300/80">
                Why HydraTax
              </p>
              <h2 className="display mt-2 text-3xl md:text-5xl">
                What sets Hydra apart
              </h2>
              <p className="mt-3 text-white/65">
                Slide through the reasons practices choose Hydra — or jump to a
                head.
              </p>
            </div>
            <div className="flex gap-2">
              {DIFFERENTIATORS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Why Hydra slide ${i + 1}`}
                  onClick={() => setWhyIndex(i)}
                  className={`h-2.5 rounded-full transition ${
                    i === whyIndex ? "w-8 bg-teal-300" : "w-2.5 bg-white/25"
                  }`}
                />
              ))}
            </div>
          </div>

          <div
            key={why.title}
            className="animate-slide-swap mt-10 rounded-2xl border border-white/15 bg-white/[0.06] p-8 backdrop-blur md:p-10"
          >
            <p className="mono text-xs text-teal-300/80">
              0{whyIndex + 1} — Hydra difference
            </p>
            <h3 className="display mt-3 text-3xl md:text-4xl">{why.title}</h3>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/70 md:text-lg">
              {why.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {DIFFERENTIATORS.map((d, i) => (
                <button
                  key={d.title}
                  type="button"
                  onClick={() => setWhyIndex(i)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                    i === whyIndex
                      ? "border-teal-300/50 bg-white/10 text-white"
                      : "border-white/10 text-white/50 hover:border-white/25"
                  }`}
                >
                  {d.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
