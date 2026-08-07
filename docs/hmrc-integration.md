# HMRC API integration — what HydraTax needs

## Accounts & applications

1. **HMRC Developer Hub** account — [developer.service.hmrc.gov.uk](https://developer.service.hmrc.gov.uk)
2. Create a **software application** (sandbox first, then production)
3. Subscribe to APIs your product uses:
   - VAT (MTD)
   - Income Tax (MTD) / Self Assessment
   - Corporation Tax (CT Online / XML where applicable)
   - PAYE RTI (FPS / EPS)
4. Note **Client ID** and **Client Secret**
5. Register redirect URI: `{NEXT_PUBLIC_APP_URL}/api/hmrc/callback`

## Environment variables

| Variable | Purpose |
|----------|---------|
| `HMRC_ENV` | `sandbox` or `production` |
| `HMRC_CLIENT_ID` / `HMRC_CLIENT_SECRET` | OAuth app credentials |
| `HMRC_SERVER_TOKEN` | Optional server-token flows |
| `HMRC_VENDOR_PUBLIC_IP` | Fraud-prevention vendor public IP |
| `HMRC_VENDOR_LICENSE_IDS` | Software licence id(s) |
| `HMRC_VENDOR_VERSION` | Software version string |
| `TOKEN_ENCRYPTION_KEY` | AES-256 key for OAuth tokens at rest |

## Fraud prevention (mandatory for MTD)

Every API call must send Gov-Client-* and Gov-Vendor-* headers. Hydra builds these in `src/server/hmrc/fraud-headers.ts`. Production go-live requires HMRC validation of header quality.

## How users submit

1. Accountant creates a **client** and stores VRN / UTR / NINO / PAYE refs
2. Client (or agent) completes **Connect HMRC** OAuth for that client
3. Books and **Documents** are prepared in the workspace
4. Module flow: **Prepare → Review → Submit**
5. Hydra posts the statutory payload; **audit_events** stores correlation / receipt immutably

## Production timeline

Sandbox testing → production application (~10 working days typical) → separate production Client ID/Secret → flip `HMRC_ENV=production` only on the production deployment.
