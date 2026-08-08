/** Hydra service fee added on top of statutory Companies House charges. */
export const HYDRA_SERVICE_FEE_POUNDS = 25;

/** Discounted Hydra fees for Practice, Firm, and Custom desk plans (not Solo). */
export const HYDRA_CH_DESK_FEES = {
  incorporation: 5,
  "incorporation-same-day": 5,
  "confirmation-statement": 1,
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

/** Modules you can mix into a Custom practice desk plan */
export const CUSTOM_PLAN_MODULES = [
  {
    id: "vat",
    label: "MTD VAT",
    price: 49,
    blurb: "Multi-VRN obligations and submit",
    entitlement: "vat" as const,
  },
  {
    id: "payroll",
    label: "PAYE / RTI",
    price: 69,
    blurb: "Employers, pay runs, FPS & EPS",
    entitlement: "payroll" as const,
  },
  {
    id: "self_assessment",
    label: "Self Assessment",
    price: 59,
    blurb: "Quarterly updates for sole traders",
    entitlement: "self_assessment" as const,
  },
  {
    id: "corporation_tax",
    label: "CT600",
    price: 99,
    blurb: "Unlimited corporation tax returns",
    entitlement: "corporation_tax" as const,
  },
] as const;

export type CustomModuleId = (typeof CUSTOM_PLAN_MODULES)[number]["id"];

/** Base monthly fee for Custom desk (workspace + CH discounts) before modules */
export const CUSTOM_PLAN_BASE_POUNDS = 39;

export function customPlanKey(modules: CustomModuleId[]) {
  const sorted = [...new Set(modules)].sort();
  return sorted.length
    ? `practice:Custom:${sorted.join("+")}`
    : "practice:Custom";
}

export function parseCustomPlanModules(planKey: string): CustomModuleId[] {
  if (!planKey.startsWith("practice:Custom")) return [];
  const rest = planKey.slice("practice:Custom".length);
  if (!rest.startsWith(":")) return [];
  const ids = rest.slice(1).split("+").filter(Boolean);
  const allowed = new Set(CUSTOM_PLAN_MODULES.map((m) => m.id));
  return ids.filter((id): id is CustomModuleId =>
    allowed.has(id as CustomModuleId),
  );
}

export function customPlanAmountPounds(modules: CustomModuleId[]) {
  const selected = CUSTOM_PLAN_MODULES.filter((m) => modules.includes(m.id));
  return (
    CUSTOM_PLAN_BASE_POUNDS +
    selected.reduce((sum, m) => sum + m.price, 0)
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
          "CH incorporation £5 · CS £1 Hydra fee",
          "Priority support queue",
        ],
        cta: "Choose Practice",
        highlighted: true,
      },
      {
        name: "Firm",
        price: 199,
        period: "/month",
        blurb: "High-volume practices and multi-office teams.",
        features: [
          "Unlimited clients",
          "Team workspaces",
          "Dedicated onboarding",
          "CH incorporation £5 · CS £1 Hydra fee",
          "Custom SLA",
        ],
        cta: "Choose Firm",
        highlighted: false,
      },
      {
        name: "Custom",
        price: CUSTOM_PLAN_BASE_POUNDS,
        period: "/month",
        blurb: "Build your own mix of VAT, PAYE, SA and CT — with desk CH rates.",
        features: [
          "Pick VAT, PAYE, SA and/or CT",
          "Practice workspace included",
          "CH incorporation £5 · CS £1 Hydra fee",
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
    subtitle: `Statutory fee + Hydra service (Solo £${HYDRA_SERVICE_FEE_POUNDS}; Practice/Firm/Custom: incorporation £5, CS £1)`,
    plans: [
      {
        name: "Confirmation statement",
        price: hydraTotal(50),
        period: "/filing",
        blurb: `CH £50 + Hydra £${HYDRA_SERVICE_FEE_POUNDS}`,
        features: [
          "Digital CS01",
          "Practice client linkage",
          "Filing receipt stored",
        ],
        cta: "View CH services",
        highlighted: true,
        href: "/companies-house",
      },
      {
        name: "Incorporation",
        price: hydraTotal(100),
        period: "/filing",
        blurb: `CH £100 + Hydra £${HYDRA_SERVICE_FEE_POUNDS}`,
        features: [
          "Digital incorporation",
          "Guided company details",
          "Post-incorporation checklist",
        ],
        cta: "View CH services",
        highlighted: false,
        href: "/companies-house",
      },
      {
        name: "iXBRL accounts",
        price: hydraTotal(0),
        period: "/filing",
        blurb: `CH £0 + Hydra £${HYDRA_SERVICE_FEE_POUNDS}`,
        features: [
          "Software accounts filing",
          "Micro-entity friendly",
          "Status tracking",
        ],
        cta: "View CH services",
        highlighted: false,
        href: "/companies-house",
      },
    ],
  },
] as const;
