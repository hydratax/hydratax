"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/admin";
import { createClient, listClients } from "@/server/actions/clients";
import {
  PRESENTATION_DEMO_TAG,
  PRESENTATION_SEED_CLIENTS,
} from "@/server/demo/presentation-seed";

export type SeedPresentationResult = {
  ok: boolean;
  created: number;
  skipped: number;
  message: string;
  clientNames: string[];
};

/**
 * Load fictional clients into the signed-in practice for live demos.
 * Safe to re-run — skips names that already exist.
 */
export async function seedPresentationDemoClients(): Promise<SeedPresentationResult> {
  // Platform ops only (ADMIN_EMAIL) — not practice owners on Settings → Account.
  const session = await requireAdmin();
  const existing = await listClients().catch(() => []);
  const existingNames = new Set(
    existing.map((c) => c.name.trim().toLowerCase()),
  );

  let created = 0;
  let skipped = 0;
  const clientNames: string[] = [];

  for (const seed of PRESENTATION_SEED_CLIENTS) {
    if (existingNames.has(seed.name.trim().toLowerCase())) {
      skipped += 1;
      continue;
    }
    try {
      const client = await createClient({
        name: seed.name,
        type: seed.type,
        companyNumber: seed.companyNumber ?? "",
        utr: seed.utr ?? "",
        vrn: seed.vrn ?? "",
        nino: seed.nino ?? "",
        payeRef: seed.payeRef ?? "",
        accountsOfficeRef: seed.accountsOfficeRef ?? "",
        contactEmail: seed.contactEmail ?? "",
        contactPhone: seed.contactPhone ?? "",
        isEmployer: Boolean(seed.isEmployer),
        isVatRegistered: Boolean(seed.isVatRegistered),
        skipCompaniesHouse: true,
      });
      // Tag desk profile so we can spot demo rows later
      try {
        const { getClient } = await import("@/server/actions/clients");
        const row = await getClient(client.id);
        if (row) {
          const { isDemoMode, isSupabaseConfigured } = await import("@/lib/env");
          const nextProfile = {
            ...(row.deskProfile ?? {}),
            presentationDemo: PRESENTATION_DEMO_TAG,
            presentationPitch: seed.pitch,
          };
          if (isDemoMode()) {
            const { demoStore } = await import("@/server/demo/store");
            const mem = demoStore.clients.find((c) => c.id === client.id);
            if (mem) mem.deskProfile = nextProfile;
          } else if (isSupabaseConfigured()) {
            const { createClient: createSb } = await import(
              "@/lib/supabase/server"
            );
            const sb = await createSb();
            await sb
              .from("clients")
              .update({ desk_profile: nextProfile })
              .eq("id", client.id)
              .eq("practice_id", session.practiceId);
          }
        }
      } catch {
        /* tag optional */
      }
      created += 1;
      clientNames.push(seed.name);
      existingNames.add(seed.name.trim().toLowerCase());
    } catch (err) {
      skipped += 1;
      console.error(
        "[presentation-demo] seed failed",
        seed.name,
        err instanceof Error ? err.message : err,
      );
    }
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/filings");

  return {
    ok: true,
    created,
    skipped,
    clientNames,
    message:
      created > 0
        ? `Added ${created} presentation client${created === 1 ? "" : "s"} to your practice desk.`
        : skipped > 0
          ? "Presentation clients are already on this practice — nothing new to add."
          : "No clients were created.",
  };
}
