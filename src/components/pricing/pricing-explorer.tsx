"use client";

import { useMemo, useState, useTransition } from "react";
import {
  PRICING_SECTIONS,
  formatGBP,
  HYDRA_SERVICE_FEE_POUNDS,
  COMPANIES_HOUSE_SERVICES,
  hydraTotal,
  hydraFeeForChService,
  CUSTOM_PLAN_MODULES,
  CUSTOM_PLAN_BASE_POUNDS,
  customPlanAmountPounds,
  customPlanKey,
  type CustomModuleId,
} from "@/lib/pricing";
import Link from "next/link";
import { FaqSection } from "@/components/faq-section";
import { faqsForProduct } from "@/lib/product-faqs";

type Section = (typeof PRICING_SECTIONS)[number];
type Plan = Section["plans"][number];

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
    <div className="pricing-page">
      <section className="pricing-hero">
        <div className="pricing-hero__glow" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-200/90">
            Pricing
          </p>
          <h1 className="display mt-3 max-w-3xl text-4xl text-white md:text-6xl">
            Clear plans for every filing
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/70">
            Practice desk, VAT, CT600, Self Assessment, PAYE, and Companies
            House — compare options and checkout in one step.
          </p>
        </div>
      </section>

      <section className="pricing-body">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
          <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
            <nav
              className="pricing-rail"
              aria-label="Pricing categories"
              role="tablist"
            >
              <p className="pricing-rail__label">Products</p>
              {PRICING_SECTIONS.map((s) => {
                const active = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveId(s.id)}
                    className={`pricing-rail__item ${active ? "is-active" : ""}`}
                  >
                    {s.title}
                  </button>
                );
              })}
            </nav>

            <div role="tabpanel">
              <div className="max-w-2xl border-b border-line pb-8">
                <h2 className="display text-3xl text-ink md:text-5xl">
                  {section.title}
                </h2>
                <p className="mt-3 text-base text-ink-soft md:text-lg">
                  {section.subtitle}
                </p>
              </div>

              {error && (
                <p className="mt-6 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {error}
                  {!stripeReady && (
                    <span className="mt-1 block text-ink-soft">
                      Add <code className="mono">STRIPE_SECRET_KEY</code> to
                      enable live checkout.
                    </span>
                  )}
                </p>
              )}

              {section.id === "companies-house" ? (
                <CompaniesHouseCards />
              ) : (
                <PlanCards
                  section={section}
                  onCheckout={checkout}
                  pendingKey={pendingKey}
                  busy={isPending}
                />
              )}

              <div className="mt-14">
                <FaqSection
                  title={`${section.title} FAQs`}
                  items={faqsForProduct(section.id)}
                />
              </div>
            </div>
          </div>
        </div>
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
  const count = section.plans.length;
  const grid =
    count >= 4
      ? "lg:grid-cols-2 xl:grid-cols-4"
      : count === 3
        ? "lg:grid-cols-3"
        : "md:grid-cols-2";

  return (
    <div className={`mt-10 grid items-stretch gap-6 ${grid}`}>
      {section.plans.map((plan) => {
        const isCustom = "customBuilder" in plan && plan.customBuilder;
        if (isCustom) {
          return (
            <CustomPlanCard
              key={plan.name}
              plan={plan}
              onCheckout={onCheckout}
              pendingKey={pendingKey}
              busy={busy}
            />
          );
        }

        const checkoutKey = planKey(section.id, plan.name);
        const loading = busy && pendingKey === checkoutKey;
        const isLink = "href" in plan && Boolean(plan.href);

        return (
          <article
            key={plan.name}
            className={`pricing-plan h-full ${plan.highlighted ? "is-featured" : ""}`}
          >
            {plan.highlighted && (
              <span className="pricing-plan__badge">Most chosen</span>
            )}
            <h3 className="display text-2xl text-ink">{plan.name}</h3>
            <p className="mt-2 min-h-[2.75rem] text-sm leading-relaxed text-ink-soft">
              {plan.blurb}
            </p>
            <p className="price-figure mt-6">
              <span className="price-amount">{formatGBP(plan.price)}</span>
              <span className="price-period">{plan.period}</span>
            </p>
            <ul className="mt-6 min-h-[8.5rem] flex-1 space-y-3 text-sm text-ink-soft">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span className="mt-0.5 text-sea" aria-hidden>
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              {isLink && "href" in plan && plan.href ? (
                <Link
                  href={plan.href}
                  className="btn btn-primary w-full whitespace-nowrap px-3 py-2.5 text-sm"
                >
                  {plan.cta}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCheckout(checkoutKey)}
                  className="btn btn-primary w-full whitespace-nowrap px-3 py-2.5 text-sm disabled:opacity-60"
                >
                  {loading ? "Redirecting…" : plan.cta}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CustomPlanCard({
  plan,
  onCheckout,
  pendingKey,
  busy,
}: {
  plan: Plan;
  onCheckout: (key: string) => void;
  pendingKey: string | null;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<CustomModuleId[]>([]);
  const total = customPlanAmountPounds(selected);
  const key = customPlanKey(selected);
  const loading = busy && pendingKey === key;

  function toggle(id: CustomModuleId) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <article className="pricing-plan h-full is-featured xl:col-span-1">
      <span className="pricing-plan__badge">Build your own</span>
      <h3 className="display text-2xl text-ink">{plan.name}</h3>
      <p className="mt-2 min-h-[2.75rem] text-sm leading-relaxed text-ink-soft">
        {plan.blurb}
      </p>
      <p className="price-figure mt-6">
        <span className="price-amount">{formatGBP(total)}</span>
        <span className="price-period">/month</span>
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {formatGBP(CUSTOM_PLAN_BASE_POUNDS)} desk + selected modules · CH
        incorporation £5 · CS £1
      </p>

      <fieldset className="mt-5 space-y-2">
        <legend className="sr-only">Select modules</legend>
        {CUSTOM_PLAN_MODULES.map((mod) => {
          const on = selected.includes(mod.id);
          return (
            <label
              key={mod.id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                on ? "border-sea bg-sea/5" : "border-line bg-white"
              }`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={on}
                onChange={() => toggle(mod.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{mod.label}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {mod.blurb}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-ink">
                +{formatGBP(mod.price)}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={busy || selected.length === 0}
          onClick={() => onCheckout(key)}
          className="btn btn-primary w-full whitespace-nowrap px-3 py-2.5 text-sm disabled:opacity-60"
        >
          {loading
            ? "Redirecting…"
            : selected.length === 0
              ? "Select at least one module"
              : `Checkout ${formatGBP(total)}/mo`}
        </button>
      </div>
    </article>
  );
}

function CompaniesHouseCards() {
  return (
    <div className="mt-10 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
      <p className="md:col-span-2 lg:col-span-3 text-sm text-ink-soft">
        Solo pays Hydra £{HYDRA_SERVICE_FEE_POUNDS} on each filing. Practice,
        Firm and Custom desks get incorporation at £5 Hydra and confirmation
        statements at £1 Hydra (statutory CH fee still applies).
      </p>
      {COMPANIES_HOUSE_SERVICES.map((service) => {
        const hydraSolo = hydraFeeForChService(service.id, "solo");
        const hydraDesk = hydraFeeForChService(service.id, "desk");
        const totalSolo = hydraTotal(service.chFeePounds, service.id, "solo");
        const totalDesk = hydraTotal(service.chFeePounds, service.id, "desk");
        const hasDeskRate = hydraDesk !== hydraSolo;

        return (
          <article
            key={service.id}
            className={`pricing-plan h-full ${service.popular ? "is-featured" : ""}`}
          >
            {service.popular && (
              <span className="pricing-plan__badge">Popular</span>
            )}
            <h3 className="display text-xl text-ink">{service.title}</h3>
            <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-ink-soft">
              {service.description}
            </p>
            <div className="mt-auto pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                CH {formatGBP(service.chFeePounds)} + Hydra{" "}
                {formatGBP(hydraSolo)}
                {hasDeskRate ? ` · desk ${formatGBP(hydraDesk)}` : ""}
              </p>
              <p className="price-figure mt-2">
                <span className="price-amount text-3xl">
                  {formatGBP(hasDeskRate ? totalDesk : totalSolo)}
                </span>
                <span className="price-period">/filing</span>
              </p>
              {hasDeskRate && (
                <p className="mt-1 text-xs text-ink-soft">
                  Desk rate shown · Solo {formatGBP(totalSolo)}
                </p>
              )}
              <Link
                href={`/companies-house/${service.id}`}
                className="btn btn-primary mt-5 w-full whitespace-nowrap px-3 py-2.5 text-sm"
              >
                View details
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
