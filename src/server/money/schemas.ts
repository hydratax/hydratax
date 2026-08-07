import { z } from "zod";
import { pence, poundsToPence } from "./pence";

export const penceSchema = z
  .number()
  .int("Amount must be integer pence")
  .transform((n) => pence(n));

export const poundsInputSchema = z
  .string()
  .min(1)
  .transform((s) => poundsToPence(s));

export const vatRateBpsSchema = z.union([
  z.literal(0),
  z.literal(500),
  z.literal(2000),
]);

export const ledgerEntryInputSchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1).max(500),
  amountPence: penceSchema,
  vatRateBps: vatRateBpsSchema.default(2000),
  dated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().max(100).optional(),
});

export const digitalIncomeRecordSchema = z.object({
  clientId: z.string().min(1),
  taxYear: z.string().regex(/^\d{4}-\d{2}$/),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turnoverPence: penceSchema,
  otherIncomePence: penceSchema.default(pence(0)),
  expensesPence: penceSchema,
});

export const vatReturnBoxesSchema = z.object({
  vatDueSales: penceSchema, // Box 1
  vatDueAcquisitions: penceSchema, // Box 2
  totalVatDue: penceSchema, // Box 3
  vatReclaimedCurrPeriod: penceSchema, // Box 4
  netVatDue: penceSchema, // Box 5
  totalValueSalesExVAT: penceSchema, // Box 6 (pounds as pence/100 for HMRC — we keep pence internally)
  totalValuePurchasesExVAT: penceSchema, // Box 7
  totalValueGoodsSuppliedExVAT: penceSchema, // Box 8
  totalAcquisitionsExVAT: penceSchema, // Box 9
});

export const ct600FiguresSchema = z.object({
  clientId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turnoverPence: penceSchema,
  costOfSalesPence: penceSchema.default(pence(0)),
  administrativeExpensesPence: penceSchema.default(pence(0)),
  otherIncomePence: penceSchema.default(pence(0)),
  tangibleAssetsPence: penceSchema.default(pence(0)),
  cashAtBankPence: penceSchema.default(pence(0)),
  debtorsPence: penceSchema.default(pence(0)),
  creditorsPence: penceSchema.default(pence(0)),
  calledUpShareCapitalPence: penceSchema.default(pence(0)),
  profitAndLossAccountPence: penceSchema.default(pence(0)),
});

export const employeeInputSchema = z.object({
  clientId: z.string().min(1),
  forename: z.string().min(1).max(100),
  surname: z.string().min(1).max(100),
  nino: z
    .string()
    .regex(/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i, "Invalid NINO")
    .transform((s) => s.toUpperCase()),
  taxCode: z.string().min(1).max(10).default("1257L"),
  annualSalaryPence: penceSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const payRunInputSchema = z.object({
  clientId: z.string().min(1),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
