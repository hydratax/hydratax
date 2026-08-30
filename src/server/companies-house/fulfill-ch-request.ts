import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { publicCheckoutError } from "@/lib/user-facing-errors";
import { getChService } from "@/lib/ch-services";
import { memoryStore, type MemoryChRequest } from "@/server/demo/store";
import {
  createCsFilingDraft,
  submitCsFiling,
} from "@/server/companies-house/filing/confirmation-statement";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { appendAuditEvent } from "@/server/audit/log";

export type ChFulfillmentResult = {
  ok: boolean;
  requestId: string;
  serviceId: string;
  companyNumber: string | null;
  companyName: string | null;
  paymentMarked: boolean;
  submitted: boolean;
  submissionNumber?: string | null;
  error?: string;
  emailDelivery?: "resend" | "logged" | "skipped";
};

type LoadedRequest = MemoryChRequest;

async function supabaseForFulfillment() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    return getSupabaseAdmin();
  }
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

async function loadChRequest(requestId: string): Promise<LoadedRequest | null> {
  if (isMemoryStore()) {
    return memoryStore.chRequests.find((r) => r.id === requestId) ?? null;
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await supabaseForFulfillment();
      const { data, error } = await supabase
        .from("companies_house_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          practiceId: data.practice_id,
          serviceId: data.service_id,
          companyNumber: data.company_number,
          accountRef: data.account_ref,
          paymentStatus: data.payment_status as MemoryChRequest["paymentStatus"],
          subscriptionActive: Boolean(data.subscription_active),
          planKey: data.plan_key,
          status: data.status as MemoryChRequest["status"],
          amountPence: data.amount_pence,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          payload: (data.payload as Record<string, unknown> | null) ?? undefined,
        };
      }
    } catch (err) {
      console.error("[ch.fulfill] supabase load", err);
    }
    return null;
  }

  try {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) return null;
    const { companiesHouseRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await getDb()
      .select()
      .from(companiesHouseRequests)
      .where(eq(companiesHouseRequests.id, requestId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      practiceId: row.practiceId,
      serviceId: row.serviceId,
      companyNumber: row.companyNumber,
      accountRef: row.accountRef,
      paymentStatus: row.paymentStatus as MemoryChRequest["paymentStatus"],
      subscriptionActive: row.subscriptionActive,
      planKey: row.planKey,
      status: row.status as MemoryChRequest["status"],
      amountPence: row.amountPence,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      payload: (row.payload as Record<string, unknown> | null) ?? undefined,
    };
  } catch {
    return null;
  }
}

async function persistRequestPatch(
  requestId: string,
  patch: Partial<
    Pick<
      MemoryChRequest,
      "paymentStatus" | "subscriptionActive" | "status" | "payload" | "updatedAt"
    >
  >,
) {
  const updatedAt = patch.updatedAt ?? new Date().toISOString();

  if (isMemoryStore()) {
    const row = memoryStore.chRequests.find((r) => r.id === requestId);
    if (row) Object.assign(row, patch, { updatedAt });
    return;
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await supabaseForFulfillment();
      const { error } = await supabase
        .from("companies_house_requests")
        .update({
          ...(patch.paymentStatus
            ? { payment_status: patch.paymentStatus }
            : {}),
          ...(patch.subscriptionActive !== undefined
            ? { subscription_active: patch.subscriptionActive }
            : {}),
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.payload ? { payload: patch.payload } : {}),
          updated_at: updatedAt,
        })
        .eq("id", requestId);
      if (error) console.error("[ch.fulfill] supabase update", error.message);
    } catch (err) {
      console.error("[ch.fulfill] supabase update", err);
    }
    return;
  }

  try {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) return;
    const { companiesHouseRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(companiesHouseRequests)
      .set({
        ...(patch.paymentStatus ? { paymentStatus: patch.paymentStatus } : {}),
        ...(patch.subscriptionActive !== undefined
          ? { subscriptionActive: patch.subscriptionActive }
          : {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.payload ? { payload: patch.payload } : {}),
        updatedAt: new Date(updatedAt),
      })
      .where(eq(companiesHouseRequests.id, requestId));
  } catch (err) {
    console.error("[ch.fulfill] drizzle update", err);
  }
}

function parseDirectors(payload: Record<string, unknown>) {
  const raw = payload.directorsJson;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      fullName?: string;
      dateOfBirth?: string;
      personalCode?: string;
    }>;
    return parsed
      .filter((d) => d.fullName && d.dateOfBirth && d.personalCode)
      .map((d) => ({
        fullName: String(d.fullName).trim(),
        dateOfBirth: String(d.dateOfBirth).trim(),
        personalCode: String(d.personalCode).trim().toUpperCase(),
      }));
  } catch {
    return [];
  }
}

