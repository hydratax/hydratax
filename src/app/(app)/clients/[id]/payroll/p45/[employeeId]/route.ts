import { requireModule } from "@/server/auth/session";
import {
  getEmployeeP45Html,
  getEmployeeP45Pdf,
} from "@/server/actions/payroll";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; employeeId: string }> },
) {
  await requireModule("payroll");
  const { id, employeeId } = await context.params;
  const format = new URL(request.url).searchParams.get("format");
  try {
    if (format !== "html") {
      const bytes = await getEmployeeP45Pdf(id, employeeId);
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="P45-${employeeId}.pdf"`,
        },
      });
    }
    const html = await getEmployeeP45Html(id, employeeId);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "P45 unavailable";
    return new Response(message, { status: 400 });
  }
}
