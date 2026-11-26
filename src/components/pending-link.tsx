"use client";

import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";

type PendingLinkProps = {
  href: string;
  className?: string;
  children: ReactNode | ((pending: boolean) => ReactNode);
  /** Replaces the label while the next page is opening. */
  pendingLabel?: ReactNode;
  replace?: boolean;
};

/** Shown immediately, even if the control unmounts while the next page loads. */
export function markNavPending(label: string) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.navPending = label;
}

export function clearNavPending() {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.navPending;
}

export function PendingLink({
  href,
  className,
  children,
  pendingLabel,
  replace,
}: PendingLinkProps) {
  const [pending, setPending] = useState(false);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    const destination = new URL(href, window.location.href);
    if (
      destination.pathname === window.location.pathname &&
      destination.search === window.location.search
    ) {
      if (destination.hash) {
        // Same-page section link — land on the target (or top if missing).
        const id = destination.hash.slice(1);
        const el =
          document.getElementById(id) ||
          document.querySelector(`[data-scroll-section="${CSS.escape(id)}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      }
      return;
    }
    // New page: start from the top immediately so the next view is not stuck
    // on the previous scroll position (e.g. footer CTAs).
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const label = typeof pendingLabel === "string" ? pendingLabel : "Opening…";
    markNavPending(label);
    setPending(true);
  }

  const content =
    typeof children === "function"
      ? children(pending)
      : pending && pendingLabel != null
        ? pendingLabel
        : children;

  return (
    <Link
      href={href}
      replace={replace}
      aria-busy={pending || undefined}
      data-pending={pending ? "true" : undefined}
      className={[className, pending ? "is-pending" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
