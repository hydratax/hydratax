/**
 * Authorization + confirmation guards for privacy actions.
 *
 * Pure functions (no I/O) so every rule is unit-tested. The server actions in
 * `src/server/actions/privacy.ts` are the only callers and must pass values
 * taken from the verified session — never from the request body.
 */

export const ERASE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT";
export const ERASE_CLIENT_PHRASE = "ERASE CLIENT DATA";

export type PracticeRole = "owner" | "admin" | "practitioner" | "readonly";

export class PrivacyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyAuthError";
  }
}

export function normalisePhrase(input: unknown): string {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function isPracticeAdmin(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Processor-side tools: owner/admin with full module access only. */
export function assertPracticeAdmin(session: {
  role: string;
  moduleAccess?: string;
}): void {
  if (!isPracticeAdmin(session.role)) {
    throw new PrivacyAuthError(
      "Only the practice owner or an administrator can export or erase client data.",
    );
  }
  if (session.moduleAccess && session.moduleAccess !== "full") {
    throw new PrivacyAuthError(
      "Only full-access administrators can export or erase client data.",
    );
  }
}

/**
 * Data-subject actions act on the signed-in user ONLY. If a request supplies
 * a subject id it must equal the session id; callers should not accept one
 * at all, this is a defence-in-depth tripwire.
 */
export function assertSelfSubject(
  sessionUserId: string,
  requestedUserId?: string | null,
): void {
  if (!sessionUserId) throw new PrivacyAuthError("Not signed in.");
  if (requestedUserId != null && requestedUserId !== sessionUserId) {
    throw new PrivacyAuthError("You can only act on your own account.");
  }
}

export function assertPhrase(input: unknown, expected: string): void {
  if (normalisePhrase(input) !== normalisePhrase(expected)) {
    throw new PrivacyAuthError(`Type "${expected}" exactly to confirm.`);
  }
}

/** Account deletion also needs the account email typed (stops mis-clicks). */
export function assertAccountEmailConfirmation(
  typedEmail: unknown,
  accountEmail: string | null | undefined,
): void {
  const typed = String(typedEmail ?? "").trim().toLowerCase();
  const actual = (accountEmail ?? "").trim().toLowerCase();
  if (!actual) {
    throw new PrivacyAuthError(
      "Your account has no email on file — contact support to delete it.",
    );
  }
  if (typed !== actual) {
    throw new PrivacyAuthError("The email address does not match your account.");
  }
}

export type MemberRow = { userId: string; role: string };

export type PracticeErasureClass =
  /** User is the only member — the whole practice would be orphaned. */
  | "sole_member"
  /** Other members exist but the user is the only owner — block. */
  | "blocked_transfer_ownership"
  /** User can simply leave (not the last owner). */
  | "leave_only"
  | "not_member";

export function classifyPracticeForUserErasure(
  members: MemberRow[],
  userId: string,
): PracticeErasureClass {
  const me = members.find((m) => m.userId === userId);
  if (!me) return "not_member";
  const others = members.filter((m) => m.userId !== userId);
  if (others.length === 0) return "sole_member";
  const otherOwners = others.filter((m) => m.role === "owner");
  if (me.role === "owner" && otherOwners.length === 0) {
    return "blocked_transfer_ownership";
  }
  return "leave_only";
}

export type StatutoryHold = {
  kind: string;
  count: number;
  description: string;
};

/**
 * Client erasure: when submitted returns exist (statutory evidence), the
 * practice must explicitly acknowledge that it is not relying on HydraTax to
 * keep them. Typed client name + phrase are always required.
 */
export function assertClientErasureConfirmation(opts: {
  phrase: unknown;
  typedClientName: unknown;
  clientName: string;
  acknowledgeStatutory: unknown;
  holds: StatutoryHold[];
}): void {
  assertPhrase(opts.phrase, ERASE_CLIENT_PHRASE);
  const typed = String(opts.typedClientName ?? "").trim().toLowerCase();
  if (!typed || typed !== opts.clientName.trim().toLowerCase()) {
    throw new PrivacyAuthError("Type the client's name exactly to confirm.");
  }
  const holdsPresent = opts.holds.some((h) => h.count > 0);
  if (holdsPresent && opts.acknowledgeStatutory !== true) {
    throw new PrivacyAuthError(
      "This client has submitted returns or statutory records. Confirm that your practice is not relying on HydraTax to keep them (export first).",
    );
  }
}

/** Grace period end for scheduled sole-owner erasure. */
export function deletionDueAt(now: Date, graceDays: number): Date {
  return new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
}
