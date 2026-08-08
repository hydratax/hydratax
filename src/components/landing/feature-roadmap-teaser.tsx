import Link from "next/link";

export function FeatureRoadmapTeaser() {
  return (
    <section
      id="roadmap"
      className="relative overflow-hidden border-t border-line"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(15,118,110,0.12),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgba(217,119,6,0.08),transparent_50%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Built with accountants
        </p>
        <h2 className="display mt-3 max-w-2xl text-3xl text-ink md:text-5xl">
          The UK’s most user-friendly practice desk — shaped by your votes
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">
          Request the feature your firm needs. Other practices upvote. We ship
          what rises — so HydraTax stays easy for the people who live in it
          every day.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/feature-requests" className="btn btn-primary">
            Request a feature
          </Link>
          <Link href="/feature-requests" className="btn btn-secondary">
            Vote on the board
          </Link>
        </div>
      </div>
    </section>
  );
}
