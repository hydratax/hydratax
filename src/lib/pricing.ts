/** Hydra service fee added on top of statutory Companies House charges. */
export const HYDRA_SERVICE_FEE_POUNDS = 25;

/**
 * Discounted Hydra fees for Practice and Custom desk plans (not Solo).
 * Confirmation statements and iXBRL accounts are £0 Hydra on desk plans
 * (unlimited filings included). Incorporation stays at £5 Hydra.
 */
export const HYDRA_CH_DESK_FEES = {
  incorporation: 5,
  "incorporation-same-day": 5,
  "confirmation-statement": 0,
  "accounts-ixbrl": 0,
} as const;

export type DeskPlanTier = "solo" | "desk";

export function qualifiesForChDeskDiscount(planKey: string | null | undefined) {
  if (!planKey) return false;
  return (
    planKey.startsWith("practice:Practice") ||
    planKey.startsWith("practice:Firm") ||
    planKey.startsWith("practice:Custom")
  );
}

export function hydraFeeForChService(
  serviceId: string,
  tier: DeskPlanTier = "solo",
) {
  if (tier === "desk") {
    const discounted =
      HYDRA_CH_DESK_FEES[serviceId as keyof typeof HYDRA_CH_DESK_FEES];
    if (typeof discounted === "number") return discounted;
  }
  return HYDRA_SERVICE_FEE_POUNDS;
}

export function hydraTotal(
  chFeePounds: number,
  serviceId?: string,
  tier: DeskPlanTier = "solo",
) {
  const hydra =
    serviceId != null
      ? hydraFeeForChService(serviceId, tier)
      : HYDRA_SERVICE_FEE_POUNDS;
  return chFeePounds + hydra;
}

/** Practice desk — fixed bundle used as the Custom volume-price ceiling. */
export const PRACTICE_PLAN_PRICE_POUNDS = 79;
export const PRACTICE_PLAN_CLIENT_LIMIT = 50;

/**
 * Custom all-inclusive stays below Practice when scaled by client count.
 * Practice £79 / 50 clients → £790 at 500 clients; Custom targets 90% of that.
 */
export const CUSTOM_VS_PRACTICE_RATIO = 0.9;

/** Billable HMRC modules — priced per client when building a Custom plan */
export const CUSTOM_PLAN_MODULES = [
  {
    id: "vat",
    label: "MTD VAT",
    pricePerClient: 12,
    /** Share of Practice all-inclusive rate (weights sum to 1). */
    weight: 0.2,
    blurb: "Multi-VRN obligations and submit",
    entitlement: "vat" as const,
  },
  {
    id: "payroll",
    label: "PAYE / RTI",
    pricePerClient: 18,
    weight: 0.25,
    blurb: "1 client up to 10 employees · FPS & EPS",
    entitlement: "payroll" as const,
  },
  {
    id: "self_assessment",
    label: "Self Assessment",
    pricePerClient: 15,
    weight: 0.2,
    blurb: "Quarterly updates for sole traders",
    entitlement: "self_assessment" as const,
  },
  {
    id: "corporation_tax",
    label: "CT600",
    pricePerClient: 35,
    weight: 0.35,
    blurb: "Corporation tax returns per company",
    entitlement: "corporation_tax" as const,
  },
] as const;

export type CustomModuleId = (typeof CUSTOM_PLAN_MODULES)[number]["id"];

/** Legacy CH tokens in older Custom plan keys — ignored; CH is included with every Custom desk. */
const LEGACY_CUSTOM_CH_TOKENS = new Set([
  "ch_incorporation",
  "ch_cs",
  "ch_accounts",
]);

export type CustomModuleSelection = {
  id: CustomModuleId;
  clients: number;
};

export type CustomPlanSelection = {
  modules: CustomModuleSelection[];
};

/**
 * @deprecated Custom has no desk fee — kept as 0 for older imports.
 */
export const CUSTOM_PLAN_BASE_POUNDS = 0;

