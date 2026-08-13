import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FeatureRequestBoard } from "@/components/feature-requests/feature-request-board";
import { listFeatureRequests } from "@/server/actions/feature-requests";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feature requests — Shape HydraTax with your practice",
  description:
    "HydraTax is built for UK accountants’ ease. Post a feature request and vote on what other practices need next.",
  keywords: [
    "accounting software feature requests",
    "UK accountant software roadmap",
    "HydraTax feature votes",
  ],
};

export default async function FeatureRequestsPage() {
  const requests = await listFeatureRequests();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f8f9_0%,#ffffff_40%)]">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-14">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Roadmap
          </p>
          <h1 className="display mt-2 text-3xl text-ink sm:text-4xl md:text-5xl">
            Feature requests
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-soft md:text-lg">
            HydraTax aims to be the UK’s most user-friendly accounting software —
            built for accountants’ ease. Tell us what to add next; vote so the
            best ideas rise.
          </p>
        </div>

        <div className="mt-10">
          <FeatureRequestBoard initial={requests} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
