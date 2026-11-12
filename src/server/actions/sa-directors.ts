"use server";

import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { listClients, getClient } from "@/server/actions/clients";
import {
  listSaTaxpayers,
  upsertSaTaxpayer,
} from "@/server/actions/sa-taxpayers";
import {
  emptyCompanyIncome,
  type SaCompanyIncome,
  type SaOtherIncome,
  type SaOtherIncomeKind,
} from "@/lib/sa-income";
import {
  displayPersonName,
  mergeTaxpayerRoles,
  normalizePersonName,
  personKeyFromParam,
  roleFromCompanyLinks,
  type SaTaxpayer,
  type SaTaxpayerRole,
} from "@/lib/sa-taxpayer";
import { clientSlugFor } from "@/lib/client-slug";
import { revalidatePath } from "next/cache";
import type { FilingUrgency } from "@/lib/filing-due";
import {
  filingSaTaxYear,
  saFilingUrgency,
} from "@/lib/sa-tax-year";

export type PracticeDirectorCompany = {
  clientId: string;
  slug: string;
  companyName: string;
  companyNumber: string;
  role: SaTaxpayerRole;
  appointedOn: string | null;
};

export type PracticeDirectorFiling = {
  taxYear: string;
  filingDue: string;
  status: "none" | "draft" | "submitted" | "accepted";
  urgency: FilingUrgency;
};

export type PracticeDirector = {
  key: string;
  fullName: string;
  companies: PracticeDirectorCompany[];
  /** Companies where this person is a director (incl. director & shareholder) */
  directorOf: number;
  /** Companies where this person is a shareholder (incl. director & shareholder) */
  shareholderOf: number;
  /** Best taxpayer record if already saved on a desk */
  taxpayer: SaTaxpayer | null;
  homeClientId: string;
  homeSlug: string;
  /** Latest SA filing year status (for card colour) */
  filing: PracticeDirectorFiling;
};

function preferDisplayName(current: string, incoming: string): string {
  const a = displayPersonName(current);
  const b = displayPersonName(incoming);
  // Prefer names that are not ALL CAPS surname-first style
  const score = (n: string, raw: string) =>
    (raw.includes(",") ? 0 : 2) + (n.split(" ").length >= 2 ? 1 : 0);
  return score(b, incoming) >= score(a, current) ? b : a;
}

function withRoleCounts(row: PracticeDirector): PracticeDirector {
  let directorOf = 0;
  let shareholderOf = 0;
  for (const c of row.companies) {
    if (c.role === "director" || c.role === "director_shareholder") {
      directorOf += 1;
    }
    if (c.role === "shareholder" || c.role === "director_shareholder") {
      shareholderOf += 1;
    }
  }
  return { ...row, directorOf, shareholderOf };
}

