"use client";

import { useMemo, useState, useTransition } from "react";
import {
  PRICING_SECTIONS,
  formatGBP,
  HYDRA_SERVICE_FEE_POUNDS,
  COMPANIES_HOUSE_SERVICES,
  hydraTotal,
} from "@/lib/pricing";
import Link from "next/link";
import { FaqSection } from "@/components/faq-section";
import { faqsForProduct } from "@/lib/product-faqs";

type Section = (typeof PRICING_SECTIONS)[number];

function planKey(sectionId: string, planName: string) {
  return `${sectionId}:${planName}`;
}

export function PricingExplorer({
  stripeReady,
}: {
  stripeReady: boolean;
}) {
  const [activeId, setActiveId] = useState<string>(PRICING_SECTIONS[0].id);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const section = useMemo(
    () =>
      PRICING_SECTIONS.find((s) => s.id === activeId) ?? PRICING_SECTIONS[0],
    [activeId],
  );

  function checkout(key: string) {
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: key }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setError(data.error ?? "Checkout failed");
          setPendingKey(null);
          return;
        }
        window.location.href = data.url;
      } catch {
        setError("Network error starting checkout");
        setPendingKey(null);
      }
    });
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-ink px-4 pb-10 pt-16 text-white md:px-6 md:pb-12 md:pt-20">
        <div className="pointer-events-none absolute -right-10 top-0 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-300/80">
            Pricing
          </p>
          <h1 className="display mt-3 max-w-3xl text-4xl md:text-6xl">
            Stay ahead
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/65">
            Separate sections for the practice desk, MTD VAT, CT600, Self
            Assessment, PAYE, and Companies House — so accountants and directors
            can budget without surprises.
          </p>

          <div
            className="mt-10 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Pricing categories"
          >
            {PRICING_SECTIONS.map((s) => {
              const active = s.id === activeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveId(s.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-white bg-white text-ink"
                      : "border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/5"
                  }`}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16"
        role="tabpanel"
      >
        <div className="max-w-2xl">
          <h2 className="display text-3xl text-ink md:text-5xl">
            {section.title}
          </h2>
          <p className="mt-2 text-ink-soft">{section.subtitle}</p>
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
            {!stripeReady && (
              <span className="mt-1 block text-ink-soft">
                Add <code className="mono">STRIPE_SECRET_KEY</code> to enable
                live checkout.
              </span>
            )}
          </p>
        )}

        {section.id === "companies-house" ? (
          <CompaniesHouseCards
            onCheckout={checkout}
            pendingKey={pendingKey}
            busy={isPending}
          />
        ) : (
          <PlanCards
            section={section}
            onCheckout={checkout}
            pendingKey={pendingKey}
            busy={isPending}
          />
        )}

        <FaqSection
          title={`${section.title} FAQs`}
          items={faqsForProduct(section.id)}
        />
      </section>
    </div>
  );
}

function PlanCards({
  section,
  onCheckout,
  pendingKey,
  busy,
}: {
  section: Section;
  onCheckout: (key: string) => void;
  pendingKey: string | null;
  busy: boolean;
}) {
  return (
    <div
      className={`mt-10 grid gap-5 ${
        section.plans.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"
      }`}
    >
      {section.plans.map((plan) => {
        const key =
          "href" in plan && plan.href
            ? `companies-house:${plan.name}`
            : planKey(section.id, plan.name);
        const checkoutKey = planKey(section.id, plan.name);
        const loading = busy && pendingKey === checkoutKey;

        return (
          <article
            key={plan.name}
            className={`pricing-card gloss-card panel relative flex flex-col overflow-hidden p-6 transition duration-300 hover:-translate-y-1 ${
              plan.highlighted
                ? "border-sea shadow-[0_22px_50px_-28px_rgba(15,118,110,0.55)]"
                : ""
            }`}
          >
            {plan.highlighted && (
              <span className="badge badge-sea mb-3 w-fit">Popular</span>
            )}
            <h3 className="display text-2xl text-ink">{plan.name}</h3>
            <p className="mt-1 text-sm text-ink-soft">{plan.blurb}</p>
            <p className="price-figure mt-6">
              <span className="price-amount">{formatGBP(plan.price)}</span>
              <span className="price-period">{plan.period}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-soft">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-sea" aria-hidden>
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            {"href" in plan && plan.href ? (
              <Link
                href={plan.href}
                className={`btn mt-8 ${
                  plan.highlighted ? "btn-primary" : "btn-secondary"
                }`}
              >
                {plan.cta}
              </Link>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onCheckout(checkoutKey)}
                className={`btn mt-8 ${
                  plan.highlighted ? "btn-primary" : "btn-secondary"
                } disabled:opacity-60`}
              >
                {loading ? "Redirecting…" : plan.cta}
              </button>
            )}
            <span className="sr-only">{key}</span>
          </article>
        );
      })}
    </div>
  );
}

function CompaniesHouseCards({
  onCheckout: _onCheckout,
  pendingKey: _pendingKey,
  busy: _busy,
}: {
  onCheckout: (key: string) => void;
  pendingKey: string | null;
  busy: boolean;
}) {
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {COMPANIES_HOUSE_SERVICES.map((service) => {
        const total = hydraTotal(service.chFeePounds);
        return (
          <article
            key={service.id}
            className={`pricing-card gloss-card panel flex flex-col p-5 transition hover:-translate-y-1 ${
              service.popular ? "border-sea" : ""
            }`}
          >
            {service.popular && (
              <span className="badge badge-sea mb-2 w-fit">Popular</span>
            )}
            <h3 className="display text-xl text-ink">{service.title}</h3>
            <p className="mt-1 flex-1 text-sm text-ink-soft">
              {service.description}
            </p>
            <p className="mt-4 text-xs text-ink-soft">
              CH {formatGBP(service.chFeePounds)} + Hydra{" "}
              {formatGBP(HYDRA_SERVICE_FEE_POUNDS)}
            </p>
            <p className="price-figure mt-2">
              <span className="price-amount text-3xl">{formatGBP(total)}</span>
              <span className="price-period">/filing</span>
            </p>
            <Link
              href={`/companies-house/${service.id}`}
              className="btn btn-primary mt-5"
            >
              Details & request form
            </Link>
          </article>
        );
      })}
    </div>
  );
}
