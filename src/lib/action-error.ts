/**
 * Server Actions that `throw` in production often reach the browser as
 * "Minified React error #441" (real message stripped). Prefer returning
 * `{ ok: false, error }` for expected failures; use this when catching.
 */
export function humanizeActionError(
  message: string | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = (message ?? "").trim();
  if (!raw) return fallback;

  if (/Minified React error\s*#441/i.test(raw)) {
    return "The server hit a problem handling this request. Please try again in a moment.";
  }
  if (/Minified React error/i.test(raw)) {
    return "Something went wrong on our side. Please try again.";
  }
  if (/digest|omitted in production/i.test(raw)) {
    return fallback;
  }

  return raw;
}

export function messageFromUnknown(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err instanceof Error) {
    return humanizeActionError(err.message, fallback);
  }
  if (typeof err === "string") {
    return humanizeActionError(err, fallback);
  }
  return fallback;
}
