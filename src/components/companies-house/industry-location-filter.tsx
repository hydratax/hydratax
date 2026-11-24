"use client";

import { useRouter } from "next/navigation";
import { SEO_LOCATION_HUBS, industryHubPath } from "@/lib/company-directory";

/**
 * Top-right city filter on an industry hub — narrows SIC results by
 * registered-office location without leaving the industry page.
 */
export function IndustryLocationFilter({
  sic,
  selected,
}: {
  sic: string;
  selected: string | null;
}) {
  const router = useRouter();
  const value = selected ?? "";

  return (
    <label className="flex min-w-[11rem] flex-col gap-1 text-left sm:items-end">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
        City
      </span>
      <select
        className="input w-full min-w-[12rem] cursor-pointer bg-white text-sm font-semibold text-ink sm:w-auto"
        aria-label="Filter by city"
        value={value}
        onChange={(e) => {
          const next = e.target.value.trim();
          const base = industryHubPath(sic);
          if (!next) {
            router.push(base);
            return;
          }
          router.push(
            `${base}?location=${encodeURIComponent(next.toLowerCase())}`,
          );
        }}
      >
        <option value="">All cities</option>
        {SEO_LOCATION_HUBS.map((place) => (
          <option key={place} value={place.toLowerCase()}>
            {place}
          </option>
        ))}
      </select>
    </label>
  );
}
