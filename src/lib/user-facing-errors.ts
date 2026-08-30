/** Map internal/server errors to safe user-facing copy. */
export function publicCheckoutError(message: string | null | undefined): string {
  if (!message?.trim()) {
    return "We could not complete your filing right now. Your payment is recorded — contact support if this continues.";
  }
  const trimmed = message.trim();
  const internal =
    /DATABASE_URL|MEMORY_STORE|getDb|SUPABASE_SERVICE|ECONNREFUSED|Invalid environment|Cannot find module|ENOENT|Gateway Target|schema|xsd/i.test(
      trimmed,
    );
  if (internal) {
    return "We could not complete your filing automatically. Your payment is recorded — we will finish the submission or contact you shortly.";
  }
  if (/Authorisation Failure|authentication code|presenter/i.test(trimmed)) {
    return "Companies House could not accept the filing with the details provided. Your payment is recorded — we will retry or contact you to confirm your company authentication code.";
  }
  return trimmed;
}
