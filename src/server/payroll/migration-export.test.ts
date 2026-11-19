import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_CSV_HEADERS,
  parseEmployeeCsv,
} from "@/server/payroll/employee-csv";
import {
  EMPLOYEE_EXPORT_HEADERS,
  buildEmployeesMigrationCsv,
  buildMigrationZipStoreOnly,
} from "@/server/payroll/migration-export";
import { extractZipEntries } from "@/server/payroll/jobs/zip-pack";
import {
  decideRtiSubmitPath,
  estimateDailyRtiCapacity,
} from "@/server/hmrc/rti-submit-queue";

describe("migration export employees CSV", () => {
  it("export headers include every import template column", () => {
    for (const h of EMPLOYEE_CSV_HEADERS) {
      expect(EMPLOYEE_EXPORT_HEADERS).toContain(h);
    }
  });

  it("exported employees.csv re-parses via import parser", () => {
    const rows = [
      {
        id: "emp-1",
        forename: "Sam",
        surname: "Taylor",
        nino: "QQ123456C",
        gender: "F",
        date_of_birth: "1990-05-12",
        address: JSON.stringify({
          street: "12 High Street",
          city: "Leeds",
          postcode: "LS1 1AA",
        }),
        tax_code: "1257L",
        tax_basis: "cumulative",
        ni_category: "A",
        annual_salary_pence: 3_200_000,
        hourly_rate_pence: 0,
        hours_per_week: 3750,
        pay_basis: "salary",
        pay_frequency: "M1",
        start_date: "2024-04-06",
        job_title: "Bookkeeper",
        payroll_id: "E001",
        starter_declaration: "A",
        is_director: false,
        directors_nic_method: "AN",
        student_loan_plan: null,
        postgraduate_loan: false,
        pension_opt_out: false,
        ssp_qualifying_days: 5,
        bank_sort_code: "112233",
        bank_account_number: "12345678",
        bank_account_name: "S Taylor",
        bf_tax_year: null,
        bf_taxable_pence: 0,
        bf_tax_pence: 0,
        bf_employee_ni_pence: 0,
        leave_date: null,
        active: true,
        first_fps_sent: false,
      },
    ];

    const csv = buildEmployeesMigrationCsv(rows);
    const parsed = parseEmployeeCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.forename).toBe("Sam");
    expect(parsed.rows[0]!.nino).toBe("QQ123456C");
    expect(parsed.rows[0]!.annualSalaryPounds).toBe("32000.00");
    expect(parsed.rows[0]!.bankSortCode).toBe("112233");
  });

  it("builds a readable store-only zip", () => {
    const zip = buildMigrationZipStoreOnly([
      {
        filename: "employees.csv",
        csv: "forename,surname\nA,B\n",
        contentType: "text/csv; charset=utf-8",
      },
      {
        filename: "pay-runs-summary.csv",
        csv: "pay_run_id\n",
        contentType: "text/csv; charset=utf-8",
      },
    ]);
    const entries = extractZipEntries(zip);
    expect(entries.map((e) => e.path).sort()).toEqual([
      "employees.csv",
      "pay-runs-summary.csv",
    ]);
  });
});

describe("rti submit queue helpers", () => {
  it("defaults to sync desk path when queue flag off", () => {
    expect(decideRtiSubmitPath().mode).toBe("sync");
  });

  it("estimates capacity for a bureau day", () => {
    const n = estimateDailyRtiCapacity({ gapMs: 2500, hours: 10, workers: 1 });
    expect(n).toBeGreaterThan(1000);
  });
});
