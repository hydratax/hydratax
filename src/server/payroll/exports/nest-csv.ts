/**
 * NEST contribution CSV export stub.
 * Column set mirrors common NEST employer upload fields — re-check against
 * the live NEST template before production use (see docs/payroll/CREDENTIALS-AND-SETUP.md).
 */

export type NestContributionRow = {
  nestMemberId?: string | null;
  nino: string;
  forename: string;
  surname: string;
  payDate: string;
  employeeContributionPence: number;
  employerContributionPence: number;
  pensionablePayPence: number;
};

function pounds(penceAmount: number): string {
  const n = Math.max(0, penceAmount);
  const whole = Math.floor(n / 100);
  const frac = String(n % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build a NEST-shaped contribution CSV (UTF-8, comma-separated). */
export function buildNestContributionsCsv(rows: NestContributionRow[]): string {
  const header = [
    "Member ID",
    "NI Number",
    "Forename",
    "Surname",
    "Payment Date",
    "Employee Contribution",
    "Employer Contribution",
    "Pensionable Earnings",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.nestMemberId?.trim() || ""),
        csvEscape(r.nino.replace(/\s+/g, "").toUpperCase()),
        csvEscape(r.forename),
        csvEscape(r.surname),
        csvEscape(r.payDate),
        pounds(r.employeeContributionPence),
        pounds(r.employerContributionPence),
        pounds(r.pensionablePayPence),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Interface for future People’s / Smart exporters. */
export type AeExportProvider = {
  id: "nest" | "peoples" | "smart";
  label: string;
  buildCsv: (rows: NestContributionRow[]) => string;
};

export const nestCsvProvider: AeExportProvider = {
  id: "nest",
  label: "NEST",
  buildCsv: buildNestContributionsCsv,
};
