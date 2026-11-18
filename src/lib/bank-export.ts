import { CATEGORY_LABELS, type BankCategory } from "@/lib/bank-categories";

export type BankExportRow = {
  dated: string;
  description: string;
  amountPence: number;
  category: string;
};

function sheetRows(transactions: BankExportRow[]) {
  return transactions.map((t) => ({
    Date: t.dated,
    Description: t.description,
    Amount: (t.amountPence / 100).toFixed(2),
    Category: CATEGORY_LABELS[t.category as BankCategory] ?? t.category,
  }));
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV export — no xlsx dependency (keeps bank desk JS lean). */
export function downloadBankCsv(
  transactions: BankExportRow[],
  filename = "bank-categorised.csv",
) {
  const rows = sheetRows(transactions);
  const header = ["Date", "Description", "Amount", "Category"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.Date, r.Description, r.Amount, r.Category].map(csvEscape).join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** XLSX only loaded when the user clicks Excel download. */
export async function downloadBankXlsx(
  transactions: BankExportRow[],
  filename = "bank-categorised.xlsx",
) {
  const XLSX = await import("xlsx");
  const rows = sheetRows(transactions);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Transactions");
  XLSX.writeFile(book, filename);
}
