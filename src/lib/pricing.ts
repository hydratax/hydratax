/**
 * Fallback Hydra software fee when a CH service id is not listed below.
 * Prefer {@link HYDRA_CH_SOLO_FEES} for known services.
 */
export const HYDRA_SERVICE_FEE_POUNDS = 20;

/**
 * Solo / one-off Companies House checkout — Hydra software fee only.
 * Companies House statutory fees stay in `chFeePounds` (GOV.UK).
 * Totals: incorporation £100 · same-day £171 · CS01 £65 · accounts £25 ·
 * name £40 · same-day name £105.
 */
export const HYDRA_CH_SOLO_FEES: Record<string, number> = {
  incorporation: 0,
  "incorporation-same-day": 15,
  "confirmation-statement": 15,
  "accounts-ixbrl": 25,
  "change-of-name": 20,
  "change-of-name-same-day": 20,
};

/**
 * Practice and Custom desk plans — CH filings included on the desk.
 * Incorporation has no added fee; CS and accounts are unlimited at £0 add-on.
 */
export const HYDRA_CH_DESK_FEES = {
  incorporation: 0,
  "incorporation-same-day": 0,
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
  if (Object.prototype.hasOwnProperty.call(HYDRA_CH_SOLO_FEES, serviceId)) {
    return HYDRA_CH_SOLO_FEES[serviceId]!;
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

/** Solo desk — one client, all HMRC rails. */
export const SOLO_PLAN_PRICE_POUNDS = 29;

/** Small Firm desk — fixed bundle; Enterprise volume pricing stays under this at 10 clients. */
export const PRACTICE_PLAN_PRICE_POUNDS = 79;
/** Small Firm desk: from 2 up to 10 clients. */
export const PRACTICE_PLAN_CLIENT_LIMIT = 10;
export const PRACTICE_PLAN_CLIENT_MIN = 2;

/**
 * Enterprise all-modules volume anchor: at this many clients per module,
 * the all-inclusive monthly total stays under £5,000.
 */
export const ENTERPRISE_VOLUME_ANCHOR_CLIENTS = 1000;
export const ENTERPRISE_VOLUME_MAX_POUNDS = 4990;

/** Yearly desk plans (Solo / Small Firm / Enterprise): 15% off ≈ almost 2 months free. */
export const YEARLY_DISCOUNT = 0.15;
export const YEARLY_MARKETING_LINE =
  "Get almost 2 months free when you choose a yearly subscription";

export function isYearlyPlanKey(planKey: string): boolean {
  return planKey.endsWith(":yearly");
}

/** Strip `:yearly` so entitlements and Custom module parsing stay monthly-keyed. */
export function basePlanKey(planKey: string): string {
  return isYearlyPlanKey(planKey) ? planKey.slice(0, -":yearly".length) : planKey;
}

export function withYearlyPlanKey(planKey: string): string {
  return isYearlyPlanKey(planKey) ? planKey : `${planKey}:yearly`;
}

/** Annual charge in whole pounds after 15% off (12 × monthly × 0.85). */
export function yearlyAmountPoundsFromMonthly(monthlyPounds: number): number {
  return Math.max(1, Math.round(monthlyPounds * 12 * (1 - YEARLY_DISCOUNT)));
}

export function yearlySavingsPoundsFromMonthly(monthlyPounds: number): number {
  return Math.max(0, monthlyPounds * 12 - yearlyAmountPoundsFromMonthly(monthlyPounds));
}

/**
 * Enterprise all-inclusive stays below Small Firm when scaled to 10 clients.
 * Small Firm £79 → volume mid-target 90% of that (£71.10 at 10 clients).
 */
export const CUSTOM_VS_PRACTICE_RATIO = 0.9;

/** Enterprise starts above Small Firm (2–10) — minimum clients per module. */
export const CUSTOM_PLAN_MIN_CLIENTS = 11;

/** Max clients selectable on an Enterprise module. */
export const CUSTOM_PLAN_MAX_CLIENTS = 10_000;

/** Shared marketing points on every HMRC add-on card. */
export const SHARED_ADDON_FEATURES = [
  "Smooth filing",
  "Downloadable files accessible for life",
  "Easy upgrade to add more features",
] as const;

/** PAYE employee cap per employer on add-on plans. */
export const PAYE_EMPLOYEES_PER_EMPLOYER = 10;

/**
 * Billable HMRC modules on Enterprise — priced per client with volume discounts.
 * Volume pricing from {CUSTOM_PLAN_MIN_CLIENTS}+ clients. Companies House included.
 */
export const CUSTOM_PLAN_MODULES = [
  {
    id: "vat",
    label: "MTD VAT",
    /** Flat fee if plan key has bare module id (legacy unlimited keys). */
    unlimitedPricePounds: 190,
    pricePerClient: 6,
    weight: 0.2,
    blurb: "One company or sole trader · MTD obligations & submit",
    entitlement: "vat" as const,
  },
  {
    id: "payroll",
    label: "PAYE / RTI",
    unlimitedPricePounds: 190,
    pricePerClient: 7,
    weight: 0.25,
    blurb: `1 company up to ${PAYE_EMPLOYEES_PER_EMPLOYER} employees · FPS & EPS`,
    entitlement: "payroll" as const,
  },
  {
    id: "self_assessment",
    label: "Self Assessment",
    unlimitedPricePounds: 499,
    pricePerClient: 6,
    weight: 0.2,
    blurb: "Self Assessment · quarterly updates for sole traders",
    entitlement: "self_assessment" as const,
  },
  {
    id: "corporation_tax",
    label: "CT600",
    unlimitedPricePounds: 350,
    pricePerClient: 10,
    weight: 0.35,
    blurb: "Dormant & trading CT600 per company",
    entitlement: "corporation_tax" as const,
  },
] as const;

export type CustomModuleId = (typeof CUSTOM_PLAN_MODULES)[number]["id"];

/**
 * Single-module Enterprise floors — stop undercutting dedicated add-on packs.
 * `packPricePounds` is the **monthly-equivalent** of the pack (one-off / yearly ÷ 12).
 * Amount is at least packEquiv × (clients / packClients) × ratio near pack size.
 */
export const ENTERPRISE_MODULE_PACK_FLOORS: Record<
  CustomModuleId,
  { packPricePounds: number; packClients: number }
> = {
  vat: { packPricePounds: 190, packClients: 15 }, // monthly pack
  payroll: { packPricePounds: 190, packClients: 15 }, // monthly pack
  self_assessment: { packPricePounds: 499 / 12, packClients: 15 }, // £499/year
  corporation_tax: { packPricePounds: 350 / 12, packClients: 15 }, // £350/year → monthly equiv
};

/** Stay just under the dedicated pack (10% courtesy) so Enterprise is still a deal, not a bypass. */
export const ENTERPRISE_PACK_FLOOR_RATIO = 0.9;

/** Legacy CH tokens in older Custom plan keys — ignored; CH is included with every Custom desk. */
const LEGACY_CUSTOM_CH_TOKENS = new Set([
  "ch_incorporation",
  "ch_cs",
  "ch_accounts",
]);

export type CustomModuleSelection = {
  id: CustomModuleId;
  /**
   * Client count for volume pricing (1–CUSTOM_PLAN_MAX_CLIENTS).
   * `null` = unlimited flat fee (legacy bare module keys only).
   */
  clients: number | null;
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
    .filter((m) => m.clients === null || m.clients > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) =>
      m.clients == null
        ? m.id
        : `${m.id}:${Math.max(1, Math.floor(m.clients))}`,
    );
  return modParts.length
    ? `practice:Custom:${modParts.join("+")}`
    : "practice:Custom";
}

export function parseCustomPlanSelection(planKey: string): CustomPlanSelection {
  const key = basePlanKey(planKey);
  if (!key.startsWith("practice:Custom")) {
    return { modules: [] };
  }
  const rest = key.slice("practice:Custom".length);
  if (!rest.startsWith(":")) return { modules: [] };

  const allowedMods = new Set(CUSTOM_PLAN_MODULES.map((m) => m.id));
  const modules: CustomModuleSelection[] = [];

  for (const part of rest.slice(1).split("+").filter(Boolean)) {
    if (LEGACY_CUSTOM_CH_TOKENS.has(part) || part === "yearly") continue;
    const [id, clientsRaw] = part.split(":");
    if (!allowedMods.has(id as CustomModuleId)) continue;
    // Bare module id (vat) or explicit "unlimited" → unlimited
    if (
      clientsRaw == null ||
      clientsRaw === "" ||
      clientsRaw.toLowerCase() === "unlimited"
    ) {
      modules.push({ id: id as CustomModuleId, clients: null });
      continue;
    }
    const clients = Math.max(
      CUSTOM_PLAN_MIN_CLIENTS,
      Math.min(
        CUSTOM_PLAN_MAX_CLIENTS,
        Math.floor(Number(clientsRaw) || CUSTOM_PLAN_MIN_CLIENTS),
      ),
    );
    modules.push({ id: id as CustomModuleId, clients });
  }

  return { modules };
}

/** @deprecated Prefer parseCustomPlanSelection */
export function parseCustomPlanModules(planKey: string): CustomModuleId[] {
  return parseCustomPlanSelection(planKey).modules.map((m) => m.id);
}

/**
 * Volume price for one Enterprise module (exact pounds before rounding).
 * - n=1 → list (all modules sum to Solo £29)
 * - n=10 → under Small Firm (£79 × 0.9 all-in)
 * - n=1000 → under £5,000 all-in (ENTERPRISE_VOLUME_MAX_POUNDS)
 */
export function customModuleAmountExact(
  moduleId: CustomModuleId,
  clients: number,
): number {
  const mod = CUSTOM_PLAN_MODULES.find((m) => m.id === moduleId);
  if (!mod) return 0;
  const n = Math.max(
    CUSTOM_PLAN_MIN_CLIENTS,
    Math.min(CUSTOM_PLAN_MAX_CLIENTS, Math.floor(clients)),
  );
  const listTotal = mod.pricePerClient * n;
  const midTotal =
    (PRACTICE_PLAN_PRICE_POUNDS / PRACTICE_PLAN_CLIENT_LIMIT) *
    CUSTOM_VS_PRACTICE_RATIO *
    mod.weight *
    n;
  const floorTotal =
    (ENTERPRISE_VOLUME_MAX_POUNDS / ENTERPRISE_VOLUME_ANCHOR_CLIENTS) *
    mod.weight *
    n;

  if (n <= 1) return listTotal;

  if (n <= PRACTICE_PLAN_CLIENT_LIMIT) {
    const t = Math.log10(n) / Math.log10(PRACTICE_PLAN_CLIENT_LIMIT);
    return Math.max(0, listTotal * (1 - t) + midTotal * t);
  }

  let exact: number;
  if (n <= ENTERPRISE_VOLUME_ANCHOR_CLIENTS) {
    const t =
      Math.log10(n / PRACTICE_PLAN_CLIENT_LIMIT) /
      Math.log10(
        ENTERPRISE_VOLUME_ANCHOR_CLIENTS / PRACTICE_PLAN_CLIENT_LIMIT,
      );
    exact = midTotal * (1 - t) + floorTotal * t;
  } else {
    exact = floorTotal;
  }

  // Stop single-module Enterprise undercutting pack monthly-equivalents (e.g. CT £350/year → £350/12).
  // Hold near pack×ratio around pack size, then ease back to the volume curve by 1000.
  const packFloor = ENTERPRISE_MODULE_PACK_FLOORS[moduleId];
  if (packFloor) {
    const { packPricePounds, packClients } = packFloor;
    if (n <= packClients) {
      exact = Math.max(
        exact,
        packPricePounds * (n / packClients) * ENTERPRISE_PACK_FLOOR_RATIO,
      );
    } else if (n < ENTERPRISE_VOLUME_ANCHOR_CLIENTS) {
      const packAtPack = packPricePounds * ENTERPRISE_PACK_FLOOR_RATIO;
      const t =
        Math.log10(n / packClients) /
        Math.log10(ENTERPRISE_VOLUME_ANCHOR_CLIENTS / packClients);
      const minAllowed = packAtPack * (1 - t) + exact * t;
      exact = Math.max(exact, minAllowed);
    }
  }

  return Math.max(0, exact);
}

export function customModuleAmountPounds(
  moduleId: CustomModuleId,
  clients: number | null = null,
): number {
  const mod = CUSTOM_PLAN_MODULES.find((m) => m.id === moduleId);
  if (!mod) return 0;
  if (clients == null) return mod.unlimitedPricePounds;
  const exact = customModuleAmountExact(moduleId, clients);
  if (exact <= 0) return 0;
  return Math.max(1, Math.round(exact));
}

/** Effective £ per client after volume discount (legacy UI / keys only). */
export function customModuleEffectiveRatePounds(
  moduleId: CustomModuleId,
  clients: number,
): number {
  const n = Math.max(1, Math.floor(clients));
  return customModuleAmountExact(moduleId, n) / n;
}

export function customPlanAmountPounds(selection: CustomPlanSelection) {
  const exact = selection.modules.reduce((sum, sel) => {
    if (sel.clients !== null && sel.clients <= 0) return sum;
    return sum + customModuleAmountPounds(sel.id, sel.clients);
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
      "File statutory accounts to Companies House. Companies House statutory fee £0 — Hydra software fee £25.",
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
  "New company incorporation",
  "Confirmation statement — unlimited on desk",
  "CH annual accounts — unlimited on desk",
] as const;

/**
 * Stable Stripe / entitlement key fragment. Display `name` can change;
 * `checkoutKey` keeps `practice:Practice` / `practice:Custom` working.
 */
export function pricingCheckoutKey(
  sectionId: string,
  plan: { name: string; checkoutKey?: string },
): string {
  return `${sectionId}:${plan.checkoutKey ?? plan.name}`;
}

/** Software / practice pricing — separate sections on /pricing */
export const PRICING_SECTIONS = [
  {
    id: "practice",
    title: "Practice desk",
    subtitle:
      "Solo for one client. Small Firm (2–10 clients) & Enterprise include a 7-day free trial (card at checkout).",
    plans: [
      {
        name: "Solo",
        price: SOLO_PLAN_PRICE_POUNDS,
        period: "/month",
        blurb:
          "One client — dormant or trading accounts, CT600, VAT, letters & forms.",
        features: [
          "1 client only",
          "Dormant company accounts filing",
          "Trading company accounts filing",
          "CT600 corporation tax return",
          "MTD VAT obligations & submit",
          "Custom letters and forms",
          `PAYE for up to ${PAYE_EMPLOYEES_PER_EMPLOYER} employees`,
          "1 Self Assessment",
          "Books in integer pence",
          "Immutable audit trail",
          "Can be cancelled anytime",
        ],
        cta: "Choose Solo",
        highlighted: false,
      },
      {
        name: "Small Firm",
        checkoutKey: "Practice",
        price: PRACTICE_PLAN_PRICE_POUNDS,
        period: "/month",
        blurb: `7 days free, then £${PRACTICE_PLAN_PRICE_POUNDS}/month — for firms with ${PRACTICE_PLAN_CLIENT_MIN} to ${PRACTICE_PLAN_CLIENT_LIMIT} clients.`,
        features: [
          "7-day free trial",
          "Prepare during trial",
          `${PRACTICE_PLAN_CLIENT_MIN}–${PRACTICE_PLAN_CLIENT_LIMIT} clients`,
          "CT600 included",
          "MTD VAT included",
          "Dormant & trading accounts",
          "Custom letters and forms",
          `${PRACTICE_PLAN_CLIENT_LIMIT} Self Assessments included`,
          "Staff roles & deadlines board",
          ...DESK_CH_FEATURES,
          "Priority support queue",
          "Can be cancelled anytime",
        ],
        cta: "Start free trial",
        highlighted: true,
      },
      {
        name: "Enterprise",
        checkoutKey: "Custom",
        price: SOLO_PLAN_PRICE_POUNDS,
        period: "/month",
        blurb: `Select HMRC services below (min ${CUSTOM_PLAN_MIN_CLIENTS} clients each).`,
        features: [
          "7-day free trial",
          "No desk fee after trial — modules only",
          "Cheaper per client as volume grows",
          `PAYE: 1 client up to ${PAYE_EMPLOYEES_PER_EMPLOYER} employees`,
          ...DESK_CH_FEATURES,
          "Pay only for HMRC modules you need",
          ...SHARED_ADDON_FEATURES,
          "Can be cancelled anytime",
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
        name: "One company or sole trader",
        price: 19,
        period: "/month",
        blurb: "One company or sole trader — all MTD VAT returns for that registration.",
        features: [
          "Prepare → review → submit",
          "Fraud-prevention headers",
          "Return history & audit IDs",
          ...SHARED_ADDON_FEATURES,
        ],
        cta: "Add VAT",
        highlighted: false,
      },
      {
        name: "VAT practice pack",
        price: 190,
        period: "/month",
        blurb: "Up to 15 companies or sole traders on the VAT desk.",
        features: [
          "Multi-VRN dashboard",
          "Deadline surfacing",
          "Reconnect OAuth per client",
          ...SHARED_ADDON_FEATURES,
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
        blurb:
          "Pay as you file — dormant company accounts & CT600 for one company.",
        features: [
          "Dormant company accounts filing",
          "P&L + balance sheet capture",
          "XML build & submit",
          "Acceptance on audit trail",
          ...SHARED_ADDON_FEATURES,
        ],
        cta: "File CT600",
        highlighted: false,
      },
      {
        name: "CT practice pack",
        price: 350,
        period: "/year",
        blurb:
          "Up to 15 companies — CT600 and dormant or trading accounts. Billed yearly.",
        features: [
          "Up to 15 companies",
          "Dormant & trading accounts",
          "Multi-client CT desk",
          "Partner review checklist",
          ...SHARED_ADDON_FEATURES,
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
        name: "1 SA return",
        price: 49,
        period: "/return",
        blurb: "One Self Assessment return for a sole trader or partner.",
        features: [
          "Ledger-linked turnover & expenses",
          "Zod-validated payloads",
          "Correlation ID proof",
          ...SHARED_ADDON_FEATURES,
        ],
        cta: "Add SA",
        highlighted: false,
      },
      {
        name: "SA practice pack",
        price: 499,
        period: "/year",
        blurb: "Up to 15 Self Assessment returns per year.",
        features: [
          "Up to 15 SA returns per year",
          "Quarterly update board",
          "NINO-linked workspaces",
          "Junior-safe guided submit",
          ...SHARED_ADDON_FEATURES,
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
        name: "One employer",
        price: 19,
        period: "/month",
        blurb: `1 company, up to ${PAYE_EMPLOYEES_PER_EMPLOYER} employees.`,
        features: [
          "Monthly pay calc in pence",
          "FPS on payday",
          "EPS no-pay",
          ...SHARED_ADDON_FEATURES,
        ],
        cta: "Add payroll",
        highlighted: false,
      },
      {
        name: "Practice PAYE",
        price: 190,
        period: "/month",
        blurb: `15 companies, up to ${PAYE_EMPLOYEES_PER_EMPLOYER} employees each.`,
        features: [
          "Multi-employer desk",
          "Pay-run history",
          "RTI status timeline",
          ...SHARED_ADDON_FEATURES,
        ],
        cta: "Add PAYE pack",
        highlighted: true,
      },
    ],
  },
  {
    id: "companies-house",
    title: "Companies House filings",
    subtitle: "Statutory Companies House fees — one price per filing",
    plans: [
      {
        name: "Confirmation statement",
        price: hydraTotal(50, "confirmation-statement", "desk"),
        period: "/filing",
        blurb: "Digital CS01 with director personal codes",
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
        blurb: "Guided IN01 with live name check",
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
        blurb: "Software accounts filing with iXBRL",
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
