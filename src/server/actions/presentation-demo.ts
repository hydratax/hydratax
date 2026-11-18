"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/admin";
import {
  createClient,
  listClientsIncludingHidden,
} from "@/server/actions/clients";
import {
  PRESENTATION_DEMO_TAG,
  PRESENTATION_SEED_CLIENTS,
} from "@/server/demo/presentation-seed";
import {
  enterPresentationDemoMode,
  exitPresentationDemoMode,
} from "@/server/demo/presentation-mode";

export type SeedPresentationResult = {
  ok: boolean;
  created: number;
  skipped: number;
  message: string;
  clientNames: string[];
};

async function tagExistingPresentationClient(
  clientId: string,
  practiceId: string,
  pitch: string,
): Promise<void> {
  const { isDemoMode, isSupabaseConfigured } = await import("@/lib/env");
  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    const mem = demoStore.clients.find((c) => c.id === clientId);
    if (mem) {
      mem.deskProfile = {
        ...(mem.deskProfile ?? {}),
        presentationDemo: PRESENTATION_DEMO_TAG,
        presentationPitch: pitch,
      };
    }
    return;
  }
  if (!isSupabaseConfigured()) return;
  const { createClient: createSb } = await import("@/lib/supabase/server");
  const sb = await createSb();
  const { data: row } = await sb
    .from("clients")
    .select("desk_profile")
    .eq("id", clientId)
    .eq("practice_id", practiceId)
    .maybeSingle();
  const prev =
    row && typeof row.desk_profile === "object" && row.desk_profile
      ? (row.desk_profile as Record<string, unknown>)
      : {};
  await sb
    .from("clients")
    .update({
      desk_profile: {
        ...prev,
        presentationDemo: PRESENTATION_DEMO_TAG,
        presentationPitch: pitch,
      },
    })
    .eq("id", clientId)
    .eq("practice_id", practiceId);
}

/** Cookie + revalidate only — used if full seed is slow. */
export async function enterPresentationDemoQuick(): Promise<{ ok: true }> {
  await requireAdmin();
  await enterPresentationDemoMode();
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  return { ok: true };
}

/**
 * Load fictional clients into the signed-in practice for live demos.
 * Enters demo mode first so the desk can open even if enrich is slow.
 */
export async function seedPresentationDemoClients(): Promise<SeedPresentationResult> {
  const session = await requireAdmin();

  // Enter mode immediately — desk isolation must not wait on enrich.
  await enterPresentationDemoMode();

  const existing = await listClientsIncludingHidden().catch(() => []);
  const byName = new Map(
    existing.map((c) => [c.name.trim().toLowerCase(), c] as const),
  );

  let created = 0;
  let skipped = 0;
  const clientNames: string[] = [];

  for (const seed of PRESENTATION_SEED_CLIENTS) {
    const key = seed.name.trim().toLowerCase();
    const already = byName.get(key);
    if (already) {
      if (already.deskProfile?.presentationDemo !== PRESENTATION_DEMO_TAG) {
        await tagExistingPresentationClient(
          already.id,
          session.practiceId,
          seed.pitch,
        ).catch(() => null);
      }
      skipped += 1;
      clientNames.push(seed.name);
      continue;
    }
    try {
      await createClient({
        name: seed.name,
        type: seed.type,
        companyNumber: seed.companyNumber ?? "",
        utr: seed.utr ?? "",
        vrn: seed.vrn?.replace(/^GB/i, "") ?? "",
        nino: seed.nino ?? "",
        payeRef: seed.payeRef ?? "",
        accountsOfficeRef: seed.accountsOfficeRef ?? "",
        companyAuthCode: seed.companyAuthCode ?? "",
        contactEmail: seed.contactEmail ?? "",
        contactPhone: seed.contactPhone ?? "",
        address: seed.address ?? "14 Meridian Way, London, E1 6AN",
        vatRegistrationDate: seed.isVatRegistered ? "2020-04-01" : undefined,
        isEmployer: Boolean(seed.isEmployer),
        isVatRegistered: Boolean(seed.isVatRegistered),
        skipCompaniesHouse: true,
        bypassClientCap: true,
        presentationDemo: PRESENTATION_DEMO_TAG,
        presentationPitch: seed.pitch,
      });
      created += 1;
      clientNames.push(seed.name);
    } catch (err) {
      skipped += 1;
      console.error(
        "[presentation-demo] seed failed",
        seed.name,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const { enrichPresentationDemoFast } = await import(
    "@/server/actions/presentation-rich-demo"
  );

  // Cap enrich so the action cannot hang the sales-demo page indefinitely.
  await Promise.race([
    enrichPresentationDemoFast().catch((err) => {
      console.error(
        "[presentation-demo] enrich failed",
        err instanceof Error ? err.message : err,
      );
      return { enriched: 0, skipped: 0 };
    }),
    new Promise<{ enriched: number; skipped: number }>((resolve) =>
      setTimeout(() => resolve({ enriched: 0, skipped: 0 }), 9000),
    ),
  ]);

  revalidatePath("/", "layout");
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/filings");
  revalidatePath("/sales-demo");

  return {
    ok: true,
    created,
    skipped,
    clientNames,
    message:
      created > 0
        ? `Demo ready — ${created} new presentation client${created === 1 ? "" : "s"} (real practice hidden).`
        : clientNames.length > 0
          ? "Demo ready — presentation clients only (real practice hidden)."
          : "Demo mode on.",
  };
}

/**
 * Leave sales demo — real practice clients only.
 * Presentation clients stay stored but are hidden from every desk list
 * until Sales demo is opened again.
 */
export async function exitPresentationDemo(): Promise<void> {
  await requireAdmin();
  await exitPresentationDemoMode();
  revalidatePath("/", "layout");
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/filings");
  redirect("/dashboard");
}
