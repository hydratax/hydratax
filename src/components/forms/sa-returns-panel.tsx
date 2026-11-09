"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaReturnDocuments } from "@/components/forms/sa-return-documents";
import { deleteSa100Draft } from "@/server/actions/sa100";
import type { Sa100Stored } from "@/server/actions/sa100";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function dueLabel(r: Sa100Stored) {
  if (r.calculation.amountDue > 0) {
    return `Due ${money(Math.round(r.calculation.amountDue * 100))}`;
  }
  if (r.calculation.refundDue > 0) {
    return `Refund ${money(Math.round(r.calculation.refundDue * 100))}`;
  }
  return "Nil";
}

/**
 * Drafts (editable) and submitted/accepted returns for a person / sole trader.
 */
function draftEditHref(baseHref: string, taxYear: string) {
  const join = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${join}year=${encodeURIComponent(taxYear)}`;
}

export function SaReturnsPanel({
  personName,
  clientId,
  taxpayerId,
  returns,
  editHrefBase,
  defaultEmail,
}: {
  personName: string;
  clientId: string;
  taxpayerId?: string | null;
  returns: Sa100Stored[];
  /** Path without year query — Edit draft appends ?year= */
  editHrefBase: string;
  defaultEmail?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const drafts = returns.filter((r) => r.status === "draft");
  const filed = returns.filter(
    (r) => r.status === "submitted" || r.status === "accepted",
  );

  if (returns.length === 0) return null;

  return (
    <div className="space-y-6">
      <FormErrorBanner error={err} />
      {drafts.length > 0 ? (
        <section className="panel p-5">
          <h2 className="display text-2xl">Draft returns — {personName}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {drafts.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {r.taxYear}{" "}
                    <span className="badge badge-muted">Draft</span>
                  </p>
                  <p className="text-ink-soft">{dueLabel(r)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={draftEditHref(editHrefBase, r.taxYear)}
                    className="btn btn-primary text-sm"
                  >
                    Edit draft
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm text-danger"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete the ${r.taxYear} draft? This cannot be undone.`,
                        )
                      ) {
                        return;
                      }
                      setErr(null);
                      start(async () => {
                        try {
                          await deleteSa100Draft({
                            clientId,
                            taxYear: r.taxYear,
                            taxpayerId: taxpayerId ?? r.taxpayerId,
                          });
                          router.refresh();
                        } catch (e) {
                          setErr(
                            messageFromUnknown(e, "Could not delete draft"),
                          );
                        }
                      });
                    }}
                  >
                    Delete
                  </button>
                  <SaReturnDocuments
                    clientId={clientId}
                    returnId={r.id}
                    taxYear={r.taxYear}
                    personName={personName}
                    defaultEmail={defaultEmail}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {filed.length > 0 ? (
        <section className="panel p-5">
          <h2 className="display text-2xl">
            Filed SA100 returns — {personName}
          </h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {filed.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {r.taxYear}{" "}
                    <span className="badge badge-ok">{r.status}</span>
                  </p>
                  <p className="text-ink-soft">
                    {dueLabel(r)}
                    {r.hmrcCorrelationId ? ` · ${r.hmrcCorrelationId}` : ""}
                  </p>
                </div>
                <SaReturnDocuments
                  clientId={clientId}
                  returnId={r.id}
                  taxYear={r.taxYear}
                  personName={personName}
                  defaultEmail={defaultEmail}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
