import { NextResponse } from "next/server";
import { fulfillPaidChRequest } from "@/server/companies-house/fulfill-ch-request";

/** Dev-only: retry CS01 fulfillment after a paid checkout. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { requestId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId = body.requestId?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  const result = await fulfillPaidChRequest({
    requestId,
    customerEmail: body.email ?? "haidary555@gmail.com",
  });

  return NextResponse.json(result);
}
