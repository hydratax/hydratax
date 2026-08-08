"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/bank", label: "Bank", key: "bank" },
] as const;

export function ClientTabs({
  clientId,
  active,
  moduleAccess = "full",
}: {
  clientId: string;
  active: string;
  moduleAccess?: ModuleAccess;
}) {
  const pathname = usePathname();
  const visible = tabs.filter((tab) =>
    canAccessModule(moduleAccess, tabKeyToModule(tab.key)),
  );

  return (
    <div className="mb-7 overflow-x-auto border-b border-line pb-0">
      <div className="flex min-w-max gap-1">
        {visible.map((tab) => {
          const href = `/clients/${clientId}${tab.href}`;
          const isActive =
            active === tab.key ||
            (tab.href !== "" && pathname.endsWith(tab.href));
          return (
            <Link
              key={tab.label}
              href={href}
              className={`relative rounded-t-md px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-white hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
