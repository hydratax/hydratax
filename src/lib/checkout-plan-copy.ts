import {
  CUSTOM_PLAN_MODULES,
  formatGBP,
  isYearlyPlanKey,
  parseCustomPlanSelection,
  basePlanKey,
} from "@/lib/pricing";
import { getCheckoutPlan } from "@/lib/checkout-plans";
import { featuresForPlanKey } from "@/lib/subscription-features";

export type CheckoutPlanCopy = {
  /** Short product name, e.g. "Custom practice desk" */
  title: string;
  /** Billing cadence label */
  billing: "Monthly" | "Yearly" | "One-off";
  /** Human lines for modules / features */
  lines: string[];
  /** Formatted amount if known, e.g. "£1,489/year" */
  priceLabel: string | null;
};

/** Friendly checkout summary — never expose raw planKey to customers. */
export function describeCheckoutPlan(planKey: string): CheckoutPlanCopy {
  if (!planKey || planKey === "unknown") {
    return {
      title: "Your HydraTax plan",
      billing: "Monthly",
      lines: [],
      priceLabel: null,
    };
  }

  const yearly = isYearlyPlanKey(planKey);
  const plan = getCheckoutPlan(planKey);
  const features = featuresForPlanKey(planKey);
  const base = basePlanKey(planKey);

  let billing: CheckoutPlanCopy["billing"] = "Monthly";
  if (plan?.interval === "one_time") billing = "One-off";
  else if (yearly || plan?.interval === "year") billing = "Yearly";

  let title = features.label;
  if (base.startsWith("practice:Custom")) {
    title = "Custom practice desk";
  } else if (base === "practice:Practice") {
    title = "Practice desk";
  } else if (base === "practice:Solo") {
    title = "Solo desk";
  } else if (base.startsWith("companies-house:")) {
    title = features.label;
  }

  const lines: string[] = [];
  if (base.startsWith("practice:Custom")) {
    const selection = parseCustomPlanSelection(base);
    for (const mod of selection.modules) {
      const meta = CUSTOM_PLAN_MODULES.find((m) => m.id === mod.id);
      if (!meta) continue;
      if (mod.clients == null) {
        lines.push(`${meta.label} — unlimited clients`);
      } else {
        lines.push(
          `${meta.label} — up to ${mod.clients.toLocaleString("en-GB")} clients`,
        );
      }
    }
    lines.push("Companies House filings included");
    if (yearly) lines.push("Yearly billing — 15% off (almost 2 months free)");
  } else {
    for (const f of features.features.slice(0, 6)) {
      lines.push(f);
    }
  }

  let priceLabel: string | null = null;
  if (plan && plan.amountPence > 0) {
    const pounds = plan.amountPence / 100;
    if (plan.interval === "year") {
      priceLabel = `${formatGBP(pounds)}/year`;
    } else if (plan.interval === "month") {
      priceLabel = `${formatGBP(pounds)}/month`;
    } else {
      priceLabel = formatGBP(pounds);
    }
  }

  return { title, billing, lines, priceLabel };
}