/** All directors / PSCs across the practice — one card per person. */
export async function listPracticeDirectors(): Promise<PracticeDirector[]> {
  await requireSession();
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const byKey = new Map<string, PracticeDirector>();

  for (const client of clients) {
    if (client.type !== "limited_company") continue;
    const slug = clientSlugFor(client, peers);
    const ch = client.companiesHouse;
    const taxpayers = client.deskProfile?.saTaxpayers ?? [];

    const push = (
      fullName: string,
      role: SaTaxpayerRole,
      appointedOn: string | null,
    ) => {
      const name = fullName.trim();
      if (!name) return;
      const key = normalizePersonName(name);
      if (!key) return;
      let row = byKey.get(key);
      if (!row) {
        const match =
          taxpayers.find(
            (t) => normalizePersonName(t.fullName) === key,
          ) ?? null;
        row = {
          key,
          fullName: displayPersonName(match?.fullName || name),
          companies: [],
          directorOf: 0,
          shareholderOf: 0,
          taxpayer: match,
          homeClientId: client.id,
          homeSlug: slug,
          filing: {
            taxYear: "",
            filingDue: "",
            status: "none",
            urgency: "unknown",
          },
        };
        byKey.set(key, row);
      } else {
        row.fullName = preferDisplayName(row.fullName, name);
      }

      const existing = row.companies.find((c) => c.clientId === client.id);
      if (existing) {
        existing.role = mergeTaxpayerRoles(existing.role, role);
        if (!existing.appointedOn && appointedOn) {
          existing.appointedOn = appointedOn;
        }
      } else {
        row.companies.push({
          clientId: client.id,
          slug,
          companyName: client.name,
          companyNumber: client.companyNumber ?? "",
          role,
          appointedOn,
        });
      }

      if (!row.taxpayer) {
        const match = taxpayers.find(
          (t) => normalizePersonName(t.fullName) === key,
        );
        if (match) {
          row.taxpayer = match;
          row.homeClientId = client.id;
          row.homeSlug = slug;
          row.fullName = preferDisplayName(row.fullName, match.fullName);
        }
      }
    };

    for (const d of ch?.directors ?? []) {
      if (d.resignedOn) continue;
      push(d.name, "director", d.appointedOn);
    }
    for (const p of ch?.pscs ?? []) {
      if (p.ceasedOn || !p.name) continue;
      push(p.name, "shareholder", p.notifiedOn);
    }
    // Match saved taxpayers by name only — do NOT let a person-level role
    // (or a wrongly stored director_shareholder) invent a company office.
    for (const t of taxpayers) {
      const key = normalizePersonName(t.fullName);
      if (!key) continue;
      const row = byKey.get(key);
      if (row) {
        if (!row.taxpayer) {
          row.taxpayer = t;
          row.homeClientId = client.id;
          row.homeSlug = slug;
          row.fullName = preferDisplayName(row.fullName, t.fullName);
        }
        continue;
      }
      // Taxpayer with no CH officer/PSC hit on this company — keep as manual link.
      const companyRole: SaTaxpayerRole =
        t.role === "director" ||
        t.role === "shareholder" ||
        t.role === "director_shareholder"
          ? t.role
          : "other";
      if (
        companyRole === "director" ||
        companyRole === "shareholder" ||
        companyRole === "director_shareholder"
      ) {
        push(t.fullName, companyRole, t.appointedOn ?? null);
      }
    }
  }

  const { listSa100Returns } = await import("@/server/actions/sa100");
  const filingYear = filingSaTaxYear();
  const rows = [...byKey.values()].map(withRoleCounts);

  await Promise.all(
    rows.map(async (row) => {
      const returns = row.taxpayer
        ? await listSa100Returns(row.homeClientId, row.taxpayer.id).catch(
            () => [],
          )
        : [];
      const match =
        returns.find((r) => r.taxYear === filingYear.label) ?? null;
      const status: PracticeDirectorFiling["status"] = match
        ? match.status === "accepted"
          ? "accepted"
          : match.status === "submitted"
            ? "submitted"
            : "draft"
        : "none";
      row.filing = {
        taxYear: filingYear.label,
        filingDue: filingYear.filingDue,
        status,
        urgency: saFilingUrgency(filingYear, status),
      };
    }),
  );

  return rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "en-GB"));
}

