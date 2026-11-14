"use server";
import { safeErr } from "@/lib/redact";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isMemoryStore, isSupabaseConfigured, isStripeConfigured } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import { startPracticeTrial } from "@/server/billing/start-practice-trial";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";

/** New passwords: >= 12 chars (Supabase/bcrypt caps usable length at 72 bytes). */
const PASSWORD_MIN = 12;
const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(72, "Password must be 72 characters or fewer");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

const signUpSchema = z.object({
  orgType: z.enum(["company", "sole_trader", "partnership", "practice"]),
  orgSearch: z.string().max(200).optional(),
  companyNumber: z.string().max(20).optional(),
  firstName: z.string().min(1, "Enter your first name").max(80),
  surname: z.string().min(1, "Enter your surname").max(80),
  email: emailSchema,
  password: newPasswordSchema,
  confirmPassword: z.string().max(200),
  startTrial: z.boolean().optional(),
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

const quickSignUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  confirmPassword: z.string().max(200),
  /** Where to continue after signup (e.g. CS01 resume + pay) */
  next: z.string().max(2048).optional(),
});

const RATE_LIMITED_MESSAGE =
  "Too many attempts. Wait a few minutes and try again.";

function isAlreadyRegisteredError(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("identity_already_exists") ||
    m.includes("email address is already associated")
  );
}

export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

function startLocalPracticeTrial(practiceId: string) {
  return startPracticeTrial(practiceId);
}

export async function signUpWithSupabase(
  input: z.infer<typeof signUpSchema>,
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const data = parsed.data;
  if (data.password !== data.confirmPassword) {
    return { ok: false, error: "Passwords do not match" };
  }

  const signUpLimit = await rateLimitByIp("signup", {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!signUpLimit.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  if (!isSupabaseConfigured()) {
    // Local fallback so the button always works without cloud keys
    memoryStore.accountProfile = {
      orgType: data.orgType,
      orgSearch: data.orgSearch?.trim() ?? "",
      firstName: data.firstName,
      createdAt: new Date().toISOString(),
    };
    memoryStore.practice.name =
      data.orgSearch?.trim() ||
      `${data.firstName} ${data.surname}${
        data.orgType === "practice" ? " Practice" : ""
      }`;
    if (!isStripeConfigured() && data.startTrial) {
      await startLocalPracticeTrial(memoryStore.practice.id);
    }
    return { ok: true, redirectTo: "/dashboard" };
  }

  try {
    const supabase = await createClient();
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          org_type: data.orgType,
          org_search: data.orgSearch ?? "",
          company_number: data.companyNumber ?? "",
          first_name: data.firstName,
          surname: data.surname,
          start_trial: data.startTrial ? "1" : "0",
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
      },
    });

    if (error) {
      // Do not pretend a new account was created — send them to sign-in with
      // an "existing account" hint (same URL shape either way avoids a hard enum).
      if (isAlreadyRegisteredError(error.message)) {
        return { ok: true, redirectTo: "/sign-in?exists=1" };
      }
      return { ok: false, error: friendlyAuthMessage(error.message) };
    }

    // With "Confirm email" on, Supabase often returns a user with empty
    // identities (and no session) when the email is already registered —
    // instead of an error. Treat that as an existing account, not "check email".
    if (
      authData.user &&
      !authData.session &&
      Array.isArray(authData.user.identities) &&
      authData.user.identities.length === 0
    ) {
      return { ok: true, redirectTo: "/sign-in?exists=1" };
    }

    // Provision practice row; free trial only starts via Practice/Custom checkout
    let practiceName: string | null = null;
    const user = authData.user;
    if (user) {
      try {
        const { ensureSupabasePractice } = await import(
          "@/server/auth/ensure-practice"
        );
        const practice = await ensureSupabasePractice(user);
        practiceName = practice.practiceName;
        // Single-company / company signups get weekly CS / accounts / CT600 nudges
        if (data.orgType === "company" || data.orgType === "sole_trader") {
          const { enrolCompanyFilingReminders } = await import(
            "@/server/billing/company-filing-reminders"
          );
          await enrolCompanyFilingReminders({
            userId: user.id,
            practiceId: practice.practiceId,
            email: data.email,
            firstName: data.firstName,
          });
        }
      } catch {
        /* practice seeded on first dashboard visit */
      }

      // First desk visit = signup; skip Trust-device until the second login.
      try {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        await supabase.auth.updateUser({
          data: {
            ...meta,
            hydra_login_count: 1,
            hydra_welcome_sent: true,
            hydra_last_login_at: new Date().toISOString(),
          },
        });
        if (authData.session) {
          const { startProvisionalSession } = await import(
            "@/server/auth/session-policy"
          );
          await startProvisionalSession();
        }
      } catch {
        /* best-effort */
      }
    }

    try {
      const { sendSignupEmails } = await import("@/server/email/signup-notify");
      await sendSignupEmails({
        to: data.email,
        firstName: data.firstName,
        surname: data.surname,
        practiceName,
        orgType: data.orgType,
        userId: user?.id ?? null,
      });
    } catch (err) {
      console.error("[auth.signUp] signup emails failed", safeErr(err));
    }

    // Supabase "Confirm email" with broken/default SMTP leaves users stuck:
    // no session, no inbox mail, and sign-in often says "invalid credentials".
    // Always send the confirm link via Resend when confirmation is required.
    if (!authData.session) {
      try {
        const { sendSignupConfirmEmail } = await import(
          "@/server/email/auth-confirm"
        );
        const sent = await sendSignupConfirmEmail({
          email: data.email,
          firstName: data.firstName,
          password: data.password,
        });
        // Last resort: confirm the user server-side so they can sign in now.
        if (sent === "failed" && user?.id) {
          const { getSupabaseAdmin } = await import("@/lib/supabase");
          await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
            email_confirm: true,
          });
          return {
            ok: true,
            redirectTo: "/sign-in?confirmed=1",
          };
        }
      } catch (err) {
        console.error("[auth.signUp] confirm email failed", safeErr(err));
      }
      return { ok: true, redirectTo: "/sign-in?confirm=1" };
    }

    return { ok: true, redirectTo: "/dashboard" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create account";
    return { ok: false, error: friendlyAuthMessage(msg) };
  }
}

