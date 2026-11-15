import type { ClientFraudMetadata } from "@/lib/fraud-types";

/**
 * Collect metadata in the browser — call immediately before submit.
 * Never cache across submissions.
 *
 * WEB_APP_VIA_SERVER: local IPs should be LAN addresses. We probe RTC when
 * available; otherwise fall back to 127.0.0.1 (HMRC prefers real values —
 * Netlify/edge still supplies Gov-Client-Public-IP from the server).
 */
export function collectClientFraudMetadata(opts?: {
  userId?: string;
}): ClientFraudMetadata {
  if (typeof window === "undefined") {
    throw new Error("collectClientFraudMetadata must run in the browser");
  }
  const s = window.screen;
  const tzOffset = -new Date().getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");

  const deviceId =
    localStorage.getItem("hydratax_device_id") ??
    (() => {
      const id = crypto.randomUUID();
      localStorage.setItem("hydratax_device_id", id);
      return id;
    })();

  const dnt =
    navigator.doNotTrack === "1" ||
    // @ts-expect-error legacy
    navigator.msDoNotTrack === "1" ||
    // @ts-expect-error legacy
    window.doNotTrack === "1";

  const plugins =
    typeof navigator.plugins !== "undefined" && navigator.plugins.length > 0
      ? Array.from(navigator.plugins)
          .map((p) => encodeURIComponent(p.name))
          .join(",")
      : "";

  const userIds = opts?.userId
    ? `hydratax=${encodeURIComponent(opts.userId)}`
    : `hydratax=${encodeURIComponent(deviceId.slice(0, 8))}`;

  // Best-effort cached LAN IPs from a prior RTC probe (set by warmFraudLocalIps).
  const cachedIps = sessionStorage.getItem("hydratax_local_ips");
  const localIps = cachedIps && cachedIps.length > 0 ? cachedIps : "127.0.0.1";

  return {
    browserJsUserAgent: navigator.userAgent,
    timezone: `UTC${sign}${hh}:${mm}`,
    screens: `width=${s.width}&height=${s.height}&scaling-factor=${window.devicePixelRatio}&colour-depth=${s.colorDepth}`,
    windowSize: `width=${window.innerWidth}&height=${window.innerHeight}`,
    localIps,
    localIpsTimestamp: new Date().toISOString(),
    deviceId,
    doNotTrack: dnt ? "true" : "false",
    browserPlugins: plugins,
    userIds,
    multiFactor: "",
  };
}

/** Optional RTC probe — call on VAT/SA desk mount to refresh LAN IPs. */
export function warmFraudLocalIps(): void {
  if (typeof window === "undefined") return;
  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel("");
    const ips = new Set<string>();
    pc.onicecandidate = (ev) => {
      const cand = ev.candidate?.candidate;
      if (!cand) return;
      const m = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9:]+)/i.exec(cand);
      if (m?.[1] && !m[1].startsWith("0.0.0.0")) ips.add(m[1]);
      if (ips.size > 0) {
        sessionStorage.setItem(
          "hydratax_local_ips",
          Array.from(ips).slice(0, 8).join(","),
        );
      }
    };
    void pc.createOffer().then((o) => pc.setLocalDescription(o));
    setTimeout(() => pc.close(), 1500);
  } catch {
    /* ignore */
  }
}
