import Link from "next/link";
import { money } from "@/lib/format";
import { getInvoiceByPayToken } from "@/server/actions/invoices";
import { PayInvoiceButton } from "@/components/forms/pay-invoice-button";

export const metadata = { title: "Pay invoice — HydraTax" };

export default async function PublicPayInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; cancelled?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const invoice = await getInvoiceByPayToken(token);

  if (!invoice) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="display text-3xl text-ink">Invoice not found</h1>
        <p className="mt-3 text-ink-soft">
          This payment link is invalid or has expired. Ask your accountant for
          a new link.
        </p>
      </main>
    );
  }

  const canPay =
    invoice.enableOnlinePay &&
    invoice.status !== "paid" &&
    invoice.status !== "void" &&
    invoice.status !== "draft" &&
    invoice.totalPence > 0;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        HydraTax
      </p>
      <h1 className="display mt-2 text-4xl text-ink">
        Invoice {invoice.invoiceNumber}
      </h1>
      {invoice.subject ? (
        <p className="mt-2 text-ink-soft">{invoice.subject}</p>
      ) : null}

      {query.paid === "1" || invoice.status === "paid" ? (
        <div className="panel mt-8 border-ok/30 bg-ok/5 p-5">
          <p className="font-semibold text-ink">Payment received</p>
          <p className="mt-1 text-sm text-ink-soft">
            Thank you. This invoice is marked paid.
          </p>
        </div>
      ) : null}

      {query.cancelled === "1" && invoice.status !== "paid" ? (
        <p className="mt-6 text-sm text-ink-soft">
          Checkout was cancelled. You can try again when ready.
        </p>
      ) : null}

      <div className="panel mt-8 space-y-3 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-soft">Issue date</dt>
            <dd className="font-semibold text-ink">{invoice.issueDate}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Due date</dt>
            <dd className="font-semibold text-ink">{invoice.dueDate}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Status</dt>
            <dd className="font-semibold capitalize text-ink">{invoice.status}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Amount due</dt>
            <dd className="display text-2xl text-ink">
              {money(invoice.totalPence)}
            </dd>
          </div>
        </dl>

        <ul className="divide-y divide-line border-t border-line pt-3 text-sm">
          {invoice.lines.map((line, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="text-ink">
                {line.description}
                <span className="text-ink-soft">
                  {" "}
                  × {line.quantity}
                </span>
              </span>
              <span className="mono font-semibold">
                {money(line.lineNetPence + line.lineVatPence)}
              </span>
            </li>
          ))}
        </ul>

        {canPay ? (
          <PayInvoiceButton token={token} amountPence={invoice.totalPence} />
        ) : invoice.status !== "paid" ? (
          <p className="text-sm text-ink-soft">
            Online card payment is not available for this invoice. Please use
            the bank details on the invoice PDF or contact your accountant.
          </p>
        ) : null}
      </div>

      <p className="mt-8 text-center text-xs text-ink-soft">
        Secure card payments powered by Stripe ·{" "}
        <Link href="/" className="text-sea hover:underline">
          HydraTax
        </Link>
      </p>
    </main>
  );
}
