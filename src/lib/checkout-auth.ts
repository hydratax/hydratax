/**
 * Desk / module plans must never create a Stripe Checkout session without a
 * real signed-in practice. Companies House one-offs may proceed with chRequestId
 * (wizard already bound the filing to a practice).
 */

export function isCompaniesHouseOneOffCheckout(
  planKey: string,
  chRequestId: string | undefined,
): boolean {
  return planKey.startsWith("companies-house:") && Boolean(chRequestId);
}

export type CheckoutAuthSession = {
  local: boolean;
  practiceId: string;
  userId: string;
  email: string | null;
};

/**
 * Decide whether /api/checkout may call Stripe.
 * - Local/demo sessions are never enough for desk plans.
 * - Desk/module plans require a non-local session with a non-empty practiceId.
 * - CH one-offs with chRequestId may bind to the request's practice instead.
 */
export function resolveDeskCheckoutAuth(opts: {
  session: CheckoutAuthSession | null;
  planKey: string;
  chRequestId?: string;
  /** Practice that owns chRequestId when present */
  chOwnerPracticeId?: string | null;
}):
  | {
      ok: true;
      practiceId: string;
      userId: string;
      email: string | null;
    }
  | { ok: false; needsAuth: true; planKey: string }
  | { ok: false; error: string; status: 400 | 404 } {
  const realSession =
    opts.session && !opts.session.local ? opts.session : null;

  if (opts.chRequestId) {
    if (!opts.chOwnerPracticeId) {
      return { ok: false, error: "Filing request not found.", status: 404 };
    }
    if (realSession && opts.chOwnerPracticeId !== realSession.practiceId) {
      return { ok: false, error: "Filing request not found.", status: 404 };
    }
  }

  const isChFiling = isCompaniesHouseOneOffCheckout(
    opts.planKey,
    opts.chRequestId,
  );

  if (!realSession && !isChFiling) {
    return { ok: false, needsAuth: true, planKey: opts.planKey };
  }

  const practiceId = realSession
    ? realSession.practiceId
    : (opts.chOwnerPracticeId ?? "");
  const userId = realSession?.userId ?? "";

  if (!practiceId.trim()) {
    // Never mint Stripe URLs with an empty practiceId for paid plans.
    if (isChFiling) {
      return { ok: false, error: "Filing request not found.", status: 404 };
    }
    return { ok: false, needsAuth: true, planKey: opts.planKey };
  }

  return {
    ok: true,
    practiceId,
    userId,
    email: realSession?.email ?? null,
  };
}

/** Build create-account URL that resumes pricing checkout after signup. */
export function accountFirstCheckoutUrl(planKey: string): string {
  const plan = planKey.trim();
  // Encode once via the outer `next` / `plan` params — do not pre-encode `:` in
  // the resume path or browsers end up with practice%253APractice.
  const resume = `/pricing?plan=${plan}`;
  return `/create-account?next=${encodeURIComponent(resume)}&plan=${encodeURIComponent(plan)}`;
}
