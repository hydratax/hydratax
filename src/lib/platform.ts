/**
 * Runtime platform helpers for web → PWA → Capacitor native shells.
 * Keep UI logic web-first; branch only when native APIs are required.
 */

export type AppPlatform = "web" | "pwa" | "ios" | "android";

export function getAppPlatform(): AppPlatform {
  if (typeof window === "undefined") return "web";

  const cap = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }
  ).Capacitor;

  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.();
    if (p === "ios") return "ios";
    if (p === "android") return "android";
  }

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari “Add to Home Screen”
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

  return standalone ? "pwa" : "web";
}

export function isNativeShell() {
  const p = getAppPlatform();
  return p === "ios" || p === "android";
}

export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}
