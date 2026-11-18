"use client";

import { useRouter } from "next/navigation";
import { InvoiceWorkspace } from "@/components/forms/invoice-workspace";
import type {
  MemoryInvoice,
  MemoryInvoiceLineTemplate,
} from "@/server/demo/store";

export type PracticeInvoiceClient = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  type: string;
};

type WorkspaceBundle = {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  invoices: MemoryInvoice[];
  templates: MemoryInvoiceLineTemplate[];
  defaultPaymentInstructions: string;
  brandingIncomplete: boolean;
  stripeConnected: boolean;
  previewInvoiceNumber: string;
};

/**
 * Thin wrapper so the practice desk can switch bill-to client via URL
 * while reusing the full client InvoiceWorkspace (create, list, email, PDF).
 */
export function PracticeInvoiceDesk({
  clients,
  workspace,
}: {
  clients: PracticeInvoiceClient[];
  selectedClientId?: string;
  workspace: WorkspaceBundle;
}) {
  const router = useRouter();

  return (
    <InvoiceWorkspace
      key={workspace.clientId}
      clientId={workspace.clientId}
      clientSlug={
        clients.find((c) => c.id === workspace.clientId)?.slug ?? null
      }
      clientName={workspace.clientName}
      clientEmail={workspace.clientEmail}
      invoices={workspace.invoices}
      templates={workspace.templates}
      defaultPaymentInstructions={workspace.defaultPaymentInstructions}
      brandingIncomplete={workspace.brandingIncomplete}
      stripeConnected={workspace.stripeConnected}
      previewInvoiceNumber={workspace.previewInvoiceNumber}
      practiceWide
      clientChoices={clients}
      onClientChange={(slug) => {
        router.push(`/invoices?client=${encodeURIComponent(slug)}`);
      }}
    />
  );
}
