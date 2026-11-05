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
      return;
    }
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
