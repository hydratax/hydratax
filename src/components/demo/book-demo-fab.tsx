"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Floating Book a demo — shown on public marketing pages only. */
export function BookDemoFab() {
  const pathname = usePathname() || "/";
  const hide =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/filings") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/create-account") ||
    pathname.startsWith("/book-demo") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/portal");

  if (hide) return null;

  return (
    <Link
      href="/book-demo"
      className="fixed bottom-5 left-4 z-[90] inline-flex items-center gap-2 rounded-full border border-sea/30 bg-sea px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-12px_rgba(15,118,110,0.65)] transition hover:bg-sea-deep md:bottom-6 md:left-6"
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs"
        aria-hidden
      >
        ▸
      </span>
      Book a demo
    </Link>
  );
}
