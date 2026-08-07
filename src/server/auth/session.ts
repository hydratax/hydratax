import { isClerkConfigured, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";

export type SessionContext = {
  userId: string;
  orgId: string;
  practiceId: string;
  practiceName: string;
  role: "owner" | "admin" | "practitioner" | "readonly";
  local: boolean;
};

export async function requireSession(): Promise<SessionContext> {
  // Prefer Supabase when configured
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id, role, practices(id, name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const practice = membership?.practices as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null
      | undefined;

    const practiceRow = Array.isArray(practice) ? practice[0] : practice;

    if (practiceRow) {
      return {
        userId: user.id,
        orgId: practiceRow.id,
        practiceId: practiceRow.id,
        practiceName: practiceRow.name,
        role: (membership?.role as SessionContext["role"]) ?? "owner",
        local: false,
      };
    }

    // Profile trigger may still be settling — fall back to memory name
    return {
      userId: user.id,
      orgId: user.id,
      practiceId: user.id,
      practiceName:
        (user.user_metadata?.org_search as string) ||
        `${user.user_metadata?.first_name ?? "Your"} practice`,
      role: "owner",
      local: false,
    };
  }

  if (isMemoryStore() || !isClerkConfigured()) {
    return {
      userId: "user_local_practitioner",
      orgId: memoryStore.practice.clerkOrgId,
      practiceId: memoryStore.practice.id,
      practiceName: memoryStore.practice.name,
      role: "owner",
      local: true,
    };
  }

  const { auth } = await import("@clerk/nextjs/server");
  const session = await auth();
  if (!session.userId) throw new Error("Unauthorized");
  if (!session.orgId) {
    throw new Error("Select or create a practice organization in Clerk");
  }

  const { ensurePractice } = await import("./practice");
  const practice = await ensurePractice(session.orgId, "Practice");

  return {
    userId: session.userId,
    orgId: session.orgId,
    practiceId: practice.id,
    practiceName: practice.name,
    role: "owner",
    local: false,
  };
}
