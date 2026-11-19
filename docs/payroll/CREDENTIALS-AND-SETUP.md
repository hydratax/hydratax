# Payroll credentials & setup guide

How to obtain everything HydraTax payroll needs that is **not** in the repo. Keep secrets out of git and desk UI copy.

## 1. HMRC RTI / Government Gateway (already used)

**What for:** FPS / EPS submit via Transaction Engine (XML).

**How to get:**

1. Register as an employer (or agent) on [Government Gateway](https://www.gov.uk/log-in-register-hmrc-online-services).
2. Enrol for PAYE for Employers (or Agent Services for bureau).
3. Collect: **User ID**, **password**, employer **PAYE reference** (`123/AB45678`), **Accounts Office reference**.
4. For software vendors / SDST test pack: request PAYE RTI test credentials from HMRC Software Developer Support Team (SDST) — use only SDST-issued SenderID / passwords for ETS.
5. Live enablement is a separate SDST step after ETS acceptance.

**HydraTax:** stored as practice/client Gateway credentials already used by RTI submit. No REST FPS required — XML-only path.

**Bureau volume:** one FPS/EPS per employer EmpRef. For throttled multi-company submits see `docs/payroll/RTI-VOLUME-AND-HMRC-LIMITS.md`. Optional env: `RTI_SUBMIT_QUEUE_ENABLED=true` enables the DB queue worker (desk single-company submit stays sync when the flag is off).

---

## 2. HMRC DPS (Data Provisioning Service) — P6 / P9 / SL1 / SL2

**What for:** Automated tax-code and student-loan notices into payroll (not manually typed).

**How to get:**

1. Join the [HMRC software developers programme](https://www.gov.uk/government/collections/hmrc-software-developers) if not already.
2. Request **DPS** access via SDST — explain product pulls employer notices for PAYE.
3. DPS uses a separate channel from RTI FPS/EPS; you will receive endpoint details, authentication model, and test datasets for P6/P9/SL1/SL2.
4. Map notice types into employee `tax_code`, `tax_basis`, `student_loan_plan`, `postgraduate_loan`.

**Blocked without:** DPS credentials + notice schema samples. Until then, accountants enter codes/plans on the employee card.

---

## 3. NEST — employer CSV (first) / API (later)

**What for:** Auto-enrolment contribution upload.

### CSV (shipped stub)

1. Employer logs into [NEST](https://www.nestpensions.org.uk/).
2. Use NEST’s contribution / member upload CSV template from the employer dashboard (column set can change — re-check annually).
3. HydraTax exports a NEST-shaped CSV from pay-run AE contributions (`src/server/payroll/exports/nest-csv.ts`).
4. Upload the file in NEST’s contribution journey.

### Worker assessment (desk — no API)

History → Employer shows a light AE status per employee (eligible / enrolled / opted out / can opt in / entitled) from GOV.UK 2026–27 thresholds (£10,000 trigger; £6,240–£50,270 qualifying band) plus date of birth and opt-out. SPA is approximated as 66 on the desk. Postponement / re-enrolment calendars and provider member sync need NEST (or other) APIs — not in this ship.

### API (later)

1. Apply for NEST Employer API access via NEST developer / employer integrations.
2. Obtain client credentials, employer ID, and sandbox.
3. Store practice-level NEST connection secrets (never in desk UI).

---

## 4. People’s Pension / Smart Pension (high level)

| Provider | Typical path |
|----------|----------------|
| **People’s Pension** | Employer portal → contribution file / API partnership. Contact B&CE / People’s Pension employer support for file spec or API onboarding. |
| **Smart Pension** | Smart Employer dashboard or Partner API — request API keys from Smart Pension partnerships. |

HydraTax should treat these as alternate exporters implementing the same AE contribution interface as NEST CSV. Do not invent file layouts — use each provider’s current template.

---

## 5. BACS / payment bureau (Standard 18)

**What for:** Net-pay credits from employee bank sort/account fields.

**Options:**

1. **Direct BACS / Bacstel-IP** — apply via your bank’s BACS service; need Service User Number (SUN), bureau software or host-to-host, and modulus-checked account details.
2. **Payment bureau** (e.g. Bottomline, Access PaySuite, bank bureau) — they issue SUN + Standard 18 file acceptance rules.
3. **Faster Payments / Open Banking** — product decision later; not Standard 18.

**HydraTax now (file generation only — no live bureau submit):**

| Desk field (Settings → Staff payments) | Required | Notes |
|----------------------------------------|----------|--------|
| Service user number | Yes | 6-digit SUN from your bank / bureau |
| Paying sort code | Yes | Originator account |
| Paying account number | Yes | Originator account |
| Paying account name | Yes | Max 18 characters on the file |
| File serial (optional) | No | 6-character serial; defaults from processing date |

Also required on each paid employee card: sort code + account number (+ optional account name).

Download **Bank payment file** from a completed pay run (History). The button stays disabled until SUN + paying account + at least one staff bank account are present. Processing day uses Mon–Fri only (approx.); your bureau’s Bacs calendar still applies at upload.

AUDDIS (new Direct Debit instructions) is available as a builder helper for bureau onboarding — salary credits use Direct Credit (`99`) + CONTRA, not AUDDIS.

---

## 6. GOV.UK rate sources (refresh each tax year)

Update together: `src/server/payroll/engine/rates.ts`, `src/server/payroll/statutory.ts`, `src/lib/hmrc-rulebook/rates.ts`.

| Topic | URL |
|-------|-----|
| Employer rates & thresholds | https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027 (and prior-year twin) |
| NI category letters | https://www.gov.uk/national-insurance-rates-letters |
| Student / PGL | https://www.gov.uk/guidance/special-rules-for-student-loans |
| Scottish Income Tax | https://www.gov.uk/scottish-income-tax |
| Directors NIC methods | https://www.gov.uk/guidance/national-insurance-for-company-directors |
| AE thresholds | same employer rates page + The Pensions Regulator |

Calendar reminder: check GOV.UK in late January / early April each year before the new tax year desk opens.
