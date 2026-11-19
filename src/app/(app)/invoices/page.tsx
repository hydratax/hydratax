import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getInvoiceNumberSettings,
  listPracticeInvoices,
  listInvoiceLineTemplates,
} from "@/server/actions/invoices";
import { getPaymentGatewayStatus } from "@/server/actions/payment-gateways";
import { listClients } from "@/server/actions/clients";
import { requireModule } from "@/server/auth/session";
import { getPracticeLetterhead } from "@/server/actions/letterhead";
import { formatPracticePaymentInstructions } from "@/lib/desk-profile";
import { letterheadNeedsBranding } from "@/lib/invoices/totals";
import { clientSlugFor } from "@/lib/client-slug";
import { PracticeInvoiceDesk } from "@/components/forms/practice-invoice-desk";
import {
  InvoiceClientsList,
  type InvoiceClientListItem,
} from "@/components/invoice-clients-list";
import { deriveInvoiceClientSummary } from "@/lib/invoice-client-status";

export const metadata = {
  title: "Invoices — HydraTax",
};

/**
 * Practice-wide invoices desk — client cards with Due / Sent / Paid, then
 * the full workspace when a client is opened.
 */
export default async function PracticeInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  try {
    await requireModule("invoices");
  } catch {
    redirect("/dashboard");
  }

  const query = await searchParams;
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const clientOptions = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"))
    .map((c) => ({
      id: c.id,
      slug: clientSlugFor({ id: c.id, name: c.name }, peers),
      name: c.name,
      email: c.contactEmail ?? null,
      type: c.type,
    }));

  if (clientOptions.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <h1 className="display text-3xl text-ink">Invoices</h1>
        <p className="mt-2 text-ink-soft">
          Add a client first, then create invoices from this desk.
        </p>
        <Link href="/clients/new" className="btn btn-primary mt-6 text-sm">
          Add client
        </Link>
      </div>
    );
  }

  const selectedRef = query.client?.trim() || null;
  const selected = selectedRef
    ? clientOptions.find(
        (c) => c.slug === selectedRef || c.id === selectedRef,
      )
    : null;

  const [invoices, templates, letterhead, gateways, numberSettings] =
    await Promise.all([
      listPracticeInvoices(),
      listInvoiceLineTemplates(),
      getPracticeLetterhead(),
      getPaymentGatewayStatus(),
      getInvoiceNumberSettings(),
    ]);

  const previewInvoiceNumber = `${numberSettings.prefix}-${String(numberSettings.next).padStart(4, "0")}`;

  const byClient = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = byClient.get(inv.clientId) ?? [];
    list.push(inv);
    byClient.set(inv.clientId, list);
  }

  const invoiceCards: InvoiceClientListItem[] = clientOptions.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    type: c.type,
    invoices: deriveInvoiceClientSummary(
      (byClient.get(c.id) ?? []).map((inv) => ({
        status: inv.status,
        dueDate: inv.dueDate,
        totalPence: inv.totalPence,
      })),
    ),
  }));

  if (!selected) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
            Invoices
          </h1>
          <p className="mt-1 text-ink-soft">
            Due, sent and paid across the practice. Branding from{" "}
            <Link
              href="/settings/letterhead"
              className="font-semibold text-sea hover:underline"
            >
              Practice branding
            </Link>
            .
          </p>
        </div>
        <InvoiceClientsList clients={invoiceCards} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        <Link
          href="/invoices"
          className="font-semibold text-sea hover:underline"
        >
          ← All invoice clients
        </Link>
        {" · "}
        branding from{" "}
        <Link
          href="/settings/letterhead"
          className="font-semibold text-sea hover:underline"
        >
          Practice branding
        </Link>
      </p>
      <PracticeInvoiceDesk
        clients={clientOptions}
        selectedClientId={selected.id}
        workspace={{
          clientId: selected.id,
          clientName: selected.name,
          clientEmail: selected.email,
          invoices,
          templates,
          defaultPaymentInstructions:
            formatPracticePaymentInstructions(letterhead),
          brandingIncomplete: letterheadNeedsBranding(letterhead),
          stripeConnected: Boolean(gateways.stripe.accountId),
          previewInvoiceNumber,
        }}
      />
    </div>
  );
}
