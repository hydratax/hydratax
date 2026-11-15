import Link from "next/link";
import { AddClientChooser } from "@/components/forms/add-client-chooser";
import { listClients } from "@/server/actions/clients";
import { getPracticeEntitlements } from "@/server/actions/account";
import { clientSlugFor } from "@/lib/client-slug";
import { requireSession } from "@/server/auth/session";
import { basePlanKey } from "@/lib/pricing";
import { isSupabaseConfigured, isMemoryStore } from "@/lib/env";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

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

  const [clients, entitlements] = await Promise.all([
    listClients(),
    getPracticeEntitlements().catch(() => null),
  ]);
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
  const maxClients = entitlements?.maxClients ?? null;
  const atClientCap =
    maxClients != null && clients.length >= maxClients;

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
          {atClientCap
            ? "Your current plan is at its client limit."
            : skipChooser
              ? "Enter the client details below to open their desk."
              : "Pick a company already on your practice, or open the new client form."}
        </p>
      </div>
      {atClientCap ? (
        <div className="space-y-4">
          <FormErrorBanner
            error={`Your plan allows ${maxClients} client${maxClients === 1 ? "" : "s"}. Upgrade on Pricing to add more clients.`}
            title="Plan limit reached"
          >
            <p className="mt-2 text-sm">
              <Link
                href="/pricing"
                className="font-semibold text-sea underline hover:no-underline"
              >
                View pricing plans
              </Link>{" "}
              to upgrade and add more clients.
            </p>
          </FormErrorBanner>
          <Link href="/pricing" className="btn btn-primary inline-flex">
            Upgrade plan
          </Link>
        </div>
      ) : (
        <AddClientChooser
          companies={companies}
          desk={desk}
          defaultContactEmail={session.email}
          skipChooser={skipChooser}
        />
      )}
    </div>
  );
}
