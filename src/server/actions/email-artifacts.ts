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
    /** `both` = CT600 + accounts + computation */
    kind: z.enum(["ct600", "accounts", "computation", "both"]),
  }),
  z.object({
    type: z.literal("sa_pdf"),
    returnId: z.string().min(1),
    /** @deprecated prefer `docs` — kept for older call sites */
    doc: z.enum(["sa100", "sa302"]).optional(),
    docs: z.array(z.enum(["sa100", "sa302"])).min(1).max(2).optional(),
  }),
  /** Uploaded (or previously stored) SA100 / SA302 PDFs — no return row required. */
  z.object({
    type: z.literal("sa_filed_pdfs"),
    taxYear: z.string().min(4).max(12),
    documentIds: z
      .array(
        z.object({
          kind: z.enum(["sa100", "sa302"]),
          documentId: z.string().min(1),
        }),
      )
      .min(1)
      .max(2),
    /** Optional DOB / personal UTR overrides for password policy */
    dateOfBirth: z.string().optional(),
    personalUtr: z.string().optional(),
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
  z.object({
    type: z.literal("client_letter"),
    letterId: z.string().min(1),
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
    let lockHint: string | null = null;
    for (const file of pack.files) {
      if (file.mimeType === "application/pdf") {
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: Buffer.from(file.base64, "base64"),
          pdfFilename: file.filename,
          section: "ct",
          requireLock: true,
        });
        if (protectedPdf.locked) {
          lockHint = protectedPdf.pack.passwordHint;
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
    if (lockHint) {
      body += `\n\nAttachments are password-protected. ${lockHint}`;
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

    // Uploaded returns use synthetic ids (`doc-{documentId}`) — email the
    // stored PDF instead of regenerating from a missing return row.
    if (returnId.startsWith("doc-")) {
      const documentId = returnId.slice("doc-".length);
      const { listSaFiledDocuments } = await import("@/server/actions/sa100");
      const filed = await listSaFiledDocuments(data.clientId);
      const sa100Doc = filed.find(
        (d) => d.id === documentId && d.kind === "return",
      );
      const taxYear = sa100Doc?.taxYear;
      const sa302Doc = taxYear
        ? filed.find((d) => d.taxYear === taxYear && d.kind === "sa302")
        : undefined;
      const pairs: Array<{ kind: "sa100" | "sa302"; documentId: string }> = [];
      if (docs.includes("sa100") && sa100Doc) {
        pairs.push({ kind: "sa100", documentId: sa100Doc.id });
      }
      if (docs.includes("sa302") && sa302Doc) {
        pairs.push({ kind: "sa302", documentId: sa302Doc.id });
      }
      if (!pairs.length) {
        throw new Error(
          "Uploaded SA PDF not found. Use Email on the tax year card after uploading SA100/SA302.",
        );
      }
      const { protectClientPdf } = await import("@/server/pdf/lock-for-client");
      const { readClientDocumentBytes } = await import(
        "@/server/documents/read-bytes"
      );
      let lockHint: string | null = null;
      for (const pair of pairs) {
        const file = await readClientDocumentBytes({
          clientId: data.clientId,
          documentId: pair.documentId,
        });
        const pdfFilename =
          file.filename.toLowerCase().endsWith(".pdf")
            ? file.filename
            : `${file.filename}.pdf`;
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: file.bytes,
          pdfFilename,
          section: "sa",
          requireLock: true,
        });
        if (protectedPdf.locked) {
          lockHint = protectedPdf.pack.passwordHint;
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
      documentCount = attachments.length;
      kind = pairs.map((p) => p.kind).join("+");
      body += `\n\nPlease find the attached ${pairs.map((p) => p.kind.toUpperCase()).join(" and ")} PDF${pairs.length > 1 ? "s" : ""}.`;
      if (lockHint) {
        body += `\n\nAttachments are password-protected. ${lockHint}`;
      }
    } else {
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
      let lockHint: string | null = null;
      const personalUtr = row.draft.utr || client.utr || null;
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
            section: "sa",
            dateOfBirth: row.draft.dateOfBirth,
            personalUtr,
            requireLock: true,
          });
          if (protectedPdf.locked) {
            lockHint = protectedPdf.pack.passwordHint;
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
          const { bytes } = await buildSa100PackPdf(
            row.draft,
            taxpayerName,
            meta,
          );
          const userSlug =
            taxpayerName
              .trim()
              .replace(/[^a-zA-Z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 40) || "taxpayer";
          const protectedPdf = await protectClientPdf({
            clientId: data.clientId,
            pdfBytes: bytes,
            pdfFilename: `SA100-${row.taxYear}-${userSlug}.pdf`,
            section: "sa",
            dateOfBirth: row.draft.dateOfBirth,
            personalUtr,
            requireLock: true,
          });
          if (protectedPdf.locked) {
            lockHint = protectedPdf.pack.passwordHint;
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
      if (lockHint) {
        body += `\n\nAttachments are password-protected. ${lockHint}`;
      }
    }
  } else if (data.artifact.type === "sa_filed_pdfs") {
    const { taxYear, documentIds, dateOfBirth, personalUtr } = data.artifact;
    const { protectClientPdf } = await import("@/server/pdf/lock-for-client");
    const { readClientDocumentBytes } = await import(
      "@/server/documents/read-bytes"
    );
    let lockHint: string | null = null;
    for (const pair of documentIds) {
      const file = await readClientDocumentBytes({
        clientId: data.clientId,
        documentId: pair.documentId,
      });
      const fallbackName =
        pair.kind === "sa302"
          ? `SA302-${taxYear}.pdf`
          : `SA100-${taxYear}.pdf`;
      const pdfFilename = file.filename.toLowerCase().endsWith(".pdf")
        ? file.filename
        : fallbackName;
      const protectedPdf = await protectClientPdf({
        clientId: data.clientId,
        pdfBytes: file.bytes,
        pdfFilename,
        section: "sa",
        dateOfBirth: dateOfBirth ?? null,
        personalUtr: personalUtr ?? null,
        requireLock: true,
      });
      if (protectedPdf.locked) {
        lockHint = protectedPdf.pack.passwordHint;
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
    documentCount = attachments.length;
    kind = documentIds.map((d) => d.kind).join("+");
    body += `\n\nPlease find the attached ${documentIds.map((d) => d.kind.toUpperCase()).join(" and ")} PDF${documentIds.length > 1 ? "s" : ""} for ${taxYear}.`;
    if (lockHint) {
      body += `\n\nAttachments are password-protected. ${lockHint}`;
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
      section: "accounts",
      requireLock: true,
    });
    if (protectedPdf.locked) {
      attachments.push({
        filename: protectedPdf.pack.filename,
        content: protectedPdf.pack.bytes.toString("base64"),
        contentType: protectedPdf.pack.contentType,
      });
      body += `\n\nYear-end accounts PDF is attached (password-protected). ${protectedPdf.pack.passwordHint}`;
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
  } else if (data.artifact.type === "client_letter") {
    const letterId = data.artifact.letterId;
    const letter = (client.deskProfile?.clientLetters ?? []).find(
      (l) => l.id === letterId,
    );
    if (!letter) throw new Error("Letter not found");
    const { getPracticeLetterhead } = await import(
      "@/server/actions/letterhead"
    );
    const { buildClientLetterPdf } = await import(
      "@/server/letters/build-client-letter-pdf"
    );
    const { markClientLetterSent } = await import(
      "@/server/actions/client-letters"
    );
    const letterhead = await getPracticeLetterhead();
    const pdfBytes = await buildClientLetterPdf({
      letterhead,
      title: letter.title,
      body: letter.body,
    });
    const safeTitle = letter.title
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "letter";
    const { protectClientPdf } = await import("@/server/pdf/lock-for-client");
    const protectedPdf = await protectClientPdf({
      clientId: data.clientId,
      pdfBytes,
      pdfFilename: `${safeTitle}.pdf`,
      section: "letters",
      requireLock: true,
    });
    if (protectedPdf.locked) {
      attachments.push({
        filename: protectedPdf.pack.filename,
        content: protectedPdf.pack.bytes.toString("base64"),
        contentType: protectedPdf.pack.contentType,
      });
      body += `\n\nPlease find the attached letter PDF (${letter.title}). ${protectedPdf.pack.passwordHint}`;
    } else {
      attachments.push({
        filename: protectedPdf.filename,
        content: protectedPdf.bytes.toString("base64"),
        contentType: protectedPdf.contentType,
      });
      body += `\n\nPlease find the attached letter PDF (${letter.title}).`;
    }
    documentCount = 1;
    kind = "client_letter";
    await markClientLetterSent({
      clientId: data.clientId,
      letterId: letter.id,
    }).catch(() => undefined);
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
    message: "Emailed to the client.",
  };
}
