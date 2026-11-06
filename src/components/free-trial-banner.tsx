import Link from "next/link";
import { PRACTICE_TRIAL } from "@/lib/trial";

/** Slim site-wide strip promoting the Practice desk free trial. */
export function FreeTrialBanner({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={
        dark
          ? "border-b border-teal-800 bg-sea-deep text-white"
          : "border-b border-teal-700 bg-sea text-white"
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-2 text-center text-xs sm:gap-x-3 sm:px-4 sm:text-sm md:px-6">
        <span className="font-bold tracking-wide text-white">
          {PRACTICE_TRIAL.shortBadge}
        </span>
        <span className="hidden text-white/75 sm:inline" aria-hidden>
          ·
        </span>
        <span className="hidden text-white/95 sm:inline">
          {PRACTICE_TRIAL.bannerText}
        </span>
        <span className="text-white/95 sm:hidden">
          No Hydra fees · free filings
        </span>
        <Link
          href={PRACTICE_TRIAL.ctaHref}
          className="rounded-md bg-white px-2.5 py-0.5 font-bold text-sea transition hover:bg-teal-50"
        >
          <span className="sm:hidden">Start →</span>
          <span className="hidden sm:inline">{PRACTICE_TRIAL.cta} →</span>
        </Link>
      </div>
    </div>
  );
}
