import { SupportHub } from "@/components/support/support-hub";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Support — HydraTax help for CT600, VAT, Self Assessment & PAYE",
  description:
    "HydraTax support centre: fix CT600 errors, MTD VAT reconnects, Self Assessment updates, FPS payroll issues and HMRC connection problems.",
  keywords: [
    "CT600 error help",
    "MTD VAT support",
    "Self Assessment filing help",
    "PAYE FPS help",
    "HMRC authentication failure",
  ],
};

export default function SupportPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image
              src="/brand/logo.png"
              alt="HydraTax"
              width={32}
              height={32}
              className="object-contain"
            />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-ink-soft">
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/support" className="text-ink">
              Support
            </Link>
            <Link href="/dashboard" className="btn btn-primary text-sm">
              Open practice
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <SupportHub />
      </main>
      <SiteFooter />
    </div>
  );
}
