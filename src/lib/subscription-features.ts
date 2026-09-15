import {
  CUSTOM_PLAN_MODULES,
  PRICING_SECTIONS,
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

  if (planKey.startsWith("practice:Custom")) {
    const selection = parseCustomPlanSelection(planKey);
    const features = [
      "7-day free trial — no Hydra fees while trial is active",
      "Companies House filings included on the desk",
      "Books, documents, and practice desk access",
    ];
    for (const mod of selection.modules) {
      const meta = CUSTOM_PLAN_MODULES.find((m) => m.id === mod.id);
      if (meta) {
        features.push(
          `${meta.label}: up to ${mod.clients} client${mod.clients === 1 ? "" : "s"}`,
        );
      }
    }
    if (selection.modules.length === 0) {
      features.push("Choose HMRC modules on Pricing when you are ready");
    }
    return { label: "Custom", features };
  }

  for (const section of PRICING_SECTIONS) {
    for (const plan of section.plans) {
      const key = `${section.id}:${plan.name}`;
      if (planKey === key || planKey.startsWith(`${key}:`)) {
        return {
          label: `${section.title} — ${plan.name}`,
          features: [...plan.features],
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
