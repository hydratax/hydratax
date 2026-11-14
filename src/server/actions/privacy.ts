"use server";

/**
 * Privacy server actions (UK GDPR / DPA 2018).
 *
 *  - exportMyData / requestAccountDeletion / cancelMyAccountDeletion
 *      → controller-side rights of the signed-in user, on THEIR OWN account.
 *  - exportClientData / eraseClientData
 *      → processor-side tools for practice owners/admins on THEIR practice's
 *        clients.
 *
 * Authorisation rule: every subject/practice id comes from `requireSession()`.
 * Request bodies may only carry a client id (re-verified against the session's
 * practice) and confirmation text. The service-role client is used inside the
 * privacy services only after these checks.
 */

import { revalidatePath } from "next/cache";
import { isMemoryStore } from "@/lib/env";
import { LEGAL_ENTITY } from "@/lib/legal-entity";
import { rateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site";
import { appendAuditEvent } from "@/server/audit/log";
import { requireSession } from "@/server/auth/session";
import {
  assertAccountEmailConfirmation,
  assertClientErasureConfirmation,
  assertPhrase,
  assertPracticeAdmin,
  assertSelfSubject,
  ERASE_ACCOUNT_PHRASE,
  PrivacyAuthError,
} from "@/server/privacy/authz";
import {
  cancelAccountDeletionForUser,
  logDataSubjectRequest,
  startAccountDeletion,
} from "@/server/privacy/account-deletion";
import {
  buildClientDataExport,
  collectStatutoryHolds,
  countClientResiduals,
} from "@/server/privacy/client-data";
import { exportFilename } from "@/server/privacy/export-shape";
import { logSecurityEvent } from "@/server/privacy/security-events";
import { buildUserDataExport } from "@/server/privacy/user-export";

export type PrivacyActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof PrivacyAuthError) return { ok: false, error: err.message };
  console.warn(
    "[privacy] action failed:",
    err instanceof Error ? err.message : "unknown",
  );
  return {
    ok: false,
    error: "Something went wrong. Please try again or contact support.",
  };
}

function throttle(scope: string, userId: string, limit: number, windowMs: number) {
  const r = rateLimit({ key: `privacy:${scope}:${userId}`, limit, windowMs });
  if (!r.ok) {
    throw new PrivacyAuthError(
      "Too many requests. Please wait a few minutes and try again.",
    );
  }
}

async function requestIp(): Promise<string | null> {
  try {
    const { getClientIp } = await import("@/lib/rate-limit");
    const ip = await getClientIp();
    return ip === "unknown" ? null : ip;
  } catch {
    return null;
  }
}

