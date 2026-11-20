"use server";

import { requireAdmin } from "@/server/auth/admin";
import type { ClientRecord } from "@/server/actions/clients";
import {
  DEMO_ADDR,
  MERIDIAN_BANK_LINES,
  MERIDIAN_EMPLOYEES,
  MERIDIAN_PEOPLE,
  MERIDIAN_PERIOD,
  MERIDIAN_VAT_BOXES,
  MERIDIAN_VAT_PERIOD,
  OAK_BANK_LINES,
  OAK_VAT_BOXES,
  PRESENTATION_RICH_TAG,
  SAMIRA_BANK_LINES,
  digitsVrn,
  type RichBankLine,
  type RichEmployee,
  type RichPerson,
} from "@/server/demo/presentation-rich-data";
import { PRESENTATION_DEMO_TAG } from "@/server/demo/presentation-seed";

function logRich(step: string, err: unknown) {
  console.error(
    "[presentation-rich]",
    step,
    err instanceof Error ? err.message : err,
  );
}

async function markRich(clientId: string) {
  const { patchDeskProfile } = await import("@/server/actions/desk");
  await patchDeskProfile(clientId, {
    presentationRich: PRESENTATION_RICH_TAG,
  }).catch((e) => logRich("markRich", e));
}

/** Fill address / phone / auth code / PAYE on every demo client card. */
async function fillDemoIdentifiers(client: ClientRecord) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  if (!profile) return;
  const { updateClient } = await import("@/server/actions/clients");
  const address = await demoAddressJson(profile.address);
  await updateClient({
    clientId: client.id,
    address,
    contactPhone: profile.contactPhone,
    contactEmail: profile.contactEmail,
    companyAuthCode: profile.companyAuthCode ?? "",
    payeRef: profile.payeRef ?? client.payeRef ?? "",
    accountsOfficeRef: profile.accountsOfficeRef ?? client.accountsOfficeRef ?? "",
    nino: profile.nino ?? client.nino ?? "",
  }).catch((e) => logRich("identifiers", e));
}

async function demoAddressJson(line: string): Promise<string> {
  const { formatAddressParts, parseAddressParts } = await import(
    "@/lib/address-parts"
  );
  const parts = parseAddressParts(line);
  if (parts.street && parts.postcode) return formatAddressParts(parts);
  const bits = line
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return formatAddressParts({
    street: bits[0] ?? line,
    city: bits[1] ?? "",
    country: "United Kingdom",
    postcode: bits[bits.length - 1] ?? "",
  });
}

