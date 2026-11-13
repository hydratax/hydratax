import { AddClientChooser } from "@/components/forms/add-client-chooser";
import { listClients } from "@/server/actions/clients";
import { clientSlugFor } from "@/lib/client-slug";
import { requireSession } from "@/server/auth/session";
import { basePlanKey } from "@/lib/pricing";
import { isSupabaseConfigured, isMemoryStore } from "@/lib/env";

type Props = {
  searchParams: Promise<{ desk?: string }>;
};

async function practicePlanIsSolo(practiceId: string): Promise<boolean> {
  const looksSolo = (planKey: string | null | undefined) => {
    if (!planKey) return false;
    const k = basePlanKey(planKey).toLowerCase();
    return k === "practice:solo" || k.endsWith(":solo");
  };

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practice_subscriptions")
        .select("plan_key, status")
        .eq("practice_id", practiceId)
        .in("status", ["active", "trialing", "canceling"])
        .order("created_at", { ascending: false })
        .limit(5);
      for (const row of data ?? []) {
        if (looksSolo(row.plan_key as string | null)) return true;
      }
    } catch {
      /* ignore */
    }
  }

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    return memoryStore.subscriptions.some(
      (s) =>
        s.practiceId === practiceId &&
        (s.status === "active" ||
          s.status === "trialing" ||
          s.status === "canceling") &&
        looksSolo(s.planKey),
    );
  }

  return false;
}

export default async function NewClientPage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const desk =
    sp.desk === "vat" || sp.desk === "payroll" ? sp.desk : ("all" as const);

  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const companies = clients
    .filter((c) => c.type === "limited_company")
    .map((c) => ({
      id: c.id,
      slug: clientSlugFor(c, peers),
      name: c.name,
      companyNumber: c.companyNumber,
      vrn: c.vrn,
      payeRef: c.payeRef,
      isVatRegistered: c.isVatRegistered,
      isEmployer: c.isEmployer,
      contactEmail: c.contactEmail ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  const solo = await practicePlanIsSolo(session.practiceId);
  // Solo desks and empty practices go straight to the new-client form.
  const skipChooser = solo || companies.length === 0;

  const title =
    desk === "vat"
      ? "Add VAT client"
      : desk === "payroll"
        ? "Add PAYE client"
        : "Add client";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="display text-4xl text-ink">{title}</h1>
        <p className="mt-1 text-ink-soft">
          {skipChooser
            ? "Enter the client details below to open their desk."
            : "Pick a company already on your practice, or open the new client form."}
        </p>
      </div>
      <AddClientChooser
        companies={companies}
        desk={desk}
        defaultContactEmail={session.email}
        skipChooser={skipChooser}
      />
    </div>
  );
}