export function customPlanKey(selection: CustomPlanSelection) {
  const modParts = [...selection.modules]
    .filter((m) => m.clients > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => `${m.id}:${Math.max(1, Math.floor(m.clients))}`);
  return modParts.length
    ? `practice:Custom:${modParts.join("+")}`
    : "practice:Custom";
}

export function parseCustomPlanSelection(planKey: string): CustomPlanSelection {
  if (!planKey.startsWith("practice:Custom")) {
    return { modules: [] };
  }
  const rest = planKey.slice("practice:Custom".length);
  if (!rest.startsWith(":")) return { modules: [] };

  const allowedMods = new Set(CUSTOM_PLAN_MODULES.map((m) => m.id));
  const modules: CustomModuleSelection[] = [];

  for (const part of rest.slice(1).split("+").filter(Boolean)) {
    if (LEGACY_CUSTOM_CH_TOKENS.has(part)) continue;
    const [id, clientsRaw] = part.split(":");
    if (!allowedMods.has(id as CustomModuleId)) continue;
    const clients = Math.max(1, Math.floor(Number(clientsRaw) || 1));
    modules.push({ id: id as CustomModuleId, clients });
  }

  return { modules };
}

/** @deprecated Prefer parseCustomPlanSelection */
export function parseCustomPlanModules(planKey: string): CustomModuleId[] {
  return parseCustomPlanSelection(planKey).modules.map((m) => m.id);
}

/**
 * Volume price for one Custom module (exact pounds before rounding).
 * Low client counts stay near list price; as volume grows the rate falls toward
 * that module’s share of (Practice £/client × CUSTOM_VS_PRACTICE_RATIO).
 */
export function customModuleAmountExact(
  moduleId: CustomModuleId,
  clients: number,
): number {
  const mod = CUSTOM_PLAN_MODULES.find((m) => m.id === moduleId);
  if (!mod) return 0;
  const n = Math.max(1, Math.floor(clients));
  const listTotal = mod.pricePerClient * n;
  const volumeCap =
    (PRACTICE_PLAN_PRICE_POUNDS / PRACTICE_PLAN_CLIENT_LIMIT) *
    CUSTOM_VS_PRACTICE_RATIO *
    mod.weight *
    n;
  // n=1 → list; n≥50 → fully on the Practice-beating volume cap
  const t = Math.min(1, Math.log10(n) / Math.log10(PRACTICE_PLAN_CLIENT_LIMIT));
  return Math.max(0, listTotal * (1 - t) + volumeCap * t);
}

export function customModuleAmountPounds(
  moduleId: CustomModuleId,
  clients: number,
): number {
  const exact = customModuleAmountExact(moduleId, clients);
  if (exact <= 0) return 0;
  return Math.max(1, Math.round(exact));
}

/** Effective £ per client after volume discount (for UI). */
export function customModuleEffectiveRatePounds(
  moduleId: CustomModuleId,
  clients: number,
): number {
  const n = Math.max(1, Math.floor(clients));
  return customModuleAmountExact(moduleId, n) / n;
}

export function customPlanAmountPounds(selection: CustomPlanSelection) {
  const exact = selection.modules.reduce((sum, sel) => {
    if (sel.clients <= 0) return sum;
    return sum + customModuleAmountExact(sel.id, sel.clients);
  }, 0);
  if (exact <= 0) return 0;
  return Math.max(1, Math.round(exact));
}

/** Practice-scaled ceiling for an all-inclusive Custom quote at `clients`. */
export function practiceScaledCeilingPounds(clients: number) {
  const n = Math.max(1, Math.floor(clients));
  return Math.round(
    (PRACTICE_PLAN_PRICE_POUNDS / PRACTICE_PLAN_CLIENT_LIMIT) * n,
  );
}

export type ChService = {
  id: string;
  title: string;
  description: string;
  channel: "Digital" | "Software" | "Paper";
  chFeePounds: number;
  popular?: boolean;
};

