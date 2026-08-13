"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="btn btn-secondary min-h-11 min-w-11 px-3 text-sm"
        aria-expanded={open}
        aria-controls="mobile-shell-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <div
          id="mobile-shell-nav"
          className="fixed inset-0 z-50 bg-ink/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto border-b border-line bg-white px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] shadow-xl safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="display text-lg font-semibold text-ink">Menu</span>
              <button
                type="button"
                className="btn btn-secondary min-h-11 px-3 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <nav className="flex flex-col">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-3.5 text-base font-semibold text-ink hover:bg-sand"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              {showSignOut && (
                <>
                  <hr className="my-2 border-line" />
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-lg px-3 py-3.5 text-left text-base font-semibold text-ink hover:bg-sand"
                    onClick={() => {
                      setOpen(false);
                      start(async () => {
                        await signOutSupabase();
                      });
                    }}
                  >
                    {pending ? "Signing out…" : "Sign out"}
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
