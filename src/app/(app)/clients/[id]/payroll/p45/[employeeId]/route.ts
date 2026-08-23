import { requireModule } from "@/server/auth/session";
import { getEmployeeP45Html } from "@/server/actions/payroll";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; employeeId: string }> },
) {
  await requireModule("payroll");
  const { id, employeeId } = await context.params;
  try {
    const html = await getEmployeeP45Html(id, employeeId);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "P45 unavailable";
    return new Response(message, { status: 400 });
  }
}
