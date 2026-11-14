import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  isClerkConfigured,
  isMemoryStore,
  isSupabaseConfigured,
} from "@/lib/env";
import type { ModuleAccess } from "@/lib/access";
import { memoryStore } from "@/server/demo/store";

export type SessionContext = {
  userId: string;
  orgId: string;
  practiceId: string;
  practiceName: string;
  role: "owner" | "admin" | "practitioner" | "readonly";
  moduleAccess: ModuleAccess;
  email: string | null;
  local: boolean;
};

function localMemorySession(): SessionContext {
  const acting = memoryStore.actingMemberId
    ? memoryStore.teamMembers.find(
        (m) =>
          m.id === memoryStore.actingMemberId &&
          m.practiceId === memoryStore.practice.id &&
          m.active,
      )
    : null;

  if (acting) {
    return {
      userId: acting.id,
      orgId: memoryStore.practice.clerkOrgId,
      practiceId: memoryStore.practice.id,
      practiceName: memoryStore.practice.name,
      role: acting.role,
      moduleAccess: acting.moduleAccess,
      email: acting.email,
      local: true,
    };
  }

  return {
    userId: "user_local_owner",
    orgId: memoryStore.practice.clerkOrgId,
    practiceId: memoryStore.practice.id,
    practiceName: memoryStore.practice.name,
    role: "owner",
    moduleAccess: "full",
    email: (process.env.ADMIN_EMAIL ?? "").split(",")[0]?.trim() || null,
    local: true,
  };
}

function isAuthRateLimited(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err ?? "");
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : 0;
  return (
    status === 429 ||
    /rate limit|too many requests|over_request_rate_limit/i.test(msg)
  );
}

/**
 * Resolve the signed-in user from VERIFIED data only.
 * Prefer getClaims (verifies the JWT signature locally when asymmetric keys are
 * enabled); fall back to getUser (server-verified). On an Auth rate limit we
 * return null (treated as signed out / retry) — we NEVER fall back to the
 * unverified cookie session from getSession().
 */
async function resolveSupabaseUser(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
): Promise<{ id: string; email: string | null } | null> {
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    const sub = claimsData?.claims?.sub;
    if (typeof sub === "string" && sub.length > 0) {
      const email = claimsData?.claims?.email;
      return {
        id: sub,
        email: typeof email === "string" ? email : null,
      };
    }
  } catch (err) {
    if (!isAuthRateLimited(err)) {
      // Claims unavailable (e.g. HS256 / no JWKS) — try getUser below.
      console.warn("[session] getClaims failed", err);
    }
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      if (isAuthRateLimited(error)) {
        console.warn(
          "[session] Supabase Auth rate limited — session not verified, treating as signed out (retry)",
        );
      }
      return null;
    }
    if (!user) return null;
    return { id: user.id, email: user.email ?? null };
  } catch (err) {
    if (isAuthRateLimited(err)) {
      console.warn(
        "[session] Supabase Auth rate limited — session not verified, treating as signed out (retry)",
      );
      return null;
    }
    console.error("[session] getUser failed", err);
    return null;
  }
}

