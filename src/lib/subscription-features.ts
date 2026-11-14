import {
  CUSTOM_PLAN_MODULES,
  PRICING_SECTIONS,
  basePlanKey,
  isYearlyPlanKey,
  parseCustomPlanSelection,
  pricingCheckoutKey,
} from "@/lib/pricing";
import { entitlementsForPlans, moduleLabel } from "@/lib/entitlements";

export type SubscriptionFeatureSummary = {
  planKey: string;
  label: string;
  status: string;
  features: string[];
  trialEndsAt: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd?: boolean;
};

/** Match a stored plan key to marketing features from /pricing. */
export function featuresForPlanKey(planKey: string): {
  label: string;
  features: string[];
} {
  if (planKey.startsWith("companies-house:")) {
    return {
      label: "Companies House filings",
      features: [
        "Paid Companies House filing credit",
        "Confirmation statement / accounts / incorporation as purchased",
      ],
    };
  }

  const yearly = isYearlyPlanKey(planKey);
  const baseKey = basePlanKey(planKey);

  if (baseKey.startsWith("practice:Custom")) {
    const selection = parseCustomPlanSelection(baseKey);
    const features = [
      "7-day free trial",
      "Prepare during trial",
      "Companies House filings included on the desk",
      "Books, documents, and practice desk access",
    ];
    if (yearly) {
      features.push(
        "Yearly billing — 15% off (almost 2 months free)",
      );
    }
    for (const mod of selection.modules) {
      const meta = CUSTOM_PLAN_MODULES.find((m) => m.id === mod.id);
      if (meta) {
        features.push(
          mod.clients == null
            ? `${meta.label}: unlimited clients`
            : `${meta.label}: up to ${mod.clients} client${mod.clients === 1 ? "" : "s"}`,
        );
      }
    }
    if (selection.modules.length === 0) {
      features.push("Choose HMRC modules on Pricing when you are ready");
    }
    return { label: "Enterprise", features };
  }

  for (const section of PRICING_SECTIONS) {
    for (const plan of section.plans) {
      const key = pricingCheckoutKey(section.id, plan);
      if (baseKey === key || baseKey.startsWith(`${key}:`)) {
        const features: string[] = [...plan.features];
        if (yearly) {
          features.unshift(
            "Yearly billing — 15% off (almost 2 months free)",
          );
        }
        return {
          label: `${section.title} — ${plan.name}`,
          features,
        };
      }
    }
  }

  const ent = entitlementsForPlans([planKey]).plans[0];
  if (ent) {
    return {
      label: ent.label,
      features: ent.modules.map((m) => moduleLabel(m)),
    };
  }

  return {
    label: planKey,
    features: ["Active HydraTax subscription"],
  };
}

/**
 * Collapse duplicate one-off Companies House purchase rows into a single card
 * so Settings → Subscription does not list the same "ACTIVE" CH block N times.
 */
export function collapseSubscriptionSummaries(
  rows: SubscriptionFeatureSummary[],
): SubscriptionFeatureSummary[] {
  const chRows = rows.filter((r) => r.planKey.startsWith("companies-house:"));
  const other = rows.filter((r) => !r.planKey.startsWith("companies-house:"));
  if (chRows.length === 0) return rows;

  const count = chRows.length;
  const creditWord = count === 1 ? "credit" : "credits";
  const status =
    chRows.some((r) => r.status === "active")
      ? "active"
      : chRows.some((r) => r.status === "trialing")
        ? "trialing"
        : chRows[0]?.status ?? "active";

  const collapsed: SubscriptionFeatureSummary = {
    planKey: "companies-house:credits",
    label: "Companies House filings",
    status,
    features: [
      `${count} paid Companies House filing ${creditWord}`,
      "Confirmation statement / accounts / incorporation as purchased",
    ],
    trialEndsAt: null,
    stripeSubscriptionId: null,
  };

  return [...other, collapsed];
}

export function statusLabel(status: string, trialEndsAt?: string | null) {
  if (status === "trialing") {
    if (trialEndsAt) {
      const d = new Date(trialEndsAt);
      if (!Number.isNaN(d.getTime())) {
        return `Free trial · ends ${d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`;
      }
    }
    return "Free trial";
  }
  if (status === "canceling") {
    if (trialEndsAt) {
      const d = new Date(trialEndsAt);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
        return `Cancelled · access until ${d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`;
      }
    }
    return "Cancellation scheduled";
  }
  if (status === "cancelled" || status === "canceled") {
    return "Cancelled";
  }
  if (status === "active") return "Active";
  return status;
}
