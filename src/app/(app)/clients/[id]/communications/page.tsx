import { EmailDocumentsForm } from "@/components/forms/email-documents-form";
import { ClientCorrespondencePanel } from "@/components/forms/client-correspondence-panel";
import { listClientDocuments } from "@/server/actions/documents";
import { listClientEmailLogs } from "@/server/actions/client-communications";
import {
  getClientCorrespondenceContext,
  listClientChannelMessages,
  listClientDocumentRequests,
} from "@/server/actions/correspondence";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { requireSession } from "@/server/auth/session";

function kindLabel(kind: string) {
  if (kind.startsWith("template:")) return "Template";
  if (kind === "bulk_accounts_reminder") return "Accounts reminder";
  if (kind === "documents") return "Documents";
  return "Email";
}

export default async function ClientCommunicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "communications");
  const [logs, docs, requests, channelMessages, ctx] = await Promise.all([
    listClientEmailLogs(clientId).catch(() => []),
    listClientDocuments(clientId).catch(() => []),
    listClientDocumentRequests(clientId).catch(() => []),
    listClientChannelMessages(clientId).catch(() => []),
    getClientCorrespondenceContext(clientId).catch(() => null),
  ]);

  const contactEmail = client.contactEmail ?? null;
  const canSend = session.role !== "readonly";
  const periodLabel =
    ctx?.period.periodStartLabel && ctx.period.periodEndLabel
      ? `${ctx.period.periodStartLabel} – ${ctx.period.periodEndLabel}`
      : null;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Communications · templates, email &amp; WhatsApp
      </p>

      <div className="space-y-6">
        {canSend && (
          <ClientCorrespondencePanel
            clientId={clientId}
            contactEmail={contactEmail}
            documentStatusLabel={
              ctx?.documentStatusLabel ?? "No request"
            }
            periodLabel={periodLabel}
            requests={requests}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {canSend ? (
            <EmailDocumentsForm
              clientId={clientId}
              defaultEmail={contactEmail}
              documents={docs.map((d) => ({ id: d.id, filename: d.filename }))}
            />
          ) : (
            <div className="panel p-5 text-sm text-ink-soft">
              Read-only access — you cannot send emails to this client.
            </div>
          )}

          <div className="panel overflow-hidden">
            <div className="border-b border-line bg-sand/60 px-4 py-3">
              <h2 className="font-semibold text-ink">
                Sent emails ({logs.length})
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Desk emails recorded for this company.
              </p>
            </div>
            {logs.length === 0 ? (
              <p className="p-6 text-sm text-ink-soft">No emails recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {logs.map((log) => (
                  <li key={log.id} className="px-4 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{log.subject}</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {kindLabel(log.kind)} · To {log.toEmail}
                        </p>
                      </div>
                      <span className="mono text-xs text-ink-soft">
                        {new Date(log.createdAt).toLocaleString("en-GB")}
                      </span>
                    </div>
                    {log.messagePreview && (
                      <p className="mt-2 text-ink-soft">{log.messagePreview}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-line bg-sand/60 px-4 py-3">
            <h2 className="font-semibold text-ink">
              Channel thread ({channelMessages.length})
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              WhatsApp and synced inbox messages matched to this client by phone
              or email. Connect channels under Settings → Channels.
            </p>
          </div>
          {channelMessages.length === 0 ? (
            <p className="p-6 text-sm text-ink-soft">
              No WhatsApp/email sync messages yet for this client.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {channelMessages.map((m) => (
                <li key={m.id} className="px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold capitalize text-ink">
                        {m.channel} · {m.direction}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {m.direction === "inbound" ? "From" : "To"}{" "}
                        {m.direction === "inbound"
                          ? m.fromAddress
                          : m.toAddress}{" "}
                        {m.subject ? `· ${m.subject}` : ""}
                      </p>
                    </div>
                    <span className="mono text-xs text-ink-soft">
                      {new Date(m.sentAt).toLocaleString("en-GB")}
                    </span>
                  </div>
                  {m.bodyPreview && (
                    <p className="mt-2 text-ink-soft">{m.bodyPreview}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
