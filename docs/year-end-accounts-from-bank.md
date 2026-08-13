# Year-end accounts from bank statements

Reference template: [`docs/templates/year-end-accounts-template.pdf`](./templates/year-end-accounts-template.pdf) (Digitus-style small company pack).

## Flow

1. **Bank** (`/clients/[id]/bank`) — upload CSV or Excel statement.
2. Auto-allocate using merchant hints (Shell → Fuel, Uber → Travel, HMRC → Tax, etc.).
3. User reassigns any line to another head via the category dropdown.
4. **Accounts pack** (`/clients/[id]/accounts-pack`) — roll into P&L / BS / Note 8.
5. **Open PDF pack** — print-ready HTML matching the template; use browser **Print → Save as PDF**.

## Heads (Note 8)

See `src/lib/bank-categories.ts`. Fuel is a first-class head (shown in Note 8); other merchants map to rent, insurance, advertising, accountancy, etc.

## Enrichment roadmap

Today: local merchant dictionary (`src/server/bank/merchants.ts`).  
Next: optional web/merchant API enrichment and opening balances / fixed assets overrides before filing iXBRL to Companies House.
