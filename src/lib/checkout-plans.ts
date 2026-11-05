import {
  PRICING_SECTIONS,
  HYDRA_SERVICE_FEE_POUNDS,
  COMPANIES_HOUSE_SERVICES,
  hydraTotal,
  hydraFeeForChService,
  formatGBP,
  customPlanAmountPounds,
  customPlanKey,
  parseCustomPlanSelection,
  basePlanKey,
  isYearlyPlanKey,
  withYearlyPlanKey,
  yearlyAmountPoundsFromMonthly,
  type CustomPlanSelection,
  type DeskPlanTier,
} from "@/lib/pricing";
import {
  getChService,
  chServiceTotal,
  formatChServicePrice,
} from "@/lib/ch-services";

export type CheckoutPlan = {
  key: string;
  sectionId: string;
  name: string;
  amountPence: number;
  interval: "month" | "year" | "one_time";
  description: string;
  /** Monthly list price before yearly discount (for UI). */
  monthlyListPounds?: number;
};

function practiceDeskYearlyEligible(baseKey: string): boolean {
  return (
    baseKey === "practice:Solo" ||
    baseKey === "practice:Practice" ||
    baseKey.startsWith("practice:Custom")
  );
}

export function listCheckoutPlans(): CheckoutPlan[] {
  const plans: CheckoutPlan[] = [];

  for (const section of PRICING_SECTIONS) {
    if (section.id === "companies-house") continue;
    for (const plan of section.plans) {
      if ("customBuilder" in plan && plan.customBuilder) continue;
      const oneTime = plan.period.includes("filing");
      const key = `${section.id}:${plan.name}`;
      plans.push({
        key,
        sectionId: section.id,
        name: `${section.title} — ${plan.name}`,
        amountPence: plan.price * 100,
        interval: oneTime ? "one_time" : "month",
        description: plan.blurb,
        monthlyListPounds: oneTime ? undefined : plan.price,
      });
      if (!oneTime && practiceDeskYearlyEligible(key)) {
        const yearly = yearlyAmountPoundsFromMonthly(plan.price);
        plans.push({
          key: withYearlyPlanKey(key),
          sectionId: section.id,
          name: `${section.title} — ${plan.name} (yearly)`,
          amountPence: yearly * 100,
          interval: "year",
          description: `${plan.blurb} Billed yearly — 15% off (almost 2 months free).`,
          monthlyListPounds: plan.price,
        });
      }
    }
  }

  for (const service of COMPANIES_HOUSE_SERVICES) {
    const hydraSolo = hydraFeeForChService(service.id, "solo");
    plans.push({
      key: `companies-house:${service.id}`,
      sectionId: "companies-house",
      name: `Companies House — ${service.title}`,
      amountPence: hydraTotal(service.chFeePounds, service.id, "solo") * 100,
      interval: "one_time",
      description: `${service.title} — ${formatGBP(hydraTotal(service.chFeePounds, service.id, "solo"))}`,
    });
    const hydraDesk = hydraFeeForChService(service.id, "desk");
    if (hydraDesk !== hydraSolo) {
      plans.push({
        key: `companies-house:${service.id}:desk`,
        sectionId: "companies-house",
        name: `Companies House — ${service.title} (desk rate)`,
        amountPence: hydraTotal(service.chFeePounds, service.id, "desk") * 100,
        interval: "one_time",
        description: `${service.title} (desk) — ${formatGBP(hydraTotal(service.chFeePounds, service.id, "desk"))}`,
      });
    }
  }

  return plans;
}

export function getCheckoutPlan(key: string): CheckoutPlan | undefined {
  const listed = listCheckoutPlans().find((p) => p.key === key);
  if (listed) return listed;

  if (key.startsWith("companies-house:")) {
    const tier: DeskPlanTier = key.endsWith(":desk") ? "desk" : "solo";
    const serviceId = key
      .replace("companies-house:", "")
      .replace(/:desk$/, "");
    const service = getChService(serviceId);
    if (!service) return undefined;
    return {
      key,
      sectionId: "companies-house",
      name: `Companies House — ${service.title}${tier === "desk" ? " (desk rate)" : ""}`,
      amountPence: chServiceTotal(service, tier) * 100,
      interval: "one_time",
      description: `${service.title} — ${formatChServicePrice(service, tier)}`,
    };
  }

  const yearly = isYearlyPlanKey(key);
  const baseKey = basePlanKey(key);

  if (baseKey.startsWith("practice:Custom")) {
    const selection = parseCustomPlanSelection(baseKey);
    if (selection.modules.length === 0) return undefined;

    const monthly = customPlanAmountPounds(selection);
    const amount = yearly ? yearlyAmountPoundsFromMonthly(monthly) : monthly;
    const labels = selection.modules
      .map((m) =>
        m.clients == null ? `${m.id} (unlimited)` : `${m.id}×${m.clients}`,
      )
      .join(", ");
    const planKey = yearly
      ? withYearlyPlanKey(customPlanKey(selection))
      : customPlanKey(selection);

    return {
      key: planKey,
      sectionId: "practice",
      name: `Practice desk — Custom (${labels})${yearly ? " · yearly" : ""}`,
      amountPence: amount * 100,
      interval: yearly ? "year" : "month",
      description: yearly
        ? "Custom unlimited HMRC modules. Billed yearly — 15% off (almost 2 months free). Companies House included."
        : "Custom unlimited HMRC modules. Companies House filings included. No desk fee.",
      monthlyListPounds: monthly,
    };
  }

  // Yearly Solo / Practice if not already listed (safety)
  if (yearly && practiceDeskYearlyEligible(baseKey)) {
    const monthlyPlan = listCheckoutPlans().find(
      (p) => p.key === baseKey && p.interval === "month",
    );
    if (monthlyPlan?.monthlyListPounds != null) {
      const yearlyAmt = yearlyAmountPoundsFromMonthly(
        monthlyPlan.monthlyListPounds,
      );
      return {
        key,
        sectionId: monthlyPlan.sectionId,
        name: `${monthlyPlan.name} (yearly)`,
        amountPence: yearlyAmt * 100,
        interval: "year",
        description: `${monthlyPlan.description} Billed yearly — 15% off (almost 2 months free).`,
        monthlyListPounds: monthlyPlan.monthlyListPounds,
      };
    }
  }

  return undefined;
}

export type { CustomPlanSelection };
export { HYDRA_SERVICE_FEE_POUNDS };
