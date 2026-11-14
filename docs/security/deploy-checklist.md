# Security / GDPR hardening — deploy checklist

Scope: the security-hardening + UK GDPR data-rights change set (migrations
`20261113120000`, `20261113230000`, `20261114000000`). Work through the sections
in order. Nothing here is applied automatically — migrations are **not** run by
the build and env vars are **not** created by the app.

> Never paste secret values into tickets, chat or this file. Names only.

---

## 1. Apply the three migrations (Supabase SQL editor or `supabase db push`)

Apply strictly in timestamp order. Each is idempotent (safe to re-run).

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/migrations/20261113120000_security_hardening_rls.sql` | `practice_members` / `practices` insert lock-down, owner protections, billing + audit tables read-only for end users, MFA tables server-written only, RLS on `hmrc_sa_form_templates` and `payroll_timesheets`, team invites accepted by server only |
| 2 | `supabase/migrations/20261113230000_security_hardening_public_data.sql` | `feature_requests` / `feature_votes` base tables revoked from `anon` / `authenticated`; safe public view; WhatsApp PIN attempt limiting |
| 3 | `supabase/migrations/20261114000000_uk_gdpr_data_rights.sql` | `security_events`, `account_deletion_requests`, `data_subject_requests` (RLS on, no policies, service-role only); re-asserts the migration-2 lock-down on `feature_requests` / `feature_votes` |

Before applying:

- [ ] Take a database backup / note the point-in-time-recovery timestamp (see §9).
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is set on Netlify **before** the app
      code that depends on these tables goes live (§2). After migration 1,
      end-user (anon/authenticated) clients can no longer write
      billing/audit/MFA tables; all of those writes go through the service role.
- [ ] Run on staging first if you have one.

After applying, sanity-check in the SQL editor (read-only):

```sql
select relname, relrowsecurity from pg_class
 where relname in ('security_events','account_deletion_requests','data_subject_requests',
                   'practice_subscriptions','checkout_orders','audit_events')
   and relnamespace = 'public'::regnamespace;   -- relrowsecurity = true for all

select has_table_privilege('anon', 'public.feature_requests', 'select');   -- false
select has_table_privilege('authenticated', 'public.security_events', 'select'); -- false
```

Heads-up: the app reads `feature_requests` / `feature_votes` through the Drizzle
(`DATABASE_URL`) connection, which bypasses RLS. If `DATABASE_URL` is **not**
set in production the feature-request board will be empty after migration 2.

---

## 2. Environment variables (Netlify → Site configuration → Environment variables)

Names only. "Required" = the feature fails closed (503/throws) or is disabled
without it in production.

**Core**

| Name | Notes |
|------|-------|
| `NEXT_PUBLIC_APP_URL` | Canonical origin (`https://hydratax.uk`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required.** Without it Stripe entitlements, audit log, security events, retention/erasure jobs, billing writes and invite acceptance silently skip (logged as warnings) |
| `DATABASE_URL` | Required for Drizzle-backed tables (activity logs, feature requests, HMRC connections) |

**Secrets introduced / enforced by this change set**

| Name | Behaviour if unset in production |
|------|----------------------------------|
| `TOKEN_ENCRYPTION_KEY` | **Throws** when encrypting/decrypting HMRC tokens (demo key is dev/test only). 32 bytes hex/base64. Rotating it requires clients to re-connect HMRC |
| `MFA_COOKIE_SECRET` | Falls back to `TOKEN_ENCRYPTION_KEY`; set a distinct value |
| `HMRC_STATE_SECRET` | Falls back to `TOKEN_ENCRYPTION_KEY`; set a distinct value |
| `SECURITY_EVENT_SALT` | Events still written, but **no IP hash** is stored |
| `CRON_SECRET` | `/api/cron/*` return 503 |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Checkout disabled (503) |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` returns 503 |
| `WHATSAPP_APP_SECRET` | WhatsApp POSTs rejected (503) |
| `WHATSAPP_VERIFY_TOKEN` | Meta GET handshake fails (403) |
| `RESEND_WEBHOOK_SECRET` | Svix verification of `/api/webhooks/resend-inbound` |
| `EMAIL_WEBHOOK_SECRET` | Bearer auth for `/api/webhooks/email` (and resend-inbound forwarders); 503 if nothing configured |

Generate random values with `openssl rand -hex 32` (or the equivalent) and
store only in Netlify.

**Other runtime config (unchanged, listed for completeness)**
`HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_ENV`, `RESEND_API_KEY`,
`EMAIL_FROM`, `ADMIN_EMAIL`, `CLOUDFLARE_R2_ACCOUNT_ID`,
`CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`,
`CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_PUBLIC_URL`, Companies House gateway vars.

**Must NOT be set in production:** `DEMO_MODE`, `MEMORY_STORE`
(they are ignored when `NODE_ENV=production` / `NETLIFY=true` / `CONTEXT=production`,
but remove them anyway), and `SERVER_ACTIONS_EXTRA_ORIGINS` on the production
context (it is ignored there, only meant for deploy previews).

---

## 3. Supabase Auth dashboard (Authentication → …)

These are **dashboard settings, not code** — the app cannot enforce them.

- [ ] **Sign In / Providers → Email → Confirm email: ON.** The app treats an
      unconfirmed email as unverified for invite acceptance and checkout attach.
- [ ] **Password protection → Prevent use of leaked passwords: ON** (needs Pro plan).
- [ ] **Minimum password length: 12** (the app forms also validate client-side;
      the dashboard value is the authority for direct API sign-ups).
- [ ] **Multi-Factor → TOTP: enabled** (the app uses TOTP/AAL2 where a user has
      enrolled, plus its own emailed/SMS OTP step-up stored in `user_mfa_settings`).
- [ ] **URL Configuration:** Site URL `https://hydratax.uk`; Redirect URLs limited
      to `https://hydratax.uk/auth/callback`, `https://hydratax.uk/auth/confirm`
      (plus `http://localhost:3000/**` for dev only — remove wildcard prod hosts).
