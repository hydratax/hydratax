import Link from "next/link";
import Image from "next/image";
import { CreateAccountForm } from "@/components/forms/create-account-form";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Sign up — HydraTax",
  description:
    "Create a HydraTax account for your company, sole trader, partnership, or multi-client accountancy practice.",
};

export default function CreateAccountPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
          <Link href="/sign-in" className="text-sm font-semibold text-sea">
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14">
        <CreateAccountForm />
      </main>

      <SiteFooter />
    </div>
  );
}
