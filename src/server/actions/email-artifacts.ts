"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getEnv } from "@/lib/env";
import { sendClientCommunicationEmail } from "@/server/actions/client-communications";
import type { EmailAttachment } from "@/server/email/transactional";

const artifactSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("onboarding_form"),
    formId: z.string().min(1),
  }),
  z.object({
    type: z.literal("ct_pack"),
    returnId: z.string().min(1),
    kind: z.enum(["ct600", "accounts", "computation"]),
  }),
  z.object({
    type: z.literal("sa_pdf"),
    returnId: z.string().min(1),
    /** @deprecated prefer `docs` — kept for older call sites */
    doc: z.enum(["sa100", "sa302"]).optional(),
    docs: z.array(z.enum(["sa100", "sa302"])).min(1).max(2).optional(),
  }),
  z.object({
    type: z.literal("vat_summary"),
    periodKey: z.string().min(1),
    status: z.enum(["draft", "submitted"]),
    boxes: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal("link"),
    url: z.string().url(),
    label: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal("accounts_bank_pack"),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

const sendSchema = z.object({
  clientId: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().min(3).max(200),
  message: z.string().min(1).max(8000),
  artifact: artifactSchema,
});

export type ClientEmailArtifact = z.infer<typeof artifactSchema>;

function formatVatBoxes(boxes: Record<string, string> | undefined): string {
  if (!boxes || !Object.keys(boxes).length) {
    return "(No box figures included — ask your accountant if you need the full schedule.)";
  }
  return Object.entries(boxes)
    .map(([k, v]) => `• ${k}: ${v || "—"}`)
    .join("\n");
}

export async function emailClientArtifact(
  input: z.infer<typeof sendSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = sendSchema.parse(input);
  const client = await getClient(data.clientId);
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  let body = data.message.trim();
  const attachments: EmailAttachment[] = [];
  let kind: string = data.artifact.type;
  let documentCount = 0;

  if (data.artifact.type === "onboarding_form") {
    const formId = data.artifact.formId;
    const { publishOnboardingForm, listClientOnboardingForms } = await import(
      "@/server/actions/onboarding-forms"
    );
    const forms = await listClientOnboardingForms(data.clientId);
    let form = forms.find((f) => f.id === formId);
    if (!form) throw new Error("Form not found");
    if (form.status === "draft") {
      form = await publishOnboardingForm({
        clientId: data.clientId,
        formId: form.id,
      });
    }
    const link = `${appUrl}/forms/${form.token}`;
    body += `\n\nComplete your form here:\n${link}\n`;
    kind = "onboarding_form";
  } else if (data.artifact.type === "ct_pack") {
    const { returnId, kind: ctKind } = data.artifact;
    const { downloadCt600Draft } = await import("@/server/actions/ct600");
    const pack = await downloadCt600Draft(
      returnId,
      data.clientId,
      ctKind,
    );
    const { protectClientPdf } = await import("@/server/pdf/lock-for-client");
    let lockedAny = false;
    for (const file of pack.files) {
      if (file.mimeType === "application/pdf") {
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: Buffer.from(file.base64, "base64"),
          pdfFilename: file.filename,
        });
        if (protectedPdf.locked) {
          lockedAny = true;
          attachments.push({
            filename: protectedPdf.pack.filename,
            content: protectedPdf.pack.bytes.toString("base64"),
            contentType: protectedPdf.pack.contentType,
          });
          continue;
        }
      }
      attachments.push({
        filename: file.filename,
        content: file.base64,
        contentType: file.mimeType,
      });
    }
    documentCount = attachments.length;
    kind = `ct_${ctKind}`;
    body += `\n\n${documentCount} PDF attachment(s) for ${client.name} are included.`;
    if (lockedAny) {
      body += `\n\nAttachments are password-protected. The password is the signing director’s date of birth as DDMMYYYY (eight digits, no slashes).`;
    }
  } else if (data.artifact.type === "sa_pdf") {
    const { returnId } = data.artifact;
    const docs = (
      data.artifact.docs?.length
        ? data.artifact.docs
        : data.artifact.doc
          ? [data.artifact.doc]
          : []
    ) as Array<"sa100" | "sa302">;
    if (!docs.length) throw new Error("Select SA100 and/or SA302 to email.");
    const { getSa100Return } = await import("@/server/actions/sa100");
    const { buildSa302Pdf } = await import("@/server/sa100/pdf");
    const { buildSa100PackPdf } = await import("@/server/sa100/pack");
    const row = await getSa100Return(data.clientId, returnId);
    const taxpayerName =
      row.draft.declarationName?.trim() ||
      (client.type === "limited_company" ? "" : client.name);
    const meta = {
      submissionRef: row.hmrcCorrelationId ?? null,
      status: row.status,
      taxYear: row.taxYear,
    };
    const { protectClientPdf } = await import("@/server/pdf/lock-for-client");
    let lockedAny = false;
    for (const doc of docs) {
      if (doc === "sa302") {
        const bytes = await buildSa302Pdf(
          row.calculation,
          taxpayerName,
          row.draft.utr || client.utr || "",
          meta,
        );
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: bytes,
          pdfFilename: `SA302-${row.taxYear}.pdf`,
          dateOfBirth: row.draft.dateOfBirth,
        });
        if (protectedPdf.locked) {
          lockedAny = true;
          attachments.push({
            filename: protectedPdf.pack.filename,
            content: protectedPdf.pack.bytes.toString("base64"),
            contentType: protectedPdf.pack.contentType,
          });
        } else {
          attachments.push({
            filename: protectedPdf.filename,
            content: protectedPdf.bytes.toString("base64"),
            contentType: protectedPdf.contentType,
          });
        }
      } else {
        const { bytes, supplements } = await buildSa100PackPdf(
          row.draft,
          taxpayerName,
          meta,
        );
        const suffix = supplements.length ? `+${supplements.join("+")}` : "";
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: bytes,
          pdfFilename: `SA100-${row.taxYear}${suffix}.pdf`,
          dateOfBirth: row.draft.dateOfBirth,
        });
        if (protectedPdf.locked) {
          lockedAny = true;
          attachments.push({
            filename: protectedPdf.pack.filename,
            content: protectedPdf.pack.bytes.toString("base64"),
            contentType: protectedPdf.pack.contentType,
          });
        } else {
          attachments.push({
            filename: protectedPdf.filename,
            content: protectedPdf.bytes.toString("base64"),
            contentType: protectedPdf.contentType,
          });
        }
      }
    }
    documentCount = attachments.length;
    kind = docs.join("+");
    body += `\n\nPlease find the attached ${docs.map((d) => d.toUpperCase()).join(" and ")} PDF${docs.length > 1 ? "s" : ""}.`;
    if (lockedAny) {
      body += `\n\nAttachments are password-protected. The password is the taxpayer’s / director’s date of birth as DDMMYYYY (eight digits, no slashes).`;
    }
  } else if (data.artifact.type === "vat_summary") {
    const { periodKey, status, boxes } = data.artifact;
    const label =
      status === "draft" ? "draft VAT return" : "submitted VAT return";
    body += `\n\n${label} for period ${periodKey} (${client.name}):\n${formatVatBoxes(boxes)}\n`;
    kind = `vat_${status}`;
  } else if (data.artifact.type === "link") {
    const { label, url } = data.artifact;
    body += `\n\n${label}:\n${url}\n`;
    kind = "link";
  } else if (data.artifact.type === "accounts_bank_pack") {
    const { periodStart, periodEnd } = data.artifact;
    const { getYearEndAccountsDraftFromBank } = await import(
      "@/server/actions/bank"
    );
    const { buildDigitusAccountsPdf } = await import(
      "@/server/accounts/build-digitus-accounts-pdf"
    );
    const draft = await getYearEndAccountsDraftFromBank(
      data.clientId,
      periodStart,
      periodEnd,
    );
    const ch =
      "companiesHouse" in client
        ? (client.companiesHouse as {
            registeredOffice?: string | null;
            directors?: Array<{ name: string; resignedOn?: string | null }>;
          } | null)
        : null;
    const directors =
      ch?.directors
        ?.filter((d) => !d.resignedOn)
        .map((d) => d.name)
        .filter(Boolean) ?? [];
    const pdf = await buildDigitusAccountsPdf({
      company: {
        name: client.name,
        companyNumber: client.companyNumber ?? "",
        utr: client.utr ?? "",
        registeredOffice: ch?.registeredOffice ?? null,
        directors,
        declarantName: directors[0] ?? null,
      },
      figures: {
        periodStart,
        periodEnd,
        turnoverPence: draft.turnoverPence,
        costOfSalesPence: draft.costOfSalesPence,
        administrativeExpensesPence: draft.adminExpensesPence,
        otherIncomePence: 0,
        tangibleAssetsPence: Number(draft.balanceSheet.fixedAssetsPence ?? 0),
        cashAtBankPence: Number(draft.balanceSheet.cashAtBankPence ?? 0),
        debtorsPence: draft.balanceSheet.otherDebtorsPence,
        creditorsPence: draft.balanceSheet.creditorsWithinOneYearPence,
        calledUpShareCapitalPence: Number(
          draft.balanceSheet.shareCapitalPence ?? 0,
        ),
        profitAndLossAccountPence: Number(
          draft.balanceSheet.profitAndLossReservePence ?? 0,
        ),
      } as never,
      taxChargePence: draft.taxationPence,
    });
    const ye = periodEnd.replace(/-/g, "");
    const filename = `${(client.companyNumber || client.name)
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .slice(0, 40)}_Accounts_YE_${ye}.pdf`;
    const { protectClientPdf } = await import("@/server/pdf/lock-for-client");
    const protectedPdf = await protectClientPdf({
      clientId: data.clientId,
      pdfBytes: Buffer.from(pdf),
      pdfFilename: filename,
    });
    if (protectedPdf.locked) {
      attachments.push({
        filename: protectedPdf.pack.filename,
        content: protectedPdf.pack.bytes.toString("base64"),
        contentType: protectedPdf.pack.contentType,
      });
      body += `\n\nYear-end accounts PDF is attached (password-protected — director DOB as DDMMYYYY).`;
    } else {
      attachments.push({
        filename: protectedPdf.filename,
        content: protectedPdf.bytes.toString("base64"),
        contentType: protectedPdf.contentType,
      });
      body += `\n\nYear-end accounts PDF is attached.`;
    }
    documentCount = 1;
    kind = "accounts_pack";
  }

  const res = await sendClientCommunicationEmail({
    clientId: data.clientId,
    toEmail: data.toEmail,
    subject: data.subject,
    message: body,
    kind,
    documentCount,
    attachments: attachments.length ? attachments : undefined,
  });

  revalidatePath(`/clients/${data.clientId}/forms`);

  return {
    ok: true as const,
    delivery: res.delivery,
    message:
      res.delivery === "resend"
        ? "Emailed to the client."
        : "Email logged locally (set RESEND_API_KEY to send for real).",
  };
}