- [ ] **SMTP Settings → custom SMTP** (e.g. Resend SMTP) so auth mail is not sent
      from the shared Supabase sender and is not rate-limited to the built-in cap.
- [ ] Google provider: authorised redirect URI is the Supabase callback URL only.

---

## 4. Netlify settings

- [ ] Build command `npm run build`, publish `.next`, `@netlify/plugin-nextjs` (all
      already in `netlify.toml`).
- [ ] Scheduled functions in `netlify.toml` (`trial-reminders`, `notification-cron`,
      09:00 UTC) call server code directly and do **not** need `CRON_SECRET`.
      `notification-cron` now also runs the UK GDPR retention jobs (best-effort,
      result counts only in the response).
- [ ] Confirm the two scheduled functions appear under Functions → Scheduled and
      that the first run shows `"retention"` in the response/log.
- [ ] Domain: apex `hydratax.uk` is canonical; `www` 301s to apex (in `netlify.toml`).
- [ ] Scope production secrets to the **Production** deploy context only; do not
      expose them to deploy previews / branch deploys.
- [ ] Response headers (CSP, HSTS, `X-Frame-Options`, …) come from
      `next.config.ts` → `src/lib/security-headers.ts`; the `[[headers]]` block in
      `netlify.toml` mirrors the non-CSP ones for CDN-served assets only.
- [ ] The in-memory rate limiter (`src/lib/rate-limit.ts`) is **per server
      instance** — it slows brute force but is not a global limit. Add a Netlify /
      Cloudflare WAF rate-limit rule for `/sign-in`, `/api/checkout` and
      `/api/documents/download` if you need a hard global cap.

---

## 5. External cron callers (if any)

`/api/cron/notifications` and `/api/cron/trial-reminders` accept
`Authorization: Bearer <CRON_SECRET>` **only**. Query-string secrets
(`?secret=…`) are no longer accepted and will 401.

- [ ] Update every external scheduler (cron-job.org, GitHub Actions, Uptime
      tools…) to send the header, then remove the old `?secret=` URLs from them.
- [ ] Unset secret ⇒ 503; wrong/missing header ⇒ 401 (and a throttled
      `webhook.unauthorised` row is written to `security_events`).

---

## 6. Meta WhatsApp Cloud API

- [ ] Set `WHATSAPP_APP_SECRET` (Meta app → Settings → Basic → App secret) and
      `WHATSAPP_VERIFY_TOKEN` (any long random string).
- [ ] Callback URL — **pick one** (both are implemented identically):
      `https://hydratax.uk/api/webhooks/whatsapp` or the Netlify function
      `https://hydratax.uk/.netlify/functions/whatsapp-webhook`.
- [ ] Enter the same verify token in Meta; subscribe to `messages`.
- [ ] Every POST must carry a valid `X-Hub-Signature-256` (HMAC-SHA256 over the
      raw body). Missing/invalid ⇒ rejected and logged.

---

## 7. Resend webhook (inbound email → task inbox)

- [ ] Resend → Webhooks → add `https://hydratax.uk/api/webhooks/resend-inbound`.
- [ ] Copy the signing secret (`whsec_…`) into `RESEND_WEBHOOK_SECRET`. Svix
      headers (`svix-id`, `svix-timestamp`, `svix-signature`) are verified with a
      5-minute tolerance.
- [ ] Forwarders that cannot sign (Zapier etc.): send
      `Authorization: Bearer <EMAIL_WEBHOOK_SECRET>` instead.
- [ ] Payload limits now enforced: 1 MiB body, ≤ 50 addresses per list, ≤ 20
      attachment entries, 15 MiB per attachment, 30 MiB total.
- [ ] `/api/webhooks/email` (inbound-email ingest from Zapier / forwarders) uses
      Bearer `EMAIL_WEBHOOK_SECRET`; the body schema bounds addresses to 320 chars.

---

## 8. Stripe webhook

