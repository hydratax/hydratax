"use server";

import { revalidatePath } from "next/cache";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { memoryStore } from "@/server/demo/store";
import { isStripeConnectConfigured } from "@/server/stripe/connect";

export type PracticeStripeConnect = {
  accountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  connectedAt: string | null;
};

export type PaymentGatewayStatus = {
  connectConfigured: boolean;
  stripe: PracticeStripeConnect;
  /** Inactive placeholders for UK desk UX parity */
  placeholders: Array<{
    id: "direct_debit" | "paypal" | "ideal" | "bancontact" | "alipay";
    label: string;
    status: "inactive";
  }>;
};

function emptyConnect(): PracticeStripeConnect {
  return {
    accountId: null,
    chargesEnabled: false,
    detailsSubmitted: false,
    connectedAt: null,
  };
}

export async function getPaymentGatewayStatus(): Promise<PaymentGatewayStatus> {
  const session = await requireSession();
  const placeholders: PaymentGatewayStatus["placeholders"] = [
    { id: "direct_debit", label: "Direct Debit", status: "inactive" },
    { id: "paypal", label: "PayPal", status: "inactive" },
    { id: "ideal", label: "iDEAL", status: "inactive" },
    { id: "bancontact", label: "Bancontact", status: "inactive" },
    { id: "alipay", label: "Alipay", status: "inactive" },
  ];

  let stripe = emptyConnect();

  if (isMemoryStore()) {
    memoryStore.stripeConnect ??= {};
    const stored = memoryStore.stripeConnect[session.practiceId];
    if (stored) stripe = { ...stored };
  } else if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practices")
        .select(
          "stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_details_submitted, stripe_connect_connected_at",
        )
        .eq("id", session.practiceId)
        .maybeSingle();
      if (data) {
        stripe = {
          accountId: (data.stripe_connect_account_id as string | null) ?? null,
          chargesEnabled: Boolean(data.stripe_connect_charges_enabled),
          detailsSubmitted: Boolean(data.stripe_connect_details_submitted),
          connectedAt:
            (data.stripe_connect_connected_at as string | null) ?? null,
        };
      }
    } catch {
      /* empty */
    }
  }

  return {
    connectConfigured: isStripeConnectConfigured(),
    stripe,
    placeholders,
  };
}

export async function savePracticeStripeConnect(input: {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}): Promise<void> {
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "admin") {
    throw new Error("Only practice owners or admins can connect Stripe.");
  }

  const connectedAt = new Date().toISOString();
  const row: PracticeStripeConnect = {
    accountId: input.accountId,
    chargesEnabled: input.chargesEnabled,
    detailsSubmitted: input.detailsSubmitted,
    connectedAt,
  };

  if (isMemoryStore()) {
    memoryStore.stripeConnect ??= {};
    memoryStore.stripeConnect[session.practiceId] = row;
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practices")
        .update({
          stripe_connect_account_id: input.accountId,
          stripe_connect_charges_enabled: input.chargesEnabled,
          stripe_connect_details_submitted: input.detailsSubmitted,
          stripe_connect_connected_at: connectedAt,
        })
        .eq("id", session.practiceId);
    } catch {
      memoryStore.stripeConnect ??= {};
      memoryStore.stripeConnect[session.practiceId] = row;
    }
  }

  revalidatePath("/settings/payments");
  revalidatePath("/clients");
}

export async function disconnectPracticeStripeConnect(): Promise<{
  ok: true;
}> {
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "admin") {
    throw new Error("Only practice owners or admins can disconnect Stripe.");
  }

  if (isMemoryStore()) {
    memoryStore.stripeConnect ??= {};
    delete memoryStore.stripeConnect[session.practiceId];
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practices")
        .update({
          stripe_connect_account_id: null,
          stripe_connect_charges_enabled: false,
          stripe_connect_details_submitted: false,
          stripe_connect_connected_at: null,
        })
        .eq("id", session.practiceId);
    } catch {
      /* memory */
    }
  }

  revalidatePath("/settings/payments");
  return { ok: true };
}

/** Practice Connect account id when charges are enabled (for invoice pay). */
export async function getPracticeConnectAccountId(
  practiceId: string,
): Promise<string | null> {
  if (isMemoryStore()) {
    const row = memoryStore.stripeConnect?.[practiceId];
    if (row?.accountId && row.chargesEnabled) return row.accountId;
    // Dev: allow pay when connected even before charges_enabled flag refreshes
    if (row?.accountId) return row.accountId;
    return null;
  }
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practices")
        .select(
          "stripe_connect_account_id, stripe_connect_charges_enabled",
        )
        .eq("id", practiceId)
        .maybeSingle();
      const id = (data?.stripe_connect_account_id as string | null) ?? null;
      if (!id) return null;
      if (data?.stripe_connect_charges_enabled) return id;
      return id;
    } catch {
      return null;
    }
  }
  return null;
}
