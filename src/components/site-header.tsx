"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FreeTrialBanner } from "@/components/free-trial-banner";

const SERVICES = [
  { label: "MTD VAT", href: "/pricing#vat" },
  { label: "Corporation Tax", href: "/pricing#ct600" },
  { label: "Confirmation Statement", href: "/companies-house/confirmation-statement" },
  { label: "Annual accounts", href: "/companies-house/accounts-ixbrl" },
  { label: "PAYE / RTI", href: "/pricing#payroll" },
  { label: "Self Assessment", href: "/pricing#self-assessment" },
] as const;

const NAV_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/companies-house", label: "Companies House" },
  { href: "/blog", label: "Guides" },
] as const;

/**
 * Shared public header: Services dropdown · Pricing · Companies House · Sign in · Sign up.
 */
export function SiteHeader({
  dark = false,
}: {
  /** Absolute header over dark hero (landing / CH hub) */
  dark?: boolean;
}) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!servicesRef.current?.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setServicesOpen(false);
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

  const shell = dark
    ? "absolute inset-x-0 top-0 z-20"
    : "sticky top-0 z-30 border-b border-line/80 bg-white/90 backdrop-blur-md";
  const brand = dark ? "text-white" : "text-ink";
  const navMuted = dark
    ? "text-white/80 hover:text-white"
    : "text-ink-soft hover:text-ink";
  const signIn = dark ? "btn btn-ghost-light text-sm" : "btn btn-secondary text-sm";
  const signUp = dark ? "btn btn-light text-sm" : "btn btn-primary text-sm";
  const menuBtn = dark
    ? "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/25 text-white"
    : "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink";

  function closeMobile() {
    setMobileOpen(false);
    setServicesOpen(false);
  }

  return (
    <header className={shell}>
      <FreeTrialBanner dark={dark} />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-4">
        <Link href="/" className="inline-flex min-w-0 items-center gap-2.5" onClick={closeMobile}>
          <span
            className={
              dark
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 p-1.5 shadow-sm sm:h-10 sm:w-10"
                : "shrink-0"
            }
          >
            <Image
              src="/brand/logo.png"
              alt="HydraTax"
              width={dark ? 28 : 32}
              height={dark ? 28 : 32}
              priority
              className="object-contain"
            />
          </span>
          <span className={`display truncate text-lg font-semibold sm:text-xl ${brand}`}>
            HydraTax
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          className={`hidden flex-1 flex-wrap items-center justify-end gap-x-5 text-sm font-semibold lg:flex ${navMuted}`}
        >
          <div className="relative" ref={servicesRef}>
            <button
              type="button"
              className={`${navMuted} inline-flex items-center gap-1`}
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
                className="absolute left-0 top-full z-40 min-w-[220px] pt-2"
              >
                <div className="rounded-lg border border-line bg-white py-2 shadow-lg">
                  {SERVICES.map((p) => (
                    <Link
                      key={p.label}
                      href={p.href}
                      role="menuitem"
                      className="block px-4 py-2 text-ink-soft hover:bg-sand hover:text-ink"
                      onClick={() => setServicesOpen(false)}
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={navMuted}>
              {l.label}
            </Link>
          ))}

          <Link href="/sign-in" className={signIn}>
            Sign in
          </Link>
          <Link href="/create-account" className={signUp}>
            Sign up
          </Link>
        </nav>

        {/* Mobile: sign up + menu */}
        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/create-account" className={`${signUp} !min-h-0 px-3 py-2 text-xs`}>
            Sign up
          </Link>
          <button
            type="button"
            className={menuBtn}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
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
          id="mobile-nav"
          className={
            dark
              ? "border-t border-white/10 bg-ink/95 px-4 py-4 backdrop-blur-md lg:hidden"
              : "border-t border-line bg-white px-4 py-4 shadow-lg lg:hidden"
          }
        >
          <nav className="flex flex-col gap-1 text-sm font-semibold">
            <p
              className={`px-2 pb-1 text-xs font-bold uppercase tracking-[0.14em] ${
                dark ? "text-white/45" : "text-ink-soft"
              }`}
            >
              Services
            </p>
            {SERVICES.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className={`rounded-lg px-3 py-2.5 ${
                  dark ? "text-white/90 hover:bg-white/10" : "text-ink hover:bg-sand"
                }`}
                onClick={closeMobile}
              >
                {p.label}
              </Link>
            ))}
            <div className={`my-2 border-t ${dark ? "border-white/10" : "border-line"}`} />
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2.5 ${
                  dark ? "text-white/90 hover:bg-white/10" : "text-ink hover:bg-sand"
                }`}
                onClick={closeMobile}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/sign-in" className={`${signIn} w-full justify-center`} onClick={closeMobile}>
                Sign in
              </Link>
              <Link
                href="/create-account"
                className={`${signUp} w-full justify-center`}
                onClick={closeMobile}
              >
                Sign up
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