async function resolveCompanyAuthCode(
  payload: Record<string, unknown>,
): Promise<string> {
  const clientId =
    typeof payload.clientId === "string" ? payload.clientId.trim() : "";

  if (clientId) {
    try {
      const { getClient } = await import("@/server/actions/clients");
      const client = await getClient(clientId);
      const fromClient = client.companyAuthCode?.trim().toUpperCase() ?? "";
      if (fromClient) return fromClient;
    } catch {
      // fall through to payload
    }
  }

  const fromPayload =
    typeof payload.companyAuthCode === "string"
      ? payload.companyAuthCode.trim().toUpperCase()
      : "";
  return fromPayload;
}

async function submitConfirmationStatementFromPayload(
  record: LoadedRequest,
  customerEmail?: string | null,
) {
  const payload = record.payload ?? {};
  const directors = parseDirectors(payload);
  if (directors.length === 0) {
    return { ok: false as const, error: "Director personal codes missing from request." };
  }

  const companyAuthCode = await resolveCompanyAuthCode(payload);
  if (!companyAuthCode) {
    return {
      ok: false as const,
      error:
        "Company authentication code missing — add it on the client record or at checkout.",
    };
  }

  const draft = await createCsFilingDraft({
    companyNumber: String(payload.companyNumber ?? record.companyNumber ?? ""),
    companyName: String(payload.companyName ?? ""),
    confirmationDate: String(payload.confirmationDate ?? ""),
    companyAuthCode,
    registeredEmail:
      (typeof payload.registeredEmail === "string" && payload.registeredEmail) ||
      customerEmail ||
      "",
    lawfulPurposeConfirmed: true,
    directors,
    clientId:
      typeof payload.clientId === "string" ? payload.clientId : "",
    practiceId: record.practiceId,
  });

  if (!draft.ok) {
    return {
      ok: false as const,
      error: draft.error ?? "Could not prepare confirmation statement filing.",
    };
  }
  if (!draft.filingId) {
    return {
      ok: false as const,
      error: "Could not prepare confirmation statement filing.",
    };
  }

  const filingId = draft.filingId;
  const filed = await submitCsFiling(filingId);
  if (!filed.ok) {
    return {
      ok: false as const,
      error: filed.error ?? "Companies House rejected the confirmation statement.",
      filingId,
    };
  }

  if (filed.mode !== "xml_gateway" || filed.status !== "submitted") {
    return {
      ok: false as const,
      error:
        filed.mode === "dry_run"
          ? "Companies House presenter credentials are not configured on this environment — live submit is disabled."
          : (filed.message ?? "Confirmation statement was not submitted to Companies House."),
      filingId,
    };
  }

  return {
    ok: true as const,
    filingId,
    submissionNumber: filed.submissionNumber ?? null,
  };
}

function cs01ConfirmationEmail(opts: {
  companyName: string;
  companyNumber: string;
  submissionNumber?: string | null;
  appUrl: string;
}) {
  const subject = `Confirmation statement submitted — ${opts.companyName}`;
  const text = `Your confirmation statement for ${opts.companyName} (${opts.companyNumber}) has been submitted to Companies House.

Please allow a few minutes for Companies House to update the public register. You can check status at:
https://find-and-update.company-information.service.gov.uk/company/${opts.companyNumber}

${opts.submissionNumber ? `Submission reference: ${opts.submissionNumber}\n` : ""}
If you paid by card, Stripe will send a separate payment receipt.

— HydraTax
${opts.appUrl}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:26px;margin:8px 0 16px;">Confirmation statement submitted</h1>
  <p>Your confirmation statement for <strong>${opts.companyName}</strong> (<strong>${opts.companyNumber}</strong>) has been sent to Companies House.</p>
  <p>Please allow a few minutes for the register to update. You can check at the <a href="https://find-and-update.company-information.service.gov.uk/company/${opts.companyNumber}">Companies House record</a>.</p>
  ${opts.submissionNumber ? `<p style="font-size:14px;color:#3a4248;">Reference: <strong>${opts.submissionNumber}</strong></p>` : ""}
  <p style="font-size:14px;color:#3a4248;">If you paid by card, Stripe will email a separate payment receipt.</p>
</body></html>`;

  return { subject, text, html };
}

function cs01PaymentReceivedEmail(opts: {
  companyName: string;
  companyNumber: string;
  appUrl: string;
}) {
  const subject = `Payment received — confirmation statement for ${opts.companyName}`;
  const text = `We received your payment for the confirmation statement filing for ${opts.companyName} (${opts.companyNumber}).

We are submitting this to Companies House now. You will receive another email from HydraTax once Companies House accepts the filing.

If you paid by card, Stripe will send a separate payment receipt.

— HydraTax
${opts.appUrl}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:26px;margin:8px 0 16px;">Payment received</h1>
  <p>We received your payment for the confirmation statement for <strong>${opts.companyName}</strong> (<strong>${opts.companyNumber}</strong>).</p>
  <p>We are submitting this to Companies House now. You will receive another email once the filing is accepted.</p>
  <p style="font-size:14px;color:#3a4248;">If you paid by card, Stripe will email a separate payment receipt.</p>
</body></html>`;

  return { subject, text, html };
}

