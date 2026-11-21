"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  COACH_HOME_ACTIONS,
  COACH_HOME_PROMPT,
  getPlaybook,
  type Playbook,
} from "@/lib/learnerbee/playbooks";

type View =
  | { mode: "home" }
  | { mode: "playbook"; playbook: Playbook; stepIndex: number };

/**
 * learnerbee — floating suggestion coach.
 * Opens with limited chips; guides one playbook at a time.
 */
export function LearnerbeeCoachBubble() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ mode: "home" });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function goHome() {
    setView({ mode: "home" });
  }

  function startPlaybook(id: string) {
    const playbook = getPlaybook(id);
    if (!playbook) return;
    setView({ mode: "playbook", playbook, stepIndex: 0 });
  }

  const step =
    view.mode === "playbook"
      ? view.playbook.steps[view.stepIndex]
      : null;
  const atEnd =
    view.mode === "playbook" &&
    view.stepIndex >= view.playbook.steps.length - 1;
  const stepNumber =
    view.mode === "playbook" ? view.stepIndex + 1 : 0;
  const stepTotal =
    view.mode === "playbook" ? view.playbook.steps.length : 0;

  return (
    <div className="pointer-events-none fixed bottom-5 right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="HydraTax help"
          className="pointer-events-auto flex w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.45)]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line bg-sea px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">
                Help
              </p>
              <p className="truncate text-sm font-semibold">
                {view.mode === "home"
                  ? "HydraTax guide"
                  : view.playbook.title}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-lg leading-none text-white/90 transition hover:bg-white/15"
              aria-label="Close help"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="max-h-[min(28rem,70vh)] space-y-3 overflow-y-auto px-4 py-4">
            {view.mode === "home" ? (
              <>
                <p className="text-sm text-ink">{COACH_HOME_PROMPT}</p>
                <ul className="flex flex-col gap-2">
                  {COACH_HOME_ACTIONS.map((action) => (
                    <li key={action.label}>
                      {action.kind === "playbook" ? (
                        <button
                          type="button"
                          className="w-full rounded-xl border border-line bg-sand/40 px-3 py-2.5 text-left text-sm font-semibold text-ink transition hover:border-sea/40 hover:bg-sea/5"
                          onClick={() => startPlaybook(action.id)}
                        >
                          {action.label}
                        </button>
                      ) : (
                        <Link
                          href={action.href}
                          className="block w-full rounded-xl border border-line bg-sand/40 px-3 py-2.5 text-left text-sm font-semibold text-ink transition hover:border-sea/40 hover:bg-sea/5"
                          onClick={() => setOpen(false)}
                        >
                          {action.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : step ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Step {stepNumber} of {stepTotal}
                </p>
                <p className="text-base font-semibold text-ink">
                  {step.title}
                </p>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {step.body}
                </p>
                {step.href ? (
                  <Link
                    href={step.href}
                    className="btn btn-primary inline-flex w-full justify-center text-sm"
                    onClick={() => {
                      /* keep panel open so they can tap Next after navigating */
                    }}
                  >
                    {step.ctaLabel ?? "Open this page"}
                  </Link>
                ) : null}
                {atEnd ? (
                  <p className="rounded-xl bg-sea/5 px-3 py-2 text-sm font-semibold text-ink">
                    You’re at the last step — finish on the desk, or start
                    another guide.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-sand/30 px-3 py-3">
            {view.mode === "playbook" ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  disabled={view.stepIndex === 0}
                  onClick={() =>
                    setView({
                      ...view,
                      stepIndex: Math.max(0, view.stepIndex - 1),
                    })
                  }
                >
                  Back
                </button>
                {!atEnd ? (
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    onClick={() =>
                      setView({
                        ...view,
                        stepIndex: Math.min(
                          view.playbook.steps.length - 1,
                          view.stepIndex + 1,
                        ),
                      })
                    }
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    onClick={goHome}
                  >
                    More help
                  </button>
                )}
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
                  onClick={goHome}
                >
                  Start over
                </button>
              </>
            ) : (
              <p className="px-1 text-xs text-ink-soft">
                Pick an option — we’ll walk you through it.
              </p>
            )}
          </footer>
        </div>
      ) : null}

      <button
        type="button"
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-sea px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_-12px_rgba(15,118,110,0.85)] transition hover:bg-sea-deep"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setView({ mode: "home" });
        }}
      >
        <span
          className="flex size-6 items-center justify-center rounded-full bg-white/15 text-xs"
          aria-hidden
        >
          ?
        </span>
        {open ? "Close" : "Help"}
      </button>
    </div>
  );
}