/**
 * Minimal signup for one-off filings (CS01 etc.) — email + password only.
 * Provisions a company-type practice so checkout / CH requests still have a practiceId.
 */
export async function quickSignUpWithSupabase(
  input: z.infer<typeof quickSignUpSchema>,
): Promise<AuthActionResult> {
  const parsed = quickSignUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const data = parsed.data;
  if (data.password !== data.confirmPassword) {
    return { ok: false, error: "Passwords do not match" };
  }

  const quickLimit = await rateLimitByIp("quick-signup", {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!quickLimit.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { safeReturnPath } = await import("@/lib/auth-return");
  const continueTo = safeReturnPath(data.next, "/dashboard");

  if (!isSupabaseConfigured()) {
    memoryStore.accountProfile = {
      orgType: "company",
      orgSearch: "",
      firstName: data.email.split("@")[0] || "Client",
      createdAt: new Date().toISOString(),
    };
    memoryStore.practice.name =
      data.email.split("@")[0] || "Filing account";
    return { ok: true, redirectTo: continueTo };
  }

  try {
    const supabase = await createClient();
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          org_type: "company",
          quick_client: "1",
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk"}/auth/callback?next=${encodeURIComponent(continueTo)}`,
      },
    });

    if (error) {
      if (isAlreadyRegisteredError(error.message)) {
        return {
          ok: true,
          redirectTo: `/sign-in?exists=1&next=${encodeURIComponent(continueTo)}`,
        };
      }
      return { ok: false, error: friendlyAuthMessage(error.message) };
    }

    if (
      authData.user &&
      !authData.session &&
      Array.isArray(authData.user.identities) &&
      authData.user.identities.length === 0
    ) {
      return {
        ok: true,
        redirectTo: `/sign-in?exists=1&next=${encodeURIComponent(continueTo)}`,
      };
    }

    let practiceName: string | null = null;
    const user = authData.user;
    const firstName = data.email.split("@")[0] || null;
    if (user) {
      try {
        const { ensureSupabasePractice } = await import(
          "@/server/auth/ensure-practice"
        );
        const practice = await ensureSupabasePractice(user);
        practiceName = practice.practiceName;
        const { enrolCompanyFilingReminders } = await import(
          "@/server/billing/company-filing-reminders"
        );
        await enrolCompanyFilingReminders({
          userId: user.id,
          practiceId: practice.practiceId,
          email: data.email,
        });
      } catch {
        /* practice seeded on first desk visit */
      }

      try {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        await supabase.auth.updateUser({
          data: {
            ...meta,
            hydra_login_count: 1,
            hydra_welcome_sent: true,
            hydra_last_login_at: new Date().toISOString(),
          },
        });
        if (authData.session) {
          const { startProvisionalSession } = await import(
            "@/server/auth/session-policy"
          );
          await startProvisionalSession();
        }
      } catch {
        /* best-effort */
      }
    }

    try {
      const { sendSignupEmails } = await import("@/server/email/signup-notify");
      await sendSignupEmails({
        to: data.email,
        firstName,
        practiceName,
        orgType: "company",
        userId: user?.id ?? null,
      });
    } catch (err) {
      console.error("[auth.quickSignUp] signup emails failed", safeErr(err));
    }

    if (!authData.session) {
      try {
        const { sendSignupConfirmEmail } = await import(
          "@/server/email/auth-confirm"
        );
        const sent = await sendSignupConfirmEmail({
          email: data.email,
          firstName,
          password: data.password,
        });
        if (sent === "failed" && user?.id) {
          const { getSupabaseAdmin } = await import("@/lib/supabase");
          await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
            email_confirm: true,
          });
          return {
            ok: true,
            redirectTo: `/sign-in?confirmed=1&next=${encodeURIComponent(continueTo)}`,
          };
        }
      } catch (err) {
        console.error("[auth.quickSignUp] confirm email failed", safeErr(err));
      }
      return {
        ok: true,
        redirectTo: `/sign-in?confirm=1&next=${encodeURIComponent(continueTo)}`,
      };
    }

    return { ok: true, redirectTo: continueTo };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create account";
    return { ok: false, error: friendlyAuthMessage(msg) };
  }
}

