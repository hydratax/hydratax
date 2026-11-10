export type ModuleAccess =
  | "full"
  | "payroll"
  | "vat"
  | "corporation_tax"
  | "invoices"
  | "self_assessment";

export const MODULE_ACCESS_OPTIONS: {
  value: ModuleAccess;
  label: string;
  blurb: string;
}[] = [
  {
    value: "full",
    label: "Full access",
    blurb: "All clients and every filing rail (owner / partner).",
  },
  {
    value: "payroll",
    label: "Payroll only",
    blurb: "PAYE / RTI for every client — no VAT or CT.",
  },
  {
    value: "vat",
    label: "VAT only",
    blurb: "MTD VAT for every client — no payroll or CT.",
  },
  {
    value: "corporation_tax",
    label: "Corporation Tax only",
    blurb: "CT600 for every client — no VAT or payroll.",
  },
  {
    value: "invoices",
    label: "Invoices only",
    blurb: "Create and manage client invoices — no tax filings.",
  },
  {
    value: "self_assessment",
    label: "Self Assessment only",
    blurb: "SA100 / personal tax for every client — no VAT, CT or payroll.",
  },
];

export type AppModule =
  | "overview"
  | "books"
  | "vat"
  | "self_assessment"
  | "corporation_tax"
  | "payroll"
  | "documents"
  | "tasks"
  | "communications"
  | "bank"
  | "invoices"
  | "team"
  | "admin"
  | "clients";

const FULL: AppModule[] = [
  "overview",
  "books",
  "vat",
  "self_assessment",
  "corporation_tax",
  "payroll",
  "documents",
  "tasks",
  "bank",
  "invoices",
  "communications",
  "team",
  "admin",
  "clients",
];

const BY_ACCESS: Record<ModuleAccess, AppModule[]> = {
  full: FULL,
  payroll: [
    "overview",
    "payroll",
    "documents",
    "tasks",
    "communications",
    "clients",
  ],
  vat: ["overview", "vat", "documents", "tasks", "communications", "clients"],
  corporation_tax: [
    "overview",
    "corporation_tax",
    "documents",
    "tasks",
    "communications",
    "clients",
  ],
  invoices: [
    "overview",
    "invoices",
    "documents",
    "tasks",
    "communications",
    "clients",
  ],
  self_assessment: [
    "overview",
    "self_assessment",
    "documents",
    "tasks",
    "communications",
    "clients",
  ],
};

export function modulesForAccess(access: ModuleAccess): Set<AppModule> {
  return new Set(BY_ACCESS[access] ?? BY_ACCESS.full);
}

export function canAccessModule(
  access: ModuleAccess,
  module: AppModule,
): boolean {
  if (access === "full") return true;
  return modulesForAccess(access).has(module);
}

/**
 * Who may run a full Companies House refresh of the practice client list:
 * practice admin/owner, or a team member on the Companies / Corporation Tax desk.
 */
export function canRefreshCompaniesHouse(session: {
  role: "owner" | "admin" | "practitioner" | "readonly";
  moduleAccess: ModuleAccess;
}): boolean {
  if (session.role === "readonly") return false;
  if (session.role === "owner" || session.role === "admin") return true;
  return (
    session.moduleAccess === "full" ||
    session.moduleAccess === "corporation_tax"
  );
}

export function assertModuleAccess(
  access: ModuleAccess,
  module: AppModule,
): void {
  if (!canAccessModule(access, module)) {
    throw new Error("You do not have access to this module");
  }
}

/** Map client-tab keys → AppModule */
export function tabKeyToModule(key: string): AppModule {
  if (key === "self-assessment") return "self_assessment";
  if (key === "corporation-tax") return "corporation_tax";
  if (key === "time-fees") return "invoices";
  if (
    key === "aml" ||
    key === "engagement" ||
    key === "portal" ||
    key === "forms"
  ) {
    return "clients";
  }
  return key as AppModule;
}
