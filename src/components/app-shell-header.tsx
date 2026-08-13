"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOutSupabase } from "@/server/actions/auth";

type NavItem = { href: string; label: string };

/**
 * Practice desk header — same pattern as the public site:
 * Services dropdown + a few top-level links + Sign out (no Menu button).
 */
export function AppShellHeader({
  serviceItems,
  links,
  hmrcLabel,
  accessBadge,
}: {
  serviceItems: NavItem[];
  links: NavItem[];
  hmrcLabel: string;
  accessBadge?: string | null;
}) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!servicesRef.current?.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setServicesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href="/dashboard" className="inline-flex shrink-0 items-center gap-2.5">
          <Image
            src="/brand/logo.png"
            alt="HydraTax"
            width={32}
            height={32}
            className="object-contain"
            priority
          />
          <span className="display text-lg font-semibold text-ink sm:text-xl">
            HydraTax
          </span>
        </Link>

        <nav className="flex flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm font-semibold text-ink-soft sm:gap-x-5">
          {serviceItems.length > 0 && (
            <div className="relative" ref={servicesRef}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-ink-soft hover:text-ink"
                aria-expanded={servicesOpen}
                aria-haspopup="menu"
                onClick={() => setServicesOpen((v) => !v)}
              >
                Services
                <span className="text-[0.65rem] opacity-70" aria-hidden>
                  ▾
                </span>
              </button>
              {servicesOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 min-w-[220px] pt-2 sm:left-0 sm:right-auto"
                >
                  <div className="rounded-lg border border-line bg-white py-2 shadow-lg">
                    {serviceItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className="block px-4 py-2 text-ink-soft hover:bg-sand hover:text-ink"
                        onClick={() => setServicesOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-soft hover:text-ink"
            >
              {item.label}
            </Link>
          ))}

          <span className="badge badge-sea mono">{hmrcLabel}</span>
          {accessBadge ? (
            <span className="badge badge-muted">{accessBadge}</span>
          ) : null}

          <button
            type="button"
            disabled={pending}
            className="btn btn-secondary text-sm"
            onClick={() => {
              start(async () => {
                await signOutSupabase();
              });
            }}
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </div>
    </header>
  );
}
