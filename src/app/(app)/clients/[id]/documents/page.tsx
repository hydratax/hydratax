import Link from "next/link";
import { getClient } from "@/server/actions/clients";
import { listClientDocuments } from "@/server/actions/documents";
import { DocumentUploadForm } from "@/components/forms/document-upload-form";
import { EmailDocumentsForm } from "@/components/forms/email-documents-form";
import { ClientTabs } from "@/components/client-tabs";
import { isBlobConfigured, isMemoryStore } from "@/lib/env";

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const docs = await listClientDocuments(id);
  const storageHint = isBlobConfigured()
    ? "Vercel Blob"
    : isMemoryStore()
      ? "Local memory (dev only)"
      : "Not configured";

  const contactEmail =
    "contactEmail" in client
      ? ((client as { contactEmail?: string | null }).contactEmail ?? null)
      : null;

  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Client workspace
        </p>
        <h1 className="display mt-1 text-4xl text-ink">{client.name}</h1>
        <p className="mt-1 text-ink-soft">
          Documents · storage: {storageHint}
        </p>
      </div>

      <ClientTabs clientId={id} active="documents" />

      <div className="grid gap-6 lg:grid-cols-2">
        <DocumentUploadForm clientId={id} />
        <EmailDocumentsForm
          clientId={id}
          defaultEmail={contactEmail}
          documents={docs.map((d) => ({ id: d.id, filename: d.filename }))}
        />
      </div>

      <div className="mt-6 panel overflow-hidden">
        <div className="border-b border-line bg-sand/60 px-4 py-3">
          <h2 className="font-semibold text-ink">Files ({docs.length})</h2>
        </div>
        {docs.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">
            No documents yet. Upload bank statements, P60s, accounts packs, or
            working papers here before prepare → review → submit.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{doc.filename}</p>
                  <p className="text-xs text-ink-soft">
                    {doc.category} · {(doc.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                    {new Date(doc.createdAt).toLocaleString("en-GB")}
                  </p>
                </div>
                {doc.blobUrl.startsWith("http") ? (
                  <a
                    href={doc.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary text-xs"
                  >
                    Open
                  </a>
                ) : (
                  <span className="badge badge-muted">Stored locally</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="panel mt-6 p-5 text-sm text-ink-soft">
        <p className="font-semibold text-ink">How submission to HMRC works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Upload source documents to this client file.</li>
          <li>
            Enter books under{" "}
            <Link href={`/clients/${id}/books`} className="font-semibold text-sea">
              Books
            </Link>
            ; prepare VAT / SA / CT600 / Payroll. Or use{" "}
            <Link href={`/clients/${id}/bank`} className="font-semibold text-sea">
              Bank
            </Link>{" "}
            CSV categorisation for SA / CT drafts.
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
