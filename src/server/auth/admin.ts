import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { requireSession, type SessionContext } from "@/server/auth/session";

export function accountRefFromUser(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

/** Platform ops admin emails from ADMIN_EMAIL (comma-separated). */
export function platformAdminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function platformAdminEmail(): string | null {
  return platformAdminEmails()[0] ?? null;
}

/**
 * Email-allowlist check only. This is NOT sufficient to authorise admin
 * actions on its own — use requireAdmin(), which also requires a verified
 * email and a completed MFA step-up.
 */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  const allowed = platformAdminEmails();
  if (!allowed.length || !email) return false;
  const needle = email.trim().toLowerCase();
  return allowed.includes(needle);
}

/** Supabase email-confirmation timestamp for the signed-in user (server-verified). */
async function sessionEmailVerified(userId: string): Promise<boolean> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(
      user &&
        user.id === userId &&
        (user.email_confirmed_at || user.confirmed_at),
    );
  } catch {
    return false;
  }
}

/** Best-effort, non-throwing audit of a platform-admin access denial. */
async function logAdminDenial(session: SessionContext, reason: string) {
  try {
    const { logSecurityEvent } = await import("@/server/privacy/security-events");
    await logSecurityEvent({
      type: "auth.admin_denied",
      severity: "medium",
      actorUserId: session.local ? null : session.userId,
      practiceId: session.local ? null : session.practiceId,
      throttleKey: `${session.userId}:${reason}`,
      details: { reason }, // never the email address
    });
  } catch {
    /* logging must never change the outcome */
  }
}

export async function requireAdmin(): Promise<SessionContext> {
  // requireSession already enforces desk expiry + MFA step-up (fail closed).
  const session = await requireSession("/admin");
  if (!isPlatformAdmin(session.email)) {
    await logAdminDenial(session, "not_allowlisted");
    redirect("/dashboard");
  }

  if (isSupabaseConfigured() && !session.local) {
    // An unverified email must never confer platform-admin rights.
    if (!(await sessionEmailVerified(session.userId))) {
      await logAdminDenial(session, "email_unverified");
      redirect("/dashboard");
    }
    // Explicit second check: admin pages never rely on a cached decision.
    const { userNeedsMfaStepUp } = await import("@/server/auth/mfa-core");
    if (await userNeedsMfaStepUp(session.userId).catch(() => true)) {
      await logAdminDenial(session, "mfa_step_up_required");
      redirect("/verify-2fa?next=%2Fadmin");
    }
  }
  return session;
}
