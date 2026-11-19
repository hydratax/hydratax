import { NextResponse } from "next/server";
import { authorizeBearer } from "@/lib/webhook-auth";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/server/privacy/security-events";
import { enqueueBulkEmployeeCsvPack } from "@/server/payroll/jobs/enqueue";
import { getBulkImportJob } from "@/server/payroll/jobs/store";
import { runPayrollJobsTick } from "@/server/payroll/jobs/processor";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Internal / ops endpoint to enqueue a bureau employee CSV pack.
 * Auth: Bearer CRON_SECRET (same as cron). Not exposed on the accountant desk.
 *
 * POST JSON:
 *   { practiceId, sourceLabel?, files?: Record<path,csv>, processNow?: boolean }
 *   or multipart later — base64 zip:
 *   { practiceId, zipBase64, sourceLabel?, processNow?: boolean }
 *
 * GET ?jobId=… — job status snapshot.
 */
export async function GET(req: Request) {
  const auth = authorizeBearer(req, process.env.CRON_SECRET, "Cron");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  const jobId = new URL(req.url).searchParams.get("jobId") || "";
  if (!jobId) {
    return NextResponse.json(
      { error: "jobId required" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const job = await getBulkImportJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, job }, { headers: NO_STORE });
  } catch (err) {
    console.error(
      "[internal bulk-import GET]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "lookup failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  const auth = authorizeBearer(req, process.env.CRON_SECRET, "Cron");
  if (!auth.ok) {
    const ip = clientIpFromHeaders(req.headers);
    await logSecurityEvent({
      type: "webhook.unauthorised",
      severity: auth.status === 401 ? "medium" : "low",
      ip,
      throttleKey: `internal.bulk-import:${ip}`,
      details: { route: "internal.bulk-import", status: auth.status },
    });
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  try {
    const body = (await req.json()) as {
      practiceId?: string;
      sourceLabel?: string;
      artifactKey?: string;
      createdBy?: string;
      files?: Record<string, string>;
      zipBase64?: string;
      processNow?: boolean;
    };

    const zipBytes = body.zipBase64
      ? Buffer.from(body.zipBase64, "base64")
      : null;

    const enqueued = await enqueueBulkEmployeeCsvPack({
      practiceId: body.practiceId || "",
      createdBy: body.createdBy || "internal-api",
      sourceLabel: body.sourceLabel,
      artifactKey: body.artifactKey,
      zipBytes,
      files: body.files,
    });

    if (!enqueued.ok) {
      return NextResponse.json(enqueued, { status: 400, headers: NO_STORE });
    }

    let tick = null;
    if (body.processNow) {
      tick = await runPayrollJobsTick({ worker: "internal-kickoff" });
    }

    return NextResponse.json(
      { ...enqueued, tick },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error(
      "[internal bulk-import POST]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "enqueue failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
