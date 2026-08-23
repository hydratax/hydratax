import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/server/actions/admin-email";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const result = await unsubscribeByToken(token);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    try {
      const body = (await req.json()) as { token?: string };
      token = body.token ?? "";
    } catch {
      /* empty body */
    }
  }
  const result = await unsubscribeByToken(token);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
