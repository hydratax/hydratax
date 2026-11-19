import { NextResponse } from "next/server";
import { authorizeBearer } from "@/lib/webhook-auth";
import {
  exportClientPayrollMigrationCsv,
  exportClientPayrollMigrationZip,
} from "@/server/payroll/migration-export";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Internal exit-migration export (no desk UI).
 * GET ?clientId=…&format=json|zip
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const auth = authorizeBearer(req, process.env.CRON_SECRET, "Cron");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") || "";
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  if (!clientId) {
    return NextResponse.json(
      { error: "clientId required" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    if (format === "zip") {
      const { filename, zip } = await exportClientPayrollMigrationZip(clientId);
      return new NextResponse(new Uint8Array(zip), {
        status: 200,
        headers: {
          ...NO_STORE,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const exported = await exportClientPayrollMigrationCsv(clientId);
    return NextResponse.json({ ok: true, ...exported }, { headers: NO_STORE });
  } catch (err) {
    console.error(
      "[internal payroll-export]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "export failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