export const COMPANIES_HOUSE_SERVICES: ChService[] = [
  {
    id: "incorporation",
    title: "Company incorporation",
    description:
      "Register a new limited company digitally with Companies House.",
    channel: "Digital",
    chFeePounds: 100,
    popular: true,
  },
  {
    id: "incorporation-same-day",
    title: "Same-day incorporation",
    description:
      "Software same-day company registration (submit before the Companies House cut-off).",
    channel: "Software",
    chFeePounds: 156,
  },
  {
    id: "confirmation-statement",
    title: "Confirmation statement (CS01)",
    description:
      "Annual confirmation statement — fee charged with the first statement in each 12-month payment period.",
    channel: "Digital",
    chFeePounds: 50,
    popular: true,
  },
  {
    id: "accounts-ixbrl",
    title: "Annual accounts (iXBRL)",
    description:
      "File statutory accounts to Companies House. Statutory filing fee is £0; Hydra prepares and submits.",
    channel: "Software",
    chFeePounds: 0,
    popular: true,
  },
  {
    id: "change-of-name",
    title: "Change of company name",
    description: "File a company name change digitally.",
    channel: "Digital",
    chFeePounds: 20,
  },
  {
    id: "change-of-name-same-day",
    title: "Same-day change of name",
    description: "Expedited digital company name change.",
    channel: "Digital",
    chFeePounds: 85,
  },
];

export function formatGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

const DESK_CH_FEATURES = [
  "New company incorporation — £5 Hydra fee",
  "Confirmation statement — unlimited · £0 Hydra",
  "CH annual accounts — unlimited · £0 Hydra",
] as const;

