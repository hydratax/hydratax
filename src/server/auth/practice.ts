import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { practices, practiceMembers } from "@/server/db/schema";

export async function ensurePractice(clerkOrgId: string, name: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(practices)
    .where(eq(practices.clerkOrgId, clerkOrgId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(practices)
    .values({ clerkOrgId, name })
    .returning();

  return created;
}

export async function ensureMember(
  practiceId: string,
  clerkUserId: string,
  role: "owner" | "admin" | "practitioner" | "readonly" = "practitioner",
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(practiceMembers)
    .where(eq(practiceMembers.clerkUserId, clerkUserId))
    .limit(1);

  if (existing[0]?.practiceId === practiceId) return existing[0];

  const [created] = await db
    .insert(practiceMembers)
    .values({ practiceId, clerkUserId, role })
    .returning();

  return created;
}
