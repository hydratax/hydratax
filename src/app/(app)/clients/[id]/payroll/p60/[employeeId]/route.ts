import { requireModule } from "@/server/auth/session";
import { getEmployeeP60Html } from "@/server/actions/payroll";
import { taxYearFromDate } from "@/lib/payroll";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; employeeId: string }> },
) {
  await requireModule("payroll");
  const { id, employeeId } = await context.params;
  const yearParam = new URL(request.url).searchParams.get("year");
  const taxYear =
    yearParam?.trim() ||
    taxYearFromDate(new Date().toISOString().slice(0, 10));
  try {
    const html = await getEmployeeP60Html(id, employeeId, taxYear);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "P60 unavailable";
    return new Response(message, { status: 400 });
  }
}
