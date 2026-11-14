# Personal data breach response (UK GDPR Arts 33–34)

> Status: **internal procedure draft** prepared by engineering. Counsel / the
> owner must review and adopt it. Fill every `[TODO]`.

A personal data breach is a security incident that leads to accidental or
unlawful destruction, loss, alteration, unauthorised disclosure of, or access
to, personal data. Examples: leaked service-role key, cross-practice data
exposure, misdirected export, lost laptop with a database dump, ransomware on a
vendor holding our data.

## Clocks

| Clock | Who | Deadline |
|---|---|---|
| ICO notification (Art 33(1)) | HydraTax as **controller** (account/billing/auth data) | Without undue delay and **within 72 hours of becoming aware**, unless unlikely to result in a risk to individuals. Phased reporting is allowed. |
| Notify customers (Art 33(2)) | HydraTax as **processor** (client data) | **Without undue delay and within 48 hours** (DPA, `processorBreachNoticeHours` in `src/lib/legal-entity.ts`). Customers then run their own 72h clock. |
| Notify individuals (Art 34) | Controller | Without undue delay where the breach is likely to result in a **high risk**. |
| Internal register (Art 33(5)) | Always | Record **every** breach, reportable or not. |

"Aware" = reasonable degree of certainty that a breach affecting personal data
has occurred. Start the clock when that is reached, not at root-cause.

## Roles

| Role | Person | Contact |
|---|---|---|
| Incident lead | `[TODO name]` | `[TODO phone/email]` |
| Deputy | `[TODO]` | `[TODO]` |
| Legal / DPO (if appointed) | `[TODO]` | `[TODO]` |
| Technical responder | `[TODO]` | `[TODO]` |

Customer-facing security mailbox: see `LEGAL_ENTITY.securityEmail`
(`[TODO]` create a dedicated `security@` alias).

## Procedure

1. **Report & log.** Anyone suspecting a breach tells the incident lead
   immediately. Open an entry in the breach register (template below) and call
   `logSecurityEvent({ type: "breach.suspected", severity, details })` from
   `src/server/privacy/security-events.ts` (details must not contain secrets or
   personal data).
2. **Contain.** Typical actions:
   - Rotate `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` (re-encrypt
     stored credentials first), Stripe / Resend / Twilio / Cloudflare keys,
     HMRC client secret, any leaked webhook secrets.
   - Revoke sessions: Supabase dashboard → Authentication → sign out users.
   - Disable the affected feature flag / route; block offending IPs at Netlify.
   - Preserve evidence (Netlify function logs, Supabase logs,
     `security_events`, `audit_events`) **before** logs roll off.
3. **Assess.** Determine: what data (categories, special category? financial?
   identifiers such as NINO/UTR/DOB?), how many individuals and records, which
   controllers (practices) are affected, whether data was encrypted /
   unintelligible to the recipient, likely consequences (identity fraud, tax
   fraud, financial loss, distress), and ongoing risk.
4. **Decide & notify.**
   - Risk to individuals unlikely → no ICO report; record reasoning in the
     register.
   - Risk likely → report to the ICO (online form
     <https://ico.org.uk/make-a-complaint/> → "Report a breach", or
     0303 123 1113) within 72h. Include nature, categories/approximate numbers,
     contact point, likely consequences, measures taken.
   - Processor data → email affected practices within 48h with the same facts
     so they can decide on their own ICO/individual notifications.
   - High risk → notify individuals directly in clear language (what happened,
     contact point, likely effects, what we are doing, what they can do).
   - Consider also: Companies House / HMRC (if their credentials are involved),
     police / Action Fraud, cyber insurer, vendor DPAs.
5. **Recover.** Patch the root cause, restore from backups, verify no
   persistence, monitor.
6. **Review (within 2 weeks).** Post-incident review, update controls and this
   procedure, close the register entry.

## Breach register template (keep outside the production database)

| Field | Value |
|---|---|
| ID / date-time detected / date-time aware | |
| Reporter / incident lead | |
| Description (what, how, systems) | |
| Data categories and approx. number of individuals / records | |
| Controllers affected (practices) | |
| Likely consequences / risk assessment (low / medium / high) | |
| Containment and remediation actions (with times) | |
| ICO notified? (ref / time) — or reason not | |
| Customers notified? (who / time) | |
| Individuals notified? (how / time) — or reason not | |
| Lessons learned / follow-ups | |

## Tooling available in the repo

- `logSecurityEvent` — append-only `public.security_events` table (RLS
  deny-by-default; service-role insert; no update/delete; purge only through
  `purge_expired_security_events`). Not yet wired into auth/webhook code, which
  other workers own — see the engineering report for the one-liners to add.
- `audit_events` — hash-chained submission audit trail.
- Per-client and per-user exports (`exportClientData`, `exportMyData`) help
  scope what a given customer/individual held.
