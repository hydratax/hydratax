import type { ClientRecord } from "@/server/actions/clients";

export function ClientWorkspaceHeader({
  client,
}: {
  client: ClientRecord;
}) {
  return (
    <div className="mb-2">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Client workspace
      </p>
      <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
        {client.name}
      </h1>
    </div>
  );
}
