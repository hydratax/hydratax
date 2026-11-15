import { isStripeConfigured } from "@/lib/env";
import { appBaseUrl } from "@/server/stripe/connect";
import { getStripe } from "@/server/stripe/client";
import type { MemoryInvoice } from "@/server/demo/store";

/**
 * Destination Checkout Session: charge on the platform, transfer to the
 * practice's connected Stripe account (Standard Connect).
 */
export async function createClientInvoiceCheckoutSession(opts: {
  invoice: MemoryInvoice;
  connectedAccountId: string;
  customerEmail?: string | null;
  clientName?: string | null;
}) {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
  const inv = opts.invoice;
  if (inv.status === "paid" || inv.status === "void") {
    throw new Error("This invoice cannot be paid online.");
  }
  if (inv.totalPence <= 0) {
    throw new Error("Invoice total must be greater than zero.");
  }
  if (!inv.payToken) {
    throw new Error("Invoice is missing a pay link.");
  }

  const stripe = getStripe();
  const base = appBaseUrl();
  const description = [
    inv.invoiceNumber,
    opts.clientName ? `— ${opts.clientName}` : null,
    inv.subject ? `· ${inv.subject}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: opts.customerEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: inv.totalPence,
          product_data: {
            name: `Invoice ${inv.invoiceNumber}`,
            description: description.slice(0, 400) || undefined,
          },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: {
        destination: opts.connectedAccountId,
      },
      metadata: {
        kind: "client_invoice",
        invoiceId: inv.id,
        practiceId: inv.practiceId,
        invoiceNumber: inv.invoiceNumber,
      },
    },
    success_url: `${base}/pay/${inv.payToken}?paid=1`,
    cancel_url: `${base}/pay/${inv.payToken}?cancelled=1`,
    metadata: {
      kind: "client_invoice",
      invoiceId: inv.id,
      practiceId: inv.practiceId,
      invoiceNumber: inv.invoiceNumber,
      payToken: inv.payToken,
    },
  });

  return session;
}
