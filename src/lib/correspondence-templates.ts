/** Built-in correspondence templates and year-end-aware merge helpers. */

import {
  companiesHouseAccountsPeriod,
  formatGbDate,
} from "@/lib/accounting-periods";

export type CorrespondenceTemplateKey =
  | "bank_statements_request"
  | "accounts_info_request"
  | "confirmation_statement_reminder"
  | "accounts_due_reminder"
  | "vat_records_request"
  | "payroll_info_request";

export type CorrespondenceTemplateDef = {
  key: CorrespondenceTemplateKey;
  name: string;
  description: string;
  channel: "email" | "whatsapp" | "both";
  subject: string;
  body: string;
};

export type TemplateVars = {
  client_name: string;
  company_number: string;
  practice_name: string;
  sender_name: string;
  accounts_due: string;
  period_start: string;
  period_end: string;
  year_end: string;
};

export const SYSTEM_CORRESPONDENCE_TEMPLATES: CorrespondenceTemplateDef[] = [
  {
    key: "bank_statements_request",
    name: "Bank statements request",
    description:
      "Asks for bank statements covering the accounting year. Dates follow the company year end from Companies House.",
    channel: "both",
    subject:
      "Bank statements needed — {{client_name}} ({{period_start}} to {{period_end}})",
    body: `Dear {{client_name}},

To prepare your annual accounts for the year ending {{year_end}}, please send us complete bank statements for all business accounts covering:

{{period_start}} to {{period_end}}

PDF statements or a secure bank export are fine. If you bank online, a download for that full period is ideal.

Please reply to this message (or WhatsApp us) with the files attached.

Kind regards,
{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "accounts_info_request",
    name: "Year-end information request",
    description: "General year-end checklist tied to the accounting period.",
    channel: "email",
    subject: "Information needed for accounts — year ending {{year_end}}",
    body: `Dear {{client_name}},

We are preparing your accounts for the year ending {{year_end}}. Please send:

• Bank statements {{period_start}} to {{period_end}}
• Sales invoices / cash book for the same period
• Purchase invoices and expense receipts
• Details of any loans, HP, or director transactions
• Stock / WIP figure at {{year_end}} (if applicable)

Kind regards,
{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "confirmation_statement_reminder",
    name: "Confirmation statement reminder",
    description: "Reminder that the CS01 filing window is approaching.",
    channel: "both",
    subject: "Confirmation statement due — {{client_name}}",
    body: `Dear {{client_name}},

Your confirmation statement at Companies House is due soon{{#accounts_due}} ({{accounts_due}}){{/accounts_due}}.

Please confirm whether company officers, registered office, and PSC details are unchanged, or let us know what has changed.

Kind regards,
{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "accounts_due_reminder",
    name: "Accounts filing reminder",
    description: "Reminder that Companies House accounts are due.",
    channel: "email",
    subject: "Annual accounts due {{accounts_due}} — {{client_name}}",
    body: `Dear {{client_name}},

Companies House shows annual accounts due on {{accounts_due}} (year ending {{year_end}}).

If you have not already sent bank statements for {{period_start}} to {{period_end}}, please send them as soon as possible so we can prepare and file on time.

Kind regards,
{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "vat_records_request",
    name: "VAT records request",
    description: "Request VAT books and evidence for the return period.",
    channel: "email",
    subject: "VAT records needed — {{client_name}}",
    body: `Dear {{client_name}},

Please send VAT records (sales, purchases, and bank evidence) for the current VAT period so we can prepare your return.

Kind regards,
{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "payroll_info_request",
    name: "Payroll information request",
    description: "Ask for timesheets / starter details before a pay run.",
    channel: "email",
    subject: "Payroll information needed — {{client_name}}",
    body: `Dear {{client_name}},

Please send any payroll updates (starters, leavers, hours, bonuses) before the next pay run.

Kind regards,
{{sender_name}}
{{practice_name}}`,
  },
];

export function applyTemplate(
  template: string,
  vars: Partial<TemplateVars>,
): string {
  let out = template.replace(
    /\{\{#([a-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key: string, inner: string) => {
      const v = vars[key as keyof TemplateVars];
      if (!v) return "";
      return inner.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (__: string, k: string) => {
        const val = vars[k as keyof TemplateVars];
        return val != null ? String(val) : "";
      });
    },
  );
  out = out.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key as keyof TemplateVars];
    return v != null ? String(v) : "";
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function accountingPeriodFromCompaniesHouse(opts: {
  incorporatedOn?: string | null;
  accountsPeriodEnd?: string | null;
  lastAccountsMadeUpTo?: string | null;
}): {
  periodStart: string | null;
  periodEnd: string | null;
  yearEnd: string | null;
  periodStartLabel: string;
  periodEndLabel: string;
  yearEndLabel: string;
} {
  if (!opts.incorporatedOn && !opts.accountsPeriodEnd) {
    return {
      periodStart: null,
      periodEnd: null,
      yearEnd: null,
      periodStartLabel: "[period start]",
      periodEndLabel: "[period end]",
      yearEndLabel: "[year end]",
    };
  }
  const poa = companiesHouseAccountsPeriod(opts);
  return {
    periodStart: poa.start,
    periodEnd: poa.end,
    yearEnd: poa.end,
    periodStartLabel: formatGbDate(poa.start),
    periodEndLabel: formatGbDate(poa.end),
    yearEndLabel: formatGbDate(poa.end),
  };
}

/**
 * Accounting period from a year-end date (subsequent years: day after previous anniversary).
 */
export function accountingPeriodFromYearEnd(
  yearEndIso: string | null | undefined,
): {
  periodStart: string | null;
  periodEnd: string | null;
  yearEnd: string | null;
  periodStartLabel: string;
  periodEndLabel: string;
  yearEndLabel: string;
} {
  return accountingPeriodFromCompaniesHouse({
    accountsPeriodEnd: yearEndIso,
  });
}

export type DocumentRequestStatus =
  | "none"
  | "requested"
  | "received"
  | "partial"
  | "overdue";

export function documentStatusLabel(
  status: DocumentRequestStatus | string,
): string {
  switch (status) {
    case "requested":
      return "Bank statements requested";
    case "received":
      return "Bank statements received";
    case "partial":
      return "Partial documents received";
    case "overdue":
      return "Documents overdue";
    default:
      return "No request";
  }
}
