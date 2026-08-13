import { SupportHub } from "@/components/support/support-hub";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

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
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <SupportHub />
      </main>
      <SiteFooter />
    </div>
  );
}
