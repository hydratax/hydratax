import { requireModule } from "@/server/auth/session";
import {
  getEmployeeP60Html,
  getEmployeeP60Pdf,
} from "@/server/actions/payroll";
import { taxYearFromDate } from "@/lib/payroll";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; employeeId: string }> },
) {
  await requireModule("payroll");
  const { id, employeeId } = await context.params;
  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const format = url.searchParams.get("format");
  const taxYear =
    yearParam?.trim() ||
    taxYearFromDate(new Date().toISOString().slice(0, 10));
  try {
    // Default to official HMRC single-sheet fill (PDF). HTML remains for ?format=html.
    if (format !== "html") {
      const bytes = await getEmployeeP60Pdf(id, employeeId, taxYear);
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="P60-${employeeId}-${taxYear}.pdf"`,
        },
      });
    }
    const html = await getEmployeeP60Html(id, employeeId, taxYear);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "P60 unavailable";
    return new Response(message, { status: 400 });
  }
}