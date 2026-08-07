"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listClientDocuments } from "@/server/actions/documents";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
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

${selected.length ? `Documents:\n${links}\n` : ""}
— Sent via HydraTax on behalf of ${session.practiceName}
Client: ${client.name}
`;

  const resendKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ?? "HydraTax <onboarding@resend.dev>";

  let delivery: "resend" | "logged" = "logged";

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [data.toEmail],
        subject: data.subject,
        text: bodyText,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Email provider error: ${err.slice(0, 200)}`);
    }
    delivery = "resend";
  }

  const log = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    clientId: data.clientId,
    toDomain: data.toEmail.split("@")[1] ?? "unknown",
    subject: data.subject,
    documentCount: selected.length,
    delivery,
    createdAt: new Date().toISOString(),
  };

  if (isMemoryStore()) {
    memoryStore.emailLogs.push(log);
    // Persist contact email on client for convenience (not shown on CH admin)
    const c = memoryStore.clients.find((x) => x.id === data.clientId);
    if (c) (c as { contactEmail?: string }).contactEmail = data.toEmail;
  } else {
    const { getDb } = await import("@/server/db");
    const { clientEmailLogs, clients } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb().insert(clientEmailLogs).values({
      practiceId: session.practiceId,
      clientId: data.clientId,
      toDomain: log.toDomain,
      subject: data.subject,
      documentCount: selected.length,
      delivery,
    });
    await getDb()
      .update(clients)
      .set({ contactEmail: data.toEmail })
      .where(eq(clients.id, data.clientId));
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "client.email.documents",
    entityType: "email",
    entityId: log.id,
    detail: {
      toDomain: log.toDomain,
      documentCount: selected.length,
      delivery,
      // no full email address in audit for minimisation
    },
  });

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/documents`);

  return {
    ok: true,
    delivery,
    message:
      delivery === "resend"
        ? "Email sent to the client."
        : "Email queued locally (set RESEND_API_KEY to send for real). Audit log recorded.",
  };
}
