import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/server/actions/admin-email";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET must NOT mutate state: mail scanners and link prefetchers follow GET
 * links and would silently unsubscribe people. Redirect to the confirmation
 * page, where the user presses a button (which performs the change).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const target = new URL("/unsubscribe", url.origin);
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target, {
    status: 303,
    headers: NO_STORE,
  });
}

/**
 * POST performs the unsubscribe. Also serves RFC 8058 one-click:
 * mail clients POST `List-Unsubscribe=One-Click` (form-encoded) to the URL in
 * the List-Unsubscribe header, which carries the token in the query string.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = (await req.json()) as { token?: string };
        token = body.token ?? "";
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const form = new URLSearchParams(await req.text());
        token = form.get("token") ?? "";
      }
    } catch {
      /* empty body */
    }
  }
  const result = await unsubscribeByToken(token);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json(result, { headers: NO_STORE });
}