/** Persist saTaxpayers + CH officers/PSCs so directors show on SA and company desks. */
async function seedPeople(
  client: ClientRecord,
  people: RichPerson[],
  companyNumber?: string | null,
) {
  const { patchDeskProfile } = await import("@/server/actions/desk");
  const { emptyCompanyIncome } = await import("@/lib/sa-income");
  const { displayPersonName, normalizePersonName } = await import(
    "@/lib/sa-taxpayer"
  );
  const { getClient } = await import("@/server/actions/clients");
  const fresh = (await getClient(client.id).catch(() => null)) ?? client;
  const existing = [...(fresh.deskProfile?.saTaxpayers ?? [])];
  const now = new Date().toISOString();
  const number = (companyNumber ?? fresh.companyNumber ?? "").trim().toUpperCase();

  for (const person of people) {
    const key = normalizePersonName(person.fullName);
    const hit = existing.findIndex(
      (t) => normalizePersonName(t.fullName) === key,
    );
    const prev = hit >= 0 ? existing[hit]! : null;
    const companyIncomes =
      person.role === "director" ||
      person.role === "shareholder" ||
      person.role === "director_shareholder"
        ? [
            emptyCompanyIncome({
              clientId: fresh.id,
              companyName: fresh.name,
              companyNumber: number,
              role: person.role,
              shareholdingPct: person.shareholdingNote?.includes("60%")
                ? 60
                : person.shareholdingNote?.includes("25%")
                  ? 25
                  : person.shareholdingNote?.includes("15%")
                    ? 15
                    : person.shareholdingNote?.includes("100%")
                      ? 100
                      : 0,
              ...(prev?.companyIncomes?.[0] ?? {}),
            }),
          ]
        : prev?.companyIncomes;

    const row = {
      id: prev?.id ?? crypto.randomUUID(),
      fullName: displayPersonName(person.fullName),
      role: person.role,
      nino: person.nino,
      utr: person.utr,
      dateOfBirth: person.dateOfBirth,
      email: person.email,
      phone: person.phone,
      address: await demoAddressJson(person.address),
      occupation: person.occupation ?? "",
      tradingAs: "",
      appointedOn: person.appointedOn ?? null,
      shareholdingNote: person.shareholdingNote ?? "",
      companyIncomes,
      otherIncomes: prev?.otherIncomes,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    if (hit >= 0) existing[hit] = row;
    else existing.push(row);
  }

  await patchDeskProfile(fresh.id, { saTaxpayers: existing }).catch((e) =>
    logRich("saTaxpayers", e),
  );

  // Ltd desks also read Companies House officers / PSCs — seed a snapshot.
  if (fresh.type === "limited_company" && number) {
    await writeDemoCompaniesHouse(fresh, people, number);
  }
}

async function writeDemoCompaniesHouse(
  client: ClientRecord,
  people: RichPerson[],
  companyNumber: string,
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  const { isDemoMode, isSupabaseConfigured } = await import("@/lib/env");
  const directors = people
    .filter(
      (p) => p.role === "director" || p.role === "director_shareholder",
    )
    .map((p) => ({
      name: p.fullName,
      role: "director",
      appointedOn: p.appointedOn ?? profile?.incorporatedOn ?? "2020-06-01",
      resignedOn: null,
      nationality: "British",
    }));
  const pscs = people
    .filter(
      (p) =>
        p.role === "shareholder" || p.role === "director_shareholder",
    )
    .map((p) => ({
      name: p.fullName,
      kind: "individual-person-with-significant-control",
      naturesOfControl: [
        p.shareholdingNote?.includes("70%") ||
        p.shareholdingNote?.includes("60%") ||
        p.shareholdingNote?.includes("100%")
          ? "ownership-of-shares-50-to-75-percent"
          : "ownership-of-shares-25-to-50-percent",
      ],
      notifiedOn: p.appointedOn ?? profile?.incorporatedOn ?? "2020-06-01",
      ceasedOn: null,
      nationality: "British",
    }));

  const snapshot = {
    companyNumber,
    companyName: client.name,
    companyStatus: "active",
    incorporatedOn: profile?.incorporatedOn ?? "2020-06-01",
    accountsNextDue: profile?.accountsNextDue ?? "2026-12-31",
    accountsPeriodEnd: profile?.accountsPeriodEnd ?? "2026-03-31",
    lastAccountsMadeUpTo: profile?.lastAccountsMadeUpTo ?? "2025-03-31",
    confirmationStatementNextDue:
      profile?.confirmationStatementNextDue ?? "2026-06-15",
    confirmationStatementLastMadeUpTo:
      profile?.confirmationStatementLastMadeUpTo ?? "2025-06-01",
    confirmationStatementNextMadeUpTo:
      profile?.confirmationStatementNextMadeUpTo ?? "2026-06-01",
    registeredOffice:
      profile?.registeredOffice ?? profile?.address ?? DEMO_ADDR.london,
    sicCodes: profile?.sicCodes ?? ["47910"],
    directors,
    pscs,
    fetchedAt: new Date().toISOString(),
  };

  try {
    if (isDemoMode()) {
      const { demoStore } = await import("@/server/demo/store");
      const row = demoStore.clients.find((c) => c.id === client.id);
      if (row) {
        row.companiesHouse = snapshot;
        row.updatedAt = new Date().toISOString();
      }
      return;
    }
    if (isSupabaseConfigured()) {
      const { createClient: createSb } = await import("@/lib/supabase/server");
      const { requireSession } = await import("@/server/auth/session");
      const session = await requireSession();
      const sb = await createSb();
      await sb
        .from("clients")
        .update({
          companies_house: snapshot,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client.id)
        .eq("practice_id", session.practiceId);
      return;
    }
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) return;
    const { clients } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const { requireSession } = await import("@/server/auth/session");
    const session = await requireSession();
    await getDb()
      .update(clients)
      .set({ companiesHouse: snapshot, updatedAt: new Date() })
      .where(
        and(
          eq(clients.id, client.id),
          eq(clients.practiceId, session.practiceId),
        ),
      );
  } catch (e) {
    logRich("companiesHouse", e);
  }
}

/** Insert PAYE people only — must finish before sales-demo request returns. */
async function seedPayrollEmployees(
  client: ClientRecord,
  employees: RichEmployee[],
  opts?: { skipEnableEmployer?: boolean },
) {
  const { enableEmployerPayroll, listEmployees } = await import(
    "@/server/actions/payroll"
  );
  const { generatePayrollId } = await import("@/lib/payroll");
  const { poundsToPence } = await import("@/server/money/pence");
  const { isDemoMode, isSupabaseConfigured } = await import("@/lib/env");
  const {
    isDeskStoreConfigured,
    deskInsertEmployee,
    deskUpdateEmployee,
  } = await import("@/server/db/desk-store");
  const { ensureD1PayrollSchema } = await import(
    "@/server/db/ensure-d1-payroll-schema"
  );
  await ensureD1PayrollSchema().catch((e) => logRich("d1Schema", e));

  if (!opts?.skipEnableEmployer) {
    await enableEmployerPayroll({
      clientId: client.id,
      payeRef: client.payeRef || "123/A246",
      accountsOfficeRef: client.accountsOfficeRef || "123PA00012345",
    }).catch((e) => logRich("enableEmployer", e));
  }

  const existing = await listEmployees(client.id, {
    includeLeavers: true,
  }).catch(() => []);
  const keys = new Set(
    existing.map((e) => `${e.forename}|${e.surname}|${e.nino}`.toLowerCase()),
  );
  const usedPayrollIds = existing.map((e) => e.payrollId);

  // Backfill gender when older seeds stored people before the column existed.
  for (const row of existing) {
    if (row.gender === "M" || row.gender === "F") continue;
    const match = employees.find(
      (emp) =>
        `${emp.forename}|${emp.surname}|${emp.nino}`.toLowerCase() ===
        `${row.forename}|${row.surname}|${row.nino}`.toLowerCase(),
    );
    if (!match?.gender) continue;
    try {
      if (isDemoMode()) {
        const { demoStore } = await import("@/server/demo/store");
        const hit = demoStore.employees.find((e) => e.id === row.id);
        if (hit) hit.gender = match.gender;
      } else if (isDeskStoreConfigured()) {
        await deskUpdateEmployee(row.id, client.id, { gender: match.gender });
      }
    } catch (e) {
      logRich(`genderBackfill:${row.forename}`, e);
    }
  }

  for (const emp of employees) {
    const key = `${emp.forename}|${emp.surname}|${emp.nino}`.toLowerCase();
    if (keys.has(key)) continue;
    const payrollId = generatePayrollId(usedPayrollIds);
    usedPayrollIds.push(payrollId);
    const annualSalaryPence = Number(
      poundsToPence(emp.annualSalaryPounds) || 0,
    );
    const row = {
      id: crypto.randomUUID(),
      clientId: client.id,
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth,
      address: emp.address,
      taxCode: emp.taxCode ?? "1257L",
      annualSalaryPence,
      startDate: emp.startDate,
      payrollId,
      payFrequency: "M1" as const,
      niCategory: "A",
      jobTitle: emp.jobTitle,
      leaveDate: null as string | null,
      starterDeclaration: "A" as const,
      firstFpsSent: false,
      previousPayrollId: null as string | null,
      hoursPerWeek: 3750,
      hourlyRatePence: 0,
      payBasis: "salary" as const,
      pensionOptOut: false,
      sspQualifyingDays: 5,
      taxBasis: "cumulative" as const,
      studentLoanPlan: null as string | null,
      postgraduateLoan: false,
      isDirector: /director/i.test(emp.jobTitle ?? ""),
      directorsNicMethod: "AN" as const,
      bankSortCode: null as string | null,
      bankAccountNumber: null as string | null,
      bankAccountName: null as string | null,
      bfTaxYear: null as string | null,
      bfTaxablePence: 0,
      bfTaxPence: 0,
      bfEmployeeNiPence: 0,
      active: true,
    };
    const deskRow = {
      id: row.id,
      client_id: row.clientId,
      forename: row.forename,
      surname: row.surname,
      nino: row.nino,
      gender: row.gender,
      date_of_birth: row.dateOfBirth,
      address: row.address,
      tax_code: row.taxCode,
      annual_salary_pence: row.annualSalaryPence,
      start_date: row.startDate,
      payroll_id: row.payrollId,
      pay_frequency: row.payFrequency,
      ni_category: row.niCategory,
      job_title: row.jobTitle,
      leave_date: row.leaveDate,
      starter_declaration: row.starterDeclaration,
      first_fps_sent: row.firstFpsSent,
      previous_payroll_id: row.previousPayrollId,
      hours_per_week: row.hoursPerWeek,
      hourly_rate_pence: row.hourlyRatePence,
      pay_basis: row.payBasis,
      pension_opt_out: row.pensionOptOut,
      ssp_qualifying_days: row.sspQualifyingDays,
      tax_basis: row.taxBasis,
      student_loan_plan: row.studentLoanPlan,
      postgraduate_loan: row.postgraduateLoan,
      is_director: row.isDirector,
      directors_nic_method: row.directorsNicMethod,
      bank_sort_code: row.bankSortCode,
      bank_account_number: row.bankAccountNumber,
      bank_account_name: row.bankAccountName,
      bf_tax_year: row.bfTaxYear,
      bf_taxable_pence: row.bfTaxablePence,
      bf_tax_pence: row.bfTaxPence,
      bf_employee_ni_pence: row.bfEmployeeNiPence,
      active: true,
    };
    try {
      if (isDemoMode()) {
        const { demoStore } = await import("@/server/demo/store");
        demoStore.employees.push(row);
      } else if (isDeskStoreConfigured()) {
        await deskInsertEmployee(deskRow);
        // Keep Supabase in sync when D1 is the primary desk store.
        if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const { getSupabaseAdmin } = await import("@/lib/supabase");
            await getSupabaseAdmin().from("employees").upsert(deskRow, {
              onConflict: "id",
            });
          } catch (e) {
            logRich(`employeeSupabase:${emp.forename}`, e);
          }
        }
      } else {
        const { getDb } = await import("@/server/db");
        const { employees: employeesTable } = await import(
          "@/server/db/schema"
        );
        await getDb().insert(employeesTable).values({
          id: row.id,
          clientId: row.clientId,
          forename: row.forename,
          surname: row.surname,
          nino: row.nino,
          gender: row.gender,
          dateOfBirth: row.dateOfBirth,
          address: row.address,
          taxCode: row.taxCode,
          annualSalaryPence: row.annualSalaryPence,
          startDate: row.startDate,
          payrollId: row.payrollId,
          payFrequency: row.payFrequency,
          niCategory: row.niCategory,
          jobTitle: row.jobTitle,
          leaveDate: row.leaveDate,
          starterDeclaration: row.starterDeclaration,
          firstFpsSent: row.firstFpsSent,
          previousPayrollId: row.previousPayrollId,
          hoursPerWeek: row.hoursPerWeek,
          hourlyRatePence: row.hourlyRatePence,
          payBasis: row.payBasis,
          pensionOptOut: row.pensionOptOut,
          sspQualifyingDays: row.sspQualifyingDays,
          taxBasis: row.taxBasis,
          studentLoanPlan: row.studentLoanPlan,
          postgraduateLoan: row.postgraduateLoan,
          isDirector: row.isDirector,
          directorsNicMethod: row.directorsNicMethod,
          bankSortCode: row.bankSortCode,
          bankAccountNumber: row.bankAccountNumber,
          bankAccountName: row.bankAccountName,
          bfTaxYear: row.bfTaxYear,
          bfTaxablePence: row.bfTaxablePence,
          bfTaxPence: row.bfTaxPence,
          bfEmployeeNiPence: row.bfEmployeeNiPence,
          active: true,
        });
      }
      keys.add(key);
    } catch (e) {
      logRich(`employee:${emp.forename}`, e);
    }
  }
}

