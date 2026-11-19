/**
 * Per-company employee CSV template + parser for bureau take-on.
 * HydraTax canonical headers only — vendor exports are remapped offline
 * (see docs/payroll/BULK-IMPORT-AND-MIGRATION.md). Money columns are £ strings;
 * callers convert to integer pence via poundsToPence.
 */

export const EMPLOYEE_CSV_HEADERS = [
  "forename",
  "surname",
  "nino",
  "gender",
  "date_of_birth",
  "address_street",
  "address_city",
  "address_postcode",
  "tax_code",
  "tax_basis",
  "ni_category",
  "annual_salary",
  "hourly_rate",
  "hours_per_week",
  "pay_basis",
  "pay_frequency",
  "start_date",
  "job_title",
  "payroll_id",
  "starter_declaration",
  "is_director",
  "directors_nic_method",
  "student_loan_plan",
  "postgraduate_loan",
  "pension_opt_out",
  "ssp_qualifying_days",
  "bank_sort_code",
  "bank_account_number",
  "bank_account_name",
  "bf_tax_year",
  "bf_taxable",
  "bf_tax",
  "bf_employee_ni",
] as const;

export type EmployeeCsvHeader = (typeof EMPLOYEE_CSV_HEADERS)[number];

export type ParsedEmployeeCsvRow = {
  rowNumber: number;
  forename: string;
  surname: string;
  nino: string;
  gender: "M" | "F";
  dateOfBirth?: string;
  address?: string;
  taxCode: string;
  taxBasis: "cumulative" | "week1Month1";
  niCategory: string;
  annualSalaryPounds?: string;
  hourlyRatePounds?: string;
  hoursPerWeek?: string;
  payBasis: "salary" | "hourly";
  payFrequency: "M1" | "W1";
  startDate: string;
  jobTitle?: string;
  payrollId?: string;
  starterDeclaration: "A" | "B" | "C";
  isDirector: boolean;
  directorsNicMethod: "AN" | "AL";
  studentLoanPlan?: string;
  postgraduateLoan: boolean;
  pensionOptOut: boolean;
  sspQualifyingDays?: number;
  bankSortCode?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  bfTaxYear?: string;
  bfTaxablePounds?: string;
  bfTaxPounds?: string;
  bfEmployeeNiPounds?: string;
};

export type EmployeeCsvParseResult = {
  rows: ParsedEmployeeCsvRow[];
  errors: { rowNumber: number; message: string }[];
};

const HEADER_ALIASES: Record<string, EmployeeCsvHeader> = {
  forename: "forename",
  first_name: "forename",
  firstname: "forename",
  surname: "surname",
  last_name: "surname",
  lastname: "surname",
  nino: "nino",
  ni_number: "nino",
  national_insurance_number: "nino",
  gender: "gender",
  date_of_birth: "date_of_birth",
  dob: "date_of_birth",
  address_street: "address_street",
  street: "address_street",
  address_city: "address_city",
  city: "address_city",
  address_postcode: "address_postcode",
  postcode: "address_postcode",
  tax_code: "tax_code",
  tax_basis: "tax_basis",
  ni_category: "ni_category",
  ni_letter: "ni_category",
  annual_salary: "annual_salary",
  salary: "annual_salary",
  hourly_rate: "hourly_rate",
  hours_per_week: "hours_per_week",
  pay_basis: "pay_basis",
  pay_frequency: "pay_frequency",
  start_date: "start_date",
  job_title: "job_title",
  payroll_id: "payroll_id",
  starter_declaration: "starter_declaration",
  is_director: "is_director",
  director: "is_director",
  directors_nic_method: "directors_nic_method",
  student_loan_plan: "student_loan_plan",
  postgraduate_loan: "postgraduate_loan",
  pension_opt_out: "pension_opt_out",
  ssp_qualifying_days: "ssp_qualifying_days",
  bank_sort_code: "bank_sort_code",
  sort_code: "bank_sort_code",
  bank_account_number: "bank_account_number",
  account_number: "bank_account_number",
  bank_account_name: "bank_account_name",
  account_name: "bank_account_name",
  bf_tax_year: "bf_tax_year",
  bf_taxable: "bf_taxable",
  bf_tax: "bf_tax",
  bf_employee_ni: "bf_employee_ni",
};

