import { CreateAccountForm } from "@/components/forms/create-account-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { safeReturnPath } from "@/lib/auth-return";
import { getOptionalSession } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign up — HydraTax",
  description:
    "Create a HydraTax account for your company, sole trader, partnership, or multi-client accountancy practice.",
};

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string }>;
}) {
  const sp = await searchParams;
  const planParam = (sp.plan ?? "").trim();
  const returnPath = safeReturnPath(
    sp.next || (planParam ? `/pricing?plan=${planParam}` : null),
  );

  // Already signed in with a real practice → continue to plan checkout / next.
  const session = await getOptionalSession();
  if (session && !session.local) {
    redirect(returnPath);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-14">
        <Suspense fallback={<p className="text-sm text-ink-soft">Loading…</p>}>
          <CreateAccountForm />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}
