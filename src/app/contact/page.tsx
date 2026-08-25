import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ContactForm } from "@/components/forms/contact-form";

export const metadata: Metadata = {
  title: "Contact us — HydraTax",
  description:
    "Contact HydraTax for sales, onboarding, or practice support via our secure contact form.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Get in touch
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
          Contact HydraTax
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Sales, onboarding, or practice support — send a message below. We keep
          our inbox address off public pages to cut spam and scam mail.
        </p>
        <div className="mt-8">
          <ContactForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
