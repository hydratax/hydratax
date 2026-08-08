import {
  PRICING_SECTIONS,
  HYDRA_SERVICE_FEE_POUNDS,
  COMPANIES_HOUSE_SERVICES,
  hydraTotal,
  hydraFeeForChService,
  formatGBP,
  customPlanAmountPounds,
  customPlanKey,
  parseCustomPlanModules,
  type CustomModuleId,
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
    // Desk-discounted checkout keys for Practice / Firm / Custom subscribers
    const hydraDesk = hydraFeeForChService(service.id, "desk");
    if (hydraDesk !== hydraSolo) {
      plans.push({
        key: `companies-house:${service.id}:desk`,
        sectionId: "companies-house",
        name: `Companies House — ${service.title} (desk rate)`,
        amountPence: hydraTotal(service.chFeePounds, service.id, "desk") * 100,
        interval: "one_time",
        description: `CH ${formatGBP(service.chFeePounds)} + Hydra ${formatGBP(hydraDesk)} (Practice / Firm / Custom)`,
      });
    }
  }

  return plans;
}

export function getCheckoutPlan(key: string): CheckoutPlan | undefined {
  const listed = listCheckoutPlans().find((p) => p.key === key);
  if (listed) return listed;

  if (key.startsWith("practice:Custom")) {
    const modules = parseCustomPlanModules(key);
    if (modules.length === 0 && key !== "practice:Custom") return undefined;
    const amount = customPlanAmountPounds(modules as CustomModuleId[]);
    const labels = modules.length
      ? modules.join(", ")
      : "desk only — add modules";
    return {
      key: customPlanKey(modules as CustomModuleId[]),
      sectionId: "practice",
      name: `Practice desk — Custom (${labels})`,
      amountPence: amount * 100,
      interval: "month",
      description:
        "Custom practice desk with selected HMRC modules and discounted Companies House Hydra fees.",
    };
  }

  return undefined;
}

export { HYDRA_SERVICE_FEE_POUNDS };
