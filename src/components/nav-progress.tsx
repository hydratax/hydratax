"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "loading" | "finishing";

/**
 * Smooth top progress bar. Advances while a navigation is pending and
 * completes only after the destination route has committed (pathname/search
 * change + paint). Driven by `html[data-nav-pending]` from PendingLink / tabs.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [phase, setPhase] = useState<Phase>("idle");
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const routeAtStart = useRef(routeKey);
  const tickRef = useRef<number | null>(null);
  const hideRef = useRef<number | null>(null);

  useEffect(() => {
    function readPending() {
      return Boolean(document.documentElement.dataset.navPending);
    }

    function start() {
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (hideRef.current) window.clearTimeout(hideRef.current);
      routeAtStart.current = `${window.location.pathname}${window.location.search}`;
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
    }

    function finish() {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setPhase("finishing");
      setWidth(100);
      hideRef.current = window.setTimeout(() => {
        setVisible(false);
        setPhase("idle");
        setWidth(0);
        delete document.documentElement.dataset.navPending;
      }, 280);
    }

    const mo = new MutationObserver(() => {
      if (readPending()) start();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-nav-pending"],
    });

    if (readPending()) start();

    return () => {
      mo.disconnect();
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (hideRef.current) window.clearTimeout(hideRef.current);
    };
  }, []);

  // Destination ready — complete the bar after this route commits.
  useEffect(() => {
    if (phase !== "loading") return;
    const pending = document.documentElement.dataset.navPending;
    if (!pending) return;
    // Wait a frame so RSC content can paint, then finish.
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (document.documentElement.dataset.navPending) finishSafe();
      });
    });
    return () => window.cancelAnimationFrame(id);

    function finishSafe() {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setPhase("finishing");
      setWidth(100);
      hideRef.current = window.setTimeout(() => {
        setVisible(false);
        setPhase("idle");
        setWidth(0);
        delete document.documentElement.dataset.navPending;
      }, 280);
    }
  }, [routeKey, phase]);

  if (!visible && phase === "idle") return null;

  const label =
    typeof document !== "undefined"
      ? document.documentElement.dataset.navPending
      : undefined;

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
      {phase === "loading" && label ? (
        <p className="mx-auto mt-2 w-fit rounded-full border border-sea/20 bg-white/95 px-3 py-1 text-xs font-semibold text-sea shadow-sm backdrop-blur">
          {label}
        </p>
      ) : null}
    </div>
  );
}
