"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setClientWorkStage } from "@/server/actions/desk";
import type { ClientWorkDesk, ClientWorkStage } from "@/lib/client-work-stage";

export type DeskStatusOption = {
  id: string;
  label: string;
};

/** Map desk filter chip → stored workStage (drives cards + logs). */
export function stageFromDeskStatus(
  desk: ClientWorkDesk | "clients",
  statusId: string,
): ClientWorkStage {
  if (desk === "sa") {
    switch (statusId) {
      case "info_received":
        return "bank_statements_received";
      case "return_prepared":
        return "drafted";
      case "reviewed":
        return "completed";
      case "submitted":
      case "complete":
        return "submitted";
      case "info_requested":
      default:
        return "not_started";
    }
  }
  if (desk === "vat") {
    switch (statusId) {
      case "drafted":
        return "drafted";
      case "completed":
        return "completed";
      case "emailed":
        return "sent_for_approval";
      case "submitted":
      case "approved":
        return "submitted";
      default:
        return "not_started";
    }
  }
  if (desk === "ct") {
    switch (statusId) {
      case "drafted":
        return "drafted";
      case "ready":
        return "completed";
      case "submitted":
      case "accepted":
        return "submitted";
      default:
        return "not_started";
    }
  }
  if (desk === "paye") {
    switch (statusId) {
      case "generated":
        return "drafted";
      case "submitted":
        return "submitted";
      default:
        return "not_started";
    }
  }
  // clients / overview — use SA-style prep stages when ids match
  switch (statusId) {
    case "bank_statements_received":
      return "bank_statements_received";
    case "drafted":
    case "in_progress":
      return "drafted";
    case "completed":
      return "completed";
    case "sent_for_approval":
      return "sent_for_approval";
    case "submitted":
      return "submitted";
    default:
      return "not_started";
  }
}

function deskForLog(
  desk: ClientWorkDesk | "clients",
): ClientWorkDesk {
  if (desk === "clients") return "overview";
  return desk;
}

/**
 * Practice-card Status control — dropdown of that desk’s filter stages.
 * Changing status writes the client work log (desk + main).
 */
export function DeskStatusButton({
  clientId,
  desk,
  options,
  value,
  className = "",
}: {
  clientId: string;
  desk: ClientWorkDesk | "clients";
  /** Filter chips excluding "all". */
  options: DeskStatusOption[];
  value: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const current =
    options.find((o) => o.id === value)?.label ??
    options[0]?.label ??
    "Status";

  return (
    <div
      className={`relative z-[2] shrink-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="rounded-lg border border-sea/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-sea hover:bg-sea/5 disabled:opacity-50"
        disabled={pending || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {pending ? "Saving…" : current}
        <span className="ml-1 text-ink-soft" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg shadow-ink/10"
        >
          {options.map((opt) => (
            <li key={opt.id} role="option" aria-selected={opt.id === value}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs font-medium ${
                  opt.id === value
                    ? "bg-sea/10 text-sea"
                    : "text-ink hover:bg-sand/60"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  if (opt.id === value) return;
                  const stage = stageFromDeskStatus(desk, opt.id);
                  start(async () => {
                    try {
                      await setClientWorkStage({
                        clientId,
                        stage,
                        desk: deskForLog(desk),
                        note: `Status → ${opt.label}`,
                      });
                      router.refresh();
                    } catch {
                      /* freeze */
                    }
                  });
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
