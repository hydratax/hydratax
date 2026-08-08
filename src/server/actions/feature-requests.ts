"use server";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isMemoryStore } from "@/lib/env";
import { memoryStore, type MemoryFeatureRequest } from "@/server/demo/store";
import { getSupabaseSessionUser } from "@/server/actions/auth";

const VOTER_COOKIE = "ht_voter";

const createSchema = z.object({
  title: z.string().trim().min(8).max(120),
  body: z.string().trim().min(20).max(1200),
  authorName: z.string().trim().min(2).max(80),
  authorEmail: z
    .string()
    .trim()
    .email()
    .max(160)
    .optional()
    .or(z.literal("")),
});

export type FeatureRequestStatus =
  | "open"
  | "planned"
  | "shipping"
  | "shipped";

export type FeatureRequestRow = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  status: FeatureRequestStatus;
  voteCount: number;
  createdAt: string;
  votedByMe: boolean;
};

function ensureMemoryFeatureTables() {
  if (!Array.isArray(memoryStore.featureRequests)) {
    memoryStore.featureRequests = [];
  }
  if (!Array.isArray(memoryStore.featureVotes)) {
    memoryStore.featureVotes = [];
  }
}

async function getVoterKey(mode: "read" | "write"): Promise<string> {
  const user = await getSupabaseSessionUser();
  if (user?.id) return `user:${user.id}`;

  const jar = await cookies();
  const existing = jar.get(VOTER_COOKIE)?.value;
  if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
    return `anon:${existing}`;
  }

  if (mode === "read") {
    return "anon:unset";
  }

  const id = randomUUID().replace(/-/g, "").slice(0, 24);
  jar.set(VOTER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return `anon:${id}`;
}

function toRow(
  r: MemoryFeatureRequest,
  votedIds: Set<string>,
): FeatureRequestRow {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    status: r.status,
    voteCount: r.voteCount,
    createdAt: r.createdAt,
    votedByMe: votedIds.has(r.id),
  };
}

export async function listFeatureRequests(): Promise<FeatureRequestRow[]> {
  const voterKey = await getVoterKey("read");

  if (isMemoryStore()) {
    ensureMemoryFeatureTables();
    const voted = new Set(
      memoryStore.featureVotes
        .filter((v) => v.voterKey === voterKey)
        .map((v) => v.requestId),
    );
    return [...memoryStore.featureRequests]
      .sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .map((r) => toRow(r, voted));
  }

  const { getDb } = await import("@/server/db");
  const { featureRequests, featureVotes } = await import(
    "@/server/db/schema"
  );
  const { desc, eq } = await import("drizzle-orm");

  const rows = await getDb()
    .select()
    .from(featureRequests)
    .orderBy(desc(featureRequests.voteCount), desc(featureRequests.createdAt));

  const myVotes = await getDb()
    .select({ requestId: featureVotes.requestId })
    .from(featureVotes)
    .where(eq(featureVotes.voterKey, voterKey));

  const voted = new Set(myVotes.map((v) => v.requestId));

  return rows.map((r) =>
    toRow(
      {
        id: r.id,
        title: r.title,
        body: r.body,
        authorName: r.authorName,
        authorEmail: r.authorEmail,
        authorUserId: r.authorUserId,
        status: r.status as FeatureRequestStatus,
        voteCount: r.voteCount,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      },
      voted,
    ),
  );
}