async function safeAudit(input: Parameters<typeof appendAuditEvent>[0]) {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.warn(
      "[privacy] audit append failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}

// ---------------------------------------------------------------------------
// Data-subject rights: the signed-in user's own account data
// ---------------------------------------------------------------------------

/** "Download my data" — JSON export of the caller's own account data. */
export async function exportMyData(): Promise<
  PrivacyActionResult<{ filename: string; json: string }>
> {
  try {
    const session = await requireSession();
    assertSelfSubject(session.userId);
    throttle("export-me", session.userId, 5, 10 * 60_000);

    const data = await buildUserDataExport({
      userId: session.userId,
      email: session.email,
    });
    const json = JSON.stringify(data, null, 2);

    await logDataSubjectRequest({
      userId: session.userId,
      email: session.email,
      type: "access",
      completed: true,
      notes: "self-service export",
    });
    await logSecurityEvent({
      type: "privacy.data_export",
      actorUserId: session.userId,
      subjectUserId: session.userId,
      practiceId: session.practiceId,
      ip: await requestIp(),
    });
    return {
      ok: true,
      filename: exportFilename("my-data", session.userId),
      json,
    };
  } catch (err) {
    return fail(err);
  }
}

export type DeleteAccountInput = {
  confirmPhrase: string;
  confirmEmail: string;
  /**
   * Only relevant if you are the sole member of a practice:
   *  - "schedule":  14-day grace period, cancel any time (default)
   *  - "immediate": erase now. Requires `acknowledgeImmediate`.
   */
  practiceData?: "schedule" | "immediate";
  acknowledgeImmediate?: boolean;
};

/** "Delete my account" — see src/server/privacy/user-erasure.ts for design. */
export async function requestAccountDeletion(
  input: DeleteAccountInput,
): Promise<
  PrivacyActionResult<{
    mode: "scheduled" | "immediate" | "member_only";
    scheduledFor?: string;
    practicesErased: number;
    signedOut: boolean;
  }>
> {
  try {
    const session = await requireSession();
    assertSelfSubject(session.userId);
    if (session.local || isMemoryStore()) {
      throw new PrivacyAuthError(
        "Account deletion is not available on the local demo desk.",
      );
    }
    throttle("delete-account", session.userId, 3, 60 * 60_000);

    assertPhrase(input?.confirmPhrase, ERASE_ACCOUNT_PHRASE);
    assertAccountEmailConfirmation(input?.confirmEmail, session.email);

    const practiceData =
      input?.practiceData === "immediate" ? "immediate" : "schedule";
    if (practiceData === "immediate" && input?.acknowledgeImmediate !== true) {
      throw new PrivacyAuthError(
        "Tick the box to confirm you want your practice and all its client data erased immediately and permanently.",
      );
    }

    const result = await startAccountDeletion({
      userId: session.userId,
      email: session.email,
      practiceData,
      ip: await requestIp(),
    });

    if (result.mode === "scheduled" && session.email) {
      try {
        const { sendTransactionalEmail } = await import(
          "@/server/email/transactional"
        );
        const when = new Date(result.scheduledFor).toUTCString();
        const cancelUrl = `${siteUrl()}/privacy/cancel-deletion?t=${encodeURIComponent(result.cancelToken)}`;
        await sendTransactionalEmail({
          to: session.email,
          subject: "Your HydraTax account is scheduled for deletion",
          text: [
            "We received a request to delete your HydraTax account and the practice data in it.",
            "",
            `Deletion is scheduled for ${when}. Until then you can cancel:`,
            cancelUrl,
            "",
            "Your subscription (if any) has been set to end at the close of the current billing period.",
            `If you did not ask for this, cancel with the link above and contact ${LEGAL_ENTITY.privacyEmail} immediately.`,
          ].join("\n"),
        });
      } catch {
        /* The in-app cancel option still works. */
      }
    }

    // Sign out (best effort — the auth user may already be gone).
    let signedOut = false;
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "local" });
      signedOut = true;
    } catch {
      /* ignore */
    }
    try {
      const { clearSessionPolicyCookies } = await import(
        "@/server/auth/session-policy"
      );
      await clearSessionPolicyCookies();
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      mode: result.mode,
      scheduledFor: result.mode === "scheduled" ? result.scheduledFor : undefined,
      practicesErased: result.plan.erasePracticeIds.length,
      signedOut,
    };
  } catch (err) {
    return fail(err);
  }
}

/** Cancel the caller's own pending (scheduled) deletion. */
export async function cancelMyAccountDeletion(): Promise<
  PrivacyActionResult<{ cancelled: boolean }>
