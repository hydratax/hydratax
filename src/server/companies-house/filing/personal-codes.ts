import { z } from "zod";

export const csStatementOfCapitalShareSchema = z.object({
  shareClass: z.string().trim().min(1).max(160),
  prescribedParticulars: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .default("Voting rights"),
  numShares: z.number().int().nonnegative(),
  aggregateNominalValue: z.number().nonnegative(),
});

export const csStatementOfCapitalSchema = z.object({
  shareCurrency: z.string().trim().length(3).default("GBP"),
  totalAmountUnpaid: z.number().nonnegative().default(0),
  totalNumberOfIssuedShares: z.number().int().nonnegative(),
  totalAggregateNominalValue: z.number().nonnegative(),
  shares: z.array(csStatementOfCapitalShareSchema).min(1),
});

/** Companies House personal codes are 11 characters (letters + digits). */
export const personalCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9]{11}$/,
    "Personal code must be 11 letters/digits from Companies House",
  );

export const companyAuthCodeSchema = z
  .string()
  .trim()
  .min(6)
  .max(12)
  .regex(/^[A-Za-z0-9]+$/, "Invalid company authentication code");

export const directorVerificationSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  title: z.string().trim().max(40).optional(),
  forename: z.string().trim().max(80).optional(),
  surname: z.string().trim().max(80).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
  personalCode: personalCodeSchema.optional(),
  nameMismatchReason: z.string().trim().max(120).optional(),
});

export const csFilingInputSchema = z.object({
  companyNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,8}$/, "Invalid company number"),
  companyName: z.string().trim().min(2).max(200),
  confirmationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Confirmation date must be YYYY-MM-DD"),
  companyAuthCode: companyAuthCodeSchema,
  registeredEmail: z
    .string()
    .trim()
    .email("Registered email address is required (ECCTA)"),
  lawfulPurposeConfirmed: z.boolean().refine((v) => v === true, {
    message: "You must confirm intended future activities are lawful",
  }),
  sicCodes: z
    .array(z.string().regex(/^\d{5}$/, "SIC codes must be 5 digits"))
    .default([]),
  statementOfCapital: csStatementOfCapitalSchema.optional(),
  directors: z.array(directorVerificationSchema).min(1, "Add at least one director"),
  clientId: z.string().uuid().optional().or(z.literal("")),
  practiceId: z.string().uuid().optional().or(z.literal("")),
});

export type ParsedCsFilingInput = z.infer<typeof csFilingInputSchema>;

export function maskPersonalCode(code: string) {
  const c = code.trim().toUpperCase();
  if (c.length < 4) return "••••";
  return `${c.slice(0, 2)}•••••••${c.slice(-2)}`;
}
