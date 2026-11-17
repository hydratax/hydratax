"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  AgentAuthServiceKey,
  AgentAuthorisationRecord,
  AgentAuthorisationStatus,
} from "@/lib/desk-profile";
import {
  requestAgentAuthorisation,
  refreshAgentAuthorisationStatus,
  setAgentAuthorisationManualStatus,
} from "@/server/actions/agent-authorisation";
import { UkDateField } from "@/components/forms/uk-date-field";

const ARN_STORAGE_KEY = "hydratax_hmrc_agent_arn";
const VAT_REG_PREFIX = "hydratax_vat_reg_date_";

const SERVICES: Array<{
  key: AgentAuthServiceKey;
  title: string;
  api: "mtd" | "online";
}> = [
  { key: "mtd_it", title: "Self Assessment", api: "mtd" },
  { key: "mtd_vat", title: "VAT", api: "mtd" },
  { key: "corporation_tax", title: "Corporation Tax", api: "online" },
  { key: "paye", title: "PAYE", api: "online" },
];

function statusLabel(s: AgentAuthorisationStatus | undefined) {
  switch (s) {
    case "authorised":
      return { text: "Authorised", className: "text-ok" };
    case "pending":
      return { text: "Pending", className: "text-violet" };
    case "rejected":
    case "expired":
      return { text: "Not authorised", className: "text-ink-soft" };
    case "deauthorised":
      return { text: "Removed", className: "text-ink-soft" };
    default:
      return { text: "Not authorised", className: "text-ink-soft" };
  }
}

function authorisedCount(
  rows: Partial<Record<AgentAuthServiceKey, AgentAuthorisationRecord>>,
  isLtd: boolean,
) {
  return SERVICES.filter((s) => {
    if (s.key === "corporation_tax" && !isLtd) return false;
    if (s.key === "paye" && !isLtd) return false;
    return rows[s.key]?.status === "authorised";
  }).length;
}

export function AgentAuthorisationPanel({
  clientId,
  initial,
  nino,
  vrn,
  postcode,
  payeRef,
  utr,
  isLtd,
}: {
  clientId: string;
  initial: Partial<Record<AgentAuthServiceKey, AgentAuthorisationRecord>>;
  nino?: string | null;
  vrn?: string | null;
  postcode?: string | null;
  payeRef?: string | null;
  utr?: string | null;
  isLtd: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(initial);
  const [arn, setArn] = useState("");
  const [vatRegDate, setVatRegDate] = useState("");
  const [postcodeFact, setPostcodeFact] = useState(postcode ?? "");
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      setArn(localStorage.getItem(ARN_STORAGE_KEY) ?? "");
      setVatRegDate(localStorage.getItem(`${VAT_REG_PREFIX}${clientId}`) ?? "");
    } catch {
      /* ignore */
    }
  }, [clientId]);

  function persistArn(next: string) {
    setArn(next);
    try {
      localStorage.setItem(ARN_STORAGE_KEY, next.trim());
    } catch {
      /* ignore */
    }
  }

  const count = authorisedCount(rows, isLtd);

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <h2 className="display text-2xl text-ink">
            HMRC agent authorisation
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {count > 0
              ? `${count} service${count === 1 ? "" : "s"} authorised`
              : "Request access for this client"}
          </p>
        </div>
        <span
          className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-line px-5 pb-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="label text-xs">
              Agent reference number
              <input
                className="input mt-1 figures"
                value={arn}
                onChange={(e) => persistArn(e.target.value)}
                placeholder="XARN1234567"
                autoComplete="off"
              />
            </label>
            <label className="label text-xs">
              Postcode
              <input
                className="input mt-1"
                value={postcodeFact}
                onChange={(e) => setPostcodeFact(e.target.value)}
                placeholder="SW1A 1AA"
              />
            </label>
            <div className="label text-xs">
              VAT registration date
              <UkDateField
                className="input mt-1"
                value={vatRegDate}
                onChange={(iso) => {
                  setVatRegDate(iso);
                  try {
                    localStorage.setItem(`${VAT_REG_PREFIX}${clientId}`, iso);
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead className="bg-sand/50 text-left text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-3 py-2 font-semibold">Service</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {SERVICES.map((svc) => {
                  if (svc.key === "corporation_tax" && !isLtd) return null;
                  if (svc.key === "paye" && !isLtd) return null;
                  const rec = rows[svc.key];
                  const st = statusLabel(rec?.status);
                  const missingId =
                    (svc.key === "mtd_it" && !nino) ||
                    (svc.key === "mtd_vat" && !vrn) ||
                    (svc.key === "corporation_tax" && !utr) ||
                    (svc.key === "paye" && !payeRef);

                  return (
                    <tr
                      key={svc.key}
                      className="border-t border-line align-middle"
                    >
                      <td className="px-3 py-3 font-semibold text-ink">
                        {svc.title}
                        {rec?.clientActionUrl ? (
                          <a
                            href={rec.clientActionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 block text-xs font-normal text-sea underline"
                          >
                            Open link
                          </a>
                        ) : null}
                      </td>
                      <td className={`px-3 py-3 font-medium ${st.className}`}>
                        {st.text}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-primary text-xs"
                            disabled={pending || Boolean(missingId)}
                            onClick={() => {
                              if (missingId) return;
                              start(async () => {
                                try {
                                  const res = await requestAgentAuthorisation({
                                    clientId,
                                    service: svc.key,
                                    agentArn: arn || undefined,
                                    knownFact:
                                      svc.key === "mtd_vat"
                                        ? vatRegDate
                                        : svc.key === "mtd_it"
                                          ? postcodeFact
                                          : undefined,
                                    agentType: "main",
                                  });
                                  setRows((prev) => ({
                                    ...prev,
                                    [svc.key]: res.record,
                                  }));
                                } catch {
                                  /* freeze — no error UI */
                                }
                              });
                            }}
                          >
                            Request
                          </button>
                          {svc.api === "mtd" ? (
                            <button
                              type="button"
                              className="btn btn-secondary text-xs"
                              disabled={pending}
                              onClick={() => {
                                start(async () => {
                                  try {
                                    const res =
                                      await refreshAgentAuthorisationStatus({
                                        clientId,
                                        service: svc.key,
                                        agentArn: arn || undefined,
                                        knownFact:
                                          svc.key === "mtd_vat"
                                            ? vatRegDate
                                            : postcodeFact,
                                      });
                                    if (res.record) {
                                      setRows((prev) => ({
                                        ...prev,
                                        [svc.key]: res.record!,
                                      }));
                                    }
                                  } catch {
                                    /* freeze */
                                  }
                                });
                              }}
                            >
                              Refresh
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            disabled={
                              pending || rec?.status === "authorised"
                            }
                            onClick={() => {
                              start(async () => {
                                try {
                                  const record =
                                    await setAgentAuthorisationManualStatus({
                                      clientId,
                                      service: svc.key,
                                      status: "authorised",
                                    });
                                  setRows((prev) => ({
                                    ...prev,
                                    [svc.key]: record,
                                  }));
                                } catch {
                                  /* freeze */
                                }
                              });
                            }}
                          >
                            Mark authorised
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
