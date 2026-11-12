"use client";

import Link from "next/link";
import { markNavPending } from "@/components/pending-link";
import {
  formatSaFilingDue,
  saCardUrgencyClass,
  saUrgencyLabel,
} from "@/lib/sa-tax-year";
import type { PracticeDirector } from "@/server/actions/sa-directors";
import { personKeySlug } from "@/lib/sa-taxpayer";

export function SaOverviewDirectorsCard({
  clientSlug,
  directors,
}: {
  clientSlug: string;
  directors: PracticeDirector[];
}) {
  return (
    <div className="panel flex flex-col p-5">
      <h2 className="display text-2xl">Self Assessment</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Personal SA100 returns — tax year 6 April to 5 April, file by 31
        January.
      </p>
      {directors.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-sand/40 px-3 py-3 text-sm text-ink-soft">
          No people linked yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {directors.map((d) => {
            const submitted =
              d.filing.status === "submitted" ||
              d.filing.status === "accepted";
            const badge = saUrgencyLabel(d.filing.urgency, submitted);
            const cardClass = saCardUrgencyClass(d.filing.urgency, submitted);
            return (
              <li key={d.key}>
                <Link
                  href={`/self-assessment/${personKeySlug(d.key)}`}
                  onClick={() =>
                    markNavPending(`Opening SA for ${d.fullName}…`)
                  }
                  className={`flex items-center justify-between gap-3 rounded-xl border border-line/80 bg-white px-3 py-3 transition hover:border-sea/40 hover:bg-sea/5 ${cardClass}`}
                >
                  <span>
                    <span className="block font-semibold text-ink">
                      {d.fullName}
                    </span>
                    {badge ? (
                      <span
                        className={`mt-0.5 block text-xs font-semibold ${
                          submitted
                            ? "text-ok"
                            : d.filing.urgency === "overdue"
                              ? "text-danger"
                              : "text-sea"
                        }`}
                      >
                        {badge}
                        {d.filing.filingDue
                          ? ` · file by ${formatSaFilingDue({
                              label: d.filing.taxYear,
                              start: "",
                              end: "",
                              filingDue: d.filing.filingDue,
                            })}`
                          : ""}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-ink-soft">
                        SA {d.filing.taxYear}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-sea">Open →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto pt-4">
        <Link
          href={`/clients/${clientSlug}/self-assessment`}
          onClick={() => markNavPending("Opening Self Assessment…")}
          className="btn btn-primary w-full text-sm"
        >
          Open Self Assessment desk
        </Link>
      </div>
    </div>
  );
}
