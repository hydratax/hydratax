import { z } from "zod";
import { personalCodeSchema } from "./personal-codes";

export const ukAddressSchema = z.object({
  premise: z.string().trim().min(1).max(50),
  street: z.string().trim().min(1).max(50),
  thoroughfare: z.string().trim().max(50).optional().or(z.literal("")),
  postTown: z.string().trim().min(1).max(50),
  county: z.string().trim().max(50).optional().or(z.literal("")),
  postcode: z.string().trim().min(5).max(10),
  /** ISO / CH country code e.g. GBR, GB-ENG, GB-WLS */
  country: z.string().trim().min(2).max(10).default("GBR"),
});

export const incorporationDirectorSchema = z.object({
  forename: z.string().trim().min(1).max(50),
  surname: z.string().trim().min(1).max(50),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
  nationality: z.string().trim().min(2).max(50),
  countryOfResidence: z.string().trim().min(2).max(50),
  personalCode: personalCodeSchema,
  serviceAddressSameAsRo: z.boolean().default(true),
  serviceAddress: ukAddressSchema.optional(),
  residentialAddress: ukAddressSchema,
  isSubscriber: z.boolean().default(true),
  shares: z.coerce.number().int().min(0).default(0),
});

export const incorporationSubscriberSchema = z.object({
  forename: z.string().trim().min(1).max(50),
  surname: z.string().trim().min(1).max(50),
  address: ukAddressSchema,
  shares: z.coerce.number().int().min(1),
  personalCode: personalCodeSchema.optional().or(z.literal("")),
  /** Include as PSC when ownership > 25% */
  isPsc: z.boolean().default(true),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  nationality: z.string().trim().max(50).optional().or(z.literal("")),
  countryOfResidence: z.string().trim().max(50).optional().or(z.literal("")),
  residentialAddress: ukAddressSchema.optional(),
});

export const incorporationInputSchema = z
  .object({
    companyName: z.string().trim().min(3).max(160),
    countryOfIncorporation: z.enum(["EW", "SC", "WA", "NI"]).default("EW"),
    registeredOffice: ukAddressSchema,
    registeredEmail: z.string().trim().email(),
    sicCodes: z
      .array(z.string().regex(/^\d{5}$/, "SIC codes are 5 digits"))
      .min(1)
      .max(4),
    shareClass: z.string().trim().min(1).max(50).default("Ordinary"),
    shareCurrency: z.literal("GBP").default("GBP"),
    nominalValue: z.coerce.number().positive(),
    amountPaidPerShare: z.coerce.number().min(0).optional(),
    directors: z.array(incorporationDirectorSchema).min(1),
    subscribers: z.array(incorporationSubscriberSchema).min(1),
    sameDay: z.boolean().default(false),
    lawfulPurposeConfirmed: z.boolean().refine((v) => v === true, {
      message: "You must confirm intended future activities are lawful",
    }),
    personalCodesConfirmed: z.boolean().refine((v) => v === true, {
      message: "Confirm personal codes are ready for filing",
    }),
    sameDayCutOffAck: z.boolean().optional(),
    authoriserForename: z.string().trim().min(1).max(50),
    authoriserSurname: z.string().trim().min(1).max(50),
    clientId: z.string().uuid().optional().or(z.literal("")),
    practiceId: z.string().uuid().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.sameDay && !data.sameDayCutOffAck) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirm same-day cut-off acknowledgement",
        path: ["sameDayCutOffAck"],
      });
    }
    const totalShares = data.subscribers.reduce((s, x) => s + x.shares, 0);
    if (totalShares < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total issued shares must be at least 1",
        path: ["subscribers"],
      });
    }
    for (const [i, d] of data.directors.entries()) {
      if (!d.serviceAddressSameAsRo && !d.serviceAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Service address required when not same as registered office",
          path: ["directors", i, "serviceAddress"],
        });
      }
    }
  });

export type ParsedIncorporationInput = z.infer<typeof incorporationInputSchema>;
export type UkAddress = z.infer<typeof ukAddressSchema>;

export function ownershipNatures(percent: number): string[] {
  if (percent > 75) {
    return [
      "OWNERSHIPOFSHARES_75TO100PERCENT",
      "VOTINGRIGHTS_75TO100PERCENT",
    ];
  }
  if (percent > 50) {
    return [
      "OWNERSHIPOFSHARES_50TO75PERCENT",
      "VOTINGRIGHTS_50TO75PERCENT",
    ];
  }
  if (percent > 25) {
    return [
      "OWNERSHIPOFSHARES_25TO50PERCENT",
      "VOTINGRIGHTS_25TO50PERCENT",
    ];
  }
  return [];
}
