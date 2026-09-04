/** Classify Supabase / OAuth messages when an email already has an account. */
export function isExistingAccountAuthError(
  message: string | null | undefined,
): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m) return false;
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("identity_already_exists") ||
    m.includes("identity is already linked") ||
    m.includes("email address is already associated") ||
    m.includes("user already exists") ||
    m.includes("duplicate") ||
    (m.includes("email") && m.includes("already"))
  );
}

export const EXISTING_ACCOUNT_SIGN_IN_MESSAGE =
  "An account with this email already exists. Sign in with your password, or use Forgot password if you need to reset it.";
