import { ClientWorkingLogs } from "@/components/client-working-logs";
import {
  normalizeWorkStage,
  type ClientWorkDesk,
} from "@/lib/client-work-stage";
import { getClient } from "@/server/actions/clients";
import { listClientEmailLogs } from "@/server/actions/client-communications";

/** Closed worklogs dropdown for a desk page (SA / CT / VAT / PAYE / overview). */
export async function ClientDeskWorklogs({
  clientId,
  desk,
}: {
  clientId: string;
  desk: ClientWorkDesk | "all";
}) {
  const [client, emailLogs] = await Promise.all([
    getClient(clientId).catch(() => null),
    listClientEmailLogs(clientId).catch(() => []),
  ]);
  if (!client) return null;

  const workLog = client.deskProfile?.workLog ?? [];
  const stage = normalizeWorkStage(client.deskProfile?.workStage);

  return (
    <div className="mt-8">
      <ClientWorkingLogs
        desk={desk}
        stage={stage}
        workLog={workLog}
        emails={emailLogs.map((l) => ({
          id: l.id,
          subject: l.subject,
          toEmail: l.toEmail,
          createdAt: l.createdAt,
          kind: l.kind,
        }))}
      />
    </div>
  );
}
