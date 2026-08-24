import Link from "next/link";
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
          <p className="mt-1 max-w-2xl text-ink-soft">
            Connect WhatsApp and your practice email so client chats and inbox
            threads are filed on each company&apos;s Communications tab.
          </p>
        </div>
        <Link href="/clients" className="btn btn-secondary">
          Back to clients
        </Link>
      </div>

      <ChannelConnectionsForm connections={connections} />

      <div className="panel p-5 text-sm text-ink-soft">
        <p className="font-semibold text-ink">How matching works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Emails are matched to a client when the from/to address equals that
            client&apos;s contact email.
          </li>
          <li>
            WhatsApp messages are matched when the phone number matches the
            client contact phone.
          </li>
          <li>
            Bank-statement replies can automatically move the client status to
            &quot;Bank statements received&quot;.
          </li>
        </ul>
        <p className="mt-3">
          Webhooks:{" "}
          <code className="mono text-xs">/api/webhooks/whatsapp</code> and{" "}
          <code className="mono text-xs">/api/webhooks/email</code>
        </p>
      </div>
    </div>
  );
}
