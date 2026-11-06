"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  canAccessModule,
  tabKeyToModule,
  type ModuleAccess,
} from "@/lib/access";
import { markNavPending } from "@/components/pending-link";

const mainTabs = [
  { href: "", label: "Overview", key: "overview" },
  { href: "/vat", label: "VAT", key: "vat" },
  { href: "/self-assessment", label: "Self Assessment", key: "self-assessment" },
  { href: "/corporation-tax", label: "Corporation Tax", key: "corporation-tax" },
  { href: "/payroll", label: "Payroll", key: "payroll" },
  { href: "/invoices", label: "Invoices", key: "invoices" },
  { href: "/engagement", label: "Engagement", key: "engagement" },
  { href: "/forms", label: "Forms and letters", key: "forms" },
  { href: "/communications", label: "Communications", key: "communications" },
] as const;

const booksItems = [
  { href: "/books", label: "Ledger", key: "books" },
  { href: "/bank", label: "Bank", key: "bank" },
  { href: "/documents", label: "Documents", key: "documents" },
  { href: "/portal", label: "Client link", key: "portal" },
] as const;

type TabItem =
  | (typeof mainTabs)[number]
  | (typeof booksItems)[number];

function activeTabFromPath(pathname: string, clientSlug: string) {
  const base = `/clients/${clientSlug}`;
  if (pathname === base) return "overview";
  for (const tab of [...booksItems, ...mainTabs]) {
    if (tab.href && pathname.startsWith(`${base}${tab.href}`)) {
      return tab.key;
    }
  }
  return "overview";
}

function tabClass(isActive: boolean, isPending: boolean) {
  return `relative rounded-t-md px-3.5 py-2.5 text-sm font-semibold transition ${
    isActive
      ? "bg-ink text-white"
      : "text-ink-soft hover:bg-white hover:text-ink"
  } ${isPending ? "ring-2 ring-sea/40 ring-offset-1" : ""}`;
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
  const [pendingFromPath, setPendingFromPath] = useState<string | null>(null);
  const [booksOpen, setBooksOpen] = useState(false);
  const booksRef = useRef<HTMLDivElement>(null);
  const booksMenuId = useId();
  const showPending =
    pendingHref && pendingFromPath === pathname ? pendingHref : null;

  const visibleMain = mainTabs.filter((tab) =>
    canAccessModule(moduleAccess, tabKeyToModule(tab.key)),
  );
  const visibleBooks = booksItems.filter((tab) =>
    canAccessModule(moduleAccess, tabKeyToModule(tab.key)),
  );
  const booksActive = visibleBooks.some((t) => t.key === active);

  useEffect(() => {
    if (!showPending) return;
    const t = window.setTimeout(() => {
      setPendingHref(null);
      setPendingFromPath(null);
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [showPending]);

  useEffect(() => {
    setBooksOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!booksOpen) return;
    function onDoc(e: MouseEvent) {
      if (!booksRef.current?.contains(e.target as Node)) setBooksOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBooksOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [booksOpen]);

  function markPending(href: string, label: string) {
    if (href === pathname) return;
    setPendingHref(href);
    setPendingFromPath(pathname);
    markNavPending(label);
  }

  function TabLink({ tab }: { tab: TabItem }) {
    const href = `/clients/${clientSlug}${tab.href}`;
    const isActive = active === tab.key;
    const isPending = showPending === href;
    return (
      <Link
        href={href}
        prefetch
        onClick={() => markPending(href, `Opening ${tab.label}…`)}
        className={tabClass(isActive, isPending)}
        aria-current={isActive ? "page" : undefined}
      >
        {tab.label}
      </Link>
    );
  }

  return (
    <div
      className={`mb-7 border-b border-line pb-0 transition-opacity ${
        showPending ? "opacity-70" : ""
      }`}
      role="tablist"
      aria-label="Client workspace tabs"
      aria-busy={showPending ? true : undefined}
    >
      <div className="flex flex-wrap gap-1">
        {visibleMain[0] && <TabLink tab={visibleMain[0]} />}

        {visibleBooks.length > 0 && (
          <div className="relative" ref={booksRef}>
            <button
              type="button"
              className={`${tabClass(booksActive, false)} inline-flex items-center gap-1`}
              aria-expanded={booksOpen}
              aria-haspopup="menu"
              aria-controls={booksMenuId}
              onClick={() => setBooksOpen((v) => !v)}
            >
              Books
              <span className="text-[0.65rem] opacity-70" aria-hidden>
                ▾
              </span>
            </button>
            {booksOpen && (
              <div
                id={booksMenuId}
                role="menu"
                className="absolute left-0 top-full z-40 min-w-[11rem] pt-1"
              >
                <div className="rounded-lg border border-line bg-white py-1 shadow-lg">
                  {visibleBooks.map((tab) => {
                    const href = `/clients/${clientSlug}${tab.href}`;
                    const isActive = active === tab.key;
                    return (
                      <Link
                        key={tab.key}
                        href={href}
                        role="menuitem"
                        prefetch
                        onClick={() => {
                          markPending(href, `Opening ${tab.label}…`);
                          setBooksOpen(false);
                        }}
                        className={`block px-4 py-2 text-sm font-semibold ${
                          isActive
                            ? "bg-sea/10 text-sea"
                            : "text-ink-soft hover:bg-sand hover:text-ink"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {visibleMain.slice(1).map((tab) => (
          <TabLink key={tab.key} tab={tab} />
        ))}
      </div>
    </div>
  );
}