export async function createFeatureRequest(input: {
  title: string;
  body: string;
  authorName: string;
  authorEmail?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please add a clear title and a short description.",
    };
  }

  const voterKey = await getVoterKey("write");
  const user = await getSupabaseSessionUser();
  const now = new Date().toISOString();
  const id = randomUUID();
  const data = parsed.data;

  if (isMemoryStore()) {
    ensureMemoryFeatureTables();
    const today = now.slice(0, 10);
    const byNameToday = memoryStore.featureRequests.filter(
      (r) =>
        r.createdAt.startsWith(today) &&
        r.authorName.toLowerCase() === data.authorName.toLowerCase(),
    ).length;
    if (byNameToday >= 5) {
      return { ok: false, error: "Daily request limit reached — try again tomorrow." };
    }

    memoryStore.featureRequests.unshift({
      id,
      title: data.title,
      body: data.body,
      authorName: data.authorName,
      authorEmail: data.authorEmail || null,
      authorUserId: user?.id ?? null,
      status: "open",
      voteCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    memoryStore.featureVotes.push({
      id: randomUUID(),
      requestId: id,
      voterKey,
      createdAt: now,
    });
    revalidatePath("/feature-requests");
    revalidatePath("/");
    return { ok: true, id };
  }

  try {
    const { getDb } = await import("@/server/db");
    const { featureRequests, featureVotes } = await import(
      "@/server/db/schema"
    );
    await getDb().insert(featureRequests).values({
      id,
      title: data.title,
      body: data.body,
      authorName: data.authorName,
      authorEmail: data.authorEmail || null,
      authorUserId: user?.id ?? null,
      status: "open",
      voteCount: 1,
    });
    await getDb().insert(featureVotes).values({
      requestId: id,
      voterKey,
    });
  } catch {
    return {
      ok: false,
      error:
        "Could not save your request. If this persists, run the feature_requests migration in Supabase.",
    };
  }

  revalidatePath("/feature-requests");
  revalidatePath("/");
  return { ok: true, id };
}

export async function toggleFeatureVote(
  requestId: string,
): Promise<
  | { ok: true; voteCount: number; votedByMe: boolean }
  | { ok: false; error: string }
> {
  if (!z.string().uuid().safeParse(requestId).success && !requestId.startsWith("fr-")) {
    return { ok: false, error: "Invalid request." };
  }

  const voterKey = await getVoterKey("write");

  if (isMemoryStore()) {
    ensureMemoryFeatureTables();
    const req = memoryStore.featureRequests.find((r) => r.id === requestId);
    if (!req) return { ok: false, error: "Request not found." };

    const existing = memoryStore.featureVotes.find(
      (v) => v.requestId === requestId && v.voterKey === voterKey,
    );

    if (existing) {
      memoryStore.featureVotes = memoryStore.featureVotes.filter(
        (v) => v.id !== existing.id,
      );
      req.voteCount = Math.max(0, req.voteCount - 1);
      req.updatedAt = new Date().toISOString();
      revalidatePath("/feature-requests");
      return { ok: true, voteCount: req.voteCount, votedByMe: false };
    }

    memoryStore.featureVotes.push({
      id: randomUUID(),
      requestId,
      voterKey,
      createdAt: new Date().toISOString(),
    });
    req.voteCount += 1;
    req.updatedAt = new Date().toISOString();
    revalidatePath("/feature-requests");
    return { ok: true, voteCount: req.voteCount, votedByMe: true };
  }

  try {
    const { getDb } = await import("@/server/db");
    const { featureRequests, featureVotes } = await import(
      "@/server/db/schema"
    );
    const { and, eq, sql } = await import("drizzle-orm");

    const [existing] = await getDb()
      .select()
      .from(featureVotes)
      .where(
        and(
          eq(featureVotes.requestId, requestId),
          eq(featureVotes.voterKey, voterKey),
        ),
      )
      .limit(1);

    if (existing) {
      await getDb().delete(featureVotes).where(eq(featureVotes.id, existing.id));
      await getDb()
        .update(featureRequests)
        .set({
          voteCount: sql`greatest(${featureRequests.voteCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(featureRequests.id, requestId));
    } else {
      await getDb().insert(featureVotes).values({ requestId, voterKey });
      await getDb()
        .update(featureRequests)
        .set({
          voteCount: sql`${featureRequests.voteCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(featureRequests.id, requestId));
    }

    const [row] = await getDb()
      .select({ voteCount: featureRequests.voteCount })
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId))
      .limit(1);

    revalidatePath("/feature-requests");
    return {
      ok: true,
      voteCount: row?.voteCount ?? 0,
      votedByMe: !existing,
    };
  } catch {
    return {
      ok: false,
      error: "Could not record your vote. Try again in a moment.",
    };
  }
}
