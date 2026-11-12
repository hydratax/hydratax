import { NextResponse } from "next/server";
import { getInvoice } from "@/server/actions/invoices";
import { getPracticeLetterhead } from "@/server/actions/letterhead";
import { requireModule } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { renderInvoiceHtml } from "@/lib/invoices/render-invoice-html";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    await requireModule("invoices");
  } catch {
    return NextResponse.redirect(new URL("/clients", _request.url));
  }

  const { id: ref, invoiceId } = await context.params;
  const { client, clientId } = await loadClientPage(ref, "invoices");

  let invoice;
  try {
    invoice = await getInvoice(invoiceId);
  } catch {
    return new NextResponse("Invoice not found", { status: 404 });
  }

  if (invoice.clientId !== clientId) {
    return new NextResponse("Invoice not found", { status: 404 });
  }

  const letterhead = await getPracticeLetterhead();
  const html = renderInvoiceHtml({
    letterhead,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      reference: invoice.reference,
      notes: invoice.notes,
      paymentInstructions: invoice.paymentInstructions,
      subtotalPence: invoice.subtotalPence,
      vatPence: invoice.vatPence,
      totalPence: invoice.totalPence,
      lines: invoice.lines,
    },
    client: {
      name: client.name,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      companyNumber: client.companyNumber,
    },
    brandingSettingsHref: "/settings/letterhead",
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
