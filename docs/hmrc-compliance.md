# HMRC Compliance Requirements

HydraTax implements the HMRC Developer Hub requirements summarised in `content.md`.

## Environments

| Env | API base | Auth base |
|-----|----------|-----------|
| sandbox | `https://test-api.service.hmrc.gov.uk` | `https://test-api.service.hmrc.gov.uk/oauth/authorize` |
| production | `https://api.service.hmrc.gov.uk` | `https://www.tax.service.gov.uk/oauth/authorize` |

Set `HMRC_ENV=sandbox|production`. Production mode refuses sandbox credential patterns and sandbox base URLs.

## Fraud prevention

Mandatory for MTD VAT and MTD Income Tax. Headers are built per request from fresh browser metadata; incomplete sets are rejected before any gateway call.

## Currency

All money is integer **pence**. Never use floating-point for tax maths.

## Audit

`audit_events` is append-only. Financial mutations and every HMRC request/response are logged with status codes and payload hashes.

## Production go-live checklist

1. Register on HMRC Developer Hub
2. Create production application; subscribe to VAT (MTD), Income Tax MTD, CT Online, PAYE RTI
3. Pass fraud-prevention header validation
4. Apply for production credentials (~10 working days)
5. Set `HMRC_ENV=production` and production secrets only
