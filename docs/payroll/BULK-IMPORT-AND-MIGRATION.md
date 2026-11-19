# Payroll bulk import & bureau migration

Plan for moving employers from Sage / Xero / QuickBooks / QTAC into HydraTax,
plus **exit** CSV when leaving HydraTax.
Audience: builders and bureau ops — not desk copy.

## Target volume (user scenario)

| Scale | Count |
| --- | --- |
| Companies | up to ~1,000 |
| Employees per company | 10–20 |
| Total employees | ~10k–20k |

That is a **multi-tenant batch** problem. HydraTax supports:

1. **Per-company** employee CSV take-on (synchronous, capped at 200 rows) — desk UI.  
2. **Bureau zip / manifest pack** via durable DB jobs + cron tick — **server/ops only** (no big bureau desk UI yet).

---

## What source systems typically export

### Sage 50 Payroll (UK desktop)

Practical path (Sage help + common migration guides):

1. **Employee Details** CSV — `File → Data Export → Payroll Data Export → Employee Details` (tick column headings).
2. **Employee Year to Date Figures** CSV — same wizard, YTD option.

Useful columns (names vary slightly by version):

| Theme | Typical Sage fields |
| --- | --- |
| Identity | Forename, Surname, NI Number, Gender, Date of Birth, Address 1–4, Post Code |
| Pay | Tax Code, Wk1Mth1 Basis, NI Category, Gross Salary / Salary Per Period, Payment Frequency, Work Start Date, Job Title |
| Director | Director Status (0 / 1 annual / 2 alternative), Date Directorship Began |
| Loans | SLR Plan Type, PGLR From/To Date |
| Bank | Sort Code, Bank Account Number, Bank Name |
| YTD (2nd file) | Gross Pay for Tax, Total Tax TD, Ees NIC TD, Ers NIC TD, statutory YTDs |

Sage Business Cloud Payroll: use product CSV/employee export or latest **FPS XML** for mid-year YTD; bank often needs a separate extract or re-key.

### Xero Payroll UK

| Source | What you get | Gaps |
| --- | --- | --- |
| Per-employee **EmployeeInformation.csv** (combine in Excel) | Standing details | Painful at volume |
| Latest **FPS XML** (RTI submissions) | Identity + YTD pay/tax/NI | No bank, email, or non-FPS fields |
| Manual / secondary CSV | Bank, pensions, leave | Often re-keyed |

Industry practice: import FPS for YTD, then overlay bank/address from a worker CSV.

### QuickBooks Payroll UK (Advanced / Employment Hero–style)

| Source | Notes |
| --- | --- |
| **Export Employees** (template with data, or empty template) | XLSX/CSV with First Name, Surname, DOB, addresses, StartDate, TaxCode, NI category/method, bank columns (`BankAccount1_*`), Rate / HoursPerWeek |
| **Opening balances** extract | Mid-year YTD / open balances — use alongside employee data |

Required-to-pay fields in QB’s own import docs are extensive; map a subset into HydraTax’s template.

### QTAC (UK bureau)

| Source | Notes |
| --- | --- |
| **Admin → Data Conversion → Company CSV Export** | Folder of CSVs including `Employee.csv` (+ company file) |
| **Batch Management → Employee Update** | Same CSV shape for create/update |
| User-defined exports | Custom column picks for bureau reporting |

QTAC is already CSV-centric; remap `Employee.csv` headers into HydraTax’s canonical template.

---

## HydraTax employee model (import targets)

Canonical fields (see `employees` in schema / `PayrollEmployee`):

- Identity: forename, surname, nino, gender, dateOfBirth, address  
- Pay: taxCode, taxBasis, niCategory, annualSalaryPence, hourlyRatePence, hoursPerWeek, payBasis, payFrequency, startDate, jobTitle, payrollId, starterDeclaration  
- Director: isDirector, directorsNicMethod (`AN` \| `AL`)  
- Loans / AE / SSP: studentLoanPlan, postgraduateLoan, pensionOptOut, sspQualifyingDays  
- Bank: bankSortCode, bankAccountNumber, bankAccountName  
- Prior employer YTD (P45-style): bfTaxYear, bfTaxablePence, bfTaxPence, bfEmployeeNiPence  

Money is stored as **integer pence**. CSV money columns are pounds strings and converted on write.

Do **not** invent HMRC fields HydraTax does not store (attachments of earnings, full AE assessment history, holiday balances, etc.).

---

## Recommended upload UX

### Phase 1 (now) — per-company CSV

1. Open the employer → People on this payroll.  
2. **CSV template** → fill or remap from vendor export.  
3. **Import CSV** → match on **NI number** (update if present, else create).  
4. Quiet desk behaviour: success line with counts; total failure freezes (no error banner).  
5. Soft cap: **200 rows** per upload (`EMPLOYEE_CSV_MAX_ROWS`) so a Netlify/server action stays synchronous.

Prefer **one company at a time** for take-on quality (parallel run first pay).

### Phase 2 (built — ops / API) — bureau zip

Pack shape:

```
bureau-takeon.zip
  12345678/employees.csv
  87654321/employees.csv
  …
```

Or flat names `12345678-employees.csv`, or a `manifest.json`:

```json
{
  "companies": [
    { "company_number": "12345678", "path": "12345678/employees.csv" },
    { "client_id": "uuid-…", "path": "clients/a/employees.csv" }
  ]
}
```

Match keys: **company_number** (default), **client_id**, or **paye_ref**. Clients must already exist on the practice.

#### How to operate (no desk UI)

