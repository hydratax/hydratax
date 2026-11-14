# Record of Processing Activities (UK GDPR Art 30)

> Status: **engineering draft derived from the code.** The authoritative,
> machine-checked source for categories, purposes, lawful bases, retention and
> stores is `src/lib/retention-policy.ts` (this file summarises it; a test
> asserts every category has a basis and a period). Sub-processors come from
> `src/lib/subprocessors.ts`; cookies from `src/lib/cookie-inventory.ts`.
> `[TODO]` = fact only the owner can supply. Art 30 applies to HydraTax both as
> controller (Art 30(1)) and processor (Art 30(2)). The < 250-employee
> exemption does **not** help because processing is regular and includes
> financial identifiers.

## 1. Organisation

| Item | Value |
|---|---|
| Controller / processor | Hydra Consultancy Services Ltd t/a HydraTax (company no. in `src/lib/legal.ts`) |
| Registered office | `[TODO]` (see `LEGAL_ENTITY.registeredOffice`) |
| ICO registration | `[TODO]` (data protection fee) |
| Contact / DPO | `info@hydratax.uk`; DPO appointed? `[TODO]` |
| Hosting regions | Supabase `[TODO]`, Netlify functions `[TODO]`, Cloudflare R2/D1 `[TODO]`, Neon `[TODO]` |

## 2. HydraTax as CONTROLLER (account / service data)

| Category | Data subjects | Purpose | Lawful basis | Retention | Stores |
|---|---|---|---|---|---|
| Account & profile | owners, admins, team | run account, authenticate | Contract | life of account; self-service delete (14-day grace for sole owners) | auth.users, profiles, practice_members, practices |
| 2FA settings | account holders | Art 32 security | Legitimate interests / contract | until disabled / deletion | user_mfa_settings |
| One-time codes | account holders | verify sign-in | Legitimate interests | 24 h (purged) | mfa_challenges |
| Billing records | purchasers | payment, accounts, VAT | Contract; legal obligation | 7 years | checkout_orders, practice_subscriptions, Stripe |
| Support tickets | people contacting support | support, disputes | Legitimate interests / contract | 3 years after resolution | support_tickets, info@ mailbox |
| Feature requests / votes | account holders | product feedback | Legitimate interests | text until removed; author e-mail 12 months | feature_requests, feature_votes |
| E-mail preferences | account holders | reminders, PECR opt-outs | Contract / consent / LI | life of account | email_preferences |
| Security events | account holders | Art 32 / 33(5) | LI; legal obligation | 12 months | security_events |
| DSAR / deletion register | requesters | Art 12 evidence | Legal obligation / LI | 6 years | data_subject_requests, account_deletion_requests |
| Bot / webhook state | WhatsApp users | idempotency, chat state | LI | 30 days | bot_sessions, webhook tables |
| Team invites | invitees | invite colleague | LI / contract | 30 days | practice_team_invites |
| Browser storage | visitors / users | sign-in, security, HMRC headers | LI; legal obligation (HMRC fraud-prevention) | per `/legal/cookies` | cookies, localStorage |

Special category data: none intentionally collected for our own purposes.
Children: not targeted.

## 3. HydraTax as PROCESSOR (client data entered by practices)

Controller = the customer practice. Instructions = Terms + DPA (`/legal/dpa`) +
in-product actions.

| Category | Data subjects | Processing | Retention default | Stores |
|---|---|---|---|---|
| Client records (name, UTR, NINO, DOB, contact, CH data) | clients, directors, partners | prepare/submit filings | until practice removes client | clients, desk_profile |
| Payroll / employee data | clients' employees | PAYE / RTI | until practice instructs | employees, pay_runs, payroll_timesheets (Supabase/D1) |
| Returns, ledgers, bank | clients | filings + evidence | until practice instructs | vat_returns, ct600_returns, sa_submissions, ledger_entries, bank_transactions |
| Uploaded documents | clients, third parties | storage | until practice deletes | client_documents, R2, Supabase Storage |
| Correspondence | clients | send/receive e-mail, WhatsApp | 6 years then purged | client_email_logs, client_channel_messages, practice_tasks |
| HMRC credentials | practice users / clients | submit to HMRC | until disconnected/erased | hmrc_connections, user_gateway_credentials (AES-256-GCM) |
| Practice activity log | team | operational audit | 12 months | practice_activity_logs |
| Submission audit evidence | pseudonymous | prove filings, tamper-evidence | 7 years | audit_events |

Practice-initiated deletion: per-client **Export** and **Erase** on the client
page (owner/admin only); erase removes Supabase rows, Cloudflare D1 rows and R2
objects (`src/server/privacy/client-purge.ts`). `audit_events` are kept
(statutory evidence, pseudonymous).

## 4. Recipients and transfers

See `src/lib/subprocessors.ts` / `/legal/sub-processors`. Statutory recipients:
HMRC, Companies House (only on instruction). Transfers outside the UK:
Netlify, Stripe, Resend, Twilio, Cloudflare, Supabase (region `[TODO]`) — rely on
UK adequacy / UK–US Data Bridge / IDTA or Addendum: **`[TODO]` confirm per signed
vendor DPA** and complete a transfer risk assessment.

## 5. Security measures (Art 32) — summary

TLS; RLS deny-by-default on application tables; server-side practice scoping;
2FA and session limits; AES-256-GCM for HMRC credentials; secrets excluded from
exports and logs; append-only `security_events` and hash-chained `audit_events`;
masking of NINO/UTR/DOB in list views; retention job
(`src/server/privacy/retention.ts`); breach procedure
(`docs/security/breach-response.md`).

### Encryption gap (decision for the owner)

NINO, UTR, DOB, and bank account numbers are stored **in plaintext columns /
JSON** (needed for search, matching and HMRC calls). Mitigations: RLS, masking,
service-role only on server. A backward-compatible helper exists
(`src/server/privacy/field-crypto.ts`: `enc:v1:` prefix + keyed blind index)
but is intentionally **not wired** — doing so needs a data migration and
rework of every plaintext lookup. Alternative: rely on Supabase/Cloudflare
encryption-at-rest and document the residual risk in the DPIA.

## 6. Cookies / PECR

All items in `STORAGE_INVENTORY` are strictly necessary; no analytics or
advertising storage was found, so no consent banner is required. Re-check on any
new third-party script (`consentBannerRequired()` is unit-tested).

## 7. Review log

| Date | Reviewer | Change |
|---|---|---|
| `[TODO]` | `[TODO]` | Initial draft from code (engineering) |
