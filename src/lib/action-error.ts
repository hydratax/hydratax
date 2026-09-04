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

  // Zod / validation dumps (JSON array or stringified issues)
  const zodFriendly = friendlyZodMessage(raw);
  if (zodFriendly) return zodFriendly;

  if (
    /unexpected response was received from the server/i.test(raw) ||
    /invalid server actions request/i.test(raw)
  ) {
    return "The server could not complete this request. Refresh the page and try again.";
  }
  if (/Minified React error\s*#441/i.test(raw)) {
    return "The server hit a problem handling this request. Please try again in a moment.";
  }
  if (/Minified React error/i.test(raw)) {
    return "Something went wrong on our side. Please try again.";
  }
  if (/digest|omitted in production/i.test(raw)) {
    return fallback;
  }
  if (/pkce|code verifier|not found in storage|auth flow was initiated/i.test(raw)) {
    return "Google sign-in did not finish. If you already have an account with this email, sign in with your password or use Forgot password.";
  }
  if (
    /already registered|already been registered|already exists|identity_already_exists|email address is already associated/i.test(
      raw,
    )
  ) {
    return "An account with this email already exists. Sign in with your password, or use Forgot password.";
  }
  if (/cannot read propert(y|ies) of null/i.test(raw) && /reset/i.test(raw)) {
    return "Saved successfully, but the form could not clear afterwards. Refresh the page if you still see this message.";
  }
  if (/cannot read propert(y|ies) of null/i.test(raw)) {
    return "Something went wrong updating this screen. Refresh the page and try again.";
  }
  if (/invalid nino/i.test(raw)) {
    return "That National Insurance number is not valid. Use the format AB123456C (last letter must be A, B, C or D).";
  }

  return raw;
}

function friendlyZodMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const issues = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { issues?: unknown }).issues)
        ? ((parsed as { issues: unknown[] }).issues)
        : null;
    if (!issues?.length) return null;

    const parts: string[] = [];
    for (const issue of issues) {
      if (!issue || typeof issue !== "object") continue;
      const msg = String((issue as { message?: string }).message ?? "").trim();
      const path = (issue as { path?: unknown }).path;
      const field =
        Array.isArray(path) && path.length
          ? String(path[path.length - 1])
          : "";

      if (/invalid nino/i.test(msg) || field.toLowerCase() === "nino") {
        parts.push(
          "National Insurance number is not valid. Use the format AB123456C (last letter must be A, B, C or D).",
        );
        continue;
      }
      if (msg) {
        const label = field
          ? field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
          : "";
        parts.push(label ? `${label}: ${msg}` : msg);
      }
    }
    if (parts.length) return [...new Set(parts)].join(" ");
  } catch {
    /* not JSON */
  }
  return null;
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
  // ZodError-like
  if (
    err &&
    typeof err === "object" &&
    "issues" in err &&
    Array.isArray((err as { issues: unknown }).issues)
  ) {
    return (
      friendlyZodMessage(JSON.stringify((err as { issues: unknown }).issues)) ??
      fallback
    );
  }
  return fallback;
}
