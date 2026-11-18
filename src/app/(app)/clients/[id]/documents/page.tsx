import Link from "next/link";
import { listClientDocuments } from "@/server/actions/documents";
import { DocumentUploadForm } from "@/components/forms/document-upload-form";
import { DocumentInboxCard } from "@/components/forms/document-inbox-card";
import { DocumentsCategorisedList } from "@/components/forms/documents-categorised-list";
import { EmailDocumentsForm } from "@/components/forms/email-documents-form";
import { isBlobConfigured, isMemoryStore } from "@/lib/env";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { ensureClientDocumentInbox } from "@/server/documents/inbound-email";
import type { DeskProfile } from "@/lib/desk-profile";

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "documents");
  const docs = await listClientDocuments(clientId).catch(() => []);
  const storageHint = isBlobConfigured()
    ? "Vercel Blob"
    : isMemoryStore()
      ? "Local memory (dev only)"
      : "Not configured";

  const contactEmail =
    "contactEmail" in client
      ? ((client as { contactEmail?: string | null }).contactEmail ?? null)
      : null;

  const inbox = await ensureClientDocumentInbox({
    clientId,
    practiceId: client.practiceId,
    clientName: client.name,
    deskProfile: (client.deskProfile as DeskProfile | null) ?? null,
  });

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Documents · storage: {storageHint}
      </p>

      <div className="mb-6">
        <DocumentInboxCard
          inboxEmail={inbox.inboxEmail}
          clientName={client.name}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DocumentUploadForm clientId={clientId} />
        <EmailDocumentsForm
          clientId={clientId}
          defaultEmail={contactEmail}
          documents={docs.map((d) => ({ id: d.id, filename: d.filename }))}
        />
      </div>

      <div className="mt-6 panel overflow-hidden">
        <div className="border-b border-line bg-sand/60 px-4 py-3">
          <h2 className="font-semibold text-ink">
            Files by desk ({docs.length})
          </h2>
        </div>
        {docs.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">
            No documents yet. Upload here, collect via the client form (photos
            save as PDF), or ask bookkeeping to email{" "}
            <span className="mono text-ink">{inbox.inboxEmail}</span>.
          </p>
        ) : (
          <DocumentsCategorisedList
            clientId={clientId}
            documents={docs.map((d) => ({
              id: String(d.id),
              filename: String(d.filename),
              blobUrl: String(d.blobUrl),
              contentType: String(d.contentType ?? ""),
              sizeBytes: Number(d.sizeBytes ?? 0),
              createdAt: String(d.createdAt),
              category: String(d.category ?? "general"),
            }))}
          />
        )}
      </div>

      <aside className="panel mt-6 p-5 text-sm text-ink-soft">
        <p className="font-semibold text-ink">How submission to HMRC works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Upload source documents to this client file.</li>
          <li>
            Sort files by desk here, or copy/paste between cards under{" "}
            <Link href={`/clients/${slug}/bank`} className="font-semibold text-sea">
              Bank
            </Link>
            . Prepare VAT / SA / CT600 from those desks.
          </li>
          <li>
            <Link href="/settings/hmrc" className="font-semibold text-sea">
              Connect HMRC
            </Link>{" "}
            for the client, then Review → Submit. Audit log stores the receipt.
          </li>
        </ol>
      </aside>
    </div>
  );
}
