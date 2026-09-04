"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOutSupabase } from "@/server/actions/auth";

type NavItem = { href: string; label: string };

/**
 * Practice desk header — desktop links + account menu;
 * mobile uses a hamburger for Services / nav / account actions.
 */
export function AppShellHeader({
  serviceItems,
  links,
  accessBadge,
  userEmail,
  canManageTeam,
}: {
  serviceItems: NavItem[];
  links: NavItem[];
  accessBadge?: string | null;
  userEmail?: string | null;
  canManageTeam?: boolean;
}) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();

  const initials = (userEmail ?? "U")
    .split("@")[0]
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!servicesRef.current?.contains(e.target as Node)) {
        setServicesOpen(false);
      }
      if (!accountRef.current?.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setServicesOpen(false);
        setAccountOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
    setServicesOpen(false);
    setAccountOpen(false);
  }

  function signOut() {
    closeMobile();
    start(async () => {
      await signOutSupabase();
    });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link
          href="/dashboard"
          className="inline-flex min-w-0 shrink-0 items-center gap-2.5"
          onClick={closeMobile}
        >
          <Image
            src="/brand/logo.png"
            alt="HydraTax"
            width={32}
            height={32}
            className="object-contain"
            priority
          />
          <span className="display truncate text-lg font-semibold text-ink sm:text-xl">
            HydraTax
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm font-semibold text-ink-soft md:flex sm:gap-x-5">
          {serviceItems.length > 0 && (
            <div className="relative" ref={servicesRef}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-ink-soft hover:text-ink"
                aria-expanded={servicesOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setServicesOpen((v) => !v);
                  setAccountOpen(false);
                }}
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

          {accessBadge ? (
            <span className="badge badge-muted">{accessBadge}</span>
          ) : null}

          <div className="relative" ref={accountRef}>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-sand text-xs font-bold text-ink hover:border-sea hover:text-sea"
              aria-label="Account menu"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              onClick={() => {
                setAccountOpen((v) => !v);
                setServicesOpen(false);
              }}
            >
              {initials}
            </button>
            {accountOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 min-w-[220px] pt-2"
              >
                <div className="rounded-lg border border-line bg-white py-2 shadow-lg">
                  {userEmail ? (
                    <p className="truncate border-b border-line px-4 py-2 text-xs text-ink-soft">
                      {userEmail}
                    </p>
                  ) : null}
                  <Link
                    href="/settings/account"
                    role="menuitem"
                    className="block px-4 py-2 text-ink-soft hover:bg-sand hover:text-ink"
                    onClick={() => setAccountOpen(false)}
                  >
                    Account
                  </Link>
                  {canManageTeam ? (
                    <Link
                      href="/settings/team"
                      role="menuitem"
                      className="block px-4 py-2 text-ink-soft hover:bg-sand hover:text-ink"
                      onClick={() => setAccountOpen(false)}
                    >
                      Team & roles
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className="block w-full px-4 py-2 text-left text-ink-soft hover:bg-sand hover:text-ink disabled:opacity-60"
                    onClick={signOut}
                  >
                    {pending ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Mobile: avatar + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          {accessBadge ? (
            <span className="badge badge-muted max-w-[7rem] truncate">
              {accessBadge}
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink"
            aria-expanded={mobileOpen}
            aria-controls="app-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <span className="text-lg leading-none" aria-hidden>
                ×
              </span>
            ) : (
              <span className="flex flex-col gap-1.5" aria-hidden>
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="app-mobile-nav"
          className="border-t border-line bg-white px-4 py-4 shadow-lg md:hidden"
        >
          <nav className="flex flex-col gap-1 text-sm font-semibold">
            {userEmail ? (
              <p className="truncate px-3 pb-2 text-xs text-ink-soft">
                {userEmail}
              </p>
            ) : null}

            {serviceItems.length > 0 && (
              <>
                <p className="px-2 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Services
                </p>
                {serviceItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2.5 text-ink hover:bg-sand"
                    onClick={closeMobile}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-2 border-t border-line" />
              </>
            )}

            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2.5 text-ink hover:bg-sand"
                onClick={closeMobile}
              >
                {item.label}
              </Link>
            ))}

            <div className="my-2 border-t border-line" />

            <Link
              href="/settings/account"
              className="rounded-lg px-3 py-2.5 text-ink hover:bg-sand"
              onClick={closeMobile}
            >
              Account
            </Link>
            {canManageTeam ? (
              <Link
                href="/settings/team"
                className="rounded-lg px-3 py-2.5 text-ink hover:bg-sand"
                onClick={closeMobile}
              >
                Team & roles
              </Link>
            ) : null}
            <button
              type="button"
              disabled={pending}
              className="rounded-lg px-3 py-2.5 text-left text-ink hover:bg-sand disabled:opacity-60"
              onClick={signOut}
            >
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
