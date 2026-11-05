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
    doc: z.enum(["sa100", "sa302"]),
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
    for (const file of pack.files) {
      attachments.push({
        filename: file.filename,
        content: file.base64,
        contentType: file.mimeType,
      });
    }
    documentCount = attachments.length;
    kind = `ct_${ctKind}`;
    body += `\n\n${documentCount} PDF attachment(s) for ${client.name} are included.`;
  } else if (data.artifact.type === "sa_pdf") {
    const { returnId, doc } = data.artifact;
    const { getSa100Return } = await import("@/server/actions/sa100");
    const { buildSa100Pdf, buildSa302Pdf } = await import("@/server/sa100/pdf");
    const row = await getSa100Return(data.clientId, returnId);
    if (doc === "sa302") {
      const bytes = await buildSa302Pdf(
        row.calculation,
        client.name,
        row.draft.utr || client.utr || "",
      );
      attachments.push({
        filename: `SA302-${row.taxYear}.pdf`,
        content: Buffer.from(bytes).toString("base64"),
        contentType: "application/pdf",
      });
    } else {
      const bytes = await buildSa100Pdf(row.draft, client.name);
      attachments.push({
        filename: `SA100-${row.taxYear}.pdf`,
        content: Buffer.from(bytes).toString("base64"),
        contentType: "application/pdf",
      });
    }
    documentCount = 1;
    kind = doc;
    body += `\n\nPlease find the ${doc.toUpperCase()} PDF attached.`;
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
