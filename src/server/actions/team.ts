"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { memoryStore, type MemoryTeamMember } from "@/server/demo/store";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { MODULE_ACCESS_OPTIONS, type ModuleAccess } from "@/lib/access";
import { appendAuditEvent } from "@/server/audit/log";

const addSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  moduleAccess: z.enum([
    "full",
    "payroll",
    "vat",
    "corporation_tax",
    "invoices",
    "self_assessment",
  ]),
});

function assertOwner(session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.role !== "owner" && session.role !== "admin") {
    throw new Error("Only the practice owner can manage the team");
  }
  if (session.moduleAccess !== "full") {
    throw new Error("Only full-access users can manage the team");
  }
}

function toMember(
  practiceId: string,
  m: {
    id: string;
    email?: string | null;
    display_name?: string | null;
    role?: string | null;
    module_access?: string | null;
    created_at?: string | null;
  },
): MemoryTeamMember {
  return {
    id: m.id,
    practiceId,
    email: m.email ?? "",
    name: m.display_name ?? m.email ?? "Member",
    role: (m.role as MemoryTeamMember["role"]) ?? "practitioner",
    moduleAccess: (m.module_access as ModuleAccess) ?? "full",
    active: true,
    createdAt: m.created_at ?? new Date().toISOString(),
  };
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
      const members = (data ?? []).map((m) => toMember(session.practiceId, m));

      const { data: invites } = await supabase
        .from("practice_team_invites")
        .select("id, email, display_name, module_access, created_at, token")
        .eq("practice_id", session.practiceId)
        .is("accepted_at", null)
        .order("created_at", { ascending: true });

      const pending = (invites ?? []).map((inv) => {
        const moduleAccess =
          (inv.module_access as ModuleAccess) ?? "payroll";
        return {
          id: `invite:${inv.token ?? inv.id}`,
          practiceId: session.practiceId,
          email: inv.email ?? "",
          name: inv.display_name ?? inv.email ?? "Invited",
          role: (moduleAccess === "full" ? "admin" : "practitioner") as MemoryTeamMember["role"],
          moduleAccess,
          active: false,
          createdAt: inv.created_at ?? new Date().toISOString(),
        } satisfies MemoryTeamMember;
      });

      return [...members, ...pending];
    } catch {
      /* fall through to memory */
    }
  }

  return memoryStore.teamMembers.filter(
    (m) => m.practiceId === session.practiceId && m.active,
  );
}

