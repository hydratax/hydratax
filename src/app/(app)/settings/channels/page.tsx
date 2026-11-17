import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/server/auth/session";
import { listChannelConnections } from "@/server/actions/correspondence";
import { ChannelConnectionsForm } from "@/components/forms/channel-connections-form";

export default async function ChannelsSettingsPage() {
  await requireSession();
  const connections = await listChannelConnections();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Settings
          </p>
          <h1 className="display mt-1 text-4xl text-ink">Channels</h1>
        </div>
        <Link href="/dashboard" className="btn btn-secondary">
          Back to dashboard
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="panel p-5 text-sm text-ink-soft">Loading…</div>
        }
      >
        <ChannelConnectionsForm connections={connections} />
      </Suspense>
    </div>
  );
}
