/**
 * Maps Stripe plan keys → dashboard module access.
 * Practices without a paid plan see locked rails with upgrade CTAs.
 */

import {
  CUSTOM_PLAN_MODULES,
  basePlanKey,
  parseCustomPlanSelection,
} from "@/lib/pricing";

export type ServiceModule =
  | "clients"
  | "books"
  | "documents"
  | "vat"
  | "self_assessment"
  | "corporation_tax"
  | "payroll"
  | "companies_house"
  | "practice_desk";

export type PlanEntitlement = {
  planKey: string;
  label: string;
  modules: ServiceModule[];
  maxClients: number | null;
  /** Optional aliases for older Stripe / stored plan keys. */
  aliases?: string[];
};

const ALL_TAX: ServiceModule[] = [
  "clients",
  "books",
  "documents",
  "vat",
  "self_assessment",
  "corporation_tax",
  "payroll",
  "companies_house",
  "practice_desk",
];

export const PLAN_ENTITLEMENTS: PlanEntitlement[] = [
  {
    planKey: "practice:Solo",
    label: "Solo",
    modules: ALL_TAX,
    maxClients: 1,
  },
  {
    planKey: "practice:Practice",
    label: "Small Firm",
    aliases: ["practice:Small Firm"],
    modules: ALL_TAX,
    maxClients: 10,
  },
  {
    planKey: "practice:Firm",
    label: "Firm",
    modules: ALL_TAX,
    maxClients: null,
  },
  {
    planKey: "practice:Custom",
    label: "Enterprise",
    aliases: ["practice:Enterprise"],
    modules: ["clients", "books", "documents", "companies_house", "practice_desk"],
    maxClients: 10_000,
  },
  {
    planKey: "vat:One company or sole trader",
    label: "One company or sole trader",
    aliases: ["vat:Single VRN"],
    modules: ["clients", "books", "documents", "vat"],
    maxClients: 1,
  },
  {
    planKey: "vat:VAT practice pack",
    label: "VAT practice pack",
    aliases: ["vat:Practice VAT pack"],
    modules: ["clients", "books", "documents", "vat", "practice_desk"],
    maxClients: 15,
  },
  {
    planKey: "ct600:Per return",
    label: "CT600 per return",
    modules: ["clients", "books", "documents", "corporation_tax"],
    maxClients: 1,
  },
  {
    planKey: "ct600:CT practice pack",
    label: "CT practice pack",
    aliases: ["ct600:Unlimited CT"],
    modules: [
      "clients",
      "books",
      "documents",
      "corporation_tax",
      "practice_desk",
    ],
    maxClients: 15,
  },
  {
    planKey: "self-assessment:1 SA return",
    label: "1 SA return",
    aliases: ["self-assessment:Per taxpayer"],
    modules: ["clients", "books", "documents", "self_assessment"],
    maxClients: 1,
  },
  {
    planKey: "self-assessment:SA practice pack",
    label: "SA practice pack",
    modules: [
      "clients",
      "books",
      "documents",
      "self_assessment",
      "practice_desk",
    ],
    maxClients: 15,
  },
  {
    planKey: "payroll:One employer",
    label: "One employer",
    aliases: ["payroll:Starter PAYE"],
    modules: ["clients", "books", "documents", "payroll"],
    maxClients: 1,
  },
  {
    planKey: "payroll:Practice PAYE",
    label: "Practice PAYE",
    modules: ["clients", "books", "documents", "payroll", "practice_desk"],
    maxClients: 15,
  },
];

/** Companies House one-offs unlock the CH module for that practice */
export function isCompaniesHousePlan(planKey: string) {
  return planKey.startsWith("companies-house:");
}

function findPlanEntitlement(key: string): PlanEntitlement | undefined {
  const direct = PLAN_ENTITLEMENTS.find((p) => p.planKey === key);
  if (direct) return direct;
  return PLAN_ENTITLEMENTS.find((p) => p.aliases?.includes(key));
}

/** Pricing page hash for a locked service module. */
export function pricingHashForModule(module: ServiceModule): string {
  switch (module) {
    case "vat":
      return "vat";
    case "corporation_tax":
      return "ct600";
    case "self_assessment":
      return "self-assessment";
    case "payroll":
      return "payroll";
    case "companies_house":
      return "companies-house";
    default:
      return "practice";
  }
}

export function entitlementsForPlans(planKeys: string[]): {
  modules: Set<ServiceModule>;
  plans: PlanEntitlement[];
  maxClients: number | null;
  hasAnyPaid: boolean;
} {
  const modules = new Set<ServiceModule>();
  const plans: PlanEntitlement[] = [];
  let maxClients: number | null = 0;
  let unlimited = false;

  for (const rawKey of planKeys) {
    const key = basePlanKey(rawKey);
    if (isCompaniesHousePlan(key)) {
      modules.add("companies_house");
      modules.add("clients");
      modules.add("documents");
      continue;
    }
    if (key.startsWith("practice:Custom")) {
      modules.add("clients");
      modules.add("books");
      modules.add("documents");
      modules.add("companies_house");
      modules.add("practice_desk");
      const selection = parseCustomPlanSelection(key);
      let clientCap = 0;
      let customUnlimited = false;
      for (const mod of CUSTOM_PLAN_MODULES) {
        const hit = selection.modules.find((m) => m.id === mod.id);
        if (hit) {
          modules.add(mod.entitlement);
          if (hit.clients == null) {
            customUnlimited = true;
          } else {
            clientCap = Math.max(clientCap, hit.clients);
          }
        }
      }
      const maxForPlan = customUnlimited
        ? null
        : Math.max(clientCap, selection.modules.length ? 1 : 0);
      plans.push({
        planKey: rawKey,
        label: "Enterprise",
        modules: [...modules] as ServiceModule[],
        maxClients: maxForPlan,
      });
      if (customUnlimited) {
        unlimited = true;
      } else if (typeof maxClients === "number") {
        maxClients = Math.max(maxClients, maxForPlan ?? 0);
      }
      continue;
    }
    const ent = findPlanEntitlement(key);
    if (!ent) continue;
    plans.push(ent);
    for (const m of ent.modules) modules.add(m);
    if (ent.maxClients === null) unlimited = true;
    else if (typeof maxClients === "number") {
      maxClients = Math.max(maxClients, ent.maxClients);
    }
  }

  return {
    modules,
    plans,
    maxClients: unlimited ? null : maxClients === 0 ? 0 : maxClients,
    hasAnyPaid: planKeys.length > 0,
  };
}

export function moduleLabel(m: ServiceModule): string {
  const map: Record<ServiceModule, string> = {
    clients: "Clients",
    books: "Books",
    documents: "Documents",
    vat: "MTD VAT",
    self_assessment: "Self Assessment",
    corporation_tax: "Corporation Tax",
    payroll: "PAYE / RTI",
    companies_house: "Companies House",
    practice_desk: "Practice desk",
  };
  return map[m];
}

/** Tax rails gated by Stripe plan entitlements (not team role alone). */
export function isPlanGatedModule(
  module: string,
): module is Extract<
  ServiceModule,
  "vat" | "self_assessment" | "corporation_tax" | "payroll" | "companies_house"
> {
  return (
    module === "vat" ||
    module === "self_assessment" ||
    module === "corporation_tax" ||
    module === "payroll" ||
    module === "companies_house"
  );
}
