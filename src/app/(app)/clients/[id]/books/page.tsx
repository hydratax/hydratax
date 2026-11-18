import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";

/** Ledger removed from Books — send visitors to Uploaded documents. */
export default async function BooksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { slug } = await loadClientPage(ref, "books");
  redirect(`/clients/${slug}/bank`);
}
