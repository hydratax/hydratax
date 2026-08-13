import * as XLSX from "xlsx";

export type TimesheetRow = {
  payrollId?: string;
  nino?: string;
  name?: string;
  ordinaryHours?: number;
  overtimeHours?: number;
  sickDays?: number;
  holidayHours?: number;
  irregularHours?: boolean;
  maternityWeeks?: number;
  maternityWeekFrom?: number;
  hourlyRatePence?: number;
  raw: Record<string, unknown>;
};

export type ParsedTimesheet = {
  rows: TimesheetRow[];
  unmatchedHeaders: string[];
};

function norm(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_MAP: Record<string, keyof Omit<TimesheetRow, "raw">> = {
  payrollid: "payrollId",
  payroll: "payrollId",
  payid: "payrollId",
  employeeid: "payrollId",
  staffid: "payrollId",
  nino: "nino",
  ni: "nino",
  nationalinsurance: "nino",
  nationalinsurancenumber: "nino",
  name: "name",
  employee: "name",
  employeename: "name",
  hours: "ordinaryHours",
  ordinaryhours: "ordinaryHours",
  hoursthisperiod: "ordinaryHours",
  workedhours: "ordinaryHours",
  overtime: "overtimeHours",
  overtimehours: "overtimeHours",
  sickdays: "sickDays",
  sspdays: "sickDays",
  sick: "sickDays",
  sicknessdays: "sickDays",
  holidayhours: "holidayHours",
  holiday: "holidayHours",
  leavehours: "holidayHours",
  maternityweeks: "maternityWeeks",
  smpweeks: "maternityWeeks",
  maternityweekfrom: "maternityWeekFrom",
  smpfrom: "maternityWeekFrom",
  smpweekfrom: "maternityWeekFrom",
  hourlyrate: "hourlyRatePence",
  rate: "hourlyRatePence",
  rateph: "hourlyRatePence",
  payrate: "hourlyRatePence",
  irregularhours: "irregularHours",
  irregular: "irregularHours",
};

function asNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/£/g, "").replace(/,/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function asPence(v: unknown): number | undefined {
  const n = asNumber(v);
  if (n == null) return undefined;
  // Treat values like 12.50 as pounds; 1250 as pence only if huge — always pounds on a timesheet.
  return Math.round(n * 100);
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

export function parseTimesheetBuffer(buffer: ArrayBuffer | Buffer): ParsedTimesheet {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return { rows: [], unmatchedHeaders: [] };
  const sheet = book.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const unmatched = new Set<string>();
  const rows: TimesheetRow[] = [];

  for (const raw of json) {
    const row: TimesheetRow = { raw };
    let any = false;
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_MAP[norm(header)];
      if (!key) {
        if (header.trim()) unmatched.add(header);
        continue;
      }
      if (key === "payrollId" || key === "nino" || key === "name") {
        const s = String(value ?? "").trim();
        if (s) {
          row[key] = s;
          any = true;
        }
        continue;
      }
      if (key === "irregularHours") {
        row.irregularHours = asBool(value);
        if (row.irregularHours) any = true;
        continue;
      }
      if (key === "hourlyRatePence") {
        const p = asPence(value);
        if (p != null && p > 0) {
          row.hourlyRatePence = p;
          any = true;
        }
        continue;
      }
      const n = asNumber(value);
      if (n != null && n !== 0) {
        (row as Record<string, unknown>)[key] = n;
        any = true;
      }
    }
    if (any) rows.push(row);
  }

  return { rows, unmatchedHeaders: [...unmatched] };
}

export function timesheetTemplateBuffer(): Buffer {
  const sample = [
    {
      payroll_id: "HYABC123",
      nino: "AB123456C",
      name: "Sam Taylor",
      hours: 37.5,
      overtime_hours: 0,
      sick_days: 0,
      holiday_hours: 0,
      irregular_hours: "no",
      maternity_weeks: 0,
      maternity_week_from: 1,
      hourly_rate: 15.0,
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(sample);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Timesheet");
  return Buffer.from(
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer,
  );
}

export function matchTimesheetRow<
  T extends {
    payrollId: string;
    nino: string;
    forename: string;
    surname: string;
  },
>(row: TimesheetRow, employees: T[]): T | undefined {
  if (row.payrollId) {
    const id = row.payrollId.toUpperCase();
    const hit = employees.find((e) => e.payrollId.toUpperCase() === id);
    if (hit) return hit;
  }
  if (row.nino) {
    const nino = row.nino.replace(/\s/g, "").toUpperCase();
    const hit = employees.find(
      (e) => e.nino.replace(/\s/g, "").toUpperCase() === nino,
    );
    if (hit) return hit;
  }
  if (row.name) {
    const name = row.name.replace(/\s+/g, " ").trim().toLowerCase();
    return employees.find(
      (e) => `${e.forename} ${e.surname}`.replace(/\s+/g, " ").trim().toLowerCase() === name,
    );
  }
  return undefined;
}