async function seedPayroll(
  client: ClientRecord,
  employees: RichEmployee[],
  opts?: { historyYears?: number },
) {
  const {
    listEmployees,
    previewPayRun,
    savePayrollPackPassword,
  } = await import("@/server/actions/payroll");
  const { savePayrollDeskSettings } = await import(
    "@/server/actions/payroll-settings"
  );
  const { defaultPayPeriod, taxYearFromDate } = await import("@/lib/payroll");
  const { isDemoMode } = await import("@/lib/env");
  const {
    isDeskStoreConfigured,
    deskUpsertTimesheet,
    deskInsertPayRun,
    deskDeletePayRun,
    deskListPayRuns,
  } = await import("@/server/db/desk-store");
  const { isPayrollRtiSubmitted } = await import(
    "@/lib/payroll-client-status"
  );

  await seedPayrollEmployees(client, employees);

  const live = await listEmployees(client.id, { includeLeavers: false }).catch(
    () => [],
  );
  if (live.length === 0) return;

  const period = defaultPayPeriod("M1");
  const scenarioByNino = new Map(
    employees.map((e) => [e.nino.replace(/\s/g, "").toUpperCase(), e.scenario]),
  );
  const timesheetRows = live.map((emp) => {
    const scenario =
      scenarioByNino.get(emp.nino.replace(/\s/g, "").toUpperCase()) ??
      "ordinary";
    const base = {
      nino: emp.nino,
      name: `${emp.forename} ${emp.surname}`,
      payrollId: emp.payrollId,
      ordinaryHours: 160,
      raw: {},
    };
    if (scenario === "ssp") {
      return { ...base, ordinaryHours: 120, sickDays: 4 };
    }
    if (scenario === "smp") {
      return {
        ...base,
        ordinaryHours: 0,
        maternityWeeks: 4,
        maternityWeekFrom: 1,
      };
    }
    if (scenario === "unpaid_absence") {
      return { ...base, ordinaryHours: 0, unpaidAbsence: true };
    }
    return base;
  });

  try {
    if (isDemoMode()) {
      const { demoStore } = await import("@/server/demo/store");
      demoStore.payrollTimesheets = demoStore.payrollTimesheets.filter(
        (t) =>
          !(
            t.clientId === client.id &&
            t.periodStart === period.periodStart &&
            t.periodEnd === period.periodEnd
          ),
      );
      demoStore.payrollTimesheets.push({
        id: crypto.randomUUID(),
        clientId: client.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        filename: "demo-seed-timesheet.csv",
        rows: timesheetRows,
        createdAt: new Date().toISOString(),
      });
    } else if (isDeskStoreConfigured()) {
      await deskUpsertTimesheet({
        client_id: client.id,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        filename: "demo-seed-timesheet.csv",
        rows: timesheetRows,
      });
    }
  } catch (e) {
    logRich("timesheet", e);
  }

  const taxYearLabel = (() => {
    const short = taxYearFromDate(period.payDate); // e.g. 25-26
    const [a, b] = short.split("-");
    if (!a || !b) return "2025-26";
    const start = Number(a) > 50 ? `19${a}` : `20${a}`;
    const end = Number(b) > 50 ? `19${b}` : `20${b}`;
    return `${start}-${end.slice(2)}`;
  })();

  await savePayrollDeskSettings({
    clientId: client.id,
    activeTaxYear: taxYearLabel,
  }).catch((e) => logRich("taxYear", e));

  await savePayrollPackPassword({
    clientId: client.id,
    password: "demopack1",
  }).catch((e) => logRich("packPassword", e));

  const { recentPayrollMonths } = await import("@/lib/payroll");
  const historyYears = Math.max(0, opts?.historyYears ?? 0);
  // ~5 tax years ≈ 60 calendar months; default stays 3 recent months.
  const monthCount = historyYears > 0 ? historyYears * 12 : 3;
  const months = recentPayrollMonths(monthCount);

  async function existingPayDates(): Promise<Set<string>> {
    if (isDemoMode()) {
      const { demoStore } = await import("@/server/demo/store");
      return new Set(
        demoStore.payRuns
          .filter((r) => r.clientId === client.id && r.kind === "FPS")
          .map((r) => String(r.payDate)),
      );
    }
    if (isDeskStoreConfigured()) {
      const runs = (await deskListPayRuns(client.id)) ?? [];
      return new Set(
        runs
          .filter((r) => String(r.kind ?? "FPS") === "FPS")
          .map((r) => String(r.pay_date)),
      );
    }
    return new Set();
  }

  const known = await existingPayDates();

  // Drop any unfiled current-payday run left by older seeds — History must
  // stay empty for this month until Generate payslips on Run payroll.
  const newestPayDate = months[0]?.period.payDate;
  if (newestPayDate) {
    try {
      if (isDemoMode()) {
        const { demoStore } = await import("@/server/demo/store");
        demoStore.payRuns = demoStore.payRuns.filter((r) => {
          if (r.clientId !== client.id) return true;
          if (String(r.kind ?? "FPS") !== "FPS") return true;
          if (String(r.payDate) !== newestPayDate) return true;
          return isPayrollRtiSubmitted({
            status: String(r.status ?? ""),
            hmrcCorrelationId: (r.hmrcCorrelationId as string | null) ?? null,
          });
        });
      } else if (isDeskStoreConfigured()) {
        const rows = (await deskListPayRuns(client.id)) ?? [];
        for (const row of rows) {
          if (String(row.kind ?? "FPS") !== "FPS") continue;
          if (String(row.pay_date) !== newestPayDate) continue;
          if (
            isPayrollRtiSubmitted({
              status: String(row.status ?? ""),
              hmrcCorrelationId:
                (row.hmrc_correlation_id as string | null) ?? null,
            })
          ) {
            continue;
          }
          await deskDeletePayRun(String(row.id));
        }
      }
      known.delete(newestPayDate);
    } catch (e) {
      logRich("payRun:clearCurrent", e);
    }
  }

  // Template from the newest payday maths; archive months clone / refresh lines.
  let template: Awaited<ReturnType<typeof previewPayRun>> | null = null;
  const newest = months[0];
  if (newest) {
    try {
      template = await previewPayRun({
        clientId: client.id,
        payDate: newest.period.payDate,
        periodStart: newest.period.periodStart,
        periodEnd: newest.period.periodEnd,
        frequency: "M1",
        submit: false,
      });
    } catch (e) {
      logRich("payRun:template", e);
    }
  }
  if (!template?.lines.length) return;

  for (let i = 0; i < months.length; i++) {
    const month = months[i]!;
    // Leave the current payday empty — History card appears only after
    // Generate payslips on Run payroll.
    if (i === 0) continue;
    if (known.has(month.period.payDate)) continue;

    try {
      let pack = template;
      // Recalc a few recent months so statutory/scenario variance stays realistic.
      if (i < 3) {
        try {
          const fresh = await previewPayRun({
            clientId: client.id,
            payDate: month.period.payDate,
            periodStart: month.period.periodStart,
            periodEnd: month.period.periodEnd,
            frequency: "M1",
            submit: false,
          });
          if (fresh.lines.length) pack = fresh;
        } catch {
          /* keep template */
        }
      }

      // Prior months = filed archive for P60 / YTD / packs.
      const status = "accepted";
      const corr = `DEMO-SEED-${month.period.payDate}` as string;

      const payRun = {
        id: crypto.randomUUID(),
        clientId: client.id,
        payDate: month.period.payDate,
        periodStart: month.period.periodStart,
        periodEnd: month.period.periodEnd,
        payFrequency: "M1" as const,
        kind: "FPS",
        status,
        totals: pack.totals,
        lines: pack.lines,
        fpsXmlHash: null as string | null,
        hmrcCorrelationId: corr,
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      if (isDemoMode()) {
        const { demoStore } = await import("@/server/demo/store");
        demoStore.payRuns.push(payRun);
        if (status === "accepted") {
          for (const line of pack.lines) {
            const emp = demoStore.employees.find((e) => e.id === line.employeeId);
            if (emp) emp.firstFpsSent = true;
          }
        }
      } else if (isDeskStoreConfigured()) {
        await deskInsertPayRun({
          id: payRun.id,
          client_id: payRun.clientId,
          pay_date: payRun.payDate,
          period_start: payRun.periodStart,
          period_end: payRun.periodEnd,
          pay_frequency: payRun.payFrequency,
          kind: payRun.kind,
          status: payRun.status,
          totals: payRun.totals,
          lines: payRun.lines,
          fps_xml_hash: payRun.fpsXmlHash,
          hmrc_correlation_id: payRun.hmrcCorrelationId,
          submitted_at: payRun.submittedAt,
        });
      }
      known.add(month.period.payDate);
    } catch (e) {
      logRich(`payRun:${month.key}`, e);
    }
  }
}

async function seedBank(
  client: ClientRecord,
  lines: RichBankLine[],
  filename: string,
) {
  const { importBankConvertedLines, listBankTransactions } = await import(
    "@/server/actions/bank"
  );
  const existing = await listBankTransactions(client.id).catch(() => []);
  if (existing.length >= Math.min(8, lines.length)) return;
  await importBankConvertedLines({
    clientId: client.id,
    lines,
    filename,
    source: "csv",
    mode: "replace",
  }).catch((e) => logRich("bank", e));
}

async function seedVatReady(
  client: ClientRecord,
  period: { key: string; start: string; end: string },
  boxes: typeof MERIDIAN_VAT_BOXES,
) {
  const vrn = digitsVrn(client.vrn);
  if (!client.isVatRegistered || !vrn) return;

  const { saveVatHmrcConnectDetails, prepareVatReturnFromBoxes, listVatReturns } =
    await import("@/server/actions/vat");

  await saveVatHmrcConnectDetails({
    clientId: client.id,
    filingAs: "business",
    vrn,
    vatRegistrationDate: "2020-04-01",
  }).catch((e) => logRich("vatConnect", e));

  const returns = await listVatReturns(client.id).catch(() => []);
  if (
    returns.some((r) => {
      const row = r as { periodKey?: string; period_key?: string };
      return row.periodKey === period.key || row.period_key === period.key;
    })
  ) {
    return;
  }

  const { vatReturnBoxesSchema } = await import("@/server/money/schemas");
  await prepareVatReturnFromBoxes({
    clientId: client.id,
    periodKey: period.key,
    periodStart: period.start,
    periodEnd: period.end,
    boxes: vatReturnBoxesSchema.parse(boxes),
  }).catch((e) => logRich("vatReady", e));
}

async function seedCt600(client: ClientRecord) {
  if (client.type !== "limited_company" || !client.companyNumber || !client.utr)
    return;
  const { prepareCt600, listCt600Returns } = await import(
    "@/server/actions/ct600"
  );
  const existing = await listCt600Returns(client.id).catch(() => []);
  if (
    existing.some(
      (r) =>
        r.periodStart === MERIDIAN_PERIOD.start &&
        r.periodEnd === MERIDIAN_PERIOD.end,
    )
  ) {
    return;
  }
  await prepareCt600({
    clientId: client.id,
    periodStart: MERIDIAN_PERIOD.start,
    periodEnd: MERIDIAN_PERIOD.end,
    turnoverPounds: "245000",
    costOfSalesPounds: "98000",
    administrativeExpensesPounds: "72000",
    otherIncomePounds: "1200",
    tangibleAssetsPounds: "18500",
    cashAtBankPounds: "42000",
    debtorsPounds: "15600",
    creditorsPounds: "22400",
    calledUpShareCapitalPounds: "100",
    profitAndLossAccountPounds: "53800",
  }).catch((e) => logRich("ct600", e));
}

async function seedAccountsLedger(client: ClientRecord) {
  if (client.type !== "limited_company") return;
  const {
    setBankLedgerPeriod,
    upsertBankAsset,
    upsertBankCreditor,
    upsertBankDebtor,
    upsertBankLoan,
  } = await import("@/server/actions/bank-ledger");
  const { saveAccountsComparatives } = await import(
    "@/server/actions/accounts-comparatives"
  );

  await setBankLedgerPeriod({
    clientId: client.id,
    periodStart: MERIDIAN_PERIOD.start,
    periodEnd: MERIDIAN_PERIOD.end,
  }).catch((e) => logRich("ledgerPeriod", e));

  await upsertBankAsset({
    clientId: client.id,
    name: "Delivery van",
    class: "vehicle",
    acquiredOn: "2023-06-01",
    costPence: 1850000,
    broughtForwardNbvPence: 1110000,
    method: "reducing_balance",
    ratePercent: 25,
    residualPence: 0,
    secondEntry: "Cr Bank / HP creditor",
    notes: "Presentation demo asset",
  }).catch((e) => logRich("asset", e));

  await upsertBankDebtor({
    clientId: client.id,
    name: "Trade debtors",
    bucket: "trade",
    broughtForwardPence: 820000,
    invoicesPence: 1560000,
    receiptsPence: 820000,
    bankCategory: "turnover",
    secondEntry: "Dr Debtors / Cr Turnover",
  }).catch((e) => logRich("debtor", e));

  await upsertBankCreditor({
    clientId: client.id,
    name: "Trade creditors",
    bucket: "trade",
    broughtForwardPence: 410000,
    billsPence: 980000,
    paymentsPence: 640000,
    bankCategory: "cost_of_sales",
    secondEntry: "Dr Cost of sales / Cr Creditors",
  }).catch((e) => logRich("creditor", e));

  await upsertBankLoan({
    clientId: client.id,
    name: "Bounce-back style loan",
    kind: "bank",
    broughtForwardPence: 1200000,
    repaymentCategory: "finance",
    secondEntry: "Dr Loan / Cr Bank",
    notes: "Within one year portion for demo",
  }).catch((e) => logRich("loan", e));

  await saveAccountsComparatives({
    clientId: client.id,
    turnoverPence: 21800000,
    costOfSalesPence: 8700000,
    adminExpensesPence: 6400000,
    taxationPence: 980000,
    dividendsPence: 500000,
    fixedAssetsPence: 1480000,
    otherDebtorsPence: 720000,
    cashAtBankPence: 3850000,
    creditorsWithinOneYearPence: 2100000,
    creditorsAfterOneYearPence: 900000,
    shareCapitalPence: 10000,
    profitAndLossReservePence: 4940000,
  }).catch((e) => logRich("comparatives", e));
}

async function seedEmailsAndWork(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
  story: "full" | "vat" | "sa" | "light",
) {
  const { insertClientEmailLog } = await import(
    "@/server/actions/client-communications"
  );
  const { appendClientWorkLog, setClientWorkStage } = await import(
    "@/server/actions/desk"
  );

  const to =
    client.contactEmail?.trim() || "accounts@example.com";
  const from = session.email?.trim() || "practice@hydratax.example";

  const emails =
    story === "full"
      ? [
          {
            subject: "VAT return ready for review — Nov–Jan",
            preview:
              "Your VAT nine-box draft is ready. Open the VAT desk to review boxes pulled from bank statements, then submit when connected.",
            kind: "vat_reminder",
            desk: "vat" as const,
            label: "Emailed VAT draft ready",
          },
          {
            subject: "Corporation tax & accounts pack draft",
            preview:
              "CT600 figures and FRS 105 pack are prepared from the year-end bank books. Open Accounts production / CT600 to walk through to submission.",
            kind: "accounts_pack",
            desk: "ct" as const,
            label: "Emailed CT & accounts draft",
          },
          {
            subject: "Payroll people on the desk",
            preview:
              "Ten employees loaded (SSP, SMP and unpaid absence). Open PAYE → History for payslip download or email pack (password demopack1).",
            kind: "payroll",
            desk: "paye" as const,
            label: "Emailed payroll headcount",
          },
          {
            subject: "Bank statements imported",
            preview:
              "Categorised statement lines are on Books — turnover, purchases, salaries, tax. Use pull-to-VAT / year-end to show the flow.",
            kind: "bank",
            desk: "overview" as const,
            label: "Emailed bank import note",
          },
        ]
      : story === "vat"
        ? [
            {
              subject: "VAT draft ready",
              preview:
                "Nine-box VAT return prepared from consulting fee statements.",
              kind: "vat_reminder",
              desk: "vat" as const,
              label: "Emailed VAT draft",
            },
          ]
        : story === "sa"
          ? [
              {
                subject: "Self Assessment books from bank",
                preview:
                  "Bank lines are on the sole-trader desk — open Books / SA to show income and expenses.",
                kind: "sa_reminder",
                desk: "sa" as const,
                label: "Emailed SA bank note",
              },
            ]
          : [
              {
                subject: "Client welcome — presentation desk",
                preview: "Presentation client loaded for the sales walkthrough.",
                kind: "general",
                desk: "overview" as const,
                label: "Emailed welcome",
              },
            ];

  for (const mail of emails) {
    await insertClientEmailLog({
      practiceId: session.practiceId,
      clientId: client.id,
      sentBy: session.userId,
      fromEmail: from,
      toEmail: to,
      subject: mail.subject,
      messagePreview: mail.preview,
      kind: mail.kind,
      delivery: "logged",
      documentCount: 0,
    }).catch((e) => logRich("email", e));

    await appendClientWorkLog({
      clientId: client.id,
      kind: "email",
      label: mail.label,
      detail: mail.preview,
      desk: mail.desk,
    }).catch((e) => logRich("worklog", e));
  }

  await setClientWorkStage({
    clientId: client.id,
    stage: story === "full" ? "drafted" : "in_progress",
    note: "Sales demo seed",
  }).catch((e) => logRich("workStage", e));

  await appendClientWorkLog({
    clientId: client.id,
    kind: "note",
    label: "Sales demo desk loaded",
    detail:
      "Fictional data only — VAT/CT left at ready for a live submit walkthrough when HMRC is connected.",
    desk: "overview",
  }).catch((e) => logRich("note", e));
}

async function enrichMeridian(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  await fillDemoIdentifiers(client);
  await seedPeople(client, MERIDIAN_PEOPLE, client.companyNumber);
  await seedPayroll(client, MERIDIAN_EMPLOYEES);
  await seedBank(
    client,
    MERIDIAN_BANK_LINES,
    "Meridian-Retail-Business-Current-2025-26.csv",
  );
  await seedAccountsLedger(client);
  await seedVatReady(client, MERIDIAN_VAT_PERIOD, MERIDIAN_VAT_BOXES);
  await seedCt600(client);
  await seedEmailsAndWork(client, session, "full");
}

async function enrichOak(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(
    client,
    profile?.people?.length ? profile.people : [],
    client.companyNumber,
  );
  await seedBank(client, OAK_BANK_LINES, "Oak-Thorn-Current-VAT-Q.csv");
  await seedVatReady(
    client,
    { key: "25A4", start: "2025-11-01", end: "2026-01-31" },
    OAK_VAT_BOXES,
  );
  await seedCt600(client);
  await seedAccountsLedger(client);
  await seedEmailsAndWork(client, session, "vat");
}

async function enrichBlueHarbour(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(
    client,
    profile?.people ?? [],
    client.companyNumber,
  );
  await seedBank(
    client,
    OAK_BANK_LINES,
    "Blue-Harbour-Properties-Current.csv",
  );
  await seedAccountsLedger(client);
  await seedCt600(client);
  await seedEmailsAndWork(client, session, "light");
}

async function enrichNorthstar(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(
    client,
    profile?.people ?? [],
    client.companyNumber,
  );
  await seedPayroll(client, MERIDIAN_EMPLOYEES, { historyYears: 5 });
  await seedBank(
    client,
    MERIDIAN_BANK_LINES.slice(0, 12),
    "Northstar-Digital-Current.csv",
  );
  await seedVatReady(client, MERIDIAN_VAT_PERIOD, MERIDIAN_VAT_BOXES);
  await seedCt600(client);
  await seedEmailsAndWork(client, session, "light");
}

async function enrichSamira(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(client, profile?.people ?? []);
  await seedBank(client, SAMIRA_BANK_LINES, "Samira-Khan-Sole-Trader.csv");
  await seedEmailsAndWork(client, session, "sa");
}

async function enrichJames(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(client, profile?.people ?? []);
  await seedBank(client, SAMIRA_BANK_LINES, "James-Whitfield-VAT.csv");
  await seedVatReady(client, MERIDIAN_VAT_PERIOD, OAK_VAT_BOXES);
  await seedEmailsAndWork(client, session, "vat");
}

async function enrichPatel(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(client, profile?.people ?? []);
  await seedEmailsAndWork(client, session, "light");
}

async function enrichGreenfield(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
) {
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const profile = demoProfileFor(client.name);
  await fillDemoIdentifiers(client);
  await seedPeople(client, profile?.people ?? []);
  await seedEmailsAndWork(client, session, "light");
}

async function enrichOnePresentationClient(
  client: ClientRecord,
  session: { practiceId: string; userId: string; email: string | null },
): Promise<"enriched" | "skipped"> {
  if (client.deskProfile?.presentationDemo !== PRESENTATION_DEMO_TAG) {
    return "skipped";
  }
  if (client.deskProfile?.presentationRich === PRESENTATION_RICH_TAG) {
    return "skipped";
  }

  const name = client.name.trim().toLowerCase();
  if (name === "meridian retail limited") {
    await enrichMeridian(client, session);
  } else if (name === "oak & thorn consulting ltd") {
    await enrichOak(client, session);
  } else if (name === "blue harbour properties ltd") {
    await enrichBlueHarbour(client, session);
  } else if (name === "northstar digital ltd") {
    await enrichNorthstar(client, session);
  } else if (name === "samira khan") {
    await enrichSamira(client, session);
  } else if (name === "james whitfield") {
    await enrichJames(client, session);
  } else if (name === "patel & partners") {
    await enrichPatel(client, session);
  } else if (name === "greenfield & co") {
    await enrichGreenfield(client, session);
  } else if (client.type === "limited_company") {
    await fillDemoIdentifiers(client);
    const { demoProfileFor } = await import(
      "@/server/demo/presentation-profiles"
    );
    const profile = demoProfileFor(client.name);
    if (profile?.people?.length) {
      await seedPeople(client, profile.people, client.companyNumber);
    }
    await seedEmailsAndWork(client, session, "light");
  } else {
    await fillDemoIdentifiers(client);
    await seedEmailsAndWork(client, session, "light");
  }
  await markRich(client.id);
  return "enriched";
}

/**
 * Guarantee Meridian / Northstar have PAYE people before the sales-demo
 * timed enrich race returns. Safe to call repeatedly.
 */
export async function ensureDemoPayrollEmployees(): Promise<{ seeded: number }> {
  await requireAdmin();
  const { listClientsIncludingHidden } = await import(
    "@/server/actions/clients"
  );
  const clients = (await listClientsIncludingHidden().catch(() => [])).filter(
    (c) => c.deskProfile?.presentationDemo === PRESENTATION_DEMO_TAG,
  );
  let seeded = 0;
  await Promise.all(
    clients.map(async (client) => {
      const name = client.name.trim().toLowerCase();
      if (
        name !== "meridian retail limited" &&
        name !== "northstar digital ltd"
      ) {
        return;
      }
      try {
        await seedPayrollEmployees(client, MERIDIAN_EMPLOYEES);
        seeded += 1;
      } catch (err) {
        logRich(`payroll:${client.name}`, err);
      }
    }),
  );
  return { seeded };
}

/**
 * RSC-safe heal for an open payroll desk — no enableEmployer / revalidatePath.
 */
export async function ensureDemoPayrollEmployeesQuiet(
  clientId: string,
): Promise<{ seeded: number }> {
  const { getClient } = await import("@/server/actions/clients");
  const client = await getClient(clientId);
  const name = client.name.trim().toLowerCase();
  if (
    name !== "meridian retail limited" &&
    name !== "northstar digital ltd"
  ) {
    return { seeded: 0 };
  }
  await seedPayrollEmployees(client, MERIDIAN_EMPLOYEES, {
    skipEnableEmployer: true,
  });
  return { seeded: 1 };
}

/** Seed recent monthly payslips for presentation employers (no HMRC submit). */
export async function ensureDemoPayHistoryQuiet(
  clientId: string,
): Promise<{ seeded: number }> {
  const { getClient } = await import("@/server/actions/clients");
  const client = await getClient(clientId);
  const name = client.name.trim().toLowerCase();
  if (
    name !== "meridian retail limited" &&
    name !== "northstar digital ltd"
  ) {
    return { seeded: 0 };
  }
  await seedPayroll(client, MERIDIAN_EMPLOYEES, {
    historyYears: name === "northstar digital ltd" ? 5 : 0,
  });
  return { seeded: 1 };
}

/**
 * Fast path for sales-demo open: identities + people for every presentation
 * client in parallel, then heavier desks only where still needed.
 */
export async function enrichPresentationDemoFast(): Promise<{
  enriched: number;
  skipped: number;
}> {
  const session = await requireAdmin();
  const { listClientsIncludingHidden } = await import(
    "@/server/actions/clients"
  );
  const { demoProfileFor } = await import(
    "@/server/demo/presentation-profiles"
  );
  const clients = (await listClientsIncludingHidden().catch(() => [])).filter(
    (c) => c.deskProfile?.presentationDemo === PRESENTATION_DEMO_TAG,
  );

  const sessionCtx = {
    practiceId: session.practiceId,
    userId: session.userId,
    email: session.email,
  };

  // Always refresh card identity + officers/people (cheap, fixes empty cards).
  await Promise.all(
    clients.map(async (client) => {
      try {
        await fillDemoIdentifiers(client);
        const profile = demoProfileFor(client.name);
        const name = client.name.trim().toLowerCase();
        const people =
          name === "meridian retail limited"
            ? MERIDIAN_PEOPLE
            : (profile?.people ?? []);
        if (people.length) {
          await seedPeople(client, people, client.companyNumber);
        }
      } catch (err) {
        logRich(`shell:${client.name}`, err);
      }
    }),
  );

  const needsHeavy = clients.filter(
    (c) => c.deskProfile?.presentationRich !== PRESENTATION_RICH_TAG,
  );

  const results = await Promise.all(
    needsHeavy.map((client) =>
      enrichOnePresentationClient(client, sessionCtx).catch((err) => {
        logRich(client.name, err);
        return "skipped" as const;
      }),
    ),
  );

  return {
    enriched: results.filter((r) => r === "enriched").length,
    skipped: results.filter((r) => r === "skipped").length,
  };
}

/** @deprecated Prefer enrichPresentationDemoFast for sales-demo entry. */
export async function enrichAllPresentationDemoClients(): Promise<{
  enriched: number;
  skipped: number;
}> {
  return enrichPresentationDemoFast();
}
