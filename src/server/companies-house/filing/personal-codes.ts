import { z } from "zod";

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
  personalCode: personalCodeSchema,
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
  registeredEmail: z.string().trim().email().optional().or(z.literal("")),
  lawfulPurposeConfirmed: z.boolean().refine((v) => v === true, {
    message: "You must confirm intended future activities are lawful",
  }),
  directors: z
    .array(directorVerificationSchema)
    .min(1, "Add a personal code for each director"),
  clientId: z.string().uuid().optional().or(z.literal("")),
  practiceId: z.string().uuid().optional().or(z.literal("")),
});

export type ParsedCsFilingInput = z.infer<typeof csFilingInputSchema>;

export function maskPersonalCode(code: string) {
  const c = code.trim().toUpperCase();
  if (c.length < 4) return "••••";
  return `${c.slice(0, 2)}•••••••${c.slice(-2)}`;
}
