"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signOutSupabase } from "@/server/actions/auth";

export function MobileNav({
  items,
  showSignOut = false,
}: {
  items: { href: string; label: string }[];
  showSignOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        className="btn btn-secondary px-3 py-2 text-sm"
        aria-expanded={open}
        aria-controls="mobile-shell-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <div
          id="mobile-shell-nav"
          className="absolute right-0 top-full z-40 mt-2 min-w-[12rem] rounded-xl border border-line bg-white py-2 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2.5 text-sm font-semibold text-ink hover:bg-sand"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {showSignOut && (
            <button
              type="button"
              disabled={pending}
              className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-ink hover:bg-sand"
              onClick={() => {
                setOpen(false);
                start(async () => {
                  await signOutSupabase();
                });
              }}
            >
              {pending ? "Signing out…" : "Sign out"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
