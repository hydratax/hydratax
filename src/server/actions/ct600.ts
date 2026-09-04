"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { ct600FiguresSchema } from "@/server/money/schemas";
import { poundsToPence } from "@/server/money/pence";
import { appendAuditEvent } from "@/server/audit/log";
import { tryGetDb } from "@/server/db";
import {
  deskGetCt600Return,
  deskListCt600Returns,
  deskSaveCt600Return,
  deskUpdateCt600Return,
  deskFindCt600ByPeriod,
} from "@/server/db/desk-store";
import type { Ct600QuestionnaireAnswers } from "@/lib/hmrc/filing-guides";
import {
  buildCt600Package,
  buildCt600FormReviewPdf,
  buildAccountsReviewPdf,
} from "@/server/hmrc/ct600/index";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { ct600SubmitEmailContent } from "@/server/email/ct600-submit-template";

async function loadCt600Builder() {
  return import("@/server/hmrc/ct600/index");
}

const figuresFormSchema = z.object({
  clientId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  turnoverPounds: z.string(),
  costOfSalesPounds: z.string().default("0"),
  administrativeExpensesPounds: z.string().default("0"),
  otherIncomePounds: z.string().default("0"),
  tangibleAssetsPounds: z.string().default("0"),
  cashAtBankPounds: z.string().default("0"),
  debtorsPounds: z.string().default("0"),
  creditorsPounds: z.string().default("0"),
  calledUpShareCapitalPounds: z.string().default("0"),
  profitAndLossAccountPounds: z.string().default("0"),
  questionnaire: z.record(z.union([z.boolean(), z.number(), z.string()])).optional(),
});

const submitSchema = z.object({
  returnId: z.string(),
  clientId: z.string(),
  senderId: z.string().optional(),
  senderPassword: z.string().optional(),
  useSavedPassword: z.boolean().optional(),
  rememberPassword: z.boolean().optional(),
});

function formToFigures(data: z.infer<typeof figuresFormSchema>) {
  return ct600FiguresSchema.parse({
    clientId: data.clientId,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    turnoverPence: poundsToPence(data.turnoverPounds),
    costOfSalesPence: poundsToPence(data.costOfSalesPounds),
    administrativeExpensesPence: poundsToPence(data.administrativeExpensesPounds),
    otherIncomePence: poundsToPence(data.otherIncomePounds),
    tangibleAssetsPence: poundsToPence(data.tangibleAssetsPounds),
    cashAtBankPence: poundsToPence(data.cashAtBankPounds),
    debtorsPence: poundsToPence(data.debtorsPounds),
    creditorsPence: poundsToPence(data.creditorsPounds),
    calledUpShareCapitalPence: poundsToPence(data.calledUpShareCapitalPounds),
    profitAndLossAccountPence: poundsToPence(data.profitAndLossAccountPounds),
  });
}

function mapCt600Row(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    clientId: (row.client_id ?? row.clientId) as string,
    periodStart: (row.period_start ?? row.periodStart) as string,
    periodEnd: (row.period_end ?? row.periodEnd) as string,
    status: row.status as string,
    figures: row.figures,
    questionnaire: (row.questionnaire ?? {}) as Ct600QuestionnaireAnswers,
    taxableProfitPence:
      (row.taxable_profit_pence ?? row.taxableProfitPence) as number | null,
    xmlPayloadHash: (row.xml_payload_hash ?? row.xmlPayloadHash) as string | null,
    hmrcCorrelationId: (row.hmrc_correlation_id ?? row.hmrcCorrelationId) as
      | string
      | null,
    hmrcReceipt: (row.hmrc_receipt ?? row.hmrcReceipt) as string | null,
    validationIssues: (row.validation_issues ?? row.validationIssues) as
      | unknown
      | null,
    submittedAt: (row.submitted_at ?? row.submittedAt) as string | null,
    createdAt: (row.created_at ?? row.createdAt) as string,
  };
}

