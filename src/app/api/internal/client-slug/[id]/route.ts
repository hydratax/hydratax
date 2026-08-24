import { NextResponse } from "next/server";
import { resolveClientFromRef } from "@/server/clients/resolve-client-page";
import { isClientUuid } from "@/lib/client-slug";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isClientUuid(id)) {
    return NextResponse.json({ error: "Not a client id" }, { status: 400 });
  }
  try {
    const { slug } = await resolveClientFromRef(id);
    return NextResponse.json({ slug });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
