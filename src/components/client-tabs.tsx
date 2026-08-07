"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "", label: "Overview", key: "overview" },
  { href: "/books", label: "Books", key: "books" },
  { href: "/vat", label: "VAT", key: "vat" },
  { href: "/self-assessment", label: "Self Assessment", key: "self-assessment" },
  { href: "/corporation-tax", label: "Corporation Tax", key: "corporation-tax" },
  { href: "/payroll", label: "Payroll", key: "payroll" },
  { href: "/documents", label: "Documents", key: "documents" },
  { href: "/bank", label: "Bank", key: "bank" },
] as const;

export function ClientTabs({
  clientId,
  active,
}: {
  clientId: string;
  active: string;
}) {
  const pathname = usePathname();

  return (
    <div className="mb-7 overflow-x-auto border-b border-line pb-0">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
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
