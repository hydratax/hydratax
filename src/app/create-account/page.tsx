import { CreateAccountForm } from "@/components/forms/create-account-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Suspense } from "react";

export const metadata = {
  title: "Sign up — HydraTax",
  description:
    "Create a HydraTax account for your company, sole trader, partnership, or multi-client accountancy practice.",
};

export default function CreateAccountPage() {
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
