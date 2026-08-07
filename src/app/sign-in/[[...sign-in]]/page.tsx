import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { SignInForm } from "@/components/forms/sign-in-form";

export const metadata = {
  title: "Sign in — HydraTax",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
          <Link href="/create-account" className="text-sm font-semibold text-sea">
            Sign up
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl justify-center px-4 py-16 md:px-6">
        <Suspense fallback={<p className="text-sm text-ink-soft">Loading…</p>}>
          <SignInForm />
        </Suspense>
      </main>
    </div>
  );
}
