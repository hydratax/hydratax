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
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  if (
    pathname !== "/verify-2fa" &&
    !pathname.startsWith("/verify-2fa/") &&
    !pathname.startsWith("/auth/") &&
    isSupabaseConfigured()
  ) {
    let needsStepUp = false;
    try {
      const { userNeedsMfaStepUp } = await import("@/server/actions/mfa");
      needsStepUp = await userNeedsMfaStepUp(session.userId);
    } catch {
      needsStepUp = false;
    }
    if (needsStepUp) {
      const resume = nextPath || pathname || "/dashboard";
      redirect(
        `/verify-2fa?next=${encodeURIComponent(
          resume.startsWith("/") ? resume : "/dashboard",
        )}`,
      );
    }
  }

  return session;
}

export async function requireModule(
  module: import("@/lib/access").AppModule,
): Promise<SessionContext> {
  const session = await requireSession();
  const { assertModuleAccess } = await import("@/lib/access");
  assertModuleAccess(session.moduleAccess, module);
  return session;
}