async function loadDraft(returnId: string, clientId: string) {
  if (isDemoMode()) {
    return demoStore.ct600Returns.find(
      (r) => r.id === returnId && r.clientId === clientId,
    );
  }
  const desk = await deskGetCt600Return(returnId, clientId);
  if (desk) return mapCt600Row(desk as Record<string, unknown>);
  const db = tryGetDb();
  if (db) {
    const { ct600Returns } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await db
      .select()
      .from(ct600Returns)
      .where(and(eq(ct600Returns.id, returnId), eq(ct600Returns.clientId, clientId)))
      .limit(1);
    if (row) return mapCt600Row(row as unknown as Record<string, unknown>);
  }
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("ct600_returns")
      .select("*")
      .eq("id", returnId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (data) return mapCt600Row(data);
  }
  return null;
}

async function persistDraft(draft: {
  id: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  figures: unknown;
  questionnaire?: Ct600QuestionnaireAnswers;
  taxableProfitPence?: number;
  xmlPayloadHash?: string;
  validationIssues?: unknown;
}) {
  if (isDemoMode()) {
    const idx = demoStore.ct600Returns.findIndex((r) => r.id === draft.id);
    const row = {
      ...draft,
      hmrcCorrelationId: null,
      hmrcReceipt: null,
      submittedAt: null,
      createdAt: new Date().toISOString(),
    };
    if (idx >= 0) demoStore.ct600Returns[idx] = row;
    else demoStore.ct600Returns.push(row);
    return row;
  }

  const saved = await deskSaveCt600Return({
    id: draft.id,
    clientId: draft.clientId,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    status: draft.status,
    figures: draft.figures,
    questionnaire: draft.questionnaire,
    taxableProfitPence: draft.taxableProfitPence,
    xmlPayloadHash: draft.xmlPayloadHash,
    validationIssues: draft.validationIssues,
  });
  if (saved) return mapCt600Row(saved as Record<string, unknown>);

  const db = tryGetDb();
  if (db) {
    const { ct600Returns } = await import("@/server/db/schema");
    const [row] = await db
      .insert(ct600Returns)
      .values({
        id: draft.id,
        clientId: draft.clientId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        status: draft.status as "draft" | "ready" | "submitted" | "accepted" | "rejected" | "error",
        figures: draft.figures,
        questionnaire: draft.questionnaire ?? {},
        taxableProfitPence: draft.taxableProfitPence ?? null,
        xmlPayloadHash: draft.xmlPayloadHash,
        validationIssues: draft.validationIssues ?? null,
      })
      .returning();
    return mapCt600Row(row as unknown as Record<string, unknown>);
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ct600_returns")
      .insert({
        id: draft.id,
        client_id: draft.clientId,
        period_start: draft.periodStart,
        period_end: draft.periodEnd,
        status: draft.status,
        figures: draft.figures,
        questionnaire: draft.questionnaire ?? {},
        taxable_profit_pence: draft.taxableProfitPence ?? null,
        xml_payload_hash: draft.xmlPayloadHash ?? null,
        validation_issues: draft.validationIssues ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapCt600Row(data);
  }

  throw new Error("CT600 storage is not configured.");
}

export async function prepareCt600(input: z.infer<typeof figuresFormSchema>) {
  const session = await requireSession();
  const data = figuresFormSchema.parse(input);
  const client = await getClient(data.clientId);
  if (client.type !== "limited_company") {
    throw new Error("CT600 is only for limited companies");
  }
  if (!client.companyNumber || !client.utr) {
    throw new Error("Company number and a valid 10-digit UTR are required for CT600");
  }

  const figures = formToFigures(data);
  const questionnaire = (data.questionnaire ?? {}) as Ct600QuestionnaireAnswers;
  const { buildCt600Package } = await loadCt600Builder();
  const built = buildCt600Package(
    {
      companyName: client.name,
      companyNumber: client.companyNumber,
      utr: client.utr,
      figures,
      questionnaire,
    },
    { strict: false },
  );

  const existing =
    (await deskFindCt600ByPeriod(
      data.clientId,
      data.periodStart,
      data.periodEnd,
    ).catch(() => null)) ??
    (isDemoMode()
      ? demoStore.ct600Returns.find(
          (r) =>
            r.clientId === data.clientId &&
            r.periodStart === data.periodStart &&
            r.periodEnd === data.periodEnd,
        )
      : null);

  const draftId =
    existing && typeof (existing as { id?: string }).id === "string"
      ? String((existing as { id: string }).id)
      : crypto.randomUUID();

  const draft = await persistDraft({
    id: draftId,
    clientId: data.clientId,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    status: built.validation.ok ? "ready" : "draft",
    figures,
    questionnaire,
    taxableProfitPence: built.taxableProfitPence,
    xmlPayloadHash: built.hash,
    validationIssues: built.validation.issues,
  });

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "ct600.prepare",
    entityType: "ct600_return",
    entityId: draft.id,
    payloadHash: built.hash,
    detail: {
      taxableProfitPence: built.taxableProfitPence,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      validationOk: built.validation.ok,
    },
  });

  revalidatePath(`/clients/${data.clientId}/corporation-tax`);
  revalidatePath(`/clients/${data.clientId}/year-end`);
  return {
    draft,
    validation: built.validation,
    xmlPreview: built.xml.slice(0, 2000),
  };
}

