import Link from "next/link";
import { PRACTICE_TRIAL } from "@/lib/trial";

/** Slim site-wide strip promoting the Practice desk free trial. */
export function FreeTrialBanner({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={
        dark
          ? "border-b border-white/10 bg-teal-950/80 text-white"
          : "border-b border-sea/20 bg-sea text-white"
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-2 text-center text-xs sm:gap-x-3 sm:px-4 sm:text-sm md:px-6">
        <span className="font-semibold tracking-wide">
          {PRACTICE_TRIAL.shortBadge}
        </span>
        <span className="hidden text-white/80 sm:inline">·</span>
        <span className="hidden text-white/90 sm:inline">
          {PRACTICE_TRIAL.bannerText}
        </span>
        <span className="text-white/85 sm:hidden">No Hydra fees · free filings</span>
        <Link
          href={PRACTICE_TRIAL.ctaHref}
          className="font-bold underline decoration-white/50 underline-offset-2 hover:decoration-white"
        >
          <span className="sm:hidden">Start →</span>
          <span className="hidden sm:inline">{PRACTICE_TRIAL.cta} →</span>
        </Link>
      </div>
    </div>
  );
}
