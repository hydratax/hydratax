import type { ClientFraudMetadata } from "@/lib/fraud-types";

/** Collect metadata in the browser — call immediately before submit. Never cache across submissions. */
export function collectClientFraudMetadata(): ClientFraudMetadata {
  if (typeof window === "undefined") {
    throw new Error("collectClientFraudMetadata must run in the browser");
  }
  const s = window.screen;
  const tzOffset = -new Date().getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");

  return {
    browserJsUserAgent: navigator.userAgent,
    timezone: `UTC${sign}${hh}:${mm}`,
    screens: `width=${s.width}&height=${s.height}&scaling-factor=${window.devicePixelRatio}&colour-depth=${s.colorDepth}`,
    windowSize: `width=${window.innerWidth}&height=${window.innerHeight}`,
    localIps: "127.0.0.1",
    localIpsTimestamp: new Date().toISOString(),
    deviceId:
      localStorage.getItem("hydratax_device_id") ??
      (() => {
        const id = crypto.randomUUID();
        localStorage.setItem("hydratax_device_id", id);
        return id;
      })(),
  };
}
