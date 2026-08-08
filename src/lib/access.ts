export type ModuleAccess =
  | "full"
  | "payroll"
  | "vat"
  | "corporation_tax";

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
];

export type AppModule =
  | "overview"
  | "books"
  | "vat"
  | "self_assessment"
  | "corporation_tax"
  | "payroll"
  | "documents"
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
  "bank",
  "invoices",
  "team",
  "admin",
  "clients",
];

const BY_ACCESS: Record<ModuleAccess, AppModule[]> = {
  full: FULL,
  payroll: ["overview", "payroll", "documents", "clients"],
  vat: ["overview", "vat", "documents", "clients"],
  corporation_tax: ["overview", "corporation_tax", "documents", "clients"],
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
  return key as AppModule;
}
