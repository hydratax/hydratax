import {
  PRICING_SECTIONS,
  HYDRA_SERVICE_FEE_POUNDS,
  COMPANIES_HOUSE_SERVICES,
  hydraTotal,
  formatGBP,
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
    plans.push({
      key: `companies-house:${service.id}`,
      sectionId: "companies-house",
      name: `Companies House — ${service.title}`,
      amountPence: hydraTotal(service.chFeePounds) * 100,
      interval: "one_time",
      description: `CH ${formatGBP(service.chFeePounds)} + Hydra ${formatGBP(HYDRA_SERVICE_FEE_POUNDS)}`,
    });
  }

  return plans;
}

export function getCheckoutPlan(key: string) {
  return listCheckoutPlans().find((p) => p.key === key);
}