/** Companies this person appears on (practice-wide), with income rows merged. */
export async function getDirectorWorkspace(input: {
  homeClientId: string;
  personKey: string;
}) {
  const directors = await listPracticeDirectors();
  const want = personKeyFromParam(input.personKey) || input.personKey;
  const person =
    directors.find((d) => d.key === want) ??
    directors.find((d) => personKeyFromParam(d.key) === want) ??
    directors.find(
      (d) => normalizePersonName(d.fullName) === normalizePersonName(want),
    );
  if (!person) throw new Error("Director not found in practice");

  let taxpayer =
    (await listSaTaxpayers(person.homeClientId)).find(
      (t) => normalizePersonName(t.fullName) === person.key,
    ) ?? null;

  const personRole = roleFromCompanyLinks({
    directorOf: person.directorOf,
    shareholderOf: person.shareholderOf,
  });

  // Ensure a taxpayer exists and company income stubs for every company.
  if (!taxpayer) {
    taxpayer = await upsertSaTaxpayer({
      clientId: person.homeClientId,
      fullName: person.fullName,
      role: personRole,
      nino: "",
      utr: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      occupation: "",
      tradingAs: "",
    });
  } else if (
    (personRole === "director" ||
      personRole === "shareholder" ||
      personRole === "director_shareholder") &&
    taxpayer.role !== personRole &&
    (taxpayer.role === "director" ||
      taxpayer.role === "shareholder" ||
      taxpayer.role === "director_shareholder" ||
      taxpayer.role === "other")
  ) {
    // Correct wrongly stored director_shareholder when CH says shareholder-only.
    taxpayer = await upsertSaTaxpayer({
      clientId: person.homeClientId,
      id: taxpayer.id,
      fullName: taxpayer.fullName,
      role: personRole,
      nino: taxpayer.nino,
      utr: taxpayer.utr,
      dateOfBirth: taxpayer.dateOfBirth,
      email: taxpayer.email,
      phone: taxpayer.phone,
      address: taxpayer.address,
      occupation: taxpayer.occupation ?? "",
      tradingAs: taxpayer.tradingAs ?? "",
      appointedOn: taxpayer.appointedOn ?? null,
      shareholdingNote: taxpayer.shareholdingNote ?? "",
    });
  }

  // Dedupe any historic duplicate company income rows for the same client.
  const seenClient = new Set<string>();
  const existing = [...(taxpayer.companyIncomes ?? [])].filter((row) => {
    if (!row.clientId || seenClient.has(row.clientId)) return false;
    seenClient.add(row.clientId);
    return true;
  });
  let changed = existing.length !== (taxpayer.companyIncomes ?? []).length;

  // Dedupe identical other-income lines (same kind + label + zero amounts).
  const otherRaw = [...(taxpayer.otherIncomes ?? [])];
  const otherSeen = new Set<string>();
  const dedupedOthers = otherRaw.filter((o) => {
    const blank =
      !o.amount &&
      !o.expenses &&
      !(o.otherBusinessIncome ?? 0) &&
      !o.taxTakenOff;
    const key = blank
      ? `${o.kind}|${(o.label || "").toLowerCase()}|blank`
      : o.id;
    if (otherSeen.has(key)) return false;
    otherSeen.add(key);
    return true;
  });
  if (dedupedOthers.length !== otherRaw.length) changed = true;

  for (const c of person.companies) {
    const mappedRole =
      c.role === "shareholder"
        ? ("shareholder" as const)
        : c.role === "director_shareholder"
          ? ("director_shareholder" as const)
          : ("director" as const);
    const hit = existing.find((e) => e.clientId === c.clientId);
    if (hit) {
      if (hit.role !== mappedRole) {
        hit.role = mappedRole;
        changed = true;
      }
      if (!hit.companyName && c.companyName) {
        hit.companyName = c.companyName;
        changed = true;
      }
      if (!hit.payeRef) {
        const companyClient = await getClient(c.clientId);
        if (companyClient.payeRef) {
          hit.payeRef = companyClient.payeRef;
          changed = true;
        }
      }
      continue;
    }
    const companyClient = await getClient(c.clientId);
    existing.push(
      emptyCompanyIncome({
        clientId: c.clientId,
        companyName: c.companyName,
        companyNumber: c.companyNumber || companyClient.companyNumber || "",
        role: mappedRole,
        payeRef: companyClient.payeRef ?? "",
      }),
    );
    changed = true;
  }
  if (changed) {
    taxpayer = await saveTaxpayerIncomes({
      clientId: person.homeClientId,
      taxpayerId: taxpayer.id,
      companyIncomes: existing,
      otherIncomes: dedupedOthers,
    });
  }

  // Pull PAYE YTD onto company cards when NINO + DOB + address all match.
  try {
    const { pullPayeIntoCompanyIncomes } = await import(
      "@/server/sa/pull-paye-into-company"
    );
    const { currentSaTaxYear } = await import("@/lib/sa-tax-year");
    const payeYear = currentSaTaxYear().label;
    const pulled = await pullPayeIntoCompanyIncomes({
      taxpayer,
      companyIncomes: taxpayer.companyIncomes ?? existing,
      taxYear: payeYear,
    });
    if (pulled.changed) {
      taxpayer = await saveTaxpayerIncomes({
        clientId: person.homeClientId,
        taxpayerId: taxpayer.id,
        companyIncomes: pulled.companyIncomes,
        otherIncomes: taxpayer.otherIncomes ?? dedupedOthers,
        taxYear: payeYear,
      });
    } else {
      taxpayer = {
        ...taxpayer,
        companyIncomes: pulled.companyIncomes,
      };
    }
  } catch {
    /* PAYE pull is best-effort — desk still opens without it */
  }

  return { person, taxpayer };
}