/**
 * Mark a Companies House checkout request paid and, for CS01, submit to Companies House.
 * Idempotent — safe to call from Stripe webhook and /checkout/success.
 */
export async function fulfillPaidChRequest(opts: {
  requestId: string;
  customerEmail?: string | null;
  stripeSessionId?: string;
}): Promise<ChFulfillmentResult> {
  const { requestId, customerEmail, stripeSessionId } = opts;
  const record = await loadChRequest(requestId);
  if (!record) {
    return {
      ok: false,
      requestId,
      serviceId: "unknown",
      companyNumber: null,
      companyName: null,
      paymentMarked: false,
      submitted: false,
      error: "Filing request not found.",
    };
  }

  const payload = record.payload ?? {};
  const companyName =
    typeof payload.companyName === "string" ? payload.companyName : null;

  if (record.paymentStatus === "paid" &&
    (record.status === "submitted" || record.status === "completed")
  ) {
    const fulfillment = payload._fulfillment as
      | { submissionNumber?: string }
      | undefined;
    return {
      ok: true,
      requestId,
      serviceId: record.serviceId,
      companyNumber: record.companyNumber,
      companyName,
      paymentMarked: true,
      submitted: true,
      submissionNumber: fulfillment?.submissionNumber ?? null,
      emailDelivery: "skipped",
    };
  }

  await persistRequestPatch(requestId, {
    paymentStatus: "paid",
    subscriptionActive: true,
    status: record.status === "received" ? "in_progress" : record.status,
  });

  let submitted = false;
  let submissionNumber: string | null | undefined;
  let fulfillError: string | undefined;
  let filingId: string | undefined;

  if (record.serviceId === "confirmation-statement") {
    const result = await submitConfirmationStatementFromPayload(
      record,
      customerEmail,
    );
    if (result.ok) {
      submitted = true;
      submissionNumber = result.submissionNumber;
      filingId = result.filingId;
      await persistRequestPatch(requestId, {
        status: "submitted",
        payload: {
          ...payload,
          _fulfillment: {
            filingId: result.filingId,
            submissionNumber: result.submissionNumber,
            stripeSessionId,
            fulfilledAt: new Date().toISOString(),
          },
        },
      });
    } else {
      fulfillError = result.error;
      await persistRequestPatch(requestId, {
        status: "in_progress",
        payload: {
          ...payload,
          _fulfillment: {
            error: result.error,
            filingId: "filingId" in result ? result.filingId : undefined,
            stripeSessionId,
            fulfilledAt: new Date().toISOString(),
          },
        },
      });
    }
  } else {
    await persistRequestPatch(requestId, { status: "in_progress" });
  }

  let emailDelivery: ChFulfillmentResult["emailDelivery"] = "skipped";
  const email =
    customerEmail?.trim() ||
    (typeof payload.registeredEmail === "string"
      ? payload.registeredEmail.trim()
      : "");
  if (
    record.serviceId === "confirmation-statement" &&
    email &&
    record.companyNumber
  ) {
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk"
    ).replace(/\/$/, "");
    const content = submitted
      ? cs01ConfirmationEmail({
          companyName: companyName ?? record.companyNumber,
          companyNumber: record.companyNumber,
          submissionNumber,
          appUrl,
        })
      : cs01PaymentReceivedEmail({
          companyName: companyName ?? record.companyNumber,
          companyNumber: record.companyNumber,
          appUrl,
        });
    try {
      emailDelivery = await sendTransactionalEmail({
        to: email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    } catch (err) {
      console.error("[ch.fulfill] email failed", err);
      emailDelivery = "skipped";
    }
  }

  try {
    await appendAuditEvent({
      practiceId: record.practiceId,
      actorId: "system:stripe_fulfillment",
      action: submitted ? "ch.request.submitted" : "ch.request.paid",
      entityType: "ch_request",
      entityId: requestId,
      detail: {
        serviceId: record.serviceId,
        companyNumber: record.companyNumber,
        submissionNumber,
        filingId,
        stripeSessionId,
        error: fulfillError,
      },
    });
  } catch {
    /* audit must not block fulfillment */
  }

  return {
    ok: submitted || record.serviceId !== "confirmation-statement",
    requestId,
    serviceId: record.serviceId,
    companyNumber: record.companyNumber,
    companyName,
    paymentMarked: true,
    submitted,
    submissionNumber,
    error: fulfillError ? publicCheckoutError(fulfillError) : undefined,
    emailDelivery,
  };
}

export async function markChRequestPaidById(requestId: string) {
  const record = await loadChRequest(requestId);
  if (!record || record.paymentStatus === "paid") return;
  await persistRequestPatch(requestId, {
    paymentStatus: "paid",
    subscriptionActive: true,
  });
}
