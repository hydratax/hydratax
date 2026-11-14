/**
 * Sub-processors and recipients — derived from what the codebase actually
 * integrates with (Supabase, Netlify, Stripe, Resend, Cloudflare R2/D1,
 * Twilio, Meta WhatsApp Cloud API, Neon, Clerk, Google sign-in, Companies
 * House, HMRC).
 *
 * Facts we cannot verify from code (hosting region, signed DPA, transfer
 * mechanism per vendor contract) are TODO placeholders for the owner.
 */

import { todo } from "@/lib/legal-entity";

export type SubProcessor = {
  name: string;
  /** Purpose in the product. */
  role: string;
  data: string;
  /** Where processing happens — owner must confirm regions. */
  location: string;
  /** Transfer safeguard where processing is outside the UK. */
  transfer: string;
  /** active = always used; optional = only when the integration is configured. */
  status: "active" | "optional";
  /** Vendor's own role. */
  vendorRole: "processor" | "independent_controller";
};

const TRANSFER_TODO = todo(
  "confirm transfer mechanism in the signed vendor DPA (UK adequacy / UK–US Data Bridge / UK IDTA or Addendum)",
);

export const SUBPROCESSORS: SubProcessor[] = [
  {
    name: "Supabase, Inc.",
    role: "Authentication, Postgres database, file storage",
    data: "Account, practice and client records; authentication data",
    location: todo("Supabase project region (e.g. London / EU / US)"),
    transfer: TRANSFER_TODO,
    status: "active",
    vendorRole: "processor",
  },
  {
    name: "Netlify, Inc.",
    role: "Application hosting, serverless functions, edge delivery",
    data: "All data in transit; request metadata and logs",
    location: "US-headquartered with global edge network; function region " +
      todo("Netlify function region"),
    transfer: TRANSFER_TODO,
    status: "active",
    vendorRole: "processor",
  },
  {
    name: "Cloudflare, Inc. (R2 object storage, D1 database)",
    role: "Uploaded document storage and heavy desk tables (payroll, ledger, VAT, bank)",
    data: "Client documents; payroll, ledger, VAT and bank-transaction rows",
    location: todo("R2 bucket jurisdiction and D1 location hint"),
    transfer: TRANSFER_TODO,
    status: "active",
    vendorRole: "processor",
  },
  {
    name: "Stripe (Stripe Payments UK Ltd / Stripe, Inc.)",
    role: "Subscription billing and card payments",
    data: "Billing name/email, plan, payment-method tokens (we never see full card numbers)",
    location: "UK / EEA / US",
    transfer: TRANSFER_TODO,
    status: "active",
    vendorRole: "independent_controller",
  },
  {
    name: "Resend, Inc.",
    role: "Transactional email (receipts, reminders, 2FA codes, client emails)",
    data: "Recipient email address, message content",
    location: "US / EU " + todo("Resend region setting"),
    transfer: TRANSFER_TODO,
    status: "active",
    vendorRole: "processor",
  },
  {
    name: "Twilio Inc.",
    role: "SMS one-time codes for two-factor authentication",
    data: "Mobile number and the one-time code message",
    location: "US / global",
    transfer: TRANSFER_TODO,
    status: "optional",
    vendorRole: "processor",
  },
  {
    name: "Meta Platforms Ireland Ltd (WhatsApp Business Cloud API)",
    role: "Client document bot over WhatsApp",
    data: "Client phone number and the messages exchanged with the bot",
    location: "Ireland / US",
    transfer: TRANSFER_TODO,
    status: "optional",
    vendorRole: "processor",
  },
  {
    name: "Neon, Inc.",
    role: "Serverless Postgres (fallback/auxiliary database)",
    data: "Same categories as Supabase where enabled",
    location: todo("Neon region"),
    transfer: TRANSFER_TODO,
    status: "optional",
    vendorRole: "processor",
  },
  {
    name: "Clerk, Inc.",
    role: "Legacy authentication provider (only if configured instead of Supabase Auth)",
    data: "Account identity and session data",
    location: "US",
    transfer: TRANSFER_TODO,
    status: "optional",
    vendorRole: "processor",
  },
  {
    name: "Google LLC / Google Ireland Ltd",
    role: "Optional 'Continue with Google' sign-in (via Supabase Auth)",
    data: "Google account id, name and email if you choose Google sign-in",
    location: "US / EEA / UK",
    transfer: "Google acts as its own controller for the sign-in; see Google's privacy policy.",
    status: "optional",
    vendorRole: "independent_controller",
  },
];

/** Statutory recipients — receive data only when the practice instructs a filing. */
export const STATUTORY_RECIPIENTS = [
  {
    name: "HM Revenue & Customs (HMRC)",
    role: "Receives VAT, Corporation Tax, Self Assessment and PAYE submissions on your instruction.",
    note: "Independent controller / public authority.",
  },
  {
    name: "Companies House",
    role: "Receives confirmation statements and accounts; we also read the public register.",
    note: "Independent controller / public authority.",
  },
] as const;
