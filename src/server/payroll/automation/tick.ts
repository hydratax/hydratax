/**
 * Monthly payroll automation — driven by Settings → Automation.
 * Called from the payroll-jobs cron tick.
 */

import type {
  DeskProfile,
  PayrollAutomationSettings,
  PayrollDeskSettings,
} from "@/lib/desk-profile";
import { defaultPayPeriod } from "@/lib/payroll";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";

export type AutomationTickSummary = {
  checked: number;
  due: number;
  payrollRan: number;
  rtiFiled: number;
  emailed: number;
  skipped: number;
  errors: string[];
};

function ukNowParts(): { ymd: string; day: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const day = Number(parts.find((p) => p.type === "day")?.value || "1");
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const year = parts.find((p) => p.type === "year")?.value || "1970";
  return { ymd: `${year}-${month}-${day}`, day };
}

function readAutomation(
  profile: DeskProfile | null | undefined,
): PayrollAutomationSettings | undefined {
  return profile?.payrollSettings?.automation;
}

type EmployerRow = {
  id: string;
  practiceId: string;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  contactEmail: string | null;
  deskProfile: DeskProfile | null;
};

async function listEmployers(): Promise<EmployerRow[]> {
  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    return demoStore.clients
      .filter((c) => c.isEmployer)
      .map((c) => ({
        id: c.id,
        practiceId: c.practiceId,
        payeRef: c.payeRef,
        accountsOfficeRef: c.accountsOfficeRef,
        contactEmail: c.contactEmail ?? null,
        deskProfile: (c.deskProfile as DeskProfile) ?? null,
      }));
  }

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("clients")
      .select(
        "id, practice_id, paye_ref, accounts_office_ref, contact_email, desk_profile, is_employer",
      )
      .eq("is_employer", true)
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: String(r.id),
      practiceId: String(r.practice_id),
      payeRef: r.paye_ref ? String(r.paye_ref) : null,
      accountsOfficeRef: r.accounts_office_ref
        ? String(r.accounts_office_ref)
        : null,
      contactEmail: r.contact_email ? String(r.contact_email) : null,
      deskProfile: (r.desk_profile as DeskProfile) ?? null,
    }));
  }

  return [];
}

async function patchAutomationLastRun(
  clientId: string,
  practiceId: string,
  profile: DeskProfile | null,
  ymd: string,
) {
  const prev = (profile?.payrollSettings ?? {}) as PayrollDeskSettings;
  const nextProfile: DeskProfile = {
    ...(profile ?? {}),
    payrollSettings: {
      ...prev,
      automation: {
        ...(prev.automation ?? {}),
        lastRunYmd: ymd,
      },
    },
  };

  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (row) {
      row.deskProfile = nextProfile;
      row.updatedAt = new Date().toISOString();
    }
    return;
  }

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    await getSupabaseAdmin()
      .from("clients")
      .update({
        desk_profile: nextProfile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", practiceId);
  }
}

/**
 * One cron pass: for each employer whose automation day matches today (UK),
 * run payroll → file FPS → email pack when those toggles are on.
 */
export async function runPayrollAutomationTick(): Promise<AutomationTickSummary> {
  const summary: AutomationTickSummary = {
    checked: 0,
    due: 0,
    payrollRan: 0,
    rtiFiled: 0,
    emailed: 0,
    skipped: 0,
    errors: [],
  };

  const { ymd, day } = ukNowParts();
  let employers: EmployerRow[] = [];
  try {
    employers = await listEmployers();
  } catch (err) {
    summary.errors.push(
      err instanceof Error ? err.message : "Could not list employers",
    );
    return summary;
  }

  summary.checked = employers.length;

  const {
    runAutomatedSavePayRun,
    runAutomatedSubmitFps,
    runAutomatedEmailPack,
  } = await import("@/server/payroll/automation/execute");

  for (const emp of employers) {
    const auto = readAutomation(emp.deskProfile);
    if (!auto) continue;

    const duePayroll =
      Boolean(auto.automatePayroll) && auto.payrollDayOfMonth === day;
    const dueRti = Boolean(auto.automateRti) && auto.rtiDayOfMonth === day;
    const dueEmail =
      Boolean(auto.automateEmail) && auto.emailDayOfMonth === day;
    if (!duePayroll && !dueRti && !dueEmail) continue;

    if (auto.lastRunYmd === ymd) {
      summary.skipped += 1;
      continue;
    }

    summary.due += 1;
    const frequency =
      emp.deskProfile?.payrollSettings?.payFrequency === "W1" ? "W1" : "M1";
    const period = defaultPayPeriod(frequency);

    try {
      if (duePayroll) {
        await runAutomatedSavePayRun({
          clientId: emp.id,
          practiceId: emp.practiceId,
          payDate: period.payDate,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          frequency,
        });
        summary.payrollRan += 1;
      }

      if (dueRti) {
        await runAutomatedSubmitFps({
          clientId: emp.id,
          practiceId: emp.practiceId,
          payDate: period.payDate,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          frequency,
          payeRef: emp.payeRef,
        });
        summary.rtiFiled += 1;
      }

      if (dueEmail) {
        await runAutomatedEmailPack({
          clientId: emp.id,
          practiceId: emp.practiceId,
          payDate: period.payDate,
          toEmail:
            emp.deskProfile?.payrollSettings?.contactEmail?.trim() ||
            emp.contactEmail,
        });
        summary.emailed += 1;
      }

      await patchAutomationLastRun(
        emp.id,
        emp.practiceId,
        emp.deskProfile,
        ymd,
      );
    } catch (err) {
      summary.errors.push(
        `${emp.id}: ${err instanceof Error ? err.message : "automation failed"}`,
      );
    }
  }

  return summary;
}