/** Soft session lookup — returns null when signed out (no throw / no redirect). */
export const getOptionalSession = cache(
  async (): Promise<SessionContext | null> => {
  // Explicit local desk: never wait on remote Supabase/Clerk (DEMO_MODE / MEMORY_STORE).
  if (isMemoryStore()) {
    return localMemorySession();
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const user = await resolveSupabaseUser(supabase);

    if (!user) return null;

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id, role, module_access, email, practices(id, name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const practice = membership?.practices as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null
      | undefined;

    const practiceRow = Array.isArray(practice) ? practice[0] : practice;
    const moduleAccess =
      (membership?.module_access as ModuleAccess | undefined) ?? "full";

    if (practiceRow) {
      return {
        userId: user.id,
        orgId: practiceRow.id,
        practiceId: practiceRow.id,
        practiceName: practiceRow.name,
        role: (membership?.role as SessionContext["role"]) ?? "owner",
        moduleAccess:
          membership?.role === "owner" || membership?.role === "admin"
            ? "full"
            : moduleAccess,
        email: user.email ?? membership?.email ?? null,
        local: false,
      };
    }

    try {
      const { ensureSupabasePractice } = await import("./ensure-practice");
      const ensured = await ensureSupabasePractice(user);
      return {
        userId: user.id,
        orgId: ensured.practiceId,
        practiceId: ensured.practiceId,
        practiceName: ensured.practiceName,
        role: (ensured.role as SessionContext["role"]) || "owner",
        moduleAccess: "full",
        email: user.email ?? null,
        local: false,
      };
    } catch (err) {
      console.error("[session] ensureSupabasePractice failed", err);
      return null;
    }
  }

  if (!isClerkConfigured()) {
    return localMemorySession();
  }

  const { auth } = await import("@clerk/nextjs/server");
  const session = await auth();
  if (!session.userId || !session.orgId) return null;

  const { ensurePractice } = await import("./practice");
  const practice = await ensurePractice(session.orgId, "Practice");

  return {
    userId: session.userId,
    orgId: session.orgId,
    practiceId: practice.id,
    practiceName: practice.name,
    role: "owner",
    moduleAccess: "full",
    email: null,
    local: false,
  };
  },
);

/** Requires a signed-in user; redirects to sign-in instead of throwing. */
export async function requireSession(
  nextPath?: string,
): Promise<SessionContext> {
  // Wall-clock desk expiry (10h / 7d) — backup to proxy enforcement.
  try {
    const { deskSessionExpired, clearSessionPolicyCookies } = await import(
      "@/server/auth/session-policy"
    );
    if (await deskSessionExpired()) {
      await clearSessionPolicyCookies();
      if (isSupabaseConfigured()) {
        try {
          const { createClient } = await import("@/lib/supabase/server");
          const supabase = await createClient();
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
      }
      let path = nextPath;
      if (!path) {
        const h = await headers();
        path = h.get("x-pathname") || "/dashboard";
      }
      redirect(
        `/sign-in?next=${encodeURIComponent(path)}&expired=1`,
      );
    }
  } catch (err) {
    // redirect() throws — rethrow; ignore soft import failures
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
  }

  const session = await getOptionalSession();
  if (!session) {
    let path = nextPath;
    if (!path) {
      const h = await headers();
      path = h.get("x-pathname") || "/dashboard";
    }
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }

  // Step-up MFA: password/OAuth succeeded but OTP not yet verified.
  // NOTE: no path-based exemption. `x-pathname` follows the URL a Server Action
  // is POSTed to, which a caller controls, so exempting /verify-2fa or /auth/
  // here would let anyone skip step-up. The verify/secure-device pages use
  // getOptionalSession, not requireSession.
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  if (isSupabaseConfigured() && !session.local) {
    // Fail closed: if we cannot determine MFA state, require step-up.
    let needsStepUp = true;
    try {
      const { userNeedsMfaStepUp } = await import("@/server/auth/mfa-core");
      needsStepUp = await userNeedsMfaStepUp(session.userId);
    } catch {
      needsStepUp = true;
    }
    if (needsStepUp) {
      const { safeReturnPath } = await import("@/lib/auth-return");
      const resume = safeReturnPath(nextPath || pathname || "/dashboard");
      redirect(`/verify-2fa?next=${encodeURIComponent(resume)}`);
    }
  }

  return session;
}

export async function requireModule(
  module: import("@/lib/access").AppModule,
): Promise<SessionContext> {
  const session = await requireSession();
  const { canAccessModule } = await import("@/lib/access");
  const { isPlanGatedModule, pricingHashForModule } = await import(
    "@/lib/entitlements"
  );

  const pricingPath = isPlanGatedModule(module)
    ? `/pricing#${pricingHashForModule(module)}`
    : "/pricing#practice";

  if (!canAccessModule(session.moduleAccess, module)) {
    // Team role lock — send them to Pricing / desk rather than a raw error page.
    redirect(isPlanGatedModule(module) ? pricingPath : "/clients");
  }

  // Plan entitlements: individual add-ons only unlock the rails they paid for.
  if (isPlanGatedModule(module)) {
    const { getPracticeEntitlements } = await import(
      "@/server/actions/account"
    );
    const ent = await getPracticeEntitlements().catch(() => null);
    if (!ent || !ent.modules.includes(module)) {
      redirect(pricingPath);
    }
  }

  return session;
}
