import { listClientDocuments } from "@/server/actions/documents";
import { BooksDocumentsWorkspace } from "@/components/forms/books-documents-workspace";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { slug, clientId } = await loadClientPage(ref, "bank");
  const documents = await listClientDocuments(clientId).catch(() => []);

  return (
    <BooksDocumentsWorkspace
      clientId={clientId}
      clientSlug={slug}
      documents={documents.map((d) => ({
        id: String(d.id),
        filename: String(d.filename),
        blobUrl: String(d.blobUrl),
        contentType: String(d.contentType),
        sizeBytes: Number(d.sizeBytes),
        createdAt:
          typeof d.createdAt === "string"
            ? d.createdAt
            : d.createdAt.toISOString(),
        category: String(d.category),
      }))}
    />
  );
}
