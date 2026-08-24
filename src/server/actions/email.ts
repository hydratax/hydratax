"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listClientDocuments } from "@/server/actions/documents";
import { sendClientCommunicationEmail } from "@/server/actions/client-communications";
import { getEnv } from "@/lib/env";

const sendSchema = z.object({
  clientId: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().min(3).max(200),
  message: z.string().min(1).max(5000),
  documentIds: z.array(z.string()).default([]),
});

export async function sendClientDocumentEmail(input: z.infer<typeof sendSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = sendSchema.parse(input);
  const client = await getClient(data.clientId);
  const docs = await listClientDocuments(data.clientId);
  const selected = docs.filter((d) => data.documentIds.includes(d.id));

  if (data.documentIds.length && !selected.length) {
    throw new Error("Selected documents not found");
  }

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const links = selected
    .map((d) => {
      const url = d.blobUrl.startsWith("http")
        ? d.blobUrl
        : `${appUrl}/clients/${data.clientId}/documents`;
      return `• ${d.filename}: ${url}`;
    })
    .join("\n");

  const bodyText = `${data.message}

${selected.length ? `Documents:\n${links}\n` : ""}`;

  const res = await sendClientCommunicationEmail({
    clientId: data.clientId,
    toEmail: data.toEmail,
    subject: data.subject,
    message: bodyText,
    kind: "documents",
    documentCount: selected.length,
  });

  revalidatePath(`/clients/${data.clientId}/documents`);

  return {
    ok: true,
    delivery: res.delivery,
    message:
      res.delivery === "resend"
        ? "Email sent to the client."
        : "Email logged locally (set RESEND_API_KEY to send for real).",
  };
}
