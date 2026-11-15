import { NextResponse } from "next/server";
import {
  clientIpFromHeaders,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { isStripeConfigured, isSupabaseConfigured } from "@/lib/env";
import { getInvoiceByPayToken } from "@/server/actions/invoices";
import { getPracticeConnectAccountId } from "@/server/actions/payment-gateways";
import { createClientInvoiceCheckoutSession } from "@/server/stripe/client-invoice-checkout";
import { memoryStore } from "@/server/demo/store";

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function lookupClientContact(clientId: string): Promise<{
  name: string | null;
  email: string | null;
}> {
  const mem = memoryStore.clients.find((c) => c.id === clientId);
  if (mem) {
    return { name: mem.name, email: mem.contactEmail ?? null };
  }
  if (isSupabaseConfigured()) {
    try {
      const { getBillingWriteClient } = await import(
        "@/server/billing/admin-client"
      );
      const supabase = await getBillingWriteClient();
      if (supabase) {
        const { data } = await supabase
          .from("clients")
          .select("name, contact_email")
          .eq("id", clientId)
          .maybeSingle();
        if (data) {
          return {
            name: (data.name as string) ?? null,
            email: (data.contact_email as string | null) ?? null,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { name: null, email: null };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Online card payments are not configured." },
      { status: 503, headers: NO_STORE },
    );
  }

  const limited = rateLimit({
    key: `invoice-pay:${clientIpFromHeaders(_req.headers)}`,
    limit: 30,
    windowMs: 10 * 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please wait and try again." },
      { status: 429, headers: { ...NO_STORE, ...rateLimitHeaders(limited) } },
    );
  }

  const { token } = await ctx.params;
  const invoice = await getInvoiceByPayToken(token);
  if (!invoice) {
    return NextResponse.json(
      { error: "Invoice not found." },
      { status: 404, headers: NO_STORE },
    );
  }
  if (!invoice.enableOnlinePay) {
    return NextResponse.json(
      { error: "Online payment is not enabled for this invoice." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (invoice.status === "paid") {
    return NextResponse.json(
      { error: "This invoice is already paid." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (invoice.status === "void" || invoice.status === "draft") {
    return NextResponse.json(
      { error: "This invoice is not open for payment." },
      { status: 400, headers: NO_STORE },
    );
  }

  const connectedAccountId = await getPracticeConnectAccountId(
    invoice.practiceId,
  );
  if (!connectedAccountId) {
    return NextResponse.json(
      {
        error:
          "The practice has not finished connecting Stripe for online payments.",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const contact = await lookupClientContact(invoice.clientId);

  try {
    const session = await createClientInvoiceCheckoutSession({
      invoice,
      connectedAccountId,
      customerEmail: contact.email,
      clientName: contact.name,
    });
    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start checkout." },
        { status: 500, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { url: session.url },
      { status: 200, headers: NO_STORE },
    );
  } catch (err) {
    console.error(
      "[invoice pay]",
      err instanceof Error ? err.message : "checkout failed",
    );
    return NextResponse.json(
      { error: "Could not start checkout. Try again later." },
      { status: 500, headers: NO_STORE },
    );
  }
}
