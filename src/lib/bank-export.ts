import * as XLSX from "xlsx";
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
    Category:
      CATEGORY_LABELS[t.category as BankCategory] ?? t.category,
  }));
}

export function downloadBankCsv(
  transactions: BankExportRow[],
  filename = "bank-categorised.csv",
) {
  const rows = sheetRows(transactions);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBankXlsx(
  transactions: BankExportRow[],
  filename = "bank-categorised.xlsx",
) {
  const rows = sheetRows(transactions);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Transactions");
  XLSX.writeFile(book, filename);
}
