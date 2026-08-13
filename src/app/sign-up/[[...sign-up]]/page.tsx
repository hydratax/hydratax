import { redirect } from "next/navigation";

/** Legacy route — preserve ?next= for filing resume after sign-up */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  const next = query.next?.trim();
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    redirect(`/create-account?next=${encodeURIComponent(next)}`);
  }
  redirect("/create-account");
}
