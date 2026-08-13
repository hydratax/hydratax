import { Suspense } from "react";
import { SignInForm } from "@/components/forms/sign-in-form";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Sign in — HydraTax",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl justify-center px-4 py-10 md:px-6 md:py-16">
        <Suspense fallback={<p className="text-sm text-ink-soft">Loading…</p>}>
          <SignInForm />
        </Suspense>
      </main>
    </div>
  );
}