export async function addTeamMember(input: z.infer<typeof addSchema>) {
  const session = await requireSession();
  assertOwner(session);
  const data = addSchema.parse(input);
  const email = data.email.trim().toLowerCase();
  const name = data.name.trim();
  const role = data.moduleAccess === "full" ? "admin" : "practitioner";

  if (isSupabaseConfigured() && !isMemoryStore()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, first_name, surname")
      .ilike("email", email)
      .maybeSingle();

    if (profile?.id) {
      const { data: existing } = await supabase
        .from("practice_members")
        .select("id")
        .eq("practice_id", session.practiceId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (existing) {
        throw new Error("A team member with this email already exists");
      }

      const { data: inserted, error } = await supabase
        .from("practice_members")
        .insert({
          practice_id: session.practiceId,
          user_id: profile.id,
          role,
          module_access: data.moduleAccess,
          email,
          display_name: name,
        })
        .select("id, email, display_name, role, module_access, created_at")
        .single();
      if (error) throw new Error(error.message);

      const member = toMember(session.practiceId, inserted);
      await appendAuditEvent({
        practiceId: session.practiceId,
        clientId: null,
        actorId: session.userId,
        action: "team.member_added",
        entityType: "team_member",
        entityId: member.id,
        detail: { email: member.email, moduleAccess: member.moduleAccess },
      });
      revalidatePath("/settings/team");
      revalidatePath("/settings/account");
      return member;
    }

    // Not registered yet — store invite and email a create-account link.
    const token = crypto.randomUUID().replace(/-/g, "");
    await supabase
      .from("practice_team_invites")
      .delete()
      .eq("practice_id", session.practiceId)
      .ilike("email", email)
      .is("accepted_at", null);
    const { error: insertInviteError } = await supabase
      .from("practice_team_invites")
      .insert({
        practice_id: session.practiceId,
        email,
        display_name: name,
        module_access: data.moduleAccess,
        invited_by: session.userId,
        token,
      });
    if (insertInviteError) throw new Error(insertInviteError.message);

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk"
    ).replace(/\/$/, "");
    const signupUrl = `${appUrl}/create-account?email=${encodeURIComponent(email)}&invite=${encodeURIComponent(token)}`;

    const { sendTransactionalEmail } = await import(
      "@/server/email/transactional"
    );
    await sendTransactionalEmail({
      to: email,
      subject: `${session.practiceName} invited you to HydraTax`,
      text: `${name}, you have been invited to join ${session.practiceName} on HydraTax.\n\nCreate your account with this email address:\n${signupUrl}\n\nAfter you sign up you will join the practice automatically. You can then turn on two-factor authentication from Account settings.`,
      html: `<p>Hi ${name},</p><p>You have been invited to join <strong>${session.practiceName}</strong> on HydraTax.</p><p><a href="${signupUrl}">Create your account</a> using <strong>${email}</strong>.</p><p>After you sign up you will join the practice automatically. You can then turn on two-factor authentication from Account settings.</p>`,
    });

    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: null,
      actorId: session.userId,
      action: "team.member_invited",
      entityType: "team_invite",
      entityId: token,
      detail: { email, moduleAccess: data.moduleAccess },
    });
    revalidatePath("/settings/team");
    revalidatePath("/settings/account");

    return {
      id: `invite:${token}`,
      practiceId: session.practiceId,
      email,
      name,
      role,
      moduleAccess: data.moduleAccess,
      active: true,
      createdAt: new Date().toISOString(),
    } satisfies MemoryTeamMember;
  }

  if (
    memoryStore.teamMembers.some(
      (m) =>
        m.practiceId === session.practiceId &&
        m.email.toLowerCase() === email &&
        m.active,
    )
  ) {
    throw new Error("A team member with this email already exists");
  }

  const member: MemoryTeamMember = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    email,
    name,
    role,
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
    detail: { email: member.email, moduleAccess: member.moduleAccess },
  });

  revalidatePath("/settings/team");
  revalidatePath("/settings/account");
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
  const role = moduleAccess === "full" ? "admin" : "practitioner";

  if (isSupabaseConfigured() && !isMemoryStore()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practice_members")
      .update({ module_access: moduleAccess, role })
      .eq("id", memberId)
      .eq("practice_id", session.practiceId)
      .select("id, email, display_name, role, module_access, created_at")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/settings/team");
    return toMember(session.practiceId, data);
  }

  const member = memoryStore.teamMembers.find(
    (m) => m.id === memberId && m.practiceId === session.practiceId,
  );
  if (!member) throw new Error("Team member not found");
  member.moduleAccess = moduleAccess;
  member.role = role;
  revalidatePath("/settings/team");
  return member;
}

export async function deactivateTeamMember(memberId: string) {
  const session = await requireSession();
  assertOwner(session);

  if (isSupabaseConfigured() && !isMemoryStore()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("practice_members")
      .delete()
      .eq("id", memberId)
      .eq("practice_id", session.practiceId)
      .neq("user_id", session.userId);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/team");
    return { ok: true as const };
  }

  const member = memoryStore.teamMembers.find(
    (m) => m.id === memberId && m.practiceId === session.practiceId,
  );
  if (!member) throw new Error("Team member not found");
  member.active = false;
  if (memoryStore.actingMemberId === memberId) {
    memoryStore.actingMemberId = null;
  }
  revalidatePath("/settings/team");
  return { ok: true as const };
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
