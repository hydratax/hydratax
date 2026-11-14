/**
 * Inventory of every cookie and browser-storage key the app sets
 * (verified by grep of src/ — see docs/security/ropa.md §Cookies).
 *
 * PECR reg 6: consent is NOT required for storage that is strictly necessary
 * for a service the user has requested, or solely for transmitting a
 * communication. If you add ANY analytics / marketing / advertising storage,
 * add it here with `strictlyNecessary: false` — the /legal/cookies page and the
 * unit test will then flag that a consent banner that blocks it is required.
 */

export type StorageItem = {
  name: string;
  kind: "cookie" | "localStorage" | "sessionStorage";
  setBy: "us" | "supabase" | "stripe" | "browser";
  purpose: string;
  duration: string;
  strictlyNecessary: boolean;
  /** Why it is exempt from consent (PECR reg 6(4)). */
  exemption: string;
};

export const STORAGE_INVENTORY: StorageItem[] = [
  {
    name: "sb-<project>-auth-token (and .0/.1 chunks)",
    kind: "cookie",
    setBy: "supabase",
    purpose: "Keeps you signed in (Supabase Auth session).",
    duration: "Session / refresh-token lifetime",
    strictlyNecessary: true,
    exemption: "Authentication for a service you requested.",
  },
  {
    name: "sb-<project>-auth-token-code-verifier",
    kind: "cookie",
    setBy: "supabase",
    purpose: "PKCE verifier used while completing sign-in / password reset.",
    duration: "Minutes (deleted after sign-in)",
    strictlyNecessary: true,
    exemption: "Authentication / security.",
  },
  {
    name: "ht_auth_next, ht_auth_org",
    kind: "cookie",
    setBy: "us",
    purpose: "Remember where to send you after Google sign-in or password reset.",
    duration: "Up to 1 hour; cleared after use",
    strictlyNecessary: true,
    exemption: "Completing a sign-in you requested.",
  },
  {
    name: "ht_mfa_pending, ht_mfa_ok",
    kind: "cookie",
    setBy: "us",
    purpose: "Two-factor step-up state (signed value; no personal data beyond user id).",
    duration: "Session to 7 days",
    strictlyNecessary: true,
    exemption: "Security of an authenticated service.",
  },
  {
    name: "ht_session_expires, ht_device_trusted",
    kind: "cookie",
    setBy: "us",
    purpose: "Enforces maximum desk session length and your 'trust this device' choice.",
    duration: "10 hours (or 7 days if you trust the device)",
    strictlyNecessary: true,
    exemption: "Security of an authenticated service; trust is your explicit choice.",
  },
  {
    name: "ht_voter",
    kind: "cookie",
    setBy: "us",
    purpose: "Stops duplicate votes on the public feature-request board when signed out.",
    duration: "400 days",
    strictlyNecessary: true,
    exemption:
      "Needed to provide the voting feature you requested; random id, not used for tracking.",
  },
  {
    name: "hydratax_device_id",
    kind: "localStorage",
    setBy: "us",
    purpose:
      "Random device identifier sent to HMRC as a fraud-prevention header (Gov-Client-Device-ID) when you file.",
    duration: "Until you clear browser storage",
    strictlyNecessary: true,
    exemption:
      "HMRC requires fraud-prevention headers for MTD software; used only on filing requests, never for analytics.",
  },
  {
    name: "hydratax_dashboard_client_view",
    kind: "localStorage",
    setBy: "us",
    purpose: "Remembers list/grid view preference.",
    duration: "Until cleared",
    strictlyNecessary: true,
    exemption: "User-requested interface preference (functional, no tracking).",
  },
  {
    name: "Form drafts (accounts wizard, year-end form, CS01 checkout, CT600 workspace, HMRC ARN)",
    kind: "localStorage",
    setBy: "us",
    purpose: "Saves unfinished forms on your device so you do not lose work.",
    duration: "Until submitted or cleared",
    strictlyNecessary: true,
    exemption: "Functionality you requested; never sent to analytics.",
  },
  {
    name: "Wizard hand-off keys",
    kind: "sessionStorage",
    setBy: "us",
    purpose: "Pass state between steps of a form within one tab.",
    duration: "Until the tab is closed",
    strictlyNecessary: true,
    exemption: "Functionality you requested.",
  },
  {
    name: "Stripe Checkout cookies",
    kind: "cookie",
    setBy: "stripe",
    purpose: "Set by Stripe on its hosted checkout page for fraud prevention and payment.",
    duration: "Per Stripe",
    strictlyNecessary: true,
    exemption: "Payment and fraud prevention for a purchase you requested (Stripe's own policy applies).",
  },
];

/** True if any item needs consent — if so a blocking consent banner is required. */
export function consentBannerRequired(
  items: StorageItem[] = STORAGE_INVENTORY,
): boolean {
  return items.some((i) => !i.strictlyNecessary);
}
