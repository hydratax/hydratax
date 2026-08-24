import { notFound, redirect } from "next/navigation";
import { getInvoice } from "@/server/actions/invoices";
import { requireModule } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { money } from "@/lib/format";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  try {
    await requireModule("invoices");
  } catch {
    redirect("/clients");
  }

  const { id: ref, invoiceId } = await params;
  const { client, clientId } = await loadClientPage(ref, "invoices");

  let invoice;
  try {
    invoice = await getInvoice(invoiceId);
  } catch {
    notFound();
  }

  if (invoice.clientId !== clientId) notFound();

  return (
    <div className="mx-auto max-w-3xl bg-white px-6 py-10 text-ink print:max-w-none print:px-0 print:py-0">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Invoice
          </p>
          <h1 className="display mt-1 text-3xl">{invoice.invoiceNumber}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Status: {invoice.status}
            {invoice.reference ? ` · Ref ${invoice.reference}` : ""}
          </p>
        </div>
        <p className="text-sm text-ink-soft print:hidden">
          Use your browser Print dialog (Ctrl/Cmd+P) to save as PDF.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Bill to
          </h2>
          <p className="mt-1 font-semibold">{client.name}</p>
          {client.contactEmail ? (
            <p className="text-sm text-ink-soft">{client.contactEmail}</p>
          ) : null}
          {client.contactPhone ? (
            <p className="text-sm text-ink-soft">{client.contactPhone}</p>
          ) : null}
          {client.companyNumber ? (
            <p className="text-sm text-ink-soft">
              Company no. {client.companyNumber}
            </p>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="text-sm">
            <span className="text-ink-soft">Issue date:</span>{" "}
            {invoice.issueDate}
          </p>
          <p className="text-sm">
            <span className="text-ink-soft">Due date:</span> {invoice.dueDate}
          </p>
        </div>
      </div>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Unit</th>
            <th className="py-2 text-right font-semibold">VAT</th>
            <th className="py-2 text-right font-semibold">Net</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, i) => (
            <tr key={i} className="border-b border-line/70">
              <td className="py-2 pr-3">{line.description}</td>
              <td className="py-2">{line.quantity}</td>
              <td className="mono py-2 text-right">
                {money(line.unitPricePence)}
              </td>
              <td className="py-2 text-right">
                {(line.vatRateBps / 100).toFixed(0)}%
              </td>
              <td className="mono py-2 text-right">
                {money(line.lineNetPence)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-6 max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-soft">Net</span>
          <span className="mono">{money(invoice.subtotalPence)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">VAT</span>
          <span className="mono">{money(invoice.vatPence)}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="mono">{money(invoice.totalPence)}</span>
        </div>
      </div>

      {invoice.notes ? (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Notes
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{invoice.notes}</p>
        </section>
      ) : null}

      {invoice.paymentInstructions ? (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Payment instructions
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {invoice.paymentInstructions}
          </p>
        </section>
      ) : null}
    </div>
  );
}
