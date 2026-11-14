import { NextResponse } from "next/server";
import {
  attachmentDisposition,
  safeDownloadContentType,
} from "@/lib/file-types";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getR2Object, isR2Configured } from "@/server/storage/r2";

/**
 * Streams a private R2 object. Query: ?key=practices/.../file.pdf
 * Keys must start with practices/{practiceId}/
 *
 * Stored objects are untrusted (inbound email / client portal uploads), so the
 * response is always a forced download with a content type mapped through the
 * allow-list and a locked-down CSP/sandbox — it must never render as HTML/SVG
 * on our origin.
 */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  if (!isR2Configured()) {
    return json({ error: "R2 not configured" }, 503);
  }

  // Enforces desk session expiry + MFA step-up and answers JSON 401/403.
  const { requireApiSession } = await import("@/server/auth/api-session");
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;
  // All roles (including readonly) may download documents of their practice.

  // Bulk-exfiltration brake (best effort, per instance): a stolen session
  // cannot scrape the whole practice archive at line speed.
  const limited = rateLimit({
    key: `doc-download:${session.userId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many downloads. Wait a moment and try again." },
      { status: 429, headers: { ...NO_STORE, ...rateLimitHeaders(limited) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (
    !key ||
    key.length > 600 ||
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.includes("//")
  ) {
    return json({ error: "Missing key" }, 400);
  }

  const allowedPrefix = `practices/${session.practiceId}/`;
  if (!key.startsWith(allowedPrefix)) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const obj = await getR2Object(key);
    if (!obj.body) {
      return json({ error: "Not found" }, 404);
    }

    const rawName = key.split("/").pop() ?? "download";
    // Strip the `${Date.now()}-` prefix we add at upload time.
    const filename = rawName.replace(/^\d{10,}-/, "") || "download";

    // Best-effort access log; never block the download on it.
    void import("@/server/audit/log")
      .then(({ appendAuditEvent }) =>
        appendAuditEvent({
          practiceId: session.practiceId,
          actorId: session.userId,
          action: "document.download",
          entityType: "document",
          entityId: null,
          detail: { key },
        }),
      )
      .catch(() => undefined);

    return new NextResponse(new Uint8Array(obj.body), {
      headers: {
        "Content-Type": safeDownloadContentType(obj.contentType),
        "Content-Disposition": attachmentDisposition(filename),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return json({ error: "Download failed" }, 500);
  }
}
