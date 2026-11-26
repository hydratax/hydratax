"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function scrollWindowTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function scrollToHashTarget(hash: string) {
  const id = hash.replace(/^#/, "").trim();
  if (!id) {
    scrollWindowTop();
    return false;
  }
  const el =
    document.getElementById(id) ||
    document.querySelector(`[data-scroll-section="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/**
 * After every in-app navigation: open from the top of the page, or land on the
 * #hash / data-scroll-section target when the link points at a section.
 */
export function ScrollOnNavigate() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    const routeKey = `${pathname}?${search}`;
    const hash = window.location.hash;
    const routeChanged = lastRoute.current !== routeKey;
    lastRoute.current = routeKey;

    if (!hash) {
      scrollWindowTop();
      return;
    }

    // Path changed (or first paint): jump to top first so we are not stuck at
    // the previous page's footer, then try the section target.
    if (routeChanged) scrollWindowTop();

    let attempts = 0;
    const tryHash = () => {
      if (scrollToHashTarget(hash)) return;
      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(tryHash, 50 * attempts);
      }
    };
    const t0 = window.setTimeout(tryHash, 0);
    const t1 = window.setTimeout(tryHash, 120);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [pathname, search]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash;
      if (!hash) {
        scrollWindowTop();
        return;
      }
      if (!scrollToHashTarget(hash)) {
        window.setTimeout(() => scrollToHashTarget(hash), 80);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Plain <Link> / <a> clicks (footer CTAs, header, etc.): reset scroll as soon
  // as we leave the current path so the next page never opens mid-footer.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const samePath =
        url.pathname === window.location.pathname &&
        url.search === window.location.search;
      if (samePath) {
        if (url.hash) {
          // Let the browser / hash listener land on the section.
          return;
        }
        scrollWindowTop();
        return;
      }
      scrollWindowTop();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
