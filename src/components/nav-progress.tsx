"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "loading" | "finishing";

function routeKeyFrom(pathname: string, search: string) {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${pathname}?${q}` : pathname;
}

/**
 * Smooth top progress bar + “Opening…” chip. Advances while a navigation is
 * pending and completes only after the destination route has committed
 * (pathname/search change + paint). Driven by `html[data-nav-pending]`.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = routeKeyFrom(pathname, searchParams?.toString() ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState<string | undefined>(undefined);
  const routeAtStart = useRef(routeKey);
  const tickRef = useRef<number | null>(null);
  const hideRef = useRef<number | null>(null);
  const safetyRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    function clearTimers() {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (hideRef.current) {
        window.clearTimeout(hideRef.current);
        hideRef.current = null;
      }
      if (safetyRef.current) {
        window.clearTimeout(safetyRef.current);
        safetyRef.current = null;
      }
    }

    function finish() {
      if (phaseRef.current === "finishing" || phaseRef.current === "idle") return;
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (safetyRef.current) {
        window.clearTimeout(safetyRef.current);
        safetyRef.current = null;
      }
      setPhase("finishing");
      setWidth(100);
      hideRef.current = window.setTimeout(() => {
        setVisible(false);
        setPhase("idle");
        setWidth(0);
        setLabel(undefined);
        delete document.documentElement.dataset.navPending;
        hideRef.current = null;
      }, 280);
    }

    function start() {
      const pending = document.documentElement.dataset.navPending;
      if (!pending) return;
      clearTimers();
      routeAtStart.current = routeKeyFrom(
        window.location.pathname,
        window.location.search,
      );
      setLabel(pending);
      setVisible(true);
      setPhase("loading");
      setWidth(12);
      tickRef.current = window.setInterval(() => {
        setWidth((w) => {
          if (w >= 88) return w;
          const step = w < 40 ? 7 : w < 70 ? 3.5 : 1.2;
          return Math.min(88, w + step);
        });
      }, 180);
      // If navigation never commits (cancelled / same URL), clear eventually.
      safetyRef.current = window.setTimeout(() => {
        if (document.documentElement.dataset.navPending) finish();
      }, 12_000);
    }

    const mo = new MutationObserver(() => {
      if (document.documentElement.dataset.navPending) start();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-nav-pending"],
    });

    if (document.documentElement.dataset.navPending) start();

    return () => {
      mo.disconnect();
      clearTimers();
    };
  }, []);

  // Destination ready — only finish after the route key actually changes.
  useEffect(() => {
    if (phase !== "loading") return;
    if (routeKey === routeAtStart.current) return;

    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (phaseRef.current !== "loading") return;
        if (!document.documentElement.dataset.navPending) return;
        if (tickRef.current) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        if (safetyRef.current) {
          window.clearTimeout(safetyRef.current);
          safetyRef.current = null;
        }
        // Destination committed — ensure we are not still parked on the old scroll.
        if (!window.location.hash) {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
        setPhase("finishing");
        setWidth(100);
        hideRef.current = window.setTimeout(() => {
          setVisible(false);
          setPhase("idle");
          setWidth(0);
          setLabel(undefined);
          delete document.documentElement.dataset.navPending;
          hideRef.current = null;
        }, 280);
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [routeKey, phase]);

  if (!visible && phase === "idle") return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90]"
      aria-hidden={!visible}
      aria-busy={phase === "loading"}
    >
      <div className="h-[3px] w-full bg-transparent">
        <div
          className="h-full origin-left rounded-r-full bg-sea shadow-[0_0_12px_rgba(15,118,110,0.45)] transition-[width,opacity] duration-200 ease-out"
          style={{
            width: `${width}%`,
            opacity: visible ? 1 : 0,
          }}
        />
      </div>
      {(phase === "loading" || phase === "finishing") && label ? (
        <p className="mx-auto mt-2 w-fit rounded-full border border-sea/20 bg-white/95 px-3 py-1 text-xs font-semibold text-sea shadow-sm backdrop-blur">
          {label}
        </p>
      ) : null}
    </div>
  );
}
