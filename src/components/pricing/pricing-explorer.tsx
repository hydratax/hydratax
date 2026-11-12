"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  PRICING_SECTIONS,
  formatGBP,
  COMPANIES_HOUSE_SERVICES,
  hydraTotal,
  CUSTOM_PLAN_MODULES,
  CUSTOM_PLAN_MIN_CLIENTS,
  CUSTOM_PLAN_MAX_CLIENTS,
  customPlanAmountPounds,
  customModuleAmountPounds,
  customModuleEffectiveRatePounds,
  customPlanKey,
  withYearlyPlanKey,
  yearlyAmountPoundsFromMonthly,
  yearlySavingsPoundsFromMonthly,
  YEARLY_MARKETING_LINE,
  pricingCheckoutKey,
  type CustomModuleId,
  type CustomModuleSelection,
} from "@/lib/pricing";
import Link from "next/link";
import { FaqSection } from "@/components/faq-section";
import { faqsForProduct } from "@/lib/product-faqs";
import { PRACTICE_TRIAL } from "@/lib/trial";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type Section = (typeof PRICING_SECTIONS)[number];
type Plan = Section["plans"][number];

export function PricingExplorer({
  stripeReady,
}: {
  stripeReady: boolean;
}) {
  const searchParams = useSearchParams();
  const resumePlan = (searchParams.get("plan") ?? "").trim();
  const resumedRef = useRef(false);
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
        const data = (await res.json()) as {
          url?: string;
          error?: string;
          needsAuth?: boolean;
          planKey?: string;
        };
        if (res.status === 401 || data.needsAuth) {
          const plan = encodeURIComponent(data.planKey || key);
          window.location.href = `/create-account?next=${encodeURIComponent(`/pricing?plan=${plan}`)}&plan=${plan}`;
          return;
        }
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

  // After create-account → /pricing?plan=… resume Stripe with the signed-in practice.
  useEffect(() => {
    if (!stripeReady || !resumePlan || resumedRef.current) return;
    resumedRef.current = true;
    checkout(resumePlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once on mount
  }, [stripeReady, resumePlan]);

  return (
    <div className="pricing-page">
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
                {section.id === "practice" ? (
                  <p className="pricing-yearly-banner mt-6">{YEARLY_MARKETING_LINE}</p>
                ) : null}
              </div>

              {error ? (
                <FormErrorBanner error={error} className="mt-6" title="Checkout blocked">
                  {!stripeReady ? (
                    <p className="form-error-banner__body mt-1 !text-ink-soft">
                      Add <code className="mono">STRIPE_SECRET_KEY</code> to
                      enable live checkout.
                    </p>
                  ) : null}
                </FormErrorBanner>
              ) : null}

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

function BillingPeriodToggle({
  billing,
  onChange,
  id,
}: {
  billing: "month" | "year";
  onChange: (v: "month" | "year") => void;
  id: string;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-line bg-paper p-0.5"
      role="group"
      aria-label={`Billing period for ${id}`}
    >
      <button
        type="button"
        className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold leading-5 transition sm:px-3 ${
          billing === "month"
            ? "bg-sea text-white"
            : "text-ink-soft hover:text-ink"
        }`}
        onClick={() => onChange("month")}
      >
        Monthly
      </button>
      <button
        type="button"
        className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold leading-5 transition sm:px-3 ${
          billing === "year"
            ? "bg-sea text-white"
            : "text-ink-soft hover:text-ink"
        }`}
        onClick={() => onChange("year")}
      >
        Yearly · 15% off
      </button>
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
  const perCardBilling = section.id === "practice";

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

        return (
          <FixedPlanCard
            key={plan.name}
            section={section}
            plan={plan}
            perCardBilling={perCardBilling}
            onCheckout={onCheckout}
            pendingKey={pendingKey}
            busy={busy}
          />
        );
      })}
    </div>
  );
}

