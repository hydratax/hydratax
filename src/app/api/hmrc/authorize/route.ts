import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/server/hmrc/oauth";
import { getHmrcConfig } from "@/server/hmrc/config";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const returnTo =
    req.nextUrl.searchParams.get("returnTo") === "vat" ? "vat" : "overview";

  const cfg = getHmrcConfig();
  if (!cfg.clientId) {
    return NextResponse.redirect(
      new URL(
        returnTo === "vat"
          ? `/clients/${clientId}/vat?hmrc=demo_connect_available`
          : `/clients/${clientId}?hmrc=demo_connect_available`,
        req.nextUrl.origin,
      ),
    );
  }

  const state = Buffer.from(
    JSON.stringify({ clientId, nonce: crypto.randomUUID(), returnTo }),
  ).toString("base64url");

  const url = buildAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