> {
  try {
    const session = await requireSession();
    assertSelfSubject(session.userId);
    throttle("cancel-delete", session.userId, 10, 60 * 60_000);
    const cancelled = await cancelAccountDeletionForUser(session.userId);
    revalidatePath("/settings/privacy");
    return { ok: true, cancelled };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Cancel via the e-mailed link (works signed-out). Invoked only from a POST
 * form on /privacy/cancel-deletion so link scanners that GET the URL cannot
 * cancel (or confirm) anything. Token is compared by hash; IP-throttled.
 */
export async function cancelDeletionWithToken(
  token: string,
): Promise<PrivacyActionResult<{ cancelled: boolean }>> {
  try {
    const { getClientIp } = await import("@/lib/rate-limit");
    const ip = await getClientIp();
    const r = rateLimit({ key: `privacy:cancel-token:${ip}`, limit: 10, windowMs: 15 * 60_000 });
    if (!r.ok) throw new PrivacyAuthError("Too many attempts. Try again later.");
    if (typeof token !== "string" || token.length > 200) {
      return { ok: true, cancelled: false };
    }
    const { cancelAccountDeletionByToken } = await import(
      "@/server/privacy/account-deletion"
    );
    return { ok: true, cancelled: await cancelAccountDeletionByToken(token) };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Processor tooling: per-client export / erase (owner / admin only)
// ---------------------------------------------------------------------------

async function loadAuthorisedClient(clientId: unknown) {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!/^[0-9a-zA-Z_-]{8,64}$/.test(id)) {
    throw new PrivacyAuthError("Client not found.");
  }
  const { fetchClientRecord } = await import("@/server/actions/clients");
  const client = await fetchClientRecord(id);
  const session = await requireSession();
  if (!client || client.practiceId !== session.practiceId) {
    throw new PrivacyAuthError("Client not found.");
  }
  return { session, client, clientId: id };
}

/** Export everything held for one client (owner/admin of that practice). */
export async function exportClientData(
  clientId: string,
): Promise<PrivacyActionResult<{ filename: string; json: string }>> {
  try {
    const first = await requireSession();
    assertPracticeAdmin(first);
    throttle("export-client", first.userId, 10, 10 * 60_000);

    const { session, client, clientId: id } = await loadAuthorisedClient(clientId);
    const data = await buildClientDataExport({
      clientId: id,
      practiceId: session.practiceId,
      clientRow: client as unknown as Record<string, unknown>,
    });
    const json = JSON.stringify(data, null, 2);

    await safeAudit({
      practiceId: session.practiceId,
      clientId: id,
      actorId: session.userId,
      action: "client.data_export",
      entityType: "client",
      entityId: id,
      detail: {
        bytes: json.length,
        employees: data.employees.length,
        documents: data.documents.length,
      },
    });
    await logSecurityEvent({
      type: "privacy.client_exported",
      actorUserId: session.userId,
      practiceId: session.practiceId,
      ip: await requestIp(),
      details: { clientId: id },
    });
    return { ok: true, filename: exportFilename("client-data", id), json };
  } catch (err) {
    return fail(err);
  }
}

export type EraseClientInput = {
  clientId: string;
  /** Must equal "ERASE CLIENT DATA". */
  confirmPhrase: string;
  /** Must equal the client's name. */
  confirmClientName: string;
  /** Required when submitted returns / statutory records exist. */
  acknowledgeStatutory?: boolean;
};

/** Read-only summary the confirmation UI shows before erasing. */
export async function getClientErasurePreview(clientId: string): Promise<
  PrivacyActionResult<{
    clientName: string;
    holds: { kind: string; count: number; description: string }[];
  }>
> {
  try {
    const first = await requireSession();
    assertPracticeAdmin(first);
    const { session, client, clientId: id } = await loadAuthorisedClient(clientId);
    const holds = await collectStatutoryHolds(id, session.practiceId);
    return { ok: true, clientName: client.name, holds };
  } catch (err) {
    return fail(err);
  }
}

/** Permanently erase one client (owner/admin of that practice). */
export async function eraseClientData(
  input: EraseClientInput,
): Promise<
  PrivacyActionResult<{ residual: Record<string, number>; pseudonymisedAuditKept: boolean }>
> {
  try {
    const first = await requireSession();
    assertPracticeAdmin(first);
    throttle("erase-client", first.userId, 10, 60 * 60_000);

    const { session, client, clientId } = await loadAuthorisedClient(
      input?.clientId,
    );
    const holds = await collectStatutoryHolds(clientId, session.practiceId);
    assertClientErasureConfirmation({
      phrase: input?.confirmPhrase,
      typedClientName: input?.confirmClientName,
      clientName: client.name,
      acknowledgeStatutory: input?.acknowledgeStatutory === true,
      holds,
    });

    // Record intent BEFORE deleting. No client name / identifiers in the detail.
    await safeAudit({
      practiceId: session.practiceId,
      clientId,
      actorId: session.userId,
      action: "client.erase_requested",
      entityType: "client",
      entityId: clientId,
      detail: {
        statutoryHoldsAcknowledged: holds.some((h) => h.count > 0),
        holds: holds.map((h) => ({ kind: h.kind, count: h.count })),
      },
    });

    // Re-runs the authorisation checks, purges every store, deletes the client.
    const { deleteClient } = await import("@/server/actions/clients");
    await deleteClient(clientId);

    const residual = await countClientResiduals(clientId);
    await safeAudit({
      practiceId: session.practiceId,
      clientId: null,
      actorId: session.userId,
      action: "client.erased",
      entityType: "client",
      entityId: clientId,
      detail: { residualStores: Object.keys(residual) },
    });
    await logSecurityEvent({
      type: "privacy.client_erased",
      severity: Object.keys(residual).length > 0 ? "medium" : "info",
      actorUserId: session.userId,
      practiceId: session.practiceId,
      ip: await requestIp(),
      details: { clientId, residualStores: Object.keys(residual) },
    });

    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true, residual, pseudonymisedAuditKept: true };
  } catch (err) {
    return fail(err);
  }
}
