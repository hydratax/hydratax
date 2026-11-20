# Shared HydraTax WhatsApp pipeline

Accountants send reminders and documents (e.g. SA100) from the desk **without**
linking their own WhatsApp. HydraTax owns one Meta Cloud API number; you assign
each practice a credential key and monthly message/document volume.

Clients see messages from **HydraTax’s** WhatsApp business profile.

---

## What you (platform owner) must get from Meta

Accountants need **nothing from Meta**. Only HydraTax’s Netlify env needs these.

| Credential | Where to get it | Env var |
|---|---|---|
| **Verify token** | You invent any long random string (e.g. `openssl rand -hex 24`) | `WHATSAPP_VERIFY_TOKEN` |
| **App secret** | [Meta App Dashboard](https://developers.facebook.com/apps/) → your app → **App settings → Basic → App secret** | `WHATSAPP_APP_SECRET` |
| **Access token** | App → **WhatsApp → API setup** (temporary) or [System User](https://business.facebook.com/settings/system-users) permanent token with WhatsApp permissions | `WHATSAPP_ACCESS_TOKEN` |
| **Phone number ID** | App → **WhatsApp → API setup** (under the business phone) | `WHATSAPP_PHONE_NUMBER_ID` |
| **Service role** (Supabase) | Supabase → Project Settings → API → `service_role` | `SUPABASE_SERVICE_ROLE_KEY` |

### Step-by-step (Meta)

1. Create / open a **Meta Business** portfolio:  
   https://business.facebook.com/
2. Create a developer app and add **WhatsApp**:  
   https://developers.facebook.com/apps/  
   Guide: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
3. In **WhatsApp → API setup**, copy **Phone number ID** and a token.
4. Add a business phone number (WhatsApp Manager):  
   https://business.facebook.com/latest/whatsapp_manager/phone_numbers  
   Help: https://www.facebook.com/business/help/456220311516626
5. Add a **payment method** on the Business account (required once free tiers are exceeded):  
   https://business.facebook.com/settings/payment-methods  
   Pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
6. Webhook callback (pick one):  
   - `https://hydratax.uk/api/webhooks/whatsapp`  
   - `https://hydratax.uk/.netlify/functions/whatsapp-webhook`  
   Verify token = same value as `WHATSAPP_VERIFY_TOKEN`.  
   Subscribe to **`messages`**.  
   Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
7. For production volume, create a **System User** token (never expires until revoked):  
   https://business.facebook.com/settings/system-users  
   Grant WhatsApp asset access; generate token with `whatsapp_business_messaging` / management scopes as Meta lists for Cloud API.
8. Paste all four WhatsApp vars + Supabase service role into **Netlify → Site → Environment variables**, then redeploy.

Optional but recommended:

- **Business verification**: Meta Business settings → Security Centre  
- **Message templates** (for first contact / bulk when the client has not messaged you):  
  https://business.facebook.com/latest/whatsapp_manager/message_templates  
  Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates

---

## What you assign to each accountant (inside HydraTax)

No Meta login for them.

1. Sign in as platform admin → **Admin → WhatsApp volume** (`/admin/whatsapp`).
2. Pick the practice → set **Enabled**, **Messages / month**, **Documents / month**.
3. Tick **Issue / rotate practice credential key** → Save.
4. Copy the one-time `htwa_…` key (shown once). Desk login is enough to send; the key is for your records / future API use.

They will see remaining volume under **Settings → Channels**.

---

## Database

Apply migration:

`supabase/migrations/20261120010000_practice_whatsapp_allocations.sql`

---

## How accountants send

1. Client card must have a **mobile number** (UK `07…` or `+44…`).
2. **Correspondence** → channel **WhatsApp** → Send template (reminders).
3. **Self Assessment** tax year Actions → **WhatsApp SA100 & SA302**.
4. Programmatic: `sendClientWhatsAppText`, `sendClientWhatsAppDocument`, `sendSaPdfsViaWhatsApp`.

Each text uses **1 message** quota. Each PDF uses **1 message + 1 document**.

---

## Costs

- Meta bills **HydraTax** (your Cloud API number) per delivered business→user message after free allowances.
- You control practice caps in Admin so growth is predictable.
- Official pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
