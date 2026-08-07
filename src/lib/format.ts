import { formatGBP } from "@/server/money/pence";

export function money(penceAmount: number): string {
  return formatGBP(penceAmount);
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
