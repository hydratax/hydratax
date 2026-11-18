import { requireAdmin } from "@/server/auth/admin";
import { SalesDemoRunner } from "@/components/sales-demo-runner";

export const metadata = {
  title: "Sales demo — HydraTax",
};

/**
 * Platform admin only. One click: seed demo clients, hide real ones, open desk.
 */
export default async function SalesDemoPage() {
  await requireAdmin();
  return <SalesDemoRunner />;
}
