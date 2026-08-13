/**
 * Maps Stripe plan keys → dashboard module access.
 * Practices without a paid plan see locked rails with upgrade CTAs.
 */

import {
  CUSTOM_PLAN_MODULES,
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
    label: "Practice",
    modules: ALL_TAX,
    maxClients: 50,
  },
  {
    planKey: "practice:Firm",
    label: "Firm",
    modules: ALL_TAX,
    maxClients: null,
  },
  {
    planKey: "practice:Custom",
    label: "Custom",
    modules: ["clients", "books", "documents", "companies_house", "practice_desk"],
    maxClients: 500,
  },
  {
    planKey: "vat:Single VRN",
    label: "Single VRN",
    modules: ["clients", "books", "documents", "vat"],
    maxClients: 1,
  },
  {
    planKey: "vat:Practice VAT pack",
    label: "Practice VAT pack",
    modules: ["clients", "books", "documents", "vat", "practice_desk"],
    maxClients: 25,
  },
  {
    planKey: "ct600:Per return",
    label: "CT600 per return",
    modules: ["clients", "books", "documents", "corporation_tax"],
    maxClients: null,
  },
  {
    planKey: "ct600:Unlimited CT",
    label: "Unlimited CT",
    modules: [
      "clients",
      "books",
      "documents",
      "corporation_tax",
      "practice_desk",
    ],
    maxClients: null,
  },
  {
    planKey: "self-assessment:Per taxpayer",
    label: "SA per taxpayer",
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
    maxClients: 40,
  },
  {
    planKey: "payroll:Starter PAYE",
    label: "Starter PAYE",
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

  for (const key of planKeys) {
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
      for (const mod of CUSTOM_PLAN_MODULES) {
        const hit = selection.modules.find((m) => m.id === mod.id);
        if (hit) {
          modules.add(mod.entitlement);
          clientCap = Math.max(clientCap, hit.clients);
        }
      }
      const maxForPlan = Math.max(clientCap, 15);
      plans.push({
        planKey: key,
        label: "Custom",
        modules: [...modules] as ServiceModule[],
        maxClients: maxForPlan,
      });
      if (typeof maxClients === "number") {
        maxClients = Math.max(maxClients, maxForPlan);
      }
      continue;
    }
    const ent = PLAN_ENTITLEMENTS.find((p) => p.planKey === key);
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