/** Refresh company employment figures from PAYE for the active tax year. */
export async function refreshCompanyPayeFromPayroll(input: {
  clientId: string;
  taxpayerId: string;
  taxYear?: string;
}) {
  await requireSession();
  const client = await getClient(input.clientId);
  const taxpayer = (client.deskProfile?.saTaxpayers ?? []).find(
    (t) => t.id === input.taxpayerId,
  );
  if (!taxpayer) throw new Error("Taxpayer not found");

  const { pullPayeIntoCompanyIncomes } = await import(
    "@/server/sa/pull-paye-into-company"
  );
  const { currentSaTaxYear } = await import("@/lib/sa-tax-year");
  const taxYear = input.taxYear || currentSaTaxYear().label;
  const pulled = await pullPayeIntoCompanyIncomes({
    taxpayer,
    companyIncomes: taxpayer.companyIncomes ?? [],
    taxYear,
  });

  const saved = await saveTaxpayerIncomes({
    clientId: input.clientId,
    taxpayerId: input.taxpayerId,
    companyIncomes: pulled.companyIncomes,
    otherIncomes: taxpayer.otherIncomes ?? [],
    taxYear,
  });

  return { taxpayer: saved, pulls: pulled.pulls };
}

const companyIncomeSchema = z.object({
  clientId: z.string(),
  companyName: z.string(),
  companyNumber: z.string().default(""),
  role: z.enum(["director", "shareholder", "director_shareholder"]),
  payePay: z.coerce.number().min(0).default(0),
  payeTax: z.coerce.number().min(0).default(0),
  payeRef: z.string().default(""),
  tips: z.coerce.number().min(0).default(0),
  benefits: z.coerce.number().min(0).default(0),
  employmentExpenses: z.coerce.number().min(0).default(0),
  dividends: z.coerce.number().min(0).default(0),
  shareholdingPct: z.coerce.number().min(0).max(100).default(0),
  subcontractorGross: z.coerce.number().min(0).default(0),
  subcontractorTax: z.coerce.number().min(0).default(0),
  directorLoan: z.coerce.number().min(0).default(0),
  directorLoanTaxable: z.boolean().default(false),
});

const seExpensesSchema = z
  .object({
    goods: z.coerce.number().min(0).default(0),
    carVanTravel: z.coerce.number().min(0).default(0),
    wages: z.coerce.number().min(0).default(0),
    rentRatesPower: z.coerce.number().min(0).default(0),
    repairs: z.coerce.number().min(0).default(0),
    professionalFees: z.coerce.number().min(0).default(0),
    interestCharges: z.coerce.number().min(0).default(0),
    officeCosts: z.coerce.number().min(0).default(0),
    other: z.coerce.number().min(0).default(0),
  })
  .optional();

const propExpensesSchema = z
  .object({
    rentsRatesInsurance: z.coerce.number().min(0).default(0),
    repairs: z.coerce.number().min(0).default(0),
    nonResidentialFinance: z.coerce.number().min(0).default(0),
    legalFees: z.coerce.number().min(0).default(0),
    services: z.coerce.number().min(0).default(0),
    other: z.coerce.number().min(0).default(0),
    domesticItems: z.coerce.number().min(0).default(0),
    residentialFinance: z.coerce.number().min(0).default(0),
  })
  .optional();

const otherIncomeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "rental",
    "taxi",
    "payroll_other",
    "self_employment",
    "other",
  ]),
  label: z.string().default(""),
  businessDescription: z.string().default(""),
  businessPostcode: z.string().default(""),
  amount: z.coerce.number().min(0).default(0),
  otherBusinessIncome: z.coerce.number().min(0).default(0),
  taxTakenOff: z.coerce.number().min(0).default(0),
  expenses: z.coerce.number().min(0).default(0),
  seExpenses: seExpensesSchema,
  propExpenses: propExpensesSchema,
  propertyCount: z.coerce.number().min(0).default(0),
  claimTradingAllowance: z.boolean().default(false),
  claimPropertyAllowance: z.boolean().default(false),
});

