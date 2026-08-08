import { NextResponse } from "next/server";
import { getR2Object, isR2Configured } from "@/server/storage/r2";

/**
 * Streams a private R2 object. Query: ?key=practices/.../file.pdf
 * Keys must start with practices/{practiceId}/
 */
export async function GET(request: Request) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
  }

  const { getOptionalSession } = await import("@/server/auth/session");
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const allowedPrefix = `practices/${session.practiceId}/`;
  if (!key.startsWith(allowedPrefix)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const obj = await getR2Object(key);
    if (!obj.body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(obj.body), {
      headers: {
        "Content-Type": obj.contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
