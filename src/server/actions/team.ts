"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { memoryStore, type MemoryTeamMember } from "@/server/demo/store";
import { isSupabaseConfigured } from "@/lib/env";
import { MODULE_ACCESS_OPTIONS, type ModuleAccess } from "@/lib/access";
import { appendAuditEvent } from "@/server/audit/log";

const addSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  moduleAccess: z.enum(["full", "payroll", "vat", "corporation_tax"]),
});

function assertOwner(session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.role !== "owner" && session.role !== "admin") {
    throw new Error("Only the practice owner can manage the team");
  }
  if (session.moduleAccess !== "full") {
    throw new Error("Only full-access users can manage the team");
  }
}

export async function listTeamMembers(): Promise<MemoryTeamMember[]> {
  const session = await requireSession();
  assertOwner(session);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practice_members")
        .select("id, email, display_name, role, module_access, created_at")
        .eq("practice_id", session.practiceId)
        .order("created_at", { ascending: true });
      return (data ?? []).map((m) => ({
        id: m.id,
        practiceId: session.practiceId,
        email: m.email ?? "",
        name: m.display_name ?? m.email ?? "Member",
        role: (m.role as MemoryTeamMember["role"]) ?? "practitioner",
        moduleAccess: (m.module_access as ModuleAccess) ?? "full",
        active: true,
        createdAt: m.created_at,
      }));
    } catch {
      /* fall through to memory */
    }
  }

  return memoryStore.teamMembers.filter(
    (m) => m.practiceId === session.practiceId,
  );
}

export async function addTeamMember(input: z.infer<typeof addSchema>) {
  const session = await requireSession();
  assertOwner(session);
  const data = addSchema.parse(input);
  const email = data.email.trim().toLowerCase();

  if (
    memoryStore.teamMembers.some(
      (m) =>
        m.practiceId === session.practiceId &&
        m.email.toLowerCase() === email,
    )
  ) {
    throw new Error("A team member with this email already exists");
  }

  // Owners always full — sub-accounts should not be given full unless intended
  const member: MemoryTeamMember = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    email,
    name: data.name.trim(),
    role: data.moduleAccess === "full" ? "admin" : "practitioner",
    moduleAccess: data.moduleAccess,
    active: true,
    createdAt: new Date().toISOString(),
  };

  memoryStore.teamMembers.push(member);

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: null,
    actorId: session.userId,
    action: "team.member_added",
    entityType: "team_member",
    entityId: member.id,
    detail: {
      email: member.email,
      moduleAccess: member.moduleAccess,
    },
  });

  revalidatePath("/settings/team");
  return member;
}

export async function updateTeamMemberAccess(
  memberId: string,
  moduleAccess: ModuleAccess,
) {
  const session = await requireSession();
  assertOwner(session);
  if (!MODULE_ACCESS_OPTIONS.some((o) => o.value === moduleAccess)) {
    throw new Error("Invalid access level");
  }

  const member = memoryStore.teamMembers.find(
    (m) => m.id === memberId && m.practiceId === session.practiceId,
  );
  if (!member) throw new Error("Team member not found");
  member.moduleAccess = moduleAccess;
  member.role = moduleAccess === "full" ? "admin" : "practitioner";

  revalidatePath("/settings/team");
  return member;
}

export async function deactivateTeamMember(memberId: string) {
  const session = await requireSession();
  assertOwner(session);
  const member = memoryStore.teamMembers.find(
    (m) => m.id === memberId && m.practiceId === session.practiceId,
  );
  if (!member) throw new Error("Team member not found");
  member.active = false;
  if (memoryStore.actingMemberId === memberId) {
    memoryStore.actingMemberId = null;
  }
  revalidatePath("/settings/team");
  return member;
}

/** Local demo: switch into a sub-account to verify module limits */
export async function actAsTeamMember(memberId: string | null) {
  const session = await requireSession();
  if (!session.local && session.role !== "owner") {
    throw new Error("Only available for practice owners");
  }
  if (memberId) {
    const member = memoryStore.teamMembers.find(
      (m) =>
        m.id === memberId &&
        m.practiceId === session.practiceId &&
        m.active,
    );
    if (!member) throw new Error("Team member not found");
    memoryStore.actingMemberId = memberId;
  } else {
    memoryStore.actingMemberId = null;
  }
  revalidatePath("/");
  revalidatePath("/settings/team");
  revalidatePath("/clients");
  return { ok: true as const };
}

export async function getActingMemberId() {
  await requireSession();
  return memoryStore.actingMemberId;
}
