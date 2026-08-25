"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  canAccessModule,
  tabKeyToModule,
  type ModuleAccess,
} from "@/lib/access";

const tabs = [
  { href: "", label: "Overview", key: "overview" },
  { href: "/books", label: "Books", key: "books" },
  { href: "/vat", label: "VAT", key: "vat" },
  { href: "/self-assessment", label: "Self Assessment", key: "self-assessment" },
  { href: "/corporation-tax", label: "Corporation Tax", key: "corporation-tax" },
  { href: "/payroll", label: "Payroll", key: "payroll" },
  { href: "/invoices", label: "Invoices", key: "invoices" },
  { href: "/documents", label: "Documents", key: "documents" },
  { href: "/communications", label: "Communications", key: "communications" },
  { href: "/bank", label: "Bank", key: "bank" },
] as const;

function activeTabFromPath(pathname: string, clientSlug: string) {
  const base = `/clients/${clientSlug}`;
  if (pathname === base) return "overview";
  for (const tab of tabs) {
    if (tab.href && pathname.startsWith(`${base}${tab.href}`)) {
      return tab.key;
    }
  }
  return "overview";
}

export function ClientTabs({
  clientSlug,
  moduleAccess = "full",
}: {
  clientSlug: string;
  /** @deprecated Active tab is inferred from the URL */
  active?: string;
  moduleAccess?: ModuleAccess;
}) {
  const pathname = usePathname();
  const active = activeTabFromPath(pathname, clientSlug);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const visible = tabs.filter((tab) =>
    canAccessModule(moduleAccess, tabKeyToModule(tab.key)),
  );

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Clear sticky pending if navigation stalls (e.g. slow RSC).
  useEffect(() => {
    if (!pendingHref) return;
    const t = window.setTimeout(() => setPendingHref(null), 8_000);
    return () => window.clearTimeout(t);
  }, [pendingHref]);

  return (
    <div
      className={`mb-7 overflow-x-auto border-b border-line pb-0 transition-opacity ${
        pendingHref ? "opacity-70" : ""
      }`}
      role="tablist"
      aria-label="Client workspace tabs"
      aria-busy={pendingHref ? true : undefined}
    >
      <div className="flex min-w-max gap-1">
        {visible.map((tab) => {
          const href = `/clients/${clientSlug}${tab.href}`;
          const isActive = active === tab.key;
          const isPending = pendingHref === href;
          return (
            <Link
              key={tab.label}
              href={href}
              prefetch
              onClick={() => {
                if (href === pathname) return;
                setPendingHref(href);
              }}
              className={`relative rounded-t-md px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-white hover:text-ink"
              } ${isPending ? "ring-2 ring-sea/40 ring-offset-1" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