export async function listCt600Returns(clientId: string) {
  await getClient(clientId);
  let rows: ReturnType<typeof mapCt600Row>[] = [];
  if (isDemoMode()) {
    rows = demoStore.ct600Returns
      .filter((r) => r.clientId === clientId)
      .map((r) => mapCt600Row(r as unknown as Record<string, unknown>));
  } else {
    const desk = await deskListCt600Returns(clientId);
    if (desk) {
      rows = desk.map((r) => mapCt600Row(r as Record<string, unknown>));
    } else {
      const db = tryGetDb();
      if (db) {
        const { ct600Returns } = await import("@/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const dbRows = await db
          .select()
          .from(ct600Returns)
          .where(eq(ct600Returns.clientId, clientId));
        rows = dbRows.map((r) =>
          mapCt600Row(r as unknown as Record<string, unknown>),
        );
      } else if (isSupabaseConfigured()) {
        const { createClient } = await import("@/lib/supabase/server");
        const supabase = await createClient();
        const { data } = await supabase
          .from("ct600_returns")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });
        rows = (data ?? []).map((r) => mapCt600Row(r));
      }
    }
  }

  // One row per accounting period — keep the newest draft/submission.
  const byPeriod = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.periodStart}|${row.periodEnd}`;
    if (!byPeriod.has(key)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()];
}

export async function submitCt600(
  returnId: string,
  clientId: string,
  credentials?: {
    senderId?: string;
    senderPassword?: string;
    useSavedPassword?: boolean;
    rememberPassword?: boolean;
    declarantName?: string;
    declarantStatus?: string;
  },
) {
  const session = await requireSession();
  submitSchema.parse({ returnId, clientId, ...credentials });
  const client = await getClient(clientId);
  if (!client.companyNumber || !client.utr) {
    throw new Error("Company number and a valid 10-digit UTR are required for CT600");
  }

  const draft = await loadDraft(returnId, clientId);
  if (!draft) throw new Error("CT600 draft not found");

  const { resolveGatewayCredentialsForSubmit } = await import(
    "@/server/hmrc/gateway-credentials"
  );
  const resolved = await resolveGatewayCredentialsForSubmit({
    clientId,
    senderId: credentials?.senderId,
    senderPassword: credentials?.senderPassword,
    useSavedPassword: credentials?.useSavedPassword,
    rememberPassword: credentials?.rememberPassword,
  });

  const figures = ct600FiguresSchema.parse(draft.figures);
  const ch =
    "companiesHouse" in client
      ? (client.companiesHouse as {
          directors?: Array<{ name: string; resignedOn?: string | null }>;
        } | null)
      : null;
  const directors =
    ch?.directors
      ?.filter((d) => !d.resignedOn)
      .map((d) => d.name)
      .filter(Boolean) ?? [];
  const { submitCt600Package } = await loadCt600Builder();
  const res = await submitCt600Package({
    companyName: client.name,
    companyNumber: client.companyNumber,
    utr: client.utr,
    figures,
    questionnaire: draft.questionnaire ?? {},
    declarantName: credentials?.declarantName?.trim() || directors[0] || null,
    declarantStatus: credentials?.declarantStatus?.trim() || "Director",
    contact: {
      email: session.email ?? undefined,
    },
    sender: "Company",
    senderId: resolved.senderId,
    senderPassword: resolved.senderPassword,
    actorId: session.userId,
    clientId,
    practiceId: session.practiceId,
    demo: isDemoMode(),
  });

  const nextStatus = res.ok ? "accepted" : "rejected";
  if (isDemoMode()) {
    const idx = demoStore.ct600Returns.findIndex((r) => r.id === returnId);
    if (idx >= 0) {
      demoStore.ct600Returns[idx] = {
        ...demoStore.ct600Returns[idx],
        status: nextStatus,
        hmrcCorrelationId: res.correlationId,
        hmrcReceipt: res.receipt,
        submittedAt: new Date().toISOString(),
        xmlPayloadHash: res.hash,
      };
    }
  } else {
    await deskUpdateCt600Return(returnId, clientId, {
      status: nextStatus,
      hmrc_correlation_id: res.correlationId,
      hmrc_receipt: res.receipt,
      submitted_at: new Date().toISOString(),
      xml_payload_hash: res.hash,
    });
    const db = tryGetDb();
    if (db) {
      const { ct600Returns } = await import("@/server/db/schema");
      const { and, eq } = await import("drizzle-orm");
      await db
        .update(ct600Returns)
        .set({
          status: nextStatus,
          hmrcCorrelationId: res.correlationId,
          hmrcReceipt: res.receipt,
          submittedAt: new Date(),
          xmlPayloadHash: res.hash,
        })
        .where(and(eq(ct600Returns.id, returnId), eq(ct600Returns.clientId, clientId)));
    }
    if (isSupabaseConfigured()) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("ct600_returns")
        .update({
          status: nextStatus,
          hmrc_correlation_id: res.correlationId,
          hmrc_receipt: res.receipt,
          submitted_at: new Date().toISOString(),
          xml_payload_hash: res.hash,
        })
        .eq("id", returnId)
        .eq("client_id", clientId);
    }
  }

  const submitEmail = session.email?.trim();
  if (submitEmail) {
    try {
      const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk"
      ).replace(/\/$/, "");
      const content = ct600SubmitEmailContent({
        companyName: client.name,
        companyNumber: client.companyNumber,
        utr: client.utr,
        periodStart: figures.periodStart,
        periodEnd: figures.periodEnd,
        accepted: res.ok,
        correlationId: res.correlationId,
        errorMessage: res.errorMessage,
        demo: isDemoMode(),
        clientId,
        appUrl,
      });
      await sendTransactionalEmail({
        to: submitEmail,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    } catch (err) {
      console.error("[ct600.submit] confirmation email failed", err);
    }
  }

  revalidatePath(`/clients/${clientId}/corporation-tax`);
  return {
    draft: await loadDraft(returnId, clientId),
    res: {
      ...res,
      errorMessage: res.errorMessage ?? null,
    },
  };
}

export async function validateCt600Draft(returnId: string, clientId: string) {
  const client = await getClient(clientId);
  const draft = await loadDraft(returnId, clientId);
  if (!draft) throw new Error("CT600 draft not found");
  const figures = ct600FiguresSchema.parse(draft.figures);
  const { buildCt600Package } = await loadCt600Builder();
  const built = buildCt600Package(
    {
      companyName: client.name,
      companyNumber: client.companyNumber ?? "",
      utr: client.utr ?? "",
      figures,
      questionnaire: draft.questionnaire ?? {},
    },
    { strict: true },
  );
  return built.validation;
}

/** Safe (non-secret) CT Online submit context for the UI. */
export async function getCt600SubmitInfo() {
  await requireSession();
  const { getHmrcConfig } = await import("@/server/hmrc/config");
  const cfg = getHmrcConfig();
  return {
    env: cfg.env,
    live: cfg.env === "production",
    vendorIdConfigured: Boolean(cfg.ctVendorId),
    productName: cfg.ctProductName,
    hasTestCredentials: Boolean(cfg.ctTestSenderId && cfg.ctTestPassword),
  };
}

/** Review PDFs before submit — no credentials required. */
export async function downloadCt600Draft(
  returnId: string,
  clientId: string,
  kind: "ct600" | "accounts" | "both" = "both",
  opts?: { declarantName?: string; declarantStatus?: string },
) {
  await requireSession();
  const client = await getClient(clientId);
  const draft = await loadDraft(returnId, clientId);
  if (!draft) throw new Error("CT600 draft not found");

  const figures = ct600FiguresSchema.parse(draft.figures);
  const built = buildCt600Package(
    {
      companyName: client.name,
      companyNumber: client.companyNumber ?? "",
      utr: client.utr ?? "",
      figures,
      questionnaire: draft.questionnaire ?? {},
    },
    { strict: false },
  );

  const ch =
    "companiesHouse" in client
      ? (client.companiesHouse as {
          registeredOffice?: string | null;
          directors?: Array<{ name: string; resignedOn?: string | null }>;
          companyNumber?: string | null;
        } | null)
      : null;
  const directors =
    ch?.directors
      ?.filter((d) => !d.resignedOn)
      .map((d) => d.name)
      .filter(Boolean) ?? [];

  const dormant =
    Number(figures.turnoverPence) === 0 &&
    Number(figures.otherIncomePence) === 0 &&
    Number(figures.costOfSalesPence) === 0 &&
    Number(figures.administrativeExpensesPence) === 0;

  const company = {
    name: client.name,
    companyNumber: client.companyNumber ?? ch?.companyNumber ?? "",
    utr: client.utr ?? "",
    registeredOffice: ch?.registeredOffice ?? null,
    directors,
    declarantName:
      opts?.declarantName?.trim() || directors[0] || null,
    declarantStatus: opts?.declarantStatus?.trim() || "Director",
  };

  const fileSlug = (client.companyNumber || client.name || "ct600")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 40);
  const ye = figures.periodEnd.replace(/-/g, "");

  const files: Array<{ filename: string; mimeType: string; base64: string }> =
    [];

  if (kind === "ct600" || kind === "both") {
    const ct600Pdf = await buildCt600FormReviewPdf({
      company,
      figures,
      taxableProfitPence: built.taxableProfitPence,
      taxChargePence: built.taxChargePence,
    });
    files.push({
      filename: `${fileSlug}_CT600_${ye}.pdf`,
      mimeType: "application/pdf",
      base64: Buffer.from(ct600Pdf).toString("base64"),
    });
  }

  if (kind === "accounts" || kind === "both") {
    const accountsPdf = await buildAccountsReviewPdf({
      company,
      figures,
      dormant,
    });
    files.push({
      filename: `${fileSlug}_Accounts_YE_${ye}.pdf`,
      mimeType: "application/pdf",
      base64: Buffer.from(accountsPdf).toString("base64"),
    });
  }

  return {
    status: draft.status,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    files,
  };
}

