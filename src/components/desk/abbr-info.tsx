"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  DESK_ABBREVIATIONS,
  type DeskAbbrCode,
  deskAbbr,
} from "@/lib/desk-abbreviations";

type AbbrInfoProps = {
  /** Key in DESK_ABBREVIATIONS (e.g. "SMP", "FPS"). */
  code: DeskAbbrCode | string;
  className?: string;
  /**
   * When true, always show the mark even if this code already appeared
   * in the nearest AbbrInfoScope (rare — prefer the default once-per-screen rule).
   */
  force?: boolean;
};

type ScopeApi = {
  /** True only for the first AbbrInfo instance registered for this code. */
  shouldShow: (code: string, instanceId: string) => boolean;
};

const AbbrInfoScopeContext = createContext<ScopeApi | null>(null);

/**
 * Dedupes “i” marks so each abbreviation shows the helper at most once
 * inside this tree (typically one desk screen / panel).
 */
export function AbbrInfoScope({ children }: { children: ReactNode }) {
  const winners = useRef(new Map<string, string>());
  const api = useMemo<ScopeApi>(
    () => ({
      shouldShow(code: string, instanceId: string) {
        const key = code.toUpperCase();
        const existing = winners.current.get(key);
        if (!existing) {
          winners.current.set(key, instanceId);
          return true;
        }
        return existing === instanceId;
      },
    }),
    [],
  );
  return (
    <AbbrInfoScopeContext.Provider value={api}>
      {children}
    </AbbrInfoScopeContext.Provider>
  );
}

/**
 * Small “i” control next to a desk abbreviation.
 * Hover or keyboard focus shows a compact popup (no under-field paragraphs).
 *
 * Renders a focusable <span> (not <button>) so it is safe inside labels and
 * action buttons — nested <button> would cause a hydration error.
 *
 * Inside an AbbrInfoScope, each code renders at most one mark.
 */
export function AbbrInfo({
  code,
  className = "",
  force = false,
}: AbbrInfoProps) {
  const entry = deskAbbr(code);
  const scope = useContext(AbbrInfoScopeContext);
  const instanceId = useId();
  if (!entry) return null;
  if (!force && scope && !scope.shouldShow(String(code), instanceId)) {
    return null;
  }

  const label = `About ${code}: ${entry.title}`;

  return (
    <span
      className={`abbr-info group relative inline-flex align-middle ${className}`}
    >
      <span
        tabIndex={0}
        role="note"
        className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-ink-soft/40 bg-white text-ink-soft transition hover:border-sea hover:text-sea focus-visible:border-sea focus-visible:text-sea focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea/30"
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {/* SVG so the mark never reads as digit “1” in mono / tight UI fonts */}
        <svg
          viewBox="0 0 12 12"
          width="8"
          height="8"
          aria-hidden="true"
          className="block"
        >
          <circle cx="6" cy="3.1" r="1.05" fill="currentColor" />
          <rect
            x="5.15"
            y="5"
            width="1.7"
            height="4.6"
            rx="0.85"
            fill="currentColor"
          />
        </svg>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg border border-line/80 bg-white px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-ink opacity-0 shadow-[0_12px_28px_-16px_rgba(15,40,45,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="block font-semibold text-ink">{entry.title}</span>
        <span className="mt-0.5 block text-ink-soft">{entry.blurb}</span>
      </span>
    </span>
  );
}

type AbbrLabelProps = {
  /** Abbreviation code shown before the info mark */
  code: DeskAbbrCode;
  /** Text after the mark (e.g. " recovered (£)") */
  after?: string;
  /** Text before the abbreviation (e.g. "File ") */
  before?: string;
  className?: string;
};

/** Label fragment: optional before + abbr + i + optional after. */
export function AbbrLabel({
  code,
  before,
  after,
  className = "",
}: AbbrLabelProps) {
  const known = code in DESK_ABBREVIATIONS;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1 ${className}`}>
      {before ? <span>{before}</span> : null}
      <span className="inline-flex items-center gap-0.5">
        {code}
        {known ? <AbbrInfo code={code} /> : null}
      </span>
      {after ? <span>{after}</span> : null}
    </span>
  );
}