function FixedPlanCard({
  section,
  plan,
  perCardBilling,
  onCheckout,
  pendingKey,
  busy,
}: {
  section: Section;
  plan: Plan;
  perCardBilling: boolean;
  onCheckout: (key: string) => void;
  pendingKey: string | null;
  busy: boolean;
}) {
  const [billing, setBilling] = useState<"month" | "year">("month");
  const monthlyKey = pricingCheckoutKey(section.id, plan);
  const yearly = perCardBilling && billing === "year";
  const checkoutKey = yearly ? withYearlyPlanKey(monthlyKey) : monthlyKey;
  const loading = busy && pendingKey === checkoutKey;
  const isLink = "href" in plan && Boolean(plan.href);
  const yearlyTotal = yearlyAmountPoundsFromMonthly(plan.price);
  const yearlySave = yearlySavingsPoundsFromMonthly(plan.price);
  const isSmallFirm =
    section.id === "practice" &&
    "checkoutKey" in plan &&
    plan.checkoutKey === "Practice";

  return (
    <article
      className={`pricing-plan h-full ${plan.highlighted ? "is-featured" : ""}`}
    >
      {perCardBilling ? (
        <div className="mb-2 flex justify-end">
          <BillingPeriodToggle
            id={plan.name}
            billing={billing}
            onChange={setBilling}
          />
        </div>
      ) : null}
      <div className="pricing-plan__badge-slot">
        {plan.highlighted ? (
          <span className="pricing-plan__badge">
            {isSmallFirm ? PRACTICE_TRIAL.shortBadge : "Most chosen"}
          </span>
        ) : (
          <span
            className="pricing-plan__badge pricing-plan__badge--ghost"
            aria-hidden
          >
            &nbsp;
          </span>
        )}
      </div>
      <h3 className="display text-2xl text-ink">{plan.name}</h3>
      {plan.blurb ? (
        <p className="pricing-plan__blurb mt-2 text-sm leading-relaxed text-ink-soft">
          {plan.blurb}
        </p>
      ) : null}
      <div className="pricing-plan__price mt-4">
        {yearly ? (
          <>
            <p className="price-figure">
              <span className="price-amount">{formatGBP(yearlyTotal)}</span>
              <span className="price-period">/year</span>
            </p>
            <p className="pricing-plan__price-note mt-1 text-xs text-ink-soft">
              <span className="line-through">
                {formatGBP(plan.price * 12)}
              </span>{" "}
              · save {formatGBP(yearlySave)} · almost 2 months free
            </p>
          </>
        ) : (
          <>
            <p className="price-figure">
              <span className="price-amount">{formatGBP(plan.price)}</span>
              <span className="price-period">{plan.period}</span>
            </p>
            <p className="pricing-plan__price-note mt-1 text-xs text-ink-soft" aria-hidden>
              &nbsp;
            </p>
          </>
        )}
      </div>
      <ul className="pricing-plan__features mt-6 flex-1 space-y-3 text-sm text-ink-soft">
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
            className="btn btn-primary w-full px-3 py-2.5 text-sm leading-snug"
          >
            {plan.cta}
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCheckout(checkoutKey)}
            className="btn btn-primary w-full px-3 py-2.5 text-sm leading-snug disabled:opacity-60"
          >
            {loading
              ? "Redirecting…"
              : yearly
                ? `${plan.cta} · yearly`
                : plan.cta}
          </button>
        )}
      </div>
    </article>
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
  const [billing, setBilling] = useState<"month" | "year">("month");
  const [modules, setModules] = useState<CustomModuleSelection[]>([]);

  const selection = useMemo(() => ({ modules }), [modules]);
  const monthlyTotal = customPlanAmountPounds(selection);
  const total =
    billing === "year"
      ? yearlyAmountPoundsFromMonthly(monthlyTotal)
      : monthlyTotal;
  const key =
    billing === "year"
      ? withYearlyPlanKey(customPlanKey(selection))
      : customPlanKey(selection);
  const loading = busy && pendingKey === key;
  const canCheckout = modules.length > 0;
  const yearlySave = yearlySavingsPoundsFromMonthly(monthlyTotal);

  function isModuleOn(id: CustomModuleId) {
    return modules.some((m) => m.id === id);
  }

  function clientsFor(id: CustomModuleId) {
    return modules.find((m) => m.id === id)?.clients ?? CUSTOM_PLAN_MIN_CLIENTS;
  }

  function toggleModule(id: CustomModuleId) {
    setModules((prev) =>
      prev.some((m) => m.id === id)
        ? prev.filter((m) => m.id !== id)
        : [...prev, { id, clients: CUSTOM_PLAN_MIN_CLIENTS }],
    );
  }

  function setClients(id: CustomModuleId, clients: number) {
    const n = Math.max(
      CUSTOM_PLAN_MIN_CLIENTS,
      Math.min(
        CUSTOM_PLAN_MAX_CLIENTS,
        Math.floor(clients) || CUSTOM_PLAN_MIN_CLIENTS,
      ),
    );
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, clients: n } : m)),
    );
  }

  return (
    <article className="pricing-plan h-full is-featured xl:col-span-1">
      <div className="mb-2 flex justify-end">
        <BillingPeriodToggle
          id={plan.name}
          billing={billing}
          onChange={setBilling}
        />
      </div>
      <div className="pricing-plan__badge-slot">
        <span className="pricing-plan__badge">{PRACTICE_TRIAL.shortBadge}</span>
      </div>
      <h3 className="display text-2xl text-ink">{plan.name}</h3>
      {canCheckout ? (
        <>
          <p className="price-figure mt-4">
            <span className="price-amount">{formatGBP(total)}</span>
            <span className="price-period">
              {billing === "year" ? "/year" : "/month"}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {billing === "year" ? (
              <>
                <span className="line-through">
                  {formatGBP(monthlyTotal * 12)}
                </span>{" "}
                · save {formatGBP(yearlySave)} · almost 2 months free
              </>
            ) : (
              <>
                From {CUSTOM_PLAN_MIN_CLIENTS} clients · Companies House included
              </>
            )}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          Select services below (min {CUSTOM_PLAN_MIN_CLIENTS} clients each).
        </p>
      )}

      <fieldset className="mt-5 space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          HMRC services
        </legend>
        {CUSTOM_PLAN_MODULES.map((mod) => {
          const on = isModuleOn(mod.id);
          const clients = clientsFor(mod.id);
          const lineTotal = on
            ? customModuleAmountPounds(mod.id, clients)
            : 0;
          const rate = on
            ? customModuleEffectiveRatePounds(mod.id, clients)
            : mod.pricePerClient;
          return (
            <div
              key={mod.id}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                on ? "border-sea bg-sea/5" : "border-line bg-white"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={on}
                  onChange={() => toggleModule(mod.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{mod.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {mod.blurb}
                  </span>
                </span>
              </label>
              {on ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2 pl-6">
                  <label
                    className="text-xs text-ink-soft"
                    htmlFor={`clients-${mod.id}`}
                  >
                    Number of clients
                  </label>
                  <input
                    id={`clients-${mod.id}`}
                    type="number"
                    min={CUSTOM_PLAN_MIN_CLIENTS}
                    max={CUSTOM_PLAN_MAX_CLIENTS}
                    value={clients}
                    onChange={(e) =>
                      setClients(mod.id, Number(e.target.value))
                    }
                    className="w-24 rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
                  />
                  <span className="text-xs text-ink-soft">
                    {new Intl.NumberFormat("en-GB", {
                      style: "currency",
                      currency: "GBP",
                      minimumFractionDigits: rate < 10 ? 2 : 0,
                      maximumFractionDigits: 2,
                    }).format(rate)}
                    /client · {formatGBP(lineTotal)}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </fieldset>

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Companies House (incorporation, confirmation statements, annual accounts)
        is included with every Enterprise desk — no monthly add-on. Minimum{" "}
        {CUSTOM_PLAN_MIN_CLIENTS} clients per selected module.
      </p>

      <div className="mt-auto space-y-2 pt-6">
        <button
          type="button"
          disabled={busy || !canCheckout}
          onClick={() => onCheckout(key)}
          className="btn btn-primary w-full px-3 py-2.5 text-sm leading-snug disabled:opacity-60"
        >
          {loading
            ? "Redirecting…"
            : !canCheckout
              ? "Select a service"
              : billing === "year"
                ? `Start free trial · ${formatGBP(total)}/yr after`
                : `Start free trial · ${formatGBP(total)}/mo after`}
        </button>
      </div>
    </article>
  );
}

function CompaniesHouseCards() {
  return (
    <div className="mt-10 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
      <p className="md:col-span-2 lg:col-span-3 text-sm text-ink-soft">
        One price per filing — statutory Companies House fee included. Small Firm
        and Enterprise desks include unlimited confirmation statements and annual
        accounts.
      </p>
      {COMPANIES_HOUSE_SERVICES.map((service) => {
        const totalDesk = hydraTotal(service.chFeePounds, service.id, "desk");

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
              <p className="price-figure mt-2">
                <span className="price-amount text-3xl">
                  {formatGBP(totalDesk)}
                </span>
                <span className="price-period">/filing</span>
              </p>
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
