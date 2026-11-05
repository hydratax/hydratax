import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  urgencyForDueDate,
  formatDueShort,
  type FilingUrgency,
} from "@/lib/filing-due";
import {
  companiesHouseAccountsPeriod,
  corporationTaxAccountingPeriods,
} from "@/lib/accounting-periods";

export type PracticeFilingKind =
  | "corporation_tax"
  | "confirmation_statement"
  | "annual_accounts"
  | "vat"
  | "paye"
  | "self_assessment"
  | "itsa_quarterly"
  | "aml_review";

export type PracticeFilingRow = {
  id: string;
  clientId: string;
  companyName: string;
  companyNumber: string | null;
  kind: PracticeFilingKind;
  label: string;
  periodLabel: string;
  deadlineIso: string | null;
  deadlineLabel: string;
  urgency: FilingUrgency;
  daysLabel: string;
  href: string;
  jobStatus?: import("@/lib/desk-profile").JobStatus | null;
};

function daysBetween(dueIso: string, now = new Date()) {
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
}

function daysLabel(dueIso: string | null, urgency: FilingUrgency) {
  if (!dueIso || urgency === "unknown") return "—";
  const d = daysBetween(dueIso);
  if (d == null) return "—";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} over`;
  if (d === 0) return "Due today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}

export type PracticeClientLite = {
  id: string;
  name: string;
  type: string;
  companyNumber: string | null;
  isVatRegistered?: boolean;
  isEmployer?: boolean;
  amlNextReviewOn?: string | null;
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
};

function isoDate(year: number, month: number, day: number) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Next electronic PAYE payment date (22nd). */
function nextPayeDeadline(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const thisMonth = isoDate(y, m, 22);
  if (now.getDate() <= 22) return thisMonth;
  const next = new Date(y, m, 22);
  return isoDate(next.getFullYear(), next.getMonth() + 1, 22);
}

/** Next standard VAT stagger: 1 month and 7 days after Mar/Jun/Sep/Dec. */
function nextVatDeadline(now: Date) {
  const periodEndMonths = [2, 5, 8, 11];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 1; year++) {
    for (const endMonth of periodEndMonths) {
      const due = new Date(year, endMonth + 2, 7);
      if (due >= today) {
        return isoDate(due.getFullYear(), due.getMonth() + 1, due.getDate());
      }
    }
  }
  return isoDate(now.getFullYear() + 1, 5, 7);
}

function nextSaDeadline(now: Date) {
  const y = now.getFullYear();
  const jan31 = new Date(y, 0, 31);
  const year = now <= jan31 ? y : y + 1;
  return isoDate(year, 1, 31);
}

function nextItsaDeadline(now: Date) {
  const y = now.getFullYear();
  const candidates = [
    isoDate(y, 8, 7),
    isoDate(y, 11, 7),
    isoDate(y + 1, 2, 7),
    isoDate(y + 1, 5, 7),
  ];
  const today = isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return candidates.find((d) => d >= today) ?? isoDate(y + 1, 8, 7);
}

export function buildPracticeFilings(
  clients: PracticeClientLite[],
  now = new Date(),
): PracticeFilingRow[] {
  const rows: PracticeFilingRow[] = [];

  for (const client of clients) {
    if (client.type !== "limited_company") continue;
    const snap = client.companiesHouse ?? null;
    const number = client.companyNumber ?? snap?.companyNumber ?? null;
    const companyQ = number ? encodeURIComponent(number) : "";

    const csDue = snap?.confirmationStatementNextDue ?? null;
    if (csDue || number) {
      const urgency = urgencyForDueDate(csDue, now);
      rows.push({
        id: `${client.id}:cs`,
        clientId: client.id,
        companyName: snap?.companyName ?? client.name,
        companyNumber: number,
        kind: "confirmation_statement",
        label: "Confirmation Statement",
        periodLabel: snap?.confirmationStatementLastMadeUpTo
          ? `Statement date ${formatDueShort(snap.confirmationStatementLastMadeUpTo)}`
          : "Next confirmation statement",
        deadlineIso: csDue,
        deadlineLabel: formatDueShort(csDue) ?? "—",
        urgency,
        daysLabel: daysLabel(csDue, urgency),
        href: `/filings/confirmation-statement/${client.id}${
          companyQ ? `?company=${companyQ}` : ""
        }`,
      });
    }

    const accountsDue = snap?.accountsNextDue ?? null;
    if (accountsDue || number) {
      const urgency = urgencyForDueDate(accountsDue, now);
      const periodEnd = snap?.accountsPeriodEnd;
      rows.push({
        id: `${client.id}:accounts`,
        clientId: client.id,
        companyName: snap?.companyName ?? client.name,
        companyNumber: number,
        kind: "annual_accounts",
        label: "Annual accounts",
        periodLabel: periodEnd
          ? `Period to ${formatDueShort(periodEnd)}`
          : "Next accounts",
        deadlineIso: accountsDue,
        deadlineLabel: formatDueShort(accountsDue) ?? "—",
        urgency,
        daysLabel: daysLabel(accountsDue, urgency),
        href: `/companies-house/accounts-ixbrl?clientId=${encodeURIComponent(
          client.id,
        )}${companyQ ? `&company=${companyQ}` : ""}`,
      });
    }

    const poa = companiesHouseAccountsPeriod({
      incorporatedOn: snap?.incorporatedOn,
      accountsPeriodEnd: snap?.accountsPeriodEnd,
      lastAccountsMadeUpTo: snap?.lastAccountsMadeUpTo,
    });
    const hasPoaDates = Boolean(
      snap?.accountsPeriodEnd || snap?.incorporatedOn,
    );
    const ctAps = hasPoaDates ? corporationTaxAccountingPeriods(poa) : [];
    if (ctAps.length || number) {
      for (const ap of ctAps) {
        const urgency = urgencyForDueDate(ap.filingDue, now);
        rows.push({
          id: `${client.id}:ct:${ap.index}`,
          clientId: client.id,
          companyName: snap?.companyName ?? client.name,
          companyNumber: number,
          kind: "corporation_tax",
          label:
            ap.of > 1
              ? `Corporation Tax (${ap.index} of ${ap.of})`
              : "Corporation Tax",
          periodLabel: `${formatDueShort(ap.start)} – ${formatDueShort(ap.end)}`,
          deadlineIso: ap.filingDue,
          deadlineLabel: formatDueShort(ap.filingDue) ?? "—",
          urgency,
          daysLabel: daysLabel(ap.filingDue, urgency),
          href: `/clients/${client.id}/corporation-tax?start=${ap.start}&end=${ap.end}`,
        });
      }
      if (!ctAps.length) {
        const urgency = urgencyForDueDate(null, now);
        rows.push({
          id: `${client.id}:ct`,
          clientId: client.id,
          companyName: snap?.companyName ?? client.name,
          companyNumber: number,
          kind: "corporation_tax",
          label: "Corporation Tax",
          periodLabel: "Corporation Tax return",
          deadlineIso: null,
          deadlineLabel: "—",
          urgency,
          daysLabel: daysLabel(null, urgency),
          href: `/clients/${client.id}/corporation-tax`,
        });
      }
    }
  }

  for (const client of clients) {
    const slug = client.id;
    if (client.isVatRegistered) {
      const due = nextVatDeadline(now);
      const urgency = urgencyForDueDate(due, now);
      rows.push({
        id: `${client.id}:vat`,
        clientId: client.id,
        companyName: client.name,
        companyNumber: client.companyNumber,
        kind: "vat",
        label: "VAT return",
        periodLabel: "Next standard quarter",
        deadlineIso: due,
        deadlineLabel: formatDueShort(due) ?? "—",
        urgency,
        daysLabel: daysLabel(due, urgency),
        href: `/clients/${slug}/vat`,
      });
    }
    if (client.isEmployer) {
      const due = nextPayeDeadline(now);
      const urgency = urgencyForDueDate(due, now);
      rows.push({
        id: `${client.id}:paye`,
        clientId: client.id,
        companyName: client.name,
        companyNumber: client.companyNumber,
        kind: "paye",
        label: "PAYE payment",
        periodLabel: "Electronic payment to HMRC",
        deadlineIso: due,
        deadlineLabel: formatDueShort(due) ?? "—",
        urgency,
        daysLabel: daysLabel(due, urgency),
        href: `/clients/${slug}/payroll`,
      });
    }
    const amlDue = client.amlNextReviewOn?.slice(0, 10) || null;
    if (amlDue) {
      const urgency = urgencyForDueDate(amlDue, now);
      rows.push({
        id: `${client.id}:aml`,
        clientId: client.id,
        companyName: client.name,
        companyNumber: client.companyNumber,
        kind: "aml_review",
        label: "AML review",
        periodLabel: "Customer due diligence",
        deadlineIso: amlDue,
        deadlineLabel: formatDueShort(amlDue) ?? "—",
        urgency,
        daysLabel: daysLabel(amlDue, urgency),
        href: `/clients/${slug}/aml`,
      });
    }
    if (client.type === "sole_trader" || client.type === "partnership") {
      const sa = nextSaDeadline(now);
      const saUrgency = urgencyForDueDate(sa, now);
      rows.push({
        id: `${client.id}:sa`,
        clientId: client.id,
        companyName: client.name,
        companyNumber: client.companyNumber,
        kind: "self_assessment",
        label: "Self Assessment",
        periodLabel: "Online filing deadline",
        deadlineIso: sa,
        deadlineLabel: formatDueShort(sa) ?? "—",
        urgency: saUrgency,
        daysLabel: daysLabel(sa, saUrgency),
        href: `/clients/${slug}/self-assessment`,
      });
      const itsa = nextItsaDeadline(now);
      const itsaUrgency = urgencyForDueDate(itsa, now);
      rows.push({
        id: `${client.id}:itsa`,
        clientId: client.id,
        companyName: client.name,
        companyNumber: client.companyNumber,
        kind: "itsa_quarterly",
        label: "MTD quarterly update",
        periodLabel: "Income Tax quarterly update",
        deadlineIso: itsa,
        deadlineLabel: formatDueShort(itsa) ?? "—",
        urgency: itsaUrgency,
        daysLabel: daysLabel(itsa, itsaUrgency),
        href: `/clients/${slug}/self-assessment`,
      });
    }
  }

  const rank: Record<FilingUrgency, number> = {
    overdue: 0,
    due_soon: 1,
    ok: 2,
    unknown: 3,
  };

  return rows.sort((a, b) => {
    const ur = rank[a.urgency] - rank[b.urgency];
    if (ur !== 0) return ur;
    const ad = a.deadlineIso ?? "9999";
    const bd = b.deadlineIso ?? "9999";
    return ad.localeCompare(bd);
  });
}

export function filingKindLabel(kind: PracticeFilingKind) {
  if (kind === "corporation_tax") return "Corporation Tax";
  if (kind === "confirmation_statement") return "Confirmation Statement";
  if (kind === "vat") return "VAT";
  if (kind === "paye") return "PAYE";
  if (kind === "self_assessment") return "Self Assessment";
  if (kind === "itsa_quarterly") return "MTD quarterly update";
  if (kind === "aml_review") return "AML review";
  return "Annual accounts";
}