/** Soft cap for a single synchronous upload (no job queue). */
export const EMPLOYEE_CSV_MAX_ROWS = 200;

export function employeeCsvTemplateText(): string {
  const sample = [
    "Sam",
    "Taylor",
    "QQ123456C",
    "F",
    "1990-05-12",
    "12 High Street",
    "Leeds",
    "LS1 1AA",
    "1257L",
    "cumulative",
    "A",
    "32000",
    "",
    "37.5",
    "salary",
    "M1",
    "2024-04-06",
    "Bookkeeper",
    "",
    "A",
    "false",
    "AN",
    "",
    "false",
    "false",
    "5",
    "112233",
    "12345678",
    "S Taylor",
    "",
    "",
    "",
    "",
  ];
  return `${EMPLOYEE_CSV_HEADERS.join(",")}\n${sample.join(",")}\n`;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function parseIsoDate(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (uk) {
    const d = uk[1]!.padStart(2, "0");
    const m = uk[2]!.padStart(2, "0");
    return `${uk[3]}-${m}-${d}`;
  }
  return undefined;
}

function mapStudentLoan(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim().toLowerCase();
  if (s === "01" || s === "1" || s === "plan1" || s === "plan_1") return "01";
  if (s === "02" || s === "2" || s === "plan2" || s === "plan_2") return "02";
  if (s === "04" || s === "4" || s === "plan4" || s === "plan_4") return "04";
  if (s === "05" || s === "5" || s === "plan5" || s === "plan_5") return "05";
  return undefined;
}

function buildAddress(cells: Partial<Record<EmployeeCsvHeader, string>>): string | undefined {
  const street = cells.address_street?.trim() || "";
  const city = cells.address_city?.trim() || "";
  const postcode = cells.address_postcode?.trim() || "";
  if (!street && !city && !postcode) return undefined;
  return JSON.stringify({
    street,
    city,
    county: "",
    postcode: postcode.toUpperCase(),
  });
}

export function parseEmployeeCsv(text: string): EmployeeCsvParseResult {
  const normalised = text.replace(/^\ufeff/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n").filter((l) => l.trim().length > 0);
  const errors: EmployeeCsvParseResult["errors"] = [];
  const rows: ParsedEmployeeCsvRow[] = [];

  if (lines.length < 2) {
    errors.push({ rowNumber: 0, message: "CSV needs a header row and at least one employee." });
    return { rows, errors };
  }

  const headerCells = splitCsvLine(lines[0]!);
  const colMap = new Map<number, EmployeeCsvHeader>();
  for (let i = 0; i < headerCells.length; i++) {
    const key = HEADER_ALIASES[normHeader(headerCells[i]!)];
    if (key) colMap.set(i, key);
  }

  if (![...colMap.values()].includes("forename") || ![...colMap.values()].includes("surname")) {
    errors.push({
      rowNumber: 1,
      message: "Header must include forename and surname columns.",
    });
    return { rows, errors };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > EMPLOYEE_CSV_MAX_ROWS) {
    errors.push({
      rowNumber: 0,
      message: `Too many rows (max ${EMPLOYEE_CSV_MAX_ROWS} per upload). Split the file.`,
    });
    return { rows, errors };
  }

  dataLines.forEach((line, idx) => {
    const rowNumber = idx + 2;
    const cells = splitCsvLine(line);
    const mapped: Partial<Record<EmployeeCsvHeader, string>> = {};
    for (const [i, key] of colMap) {
      mapped[key] = cells[i] ?? "";
    }

    const forename = mapped.forename?.trim() || "";
    const surname = mapped.surname?.trim() || "";
    const nino = (mapped.nino?.trim() || "").replace(/\s+/g, "").toUpperCase();
    const startDate = parseIsoDate(mapped.start_date);
    const genderRaw = (mapped.gender || "M").trim().toUpperCase();
    const gender: "M" | "F" = genderRaw.startsWith("F") ? "F" : "M";

    if (!forename || !surname) {
      errors.push({ rowNumber, message: "Forename and surname are required." });
      return;
    }
    if (!nino || nino.length < 8) {
      errors.push({ rowNumber, message: "NI number is required." });
      return;
    }
    if (!startDate) {
      errors.push({ rowNumber, message: "Start date is required (YYYY-MM-DD or DD/MM/YYYY)." });
      return;
    }

    const annual = mapped.annual_salary?.trim() || "";
    const hourly = mapped.hourly_rate?.trim() || "";
    if (!annual && !hourly) {
      errors.push({ rowNumber, message: "Enter annual_salary or hourly_rate." });
      return;
    }

    const taxBasisRaw = (mapped.tax_basis || "cumulative").trim().toLowerCase();
    const taxBasis: "cumulative" | "week1Month1" =
      taxBasisRaw === "week1month1" ||
      taxBasisRaw === "w1m1" ||
      taxBasisRaw === "1" ||
      taxBasisRaw === "week1/month1"
        ? "week1Month1"
        : "cumulative";

    const payFreqRaw = (mapped.pay_frequency || "M1").trim().toUpperCase();
    const payFrequency: "M1" | "W1" =
      payFreqRaw === "W1" || payFreqRaw === "W" || payFreqRaw === "WEEKLY"
        ? "W1"
        : "M1";

    const payBasisRaw = (mapped.pay_basis || (hourly && !annual ? "hourly" : "salary"))
      .trim()
      .toLowerCase();
    const payBasis: "salary" | "hourly" =
      payBasisRaw === "hourly" ? "hourly" : "salary";

    const starterRaw = (mapped.starter_declaration || "A").trim().toUpperCase();
    const starterDeclaration: "A" | "B" | "C" =
      starterRaw === "B" || starterRaw === "C" ? starterRaw : "A";

    const directorsRaw = (mapped.directors_nic_method || "AN").trim().toUpperCase();
    const directorsNicMethod: "AN" | "AL" =
      directorsRaw === "AL" || directorsRaw === "ALTERNATIVE" ? "AL" : "AN";

    const sspRaw = mapped.ssp_qualifying_days?.trim();
    const sspQualifyingDays = sspRaw
      ? Math.min(7, Math.max(1, Math.round(Number(sspRaw)) || 5))
      : undefined;

    rows.push({
      rowNumber,
      forename,
      surname,
      nino,
      gender,
      dateOfBirth: parseIsoDate(mapped.date_of_birth),
      address: buildAddress(mapped),
      taxCode: mapped.tax_code?.trim() || "1257L",
      taxBasis,
      niCategory: (mapped.ni_category?.trim() || "A").toUpperCase().slice(0, 1),
      annualSalaryPounds: annual || undefined,
      hourlyRatePounds: hourly || undefined,
      hoursPerWeek: mapped.hours_per_week?.trim() || undefined,
      payBasis,
      payFrequency,
      startDate,
      jobTitle: mapped.job_title?.trim() || undefined,
      payrollId: mapped.payroll_id?.trim() || undefined,
      starterDeclaration,
      isDirector: truthy(mapped.is_director),
      directorsNicMethod,
      studentLoanPlan: mapStudentLoan(mapped.student_loan_plan),
      postgraduateLoan: truthy(mapped.postgraduate_loan),
      pensionOptOut: truthy(mapped.pension_opt_out),
      sspQualifyingDays,
      bankSortCode: mapped.bank_sort_code?.replace(/\D/g, "") || undefined,
      bankAccountNumber: mapped.bank_account_number?.replace(/\D/g, "") || undefined,
      bankAccountName: mapped.bank_account_name?.trim() || undefined,
      bfTaxYear: mapped.bf_tax_year?.trim() || undefined,
      bfTaxablePounds: mapped.bf_taxable?.trim() || undefined,
      bfTaxPounds: mapped.bf_tax?.trim() || undefined,
      bfEmployeeNiPounds: mapped.bf_employee_ni?.trim() || undefined,
    });
  });

  return { rows, errors };
}
