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
  | "annual_accounts";

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
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
};

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
  return "Annual accounts";
}
