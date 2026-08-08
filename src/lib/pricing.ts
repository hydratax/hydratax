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

/** Billable HMRC modules — priced per client when building a Custom plan */
export const CUSTOM_PLAN_MODULES = [
  {
    id: "vat",
    label: "MTD VAT",
    pricePerClient: 12,
    blurb: "Multi-VRN obligations and submit",
    entitlement: "vat" as const,
  },
  {
    id: "payroll",
    label: "PAYE / RTI",
    pricePerClient: 18,
    blurb: "Employers, pay runs, FPS & EPS",
    entitlement: "payroll" as const,
  },
  {
    id: "self_assessment",
    label: "Self Assessment",
    pricePerClient: 15,
    blurb: "Quarterly updates for sole traders",
    entitlement: "self_assessment" as const,
  },
  {
    id: "corporation_tax",
    label: "CT600",
    pricePerClient: 35,
    blurb: "Corporation tax returns per company",
    entitlement: "corporation_tax" as const,
  },
] as const;

export type CustomModuleId = (typeof CUSTOM_PLAN_MODULES)[number]["id"];

/** Companies House add-ons — no monthly fee on Custom */
export const CUSTOM_CH_ADDONS = [
  {
    id: "ch_incorporation",
    label: "New company incorporation",
    blurb: "No monthly fee · desk Hydra rate £5 per filing + CH statutory fee",
  },
  {
    id: "ch_cs",
    label: "Confirmation statement",
    blurb: "Unlimited CS01 filings · no monthly fee · £0 Hydra on desk",
  },
  {
    id: "ch_accounts",
    label: "Annual accounts (iXBRL)",
    blurb: "Unlimited accounts filings · no monthly fee · £0 Hydra on desk",
  },
] as const;

export type CustomChAddonId = (typeof CUSTOM_CH_ADDONS)[number]["id"];

export type CustomModuleSelection = {
  id: CustomModuleId;
  clients: number;
};

export type CustomPlanSelection = {
  modules: CustomModuleSelection[];
  chAddons: CustomChAddonId[];
};

/** Base monthly fee for Custom desk (workspace) before HMRC modules */
export const CUSTOM_PLAN_BASE_POUNDS = 39;

export function customPlanKey(selection: CustomPlanSelection) {
  const modParts = [...selection.modules]
    .filter((m) => m.clients > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => `${m.id}:${Math.max(1, Math.floor(m.clients))}`);
  const chParts = [...new Set(selection.chAddons)].sort();
  const parts = [...modParts, ...chParts];
  return parts.length
    ? `practice:Custom:${parts.join("+")}`
    : "practice:Custom";
}

export function parseCustomPlanSelection(planKey: string): CustomPlanSelection {
  if (!planKey.startsWith("practice:Custom")) {
    return { modules: [], chAddons: [] };
  }
  const rest = planKey.slice("practice:Custom".length);
  if (!rest.startsWith(":")) return { modules: [], chAddons: [] };

  const allowedMods = new Set(CUSTOM_PLAN_MODULES.map((m) => m.id));
  const allowedCh = new Set(CUSTOM_CH_ADDONS.map((a) => a.id));
  const modules: CustomModuleSelection[] = [];
  const chAddons: CustomChAddonId[] = [];

  for (const part of rest.slice(1).split("+").filter(Boolean)) {
    if (allowedCh.has(part as CustomChAddonId)) {
      chAddons.push(part as CustomChAddonId);
      continue;
    }
    const [id, clientsRaw] = part.split(":");
    if (!allowedMods.has(id as CustomModuleId)) continue;
    const clients = Math.max(1, Math.floor(Number(clientsRaw) || 1));
    modules.push({ id: id as CustomModuleId, clients });
  }

  return { modules, chAddons };
}

/** @deprecated Prefer parseCustomPlanSelection */
export function parseCustomPlanModules(planKey: string): CustomModuleId[] {
  return parseCustomPlanSelection(planKey).modules.map((m) => m.id);
}

export function customPlanAmountPounds(selection: CustomPlanSelection) {
  const moduleTotal = selection.modules.reduce((sum, sel) => {
    const mod = CUSTOM_PLAN_MODULES.find((m) => m.id === sel.id);
    if (!mod) return sum;
    return sum + mod.pricePerClient * Math.max(1, Math.floor(sel.clients));
  }, 0);
  // CH add-ons: £0 monthly
  return CUSTOM_PLAN_BASE_POUNDS + moduleTotal;
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
  {
    id: "voluntary-strike-off",
    title: "Voluntary strike off (DS01)",
    description: "Apply to close / strike off a company digitally.",
    channel: "Digital",
    chFeePounds: 13,
  },
  {
    id: "registration-of-charge",
    title: "Registration of a charge",
    description: "Register a charge against the company.",
    channel: "Digital",
    chFeePounds: 14,
  },
  {
    id: "certificate-incorporation",
    title: "Certificate of incorporation (post)",
    description: "Order a certificate of incorporation by post.",
    channel: "Paper",
    chFeePounds: 22,
  },
  {
    id: "certified-copy",
    title: "Certified copy of a document",
    description:
      "Certified copy of a filed document by post (£22 standard per Companies House fees).",
    channel: "Paper",
    chFeePounds: 22,
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
    subtitle: "Multi-client workspace for accountants and bookkeepers",
    plans: [
      {
        name: "Solo",
        price: 29,
        period: "/month",
        blurb: "For sole practitioners with a focused client list.",
        features: [
          "Up to 15 clients",
          "Books in integer pence",
          "Immutable audit trail",
          "HMRC-ready filing",
        ],
        cta: "Start solo",
        highlighted: false,
      },
      {
        name: "Practice",
        price: 79,
        period: "/month",
        blurb: "The Hydra desk for growing firms.",
        features: [
          "Up to 100 clients",
          "Staff roles & deadlines board",
          "All HMRC filings unlocked",
          ...DESK_CH_FEATURES,
          "Priority support queue",
        ],
        cta: "Choose Practice",
        highlighted: true,
      },
      {
        name: "Custom",
        price: CUSTOM_PLAN_BASE_POUNDS,
        period: "/month",
        blurb:
          "Pick HMRC modules by client count — Companies House add-ons at no monthly fee.",
        features: [
          "Quote scales with clients per service",
          "Practice workspace included",
          ...DESK_CH_FEATURES,
          "Pay only for modules you need",
        ],
        cta: "Build custom plan",
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