export async function saveTaxpayerIncomes(input: {
  clientId: string;
  taxpayerId: string;
  companyIncomes: SaCompanyIncome[];
  otherIncomes: SaOtherIncome[];
  /** Active SA tax year to refresh (defaults to current filing year). */
  taxYear?: string;
}) {
  const client = await getClient(input.clientId);
  const list = [...(client.deskProfile?.saTaxpayers ?? [])];
  const idx = list.findIndex((t) => t.id === input.taxpayerId);
  if (idx < 0) throw new Error("Taxpayer not found");
  const companies = input.companyIncomes.map((c) =>
    companyIncomeSchema.parse(c),
  );
  const others = input.otherIncomes.map((o) => otherIncomeSchema.parse(o));
  const row: SaTaxpayer = {
    ...list[idx]!,
    companyIncomes: companies,
    otherIncomes: others,
    updatedAt: new Date().toISOString(),
  };
  // Persist via upsert fields — write full taxpayer through upsertSaTaxpayer path
  const { syncWriteTaxpayer } = await import("@/server/actions/sa-taxpayers");
  const saved = await syncWriteTaxpayer(input.clientId, row);

  // Push company / other income onto the open SA100 draft so Employment (SA102)
  // and related pages pick up employer name, PAYE ref, pay and tax immediately.
  try {
    const { accumulateSa100FromIncome } = await import("@/lib/sa-income");
    const { filingSaTaxYear, parseSaTaxYearLabel } = await import(
      "@/lib/sa-tax-year"
    );
    const { getSa100Draft, saveSa100Draft, listSa100Returns } = await import(
      "@/server/actions/sa100"
    );
    const requested =
      (input.taxYear && parseSaTaxYearLabel(input.taxYear)?.label) || null;
    const returns = await listSa100Returns(input.clientId, input.taxpayerId);
    const openDraft = returns.find((r) => r.status === "draft");
    const taxYear =
      requested || openDraft?.taxYear || filingSaTaxYear().label;
    const existingDraft = await getSa100Draft(
      input.clientId,
      taxYear,
      input.taxpayerId,
    );
    const merged = accumulateSa100FromIncome(saved, {
      ...(existingDraft?.draft ?? {}),
      taxYear,
    });
    await saveSa100Draft({
      clientId: input.clientId,
      taxpayerId: input.taxpayerId,
      draft: merged,
    });
  } catch {
    /* SA100 sync is best-effort — income save still succeeded */
  }

  revalidatePath(`/clients/${input.clientId}/self-assessment`);
  revalidatePath(`/self-assessment`, "layout");
  return saved;
}

export async function addOtherIncomeLine(input: {
  clientId: string;
  taxpayerId: string;
  kind: SaOtherIncomeKind;
  label?: string;
}) {
  const client = await getClient(input.clientId);
  const t = (client.deskProfile?.saTaxpayers ?? []).find(
    (x) => x.id === input.taxpayerId,
  );
  if (!t) throw new Error("Taxpayer not found");

  // Avoid stacking blank duplicates of the same source kind.
  const alreadyBlank = (t.otherIncomes ?? []).some(
    (o) =>
      o.kind === input.kind &&
      !o.amount &&
      !o.expenses &&
      !(o.otherBusinessIncome ?? 0) &&
      !o.taxTakenOff,
  );
  if (alreadyBlank) {
    return t;
  }

  const others = [
    ...(t.otherIncomes ?? []),
    {
      id: crypto.randomUUID(),
      kind: input.kind,
      label: input.label ?? "",
      businessDescription:
        input.kind === "taxi" ? "Taxi / private hire" : "",
      businessPostcode: "",
      amount: 0,
      otherBusinessIncome: 0,
      taxTakenOff: 0,
      expenses: 0,
      propertyCount: input.kind === "rental" ? 1 : 0,
      claimTradingAllowance: false,
      claimPropertyAllowance: false,
    },
  ];
  return saveTaxpayerIncomes({
    clientId: input.clientId,
    taxpayerId: input.taxpayerId,
    companyIncomes: t.companyIncomes ?? [],
    otherIncomes: others,
  });
}

export async function removeOtherIncomeLine(input: {
  clientId: string;
  taxpayerId: string;
  lineId: string;
}) {
  const client = await getClient(input.clientId);
  const t = (client.deskProfile?.saTaxpayers ?? []).find(
    (x) => x.id === input.taxpayerId,
  );
  if (!t) throw new Error("Taxpayer not found");
  return saveTaxpayerIncomes({
    clientId: input.clientId,
    taxpayerId: input.taxpayerId,
    companyIncomes: t.companyIncomes ?? [],
    otherIncomes: (t.otherIncomes ?? []).filter((o) => o.id !== input.lineId),
  });
}
