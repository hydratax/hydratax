"use server";

import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import {
  applyDeviceTrustPolicy,
  skipTwoFactorPrompt,
} from "@/server/auth/session-policy";
import { safeReturnPath } from "@/lib/auth-return";

const trustSchema = z.object({
  trusted: z.boolean(),
  nextPath: z.string().optional(),
});

export async function confirmDeviceTrust(input: z.infer<typeof trustSchema>) {
  await requireSession("/secure-device");
  const parsed = trustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid choice" };
  }
  await applyDeviceTrustPolicy(parsed.data.trusted);
  return {
    ok: true as const,
    redirectTo: safeReturnPath(parsed.data.nextPath),
  };
}

export async function skipTwoFactorSuggestion() {
  await requireSession("/secure-device");
  return skipTwoFactorPrompt();
}
