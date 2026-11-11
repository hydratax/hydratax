import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";

/** Time & fees removed from the product — send staff to invoices. */
export default async function TimeFeesRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { slug } = await loadClientPage(ref);
  redirect(`/clients/${slug}/invoices`);
}
