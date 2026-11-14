# DPIA screening (UK GDPR Art 35)

> Status: **screening draft prepared by engineering — not a signed DPIA.** The
> owner / DPO / counsel must review, decide and sign. `[TODO]` = missing fact.

Processing assessed: HydraTax — SaaS for UK accountants preparing and
submitting VAT, Corporation Tax, Self Assessment, PAYE/RTI and Companies House
filings; storing client records, payroll, ledgers, bank transactions and
documents; HMRC / Companies House connections; WhatsApp document bot; e-mail.

## ICO "likely high risk" triggers (and EDPB criteria)

| Criterion | Present? | Notes |
|---|---|---|
| Systematic monitoring / profiling with significant effect | No | No behavioural profiling; no automated decisions with legal effect. |
| Large-scale processing | **Possibly** | Scale depends on customer count — `[TODO]` record number of practices / data subjects. Payroll and financial data for many individuals. |
| Special category / criminal data | Not intentionally | Payroll may incidentally reveal health (statutory sick pay) or trade-union data via free text — `[TODO]` decide guidance for customers. |
| Financial data / identifiers enabling fraud (NINO, UTR, bank details, DOB) | **Yes** | Exposure could enable identity and tax fraud. |
| Vulnerable data subjects | Possibly | Employees (power imbalance) of customers' clients. |
| Innovative technology | No (AI features, if any, must be re-screened) | `[TODO]` confirm no LLM processing of client data without DPIA. |
| Matching / combining datasets | Limited | Companies House look-ups, HMRC APIs on instruction. |
| Prevents data subject exercising rights | No | Self-service export / erase tools exist. |

**Screening conclusion (engineering view):** a full DPIA is **recommended**
(large-scale processing of financial identifiers as processor, plus controller
processing of authentication data). Decision and sign-off by the owner:
`[TODO: decision, date, signatory]`.

## Description of processing

See `docs/security/ropa.md` for categories, purposes, recipients, retention and
sub-processors. Flow: practice user → HydraTax web app (Netlify) → Supabase
(auth/DB) / Cloudflare (R2, D1) → on instruction to HMRC / Companies House;
Stripe for billing, Resend for e-mail, optional Twilio / WhatsApp.

## Necessity and proportionality

- Lawful basis: controller data — contract / legal obligation / legitimate
  interests; client data — the practice's basis, HydraTax acts on instruction.
- Minimisation: identifiers masked in lists (`src/lib/mask-identifiers.ts`),
  secrets stripped from exports, short-lived data purged automatically
  (`src/server/privacy/retention.ts`).
- Rights: export / erase tools, DSAR register, one-month response process.
- Processor controls: DPA at `/legal/dpa`; sub-processor list; `[TODO]` signed
  DPAs with every vendor.

## Risks and mitigations

| Risk | Likelihood | Severity | Mitigations in place | Residual / action |
|---|---|---|---|---|
| Cross-practice data exposure (RLS or authz bug) | Low–Med | High | RLS deny-by-default; practice-scoped server checks; tests | Periodic RLS review (`[TODO]` schedule) |
| Compromised service-role key | Low | Very high | Server-only; env-managed | Key rotation runbook (breach-response.md); consider secrets scanning |
| Plaintext NINO/UTR/DOB/bank columns | Med | High | RLS; masking in UI; HMRC secrets encrypted | Column-level encryption helper exists (`field-crypto.ts`), **not wired** — decide |
| Credential theft / account takeover | Med | High | 2FA, session limits | Enforce 2FA for owners `[TODO]` |
| Over-retention | Med | Med | Retention job; policy in `retention-policy.ts` | Wire job into cron; confirm periods with counsel |
| Unauthorised erasure | Low | High | Owner/admin only, typed confirmation, audit | — |
| International transfers | Med | Med | IDTA / Addendum / adequacy | `[TODO]` confirm per vendor and regions |
| Breach not reported in time | Low | High | Procedure + register + 48h/72h clocks | Train incident lead |

## Consultation and sign-off

- DPO / privacy lead advice: `[TODO]`
- Data subject / customer views sought: `[TODO]`
- Prior consultation with ICO needed (Art 36) if high residual risk: `[TODO]`
- Approved by: `[TODO name, role, date]`; review date: `[TODO]` (at least annually
  or on material change).
