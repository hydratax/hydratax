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
  type CustomPlanSelection,
} from "@/lib/pricing";

export type CheckoutPlan = {
  key: string;
  sectionId: string;
  name: string;
  amountPence: number;
  interval: "month" | "one_time";
  description: string;
};

export function listCheckoutPlans(): CheckoutPlan[] {
  const plans: CheckoutPlan[] = [];

  for (const section of PRICING_SECTIONS) {
    if (section.id === "companies-house") continue;
    for (const plan of section.plans) {
      if ("customBuilder" in plan && plan.customBuilder) continue;
      const oneTime = plan.period.includes("filing");
      plans.push({
        key: `${section.id}:${plan.name}`,
        sectionId: section.id,
        name: `${section.title} — ${plan.name}`,
        amountPence: plan.price * 100,
        interval: oneTime ? "one_time" : "month",
        description: plan.blurb,
      });
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
      description: `CH ${formatGBP(service.chFeePounds)} + Hydra ${formatGBP(hydraSolo)}`,
    });
    const hydraDesk = hydraFeeForChService(service.id, "desk");
    if (hydraDesk !== hydraSolo) {
      plans.push({
        key: `companies-house:${service.id}:desk`,
        sectionId: "companies-house",
        name: `Companies House — ${service.title} (desk rate)`,
        amountPence: hydraTotal(service.chFeePounds, service.id, "desk") * 100,
        interval: "one_time",
        description: `CH ${formatGBP(service.chFeePounds)} + Hydra ${formatGBP(hydraDesk)} (Practice / Custom)`,
      });
    }
  }

  return plans;
}

export function getCheckoutPlan(key: string): CheckoutPlan | undefined {
  const listed = listCheckoutPlans().find((p) => p.key === key);
  if (listed) return listed;

  if (key.startsWith("practice:Custom")) {
    const selection = parseCustomPlanSelection(key);
    const hasAnything =
      selection.modules.length > 0 || selection.chAddons.length > 0;
    if (!hasAnything && key !== "practice:Custom") return undefined;

    // Require at least one billable module or CH addon for checkout
    if (!hasAnything) return undefined;

    const amount = customPlanAmountPounds(selection);
    const labels = [
      ...selection.modules.map((m) => `${m.id}×${m.clients}`),
      ...selection.chAddons,
    ].join(", ");

    return {
      key: customPlanKey(selection),
      sectionId: "practice",
      name: `Practice desk — Custom (${labels})`,
      amountPence: amount * 100,
      interval: "month",
      description:
        "Custom practice desk with per-client HMRC modules and free Companies House add-ons.",
    };
  }

  return undefined;
}

export type { CustomPlanSelection };
export { HYDRA_SERVICE_FEE_POUNDS };