1. Apply migration `supabase/migrations/20261119010000_bulk_import_and_rti_queue.sql`.  
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` are set.  
3. Enqueue:

```bash
curl -s -X POST "$BASE/api/internal/bulk-import" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"practiceId\":\"…\",\"sourceLabel\":\"sage-takeon\",\"zipBase64\":\"…\",\"processNow\":true}"
```

Or pass `files` as a JSON map of path → CSV text (no zip).

4. Process further ticks:

```bash
curl -s -X POST "$BASE/api/cron/payroll-jobs" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Default: **5 companies per tick** (`BULK_IMPORT_COMPANIES_PER_TICK`). Cap **1000** companies per job.

5. Status: `GET /api/internal/bulk-import?jobId=…` with the same Bearer secret.

6. Optional Netlify function: `netlify/functions/payroll-jobs-cron.ts` (add a `[functions."payroll-jobs-cron"] schedule` in `netlify.toml` when you want it live — not enabled by default to avoid surprise credit use).

Code entry points:

| Piece | Path |
| --- | --- |
| Enqueue | `src/server/payroll/jobs/enqueue.ts` |
| Zip / manifest parse | `src/server/payroll/jobs/pack-manifest.ts`, `zip-pack.ts` |
| Worker tick | `src/server/payroll/jobs/processor.ts` |
| Apply CSV | `src/server/payroll/employee-csv-apply.ts` |
| Tables | `bulk_import_jobs`, `bulk_import_job_items` |

---

## Infrastructure verdict

| Capability | Status in HydraTax |
| --- | --- |
| Per-client employee create/update actions | Yes (`addEmployee` / `updateEmployee`) |
| Bank CSV / statement import | Yes (bank desk — different domain) |
| Timesheet XLSX/CSV | Yes (pay run) |
| NEST / BACS **export** CSV | Yes |
| Canonical **employee** CSV template + parse + single-company import | Yes |
| Durable DB job tables + claim RPCs | **Yes** (`bulk_import_*`, `rti_submit_jobs`) |
| Cron / internal enqueue for bureau packs | **Yes** (Bearer `CRON_SECRET`) |
| Progress UI for long imports | **No** (ops polls job JSON only) |
| Multi-company zip ingest | **Yes** (backend) |
| Redis / Inngest / BullMQ | **No** — intentionally unused |
| Exit payroll CSV export (backend) | **Yes** — see below; **no desk button** |
| Vendor auto-mappers (Sage/Xero/QB/QTAC headers) | Still remap offline to HydraTax CSV |
| FPS XML take-on for YTD | Not built |

### Honest gaps remaining

1. No accountant-facing bureau progress desk (by design for this slice).  
2. No vendor header auto-mappers.  
3. No FPS XML mid-year take-on.  
4. Plan employee caps still apply on other create paths; bulk apply uses service-role writes and does not re-check plan caps per row (ops should respect entitlements).  
5. Directors’ NIC / student loans may still be blocked in live FPS preflight even if imported.

---

## Exit / leaving HydraTax (outbound CSV)

Backend-only. **Do not** add desk buttons/menus until product asks.

### Invoke

```ts
import {
  exportClientPayrollMigrationCsv,
  exportClientPayrollMigrationZip,
} from "@/server/payroll/migration-export";

const { files } = await exportClientPayrollMigrationCsv(clientId);
// files[0] = employees.csv (import headers + extras)
// files[1] = pay-runs-summary.csv

const { zip, filename } = await exportClientPayrollMigrationZip(clientId);
```

Ops HTTP (Bearer `CRON_SECRET`):

```bash
curl -s "$BASE/api/internal/payroll-export?clientId=…&format=json" \
  -H "Authorization: Bearer $CRON_SECRET"

curl -s "$BASE/api/internal/payroll-export?clientId=…&format=zip" \
  -H "Authorization: Bearer $CRON_SECRET" -o export.zip
```

### employees.csv columns

Import template headers (`EMPLOYEE_CSV_HEADERS`) **plus**:

`leave_date`, `active`, `first_fps_sent`, `employee_id`

Money as pounds strings; bank fields included. Destination systems (Sage / Xero / QB / QTAC) should map these columns into their employee import templates — ignore extras they do not understand. Round-trip: export → re-import into HydraTax works for the shared header set (extras are ignored by the parser).

### pay-runs-summary.csv

Lightweight history: pay dates, periods, kind, status, HMRC correlation id. Not a full payslip dump.

### What is not exported yet

Statutory PDF packs, timesheet blobs, Gateway credentials, full FPS XML archive. Add deliberately if a destination requires them.

---

## RTI at bureau scale

See **`docs/payroll/RTI-VOLUME-AND-HMRC-LIMITS.md`**. Summary: one FPS per EmpRef; ~1000 companies ⇒ ~1000 submits; no published software-house daily cap; HydraTax should queue/throttle (`rti_submit_jobs`, `RTI_SUBMIT_QUEUE_ENABLED`).

---

## Implemented vs documented-only

| Item | State |
| --- | --- |
| Documents & packs collapsed pay-run rows | Implemented |
| Employee multicards + director AbbrInfo | Implemented |
| Research of Sage / Xero / QB / QTAC export shapes | This doc |
| HydraTax employee CSV template + parser + unit tests | Implemented |
| Per-company Import CSV on People desk | Implemented |
| DB job queue + zip/manifest pack + cron/internal enqueue | **Implemented** |
| Exit migration CSV / zip builders + internal route | **Implemented (no desk UI)** |
| RTI volume research + queue stubs | **Implemented** — see RTI doc |
| Bureau progress desk UI | Not built |
| Vendor auto-mappers / FPS XML take-on | Not built |

---

## Template headers

See `EMPLOYEE_CSV_HEADERS` in `src/server/payroll/employee-csv.ts`. Sample row is included in the downloaded template.
