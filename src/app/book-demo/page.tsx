import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BookDemoWizard } from "@/components/demo/book-demo-wizard";
import { DEMO_SERVICES } from "@/lib/demo-booking";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Book a demo — HydraTax",
  description:
    "Book a live HydraTax demonstration for your practice — suite walkthrough, module-specific demo, migration, training or onboarding.",
  alternates: { canonical: `${siteUrl()}/book-demo` },
};

export default function BookDemoPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
              Book a demo
            </p>
            <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
              See HydraTax with your practice in mind
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">
              Add your name and email, then choose your demo and a time. We
              email you a confirmation straight away.
            </p>

            <div className="mt-8">
              <BookDemoWizard />
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-line bg-white p-5">
              <h2 className="display text-2xl text-ink">Choose your demo</h2>
              <ul className="mt-4 space-y-4">
                {DEMO_SERVICES.slice(0, 3).map((s) => (
                  <li key={s.id}>
                    <p className="font-semibold text-ink">{s.title}</p>
                    <p className="mt-1 text-sm text-ink-soft">{s.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-sea/25 bg-sea px-5 py-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                Practice desk
              </p>
              <p className="mt-2 text-lg font-semibold leading-snug">
                Prefer to explore first? Start a 7-day Practice trial — card at
                checkout, charged on day 8.
              </p>
              <Link
                href="/pricing#practice"
                className="btn mt-4 border-0 bg-white text-sea hover:bg-sand"
              >
                View pricing
              </Link>
            </div>

            <div className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-soft">
              <p className="font-semibold text-ink">Already on HydraTax?</p>
              <p className="mt-1">
                Book a training or onboarding session from the demo types above —
                or{" "}
                <Link href="/contact" className="font-semibold text-sea">
                  contact support
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