- [ ] Stripe → Developers → Webhooks → endpoint
      `https://hydratax.uk/api/stripe/webhook`, events handled by the
      app: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `invoice.paid`, `invoice.payment_failed` (others are acknowledged and ignored).
- [ ] Put the endpoint's signing secret (`whsec_…`) in `STRIPE_WEBHOOK_SECRET`.
- [ ] Known limitation: if `SUPABASE_SERVICE_ROLE_KEY` is missing in production the
      webhook still answers 200 but entitlements are **not** written (a warning is
      logged). Verify §2 before enabling live mode.
- [ ] Do a live-mode test payment, confirm the plan activates and
      `checkout_orders` / `practice_subscriptions` rows appear.

---

## 9. Post-deploy smoke tests

Replace `$BASE` with `https://hydratax.uk`. All of these must be done
**unauthenticated** and need no secrets.

```bash
BASE=https://hydratax.uk

# 1. Unsigned Stripe webhook -> 400 (503 if STRIPE_WEBHOOK_SECRET unset)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/stripe/webhook" -d '{}'

# 2. Unauthenticated cron -> 401 (503 if CRON_SECRET unset); query secret must NOT work
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/cron/notifications"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/cron/notifications?secret=anything"

# 3. Unsigned WhatsApp / Resend / email webhooks -> 401/403/503, never 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/webhooks/whatsapp" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/webhooks/resend-inbound" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/webhooks/email" -d '{}'

# 4. Forged MFA cookie, no Supabase session -> redirected to /sign-in (3xx), never the dashboard
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  -H "Cookie: ht_mfa_ok=v1.ok.00000000-0000-0000-0000-000000000000.9999999999.deadbeef" "$BASE/dashboard"

# 5. HMRC callback without a session -> 3xx to /sign-in (NOT a token exchange)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$BASE/api/hmrc/callback?code=x&state=y"

# 6. Document download without a session -> 401
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/documents/download?key=practices/x/y.pdf"

# 7. Security headers
curl -sI "$BASE/" | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener"
curl -sI "$BASE/api/documents/download" | grep -i cache-control      # no-store
```

Expected:

| # | Expected |
|---|----------|
| 1 | `400` |
| 2 | `401` both (or `503` if `CRON_SECRET` is missing — fix the env var) |
| 3 | `403`/`401`/`503` — anything but `200` |
| 4 | `3xx`, `Location` contains `/sign-in` |
| 5 | `3xx`, `Location` contains `/sign-in` |
| 6 | `401` (`503` means R2 is not configured) |
| 7 | HSTS, CSP (with `frame-ancestors 'none'` and `upgrade-insecure-requests`), `X-Frame-Options: DENY`, `nosniff`, referrer policy, permissions policy, COOP; `no-store` on `/api/*` |

Authenticated manual checks (cannot be curl-ed without a session):

- [ ] Sign in → emailed/SMS OTP/TOTP step-up → dashboard; a code is invalidated after 5 wrong attempts and
      the lockout is recorded as `auth.mfa_failed` / `auth.mfa_locked`.
- [ ] A valid session with a **tampered** `ht_mfa_ok` cookie is sent to `/verify-2fa`.
- [ ] Google sign-in round trip and `/auth/confirm` password reset.
- [ ] HMRC connect from `/settings/hmrc` completes and returns to the same page.
- [ ] Settings → Privacy: export downloads; erase client works for owner/admin and
      shows a clear refusal for practitioners/read-only.
- [ ] After a few deliberate failures, `select event_type, count(*) from
      security_events group by 1;` shows the new event types.

---

## 10. Rollback notes

- **Code:** redeploy the previous Netlify deploy (Deploys → Publish deploy).
  Not verified: whether the *previous* build writes any of the now read-only
  tables (billing, audit, MFA, practice_members self-insert) with a user-scoped
  client. If it does, those writes will fail under the new RLS, so a code-only
  rollback needs the migrations reverted (or restored from backup) as well.
- **Migrations have no automatic down-scripts.** To revert:
  - Migration 3: `drop table public.data_subject_requests, public.account_deletion_requests, public.security_events;`
    (this destroys the security-event log — export it first if it matters for Art 33(5)).
  - Migration 2: restore the old policies only if you accept re-exposing
    `author_email` / `voter_key` to the anon key — **not recommended**.
  - Migration 1: per-table `drop policy` / `create policy` from the earlier
    migrations (`20261111210000_user_mfa.sql` etc. hold the previous definitions).
    Prefer restoring from the pre-migration backup/PITR if a broad revert is needed.
- **Env var changes:** secrets with fallbacks (`MFA_COOKIE_SECRET`,
  `HMRC_STATE_SECRET`) — changing them signs everyone out of MFA step-up /
  invalidates in-flight HMRC connects, nothing more. Changing
  `TOKEN_ENCRYPTION_KEY` invalidates stored HMRC tokens (re-connect required).
- **Cron:** if an external scheduler breaks after the Bearer-only change, add the
  `Authorization` header — do not re-introduce query-string secrets.