/** Software / practice pricing — separate sections on /pricing */
export const PRICING_SECTIONS = [
  {
    id: "practice",
    title: "Practice desk",
    subtitle:
      "Solo for one client. Practice & Custom include a 7-day free trial (card at checkout).",
    plans: [
      {
        name: "Solo",
        price: 29,
        period: "/month",
        blurb: "One client desk — PAYE for one employee and one Self Assessment.",
        features: [
          "1 client only",
          "PAYE for 1 employee",
          "1 Self Assessment",
          "Books in integer pence",
          "Immutable audit trail",
          "HMRC-ready filing",
        ],
        cta: "Choose Solo",
        highlighted: false,
      },
      {
        name: "Practice",
        price: PRACTICE_PLAN_PRICE_POUNDS,
        period: "/month",
        blurb:
          "7 days free, then £79/month — capped at 50 clients. No Hydra fees while you trial.",
        features: [
          "7-day free trial — no Hydra fees",
          "Free submissions during trial",
          `Up to ${PRACTICE_PLAN_CLIENT_LIMIT} clients`,
          "CT600 included",
          "MTD VAT included",
          `${PRACTICE_PLAN_CLIENT_LIMIT} Self Assessments included`,
          "Staff roles & deadlines board",
          ...DESK_CH_FEATURES,
          "Priority support queue",
        ],
        cta: "Start free trial",
        highlighted: true,
      },
      {
        name: "Custom",
        price: 12,
        period: "/month",
        blurb:
          "Pick HMRC modules by client count — 7-day free trial, then volume discounts apply.",
        features: [
          "7-day free trial — no Hydra fees",
          "No desk fee after trial — modules only",
          "Cheaper per client as volume grows",
          "PAYE: 1 client up to 10 employees",
          ...DESK_CH_FEATURES,
          "Pay only for HMRC modules you need",
        ],
        cta: "Start free trial",
        highlighted: false,
        customBuilder: true,
      },
    ],
  },
  {
    id: "vat",
    title: "MTD VAT",
    subtitle: "Obligations, box drafts from books, and HMRC submit",
    plans: [
      {
        name: "Single VRN",
        price: 12,
        period: "/month",
        blurb: "One VAT registration — all returns for that VRN.",
        features: [
          "Prepare → review → submit",
          "Fraud-prevention headers",
          "Return history & audit IDs",
        ],
        cta: "Add VAT",
        highlighted: false,
      },
      {
        name: "Practice VAT pack",
        price: 49,
        period: "/month",
        blurb: "Up to 25 VRNs on the Practice desk.",
        features: [
          "Multi-VRN dashboard",
          "Deadline surfacing",
          "Reconnect OAuth per client",
        ],
        cta: "Add VAT pack",
        highlighted: true,
      },
    ],
  },
  {
    id: "ct600",
    title: "Corporation Tax (CT600)",
    subtitle: "CT Online XML filing for limited companies",
    plans: [
      {
        name: "Per return",
        price: 35,
        period: "/filing",
        blurb: "Pay as you file — ideal for seasonal CT work.",
        features: [
          "P&L + balance sheet capture",
          "XML build & submit",
          "Acceptance on audit trail",
        ],
        cta: "File CT600",
        highlighted: false,
      },
      {
        name: "Unlimited CT",
        price: 99,
        period: "/month",
        blurb: "Unlimited CT600 submits for the practice.",
        features: [
          "Prior-period unlocks",
          "Multi-client CT queue",
          "Partner review checklist",
        ],
        cta: "Unlock CT",
        highlighted: true,
      },
    ],
  },
  {
    id: "self-assessment",
    title: "Self Assessment",
    subtitle: "MTD Income Tax digital records and quarterly updates",
    plans: [
      {
        name: "Per taxpayer",
        price: 15,
        period: "/month",
        blurb: "One sole trader or partner.",
        features: [
          "Ledger-linked turnover & expenses",
          "Zod-validated payloads",
          "Correlation ID proof",
        ],
        cta: "Add SA",
        highlighted: false,
      },
      {
        name: "SA practice pack",
        price: 59,
        period: "/month",
        blurb: "Up to 40 Self Assessment clients.",
        features: [
          "Quarterly update board",
          "NINO-linked workspaces",
          "Junior-safe guided submit",
        ],
        cta: "Add SA pack",
        highlighted: true,
      },
    ],
  },
  {
    id: "payroll",
    title: "PAYE & RTI payroll",
    subtitle: "Employees, pay runs, FPS and EPS",
    plans: [
      {
        name: "Starter PAYE",
        price: 18,
        period: "/month",
        blurb: "One employer scheme, up to 5 employees.",
        features: ["Monthly pay calc in pence", "FPS on payday", "EPS no-pay"],
        cta: "Add payroll",
        highlighted: false,
      },
      {
        name: "Practice PAYE",
        price: 69,
        period: "/month",
        blurb: "Up to 15 employer schemes.",
        features: [
          "Multi-employer desk",
          "Pay-run history",
          "RTI status timeline",
        ],
        cta: "Add PAYE pack",
        highlighted: true,
      },
    ],
  },
  {
    id: "companies-house",
    title: "Companies House filings",
    subtitle: `Statutory fee + Hydra service (Solo £${HYDRA_SERVICE_FEE_POUNDS}; Practice/Custom: incorporation £5 Hydra, CS & accounts £0 Hydra)`,
    plans: [
      {
        name: "Confirmation statement",
        price: hydraTotal(50, "confirmation-statement", "desk"),
        period: "/filing",
        blurb: "CH £50 + Hydra £0 on Practice/Custom desk",
        features: [
          "Digital CS01",
          "Unlimited on desk plans",
          "Filing receipt stored",
        ],
        cta: "View CH services",
        highlighted: true,
        href: "/companies-house",
      },
      {
        name: "Incorporation",
        price: hydraTotal(100, "incorporation", "desk"),
        period: "/filing",
        blurb: "CH £100 + Hydra £5 on Practice/Custom desk",
        features: [
          "New company incorporation",
          "Guided company details",
          "Post-incorporation checklist",
        ],
        cta: "View CH services",
        highlighted: false,
        href: "/companies-house",
      },
      {
        name: "iXBRL accounts",
        price: hydraTotal(0, "accounts-ixbrl", "desk"),
        period: "/filing",
        blurb: "CH £0 + Hydra £0 on Practice/Custom desk",
        features: [
          "Software accounts filing",
          "Unlimited on desk plans",
          "Status tracking",
        ],
        cta: "View CH services",
        highlighted: false,
        href: "/companies-house",
      },
    ],
  },
] as const;
