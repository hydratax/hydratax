import { createHash } from "crypto";
import { redirect } from "next/navigation";
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

export function isPlatformAdmin(email: string | null | undefined): boolean {
  const allowed = platformAdminEmails();
  if (!allowed.length || !email) return false;
  const needle = email.trim().toLowerCase();
  return allowed.includes(needle);
}

export async function requireAdmin(): Promise<SessionContext> {
  const session = await requireSession("/admin");
  if (!isPlatformAdmin(session.email)) {
    redirect("/dashboard");
  }
  return session;
}
