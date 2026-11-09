import type { SaCompanyIncome } from "@/lib/sa-income";
import type { SaTaxpayer } from "@/lib/sa-taxpayer";
import {
  matchSaPersonToPayeEmployee,
  normalizeNino,
  saTaxYearToPayrollYear,
} from "@/lib/sa-paye-match";
import { ytdFromRuns } from "@/lib/payroll";
import { getClient } from "@/server/actions/clients";
import { listEmployees, listPayRuns } from "@/server/actions/payroll";
import { currentSaTaxYear, parseSaTaxYearLabel } from "@/lib/sa-tax-year";

function penceToPounds(pence: number): number {
  return Math.round((pence || 0) / 100);
}

export type PayePullMeta = {
  clientId: string;
  matched: boolean;
  employeeId?: string;
  payePay?: number;
  payeTax?: number;
  payeRef?: string;
  reason?: string;
};

/**
 * For each company on the SA desk, if the person is on that company's PAYE
 * payroll and NINO + date of birth + address all match, copy current-year
 * (or requested tax year) YTD pay and tax onto the company income card.
 * Any failed identity check leaves that company's PAYE figures untouched.
 */
export async function pullPayeIntoCompanyIncomes(opts: {
  taxpayer: SaTaxpayer;
  companyIncomes: SaCompanyIncome[];
  /** SA tax year label e.g. 2025-26 — defaults to current tax year */
  taxYear?: string;
}): Promise<{
  companyIncomes: SaCompanyIncome[];
  pulls: PayePullMeta[];
  changed: boolean;
}> {
  const yearLabel =
    (opts.taxYear && parseSaTaxYearLabel(opts.taxYear)?.label) ||
    currentSaTaxYear().label;
  const payrollYear = saTaxYearToPayrollYear(yearLabel);

  const person = {
    nino: opts.taxpayer.nino,
    dateOfBirth: opts.taxpayer.dateOfBirth,
    address: opts.taxpayer.address,
  };
  const personNino = normalizeNino(person.nino);

  const pulls: PayePullMeta[] = [];
  let changed = false;
  const next: SaCompanyIncome[] = [];

  for (const company of opts.companyIncomes) {
    try {
      const employees = await listEmployees(company.clientId, {
        includeLeavers: true,
      });

      let matchedEmployee: (typeof employees)[number] | null = null;
      let ninoOnlyHit = false;
      for (const e of employees) {
        const result = matchSaPersonToPayeEmployee(person, {
          nino: e.nino,
          dateOfBirth: e.dateOfBirth,
          address: e.address,
        });
        if (result.matched) {
          matchedEmployee = e;
          break;
        }
        if (personNino && normalizeNino(e.nino) === personNino) {
          ninoOnlyHit = true;
        }
      }

      if (!matchedEmployee) {
        pulls.push({
          clientId: company.clientId,
          matched: false,
          reason: ninoOnlyHit
            ? "NINO found on payroll but date of birth or address did not match — PAYE not applied"
            : "No matching PAYE employee (NINO, date of birth and address required)",
        });
        next.push(company);
        continue;
      }

      const [runs, client] = await Promise.all([
        listPayRuns(company.clientId),
        getClient(company.clientId),
      ]);
      const ytd = ytdFromRuns(matchedEmployee.id, payrollYear, runs);
      const taxable = ytd.taxablePence ?? ytd.grossPence;
      const payePay = penceToPounds(taxable);
      const payeTax = penceToPounds(ytd.taxPence);
      const payeRef = (client.payeRef || company.payeRef || "").trim();

      const updated: SaCompanyIncome = {
        ...company,
        payePay,
        payeTax,
        payeRef: payeRef || company.payeRef,
      };
      if (
        updated.payePay !== company.payePay ||
        updated.payeTax !== company.payeTax ||
        updated.payeRef !== company.payeRef
      ) {
        changed = true;
      }
      pulls.push({
        clientId: company.clientId,
        matched: true,
        employeeId: matchedEmployee.id,
        payePay,
        payeTax,
        payeRef: updated.payeRef,
      });
      next.push(updated);
    } catch {
      pulls.push({
        clientId: company.clientId,
        matched: false,
        reason: "Could not read PAYE for this company",
      });
      next.push(company);
    }
  }

  return { companyIncomes: next, pulls, changed };
}
