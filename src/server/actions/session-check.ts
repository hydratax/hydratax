"use server";

import { getOptionalSession } from "@/server/auth/session";

/** Soft auth check for client flows that need to redirect with a resume URL. */
export async function hasSignedInSession() {
  const session = await getOptionalSession();
  return Boolean(session);
}
