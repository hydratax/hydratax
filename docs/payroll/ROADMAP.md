# HydraTax payroll roadmap

Owned by **payebee**. Locked architect decisions (do not re-litigate without product owner).

## Locked decisions

1. **Engine location:** `src/server/payroll/engine/` (`rates.ts`, `tax.ts`, `ni.ts`, `student-loans.ts`) called from `src/server/hmrc/payroll.ts`. **hmrcbee** owns XML wrap / IRmark / submit only.
2. **Stack:** pdf-lib + **XML-only RTI** (no REST FPS unless already present).
3. **Pension first target:** NEST CSV export shape first; API later. Stub interface + CSV builder.
4. **Schema:** Migrations + `ensurePayrollSchema` / D1 for student loans, NI letter UI, W1/M1 tax basis, bank fields, AE assessment stub.
5. **Priority:** (a) PAYE+NI engine → (b) student loans on pay lines + FPS → (c) Phase 2 without external APIs.
6. **MVP includes:** EPS recoverables (SER) skeleton, Welsh (C) mirror of rUK, Scottish (S) GOV.UK bands. CIS300 stub/roadmap only.
7. **Directors NIC:** Annual-method (AN) default; Alternative (AL) uses period thresholds — both emit FPS `DirectorsNIC`.

## Phase status

### Phase 1 — Foundation

| Item | Status |
|------|--------|
| Integer-pence rates (rUK / S / C) 2025–26 & 2026–27 | Done |
| Tax engine: cumulative + W1/M1, PA taper, BR/0T/NT/K/S/C | Done |
| NI categories A,B,C,H,M,J,Z (+ F,I,L,S,V,D,E,K,N shapes) | Done |
| Student loans Plans 1/2/4/5 + PGL | Done |
| Wire into `calculatePeriodPay` / YTD / payslips | Done |
| FPS StudentLoanRecovered / PostgradLoanRecovered / TD | Done |
| Employee UI: NI letter, tax basis, loans, director, bank | Done |
| Unblock `student_loan_unsupported` preflight | Done |
| Directors annual-method + FPS `DirectorsNIC=AN` | Done |
| Directors alternative method + FPS `DirectorsNIC=AL` | Done |
| Unit tests (pence fixtures) | Done / expanding |
| Docs: credentials + this roadmap | Done |

### Phase 2 — Compliance (credential-free) — **COMPLETE**

| Item | Status |
|------|--------|
| EPS RecoverableAmountsYTD collection + soft-gate | Done |
| EPS ApprenticeshipLevy collection + soft-gate | Done (desk + XML; GOV.UK 0.5% / £15k) |
| P32 employer liability view from run aggregates | Done (History → Employer totals) |
| NEST CSV export from AE contributions | Done (download on pay run) |
| Bank fields for future BACS | Done (cards + Staff payments settings) |
| BACS Standard 18 credit file export | Done (download only; SUN from settings) |
| AE assessment light desk display | Done (History → Employer · workplace pension) |
| Alternative directors method (AL) | Done (engine + FPS + employee UI) |
| Full NI YTD band precision vs HMRC tables | Done (whole-pound edges + fixtures) |
| CIS300 | Roadmap only (not in Phase 2 scope) |

Credential-free Phase 2 is **complete**. Further payroll depth needs external keys — see below and [CREDENTIALS-AND-SETUP.md](./CREDENTIALS-AND-SETUP.md).

### Phase 3 — Integrations (credentials required)

Waiting on keys / enrolments documented in CREDENTIALS-AND-SETUP:

| Item | Needs |
|------|--------|
| Live Gateway prove-out (FPS/EPS levy & recoverables) | HMRC Gateway / SDST live enablement |
| HMRC DPS (P6/P9/SL1/SL2) | DPS credentials + notice schemas |
| NEST / People’s / Smart APIs | Provider API onboarding (CSV already ships) |
| Live bureau / Bacstel-IP submit | Bank/bureau channel (SUN already collected for file export) |

### Phase 4 — Market-leading

- NMW / holiday-pay audits
- P11D(b) / Class 1A
- Bureau draft → approve → submit workflows
- MPBiKs (from April 2027)
- CIS300 (if product prioritises)

## Practice workflow (desk) — shipped foundation

Two-step bureau path on Run payroll + Payroll clients cards:

1. **Generate payslips** (`savePayRun` → status `ready`) — pack ready; email for review; **RTI not filed**.
2. **Submit RTI** (`createAndSubmitPayRun` / `submitSavedPayRun` → `accepted`) — FPS filed for the period.

After submit, History supports **Reverse** / **Reverse & amend** per employee → amend draft (`prepareAmendedPayRun`) → re-file corrected YTD via FPS (HMRC correction path).

Payroll clients desk (`/clients?desk=payroll`) filters: All · Not started · Generated · RTI submitted · Monthly · Weekly (no Companies House CS/Accounts filters).

**Northstar Digital Ltd** demo seed: ~5 tax years of monthly pay runs (idempotent `DEMO-SEED-*`), newest month left as generated for workflow demos.

### HMRC amend gap (honest)

- Desk state machine + reverse/amend draft + re-file FPS with corrected figures: **working**.
- There is no separate FPS “amendment submission type” for ordinary pay — HMRC expects a further FPS with corrected **FiguresToDate**.
- FPS XSD `Amendment` under Benefits/Expenses (cars) is **not** wired; car/van benefit amendments remain out of scope.
- `LateReason` not emitted; late filing reasons still a gap if HMRC requires them.

## Verify

```bash
npx vitest run src/server/payroll/engine src/server/payroll/exports src/server/payroll/ae-assessment.test.ts src/lib/payroll.test.ts src/server/hmrc/rti-submit.test.ts
python scripts/validate-rti-xsd.py --kind fps --tax-year 26-27 --stdin
```

See also: [CREDENTIALS-AND-SETUP.md](./CREDENTIALS-AND-SETUP.md).