export async function signInWithSupabase(
  input: z.infer<typeof signInSchema>,
): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const data = parsed.data;

  if (!isSupabaseConfigured()) {
    // Local desk without Supabase
    return { ok: true, redirectTo: "/dashboard" };
  }

  // Brute-force brake: per client IP and per target account (best effort —
  // in-memory per instance; add an edge/WAF rate rule for a hard guarantee).
  const ipLimit = await rateLimitByIp("signin", {
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  const acctLimit = rateLimit({
    key: `signin-acct:${data.email}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.ok || !acctLimit.ok) {
    // No email / password in the event — only which brake tripped.
    try {
      const { getClientIp } = await import("@/lib/rate-limit");
      const { logSecurityEvent } = await import("@/server/privacy/security-events");
      const ip = await getClientIp();
      await logSecurityEvent({
        type: "auth.login_failed_burst",
        severity: "medium",
        ip,
        throttleKey: `signin:${ip}`,
        details: { limiter: !ipLimit.ok ? "ip" : "account" },
      });
    } catch {
      /* best-effort */
    }
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  try {
    const supabase = await createClient();
    const { data: signedIn, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code ?? "")
          : "";
      return { ok: false, error: friendlyAuthMessage(error.message, code) };
    }
    const userId = signedIn.user?.id;
    let suggest2fa = false;
    let loginCount = 0;
    if (userId) {
      const { startProvisionalSession, recordSuccessfulLogin } = await import(
        "@/server/auth/session-policy"
      );
      await startProvisionalSession();
      const login = await recordSuccessfulLogin(userId);
      suggest2fa = login.suggest2fa;
      loginCount = login.loginCount;

      const { beginMfaIfRequired } = await import("@/server/auth/mfa-core");
      let mfaRequired = true; // fail closed
      try {
        mfaRequired = (await beginMfaIfRequired(userId)).required;
      } catch (err) {
        console.error("[auth.signIn] MFA begin failed", safeErr(err));
      }
      if (mfaRequired) {
        const { postLoginPath } = await import("@/lib/session-policy");
        return {
          ok: true,
          redirectTo: `/verify-2fa?next=${encodeURIComponent(
            postLoginPath("/dashboard", { suggest2fa, loginCount }),
          )}`,
        };
      }
    }
    const { postLoginPath } = await import("@/lib/session-policy");
    return {
      ok: true,
      redirectTo: postLoginPath("/dashboard", { suggest2fa, loginCount }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign in failed";
    return { ok: false, error: friendlyAuthMessage(msg) };
  }
}

function friendlyAuthMessage(raw: string, code = ""): string {
  const m = raw.toLowerCase();
  const c = code.toLowerCase();
  if (c === "email_not_confirmed" || m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirm your email first — check your inbox (and spam) for the HydraTax confirmation link, then sign in again.";
  }
  if (c === "invalid_credentials" || m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Email or password is incorrect. If you just signed up, use the password you chose — or Forgot password if this email already had an account.";
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("identity_already_exists") ||
    m.includes("email address is already associated")
  ) {
    return "An account with this email already exists. Sign in with your password, or use Forgot password.";
  }
  if (m.includes("pkce") || m.includes("code verifier") || m.includes("not found in storage")) {
    return "Google sign-in did not finish. If you already have an account with this email, sign in with your password or use Forgot password.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("password")) {
    return raw;
  }
  return raw || "Something went wrong. Please try again.";
}

export async function requestPasswordReset(input: {
  email: string;
}): Promise<AuthActionResult> {
  const parsed = z.object({ email: emailSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: "Password reset needs Supabase. Use a configured environment.",
    };
  }

  // Throttle (email-bombing + enumeration timing). When limited we answer
  // exactly like a success so callers cannot tell the difference.
  const resetIp = await rateLimitByIp("pw-reset", {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  const resetAcct = rateLimit({
    key: `pw-reset-acct:${parsed.data.email}`,
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });
  if (!resetIp.ok || !resetAcct.ok) {
    return { ok: true, redirectTo: "/forgot-password?sent=1" };
  }

  try {
    const supabase = await createClient();
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    // Prefer /auth/confirm?token_hash=… in the Supabase recovery email template
    // (works across browsers). redirectTo remains the fallback after verify.
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      {
        redirectTo: `${appUrl}/reset-password`,
      },
    );
    if (error) {
      // Log, but never surface provider errors that could differ per account.
      console.warn("[auth.reset] resetPasswordForEmail failed", error.message);
    }
    // Always succeed from the UI's perspective to avoid email enumeration.
    return { ok: true, redirectTo: "/forgot-password?sent=1" };
  } catch (err) {
    console.warn(
      "[auth.reset] failed",
      err instanceof Error ? err.message : "unknown",
    );
    return { ok: true, redirectTo: "/forgot-password?sent=1" };
  }
}

export async function updatePasswordWithSupabase(input: {
  password: string;
  confirmPassword: string;
}): Promise<AuthActionResult> {
  const parsed = z
    .object({
      password: newPasswordSchema,
      confirmPassword: z.string().max(200),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ok: false, error: "Passwords do not match" };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Password update needs Supabase." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: "Your reset link has expired. Request a new one from Sign in.",
      };
    }
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return { ok: false, error: friendlyAuthMessage(error.message) };
    }
    return { ok: true, redirectTo: "/sign-in?reset=1" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not update password";
    return { ok: false, error: friendlyAuthMessage(msg) };
  }
}

/** Resend the signup confirmation link via Resend (not Supabase SMTP). */
export async function resendSignupConfirmation(
  emailRaw: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = emailSchema.safeParse(emailRaw);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const limited = await rateLimitByIp("resend-confirm", {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) return { ok: false, error: RATE_LIMITED_MESSAGE };

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Email confirmation is not available locally." };
  }

  try {
    const { sendSignupConfirmEmail } = await import(
      "@/server/email/auth-confirm"
    );
    const sent = await sendSignupConfirmEmail({ email: parsed.data });
    if (sent === "failed") {
      return {
        ok: false,
        error:
          "Could not send the confirmation email. Try again in a minute, or use Forgot password if you already have an account.",
      };
    }
    return {
      ok: true,
      message:
        "If an unconfirmed account exists for that email, we sent a confirmation link from HydraTax. Check inbox and spam.",
    };
  } catch (err) {
    console.error("[auth.resendConfirm]", safeErr(err));
    return { ok: false, error: "Could not send the confirmation email." };
  }
}

export async function signOutSupabase() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  try {
    const { clearSessionPolicyCookies } = await import(
      "@/server/auth/session-policy"
    );
    await clearSessionPolicyCookies();
  } catch {
    /* ignore */
  }
  redirect("/");
}

export async function getSupabaseSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function authMode() {
  if (isSupabaseConfigured()) return "supabase" as const;
  if (isMemoryStore()) return "local" as const;
  return "local" as const;
}
