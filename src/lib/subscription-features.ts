import {
  CUSTOM_PLAN_MODULES,
  PRICING_SECTIONS,
  basePlanKey,
  isYearlyPlanKey,
  parseCustomPlanSelection,
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
      label: "Companies House filing",
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
      "7-day free trial — no Hydra fees while trial is active",
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
    return { label: "Custom practice desk", features };
  }

  for (const section of PRICING_SECTIONS) {
    for (const plan of section.plans) {
      const key = `${section.id}:${plan.name}`;
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
  if (status === "canceling" || status === "cancelled" || status === "canceled") {
    return "Cancellation scheduled";
  }
  if (status === "active") return "Active";
  return status;
}
