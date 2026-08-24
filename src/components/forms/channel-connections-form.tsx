"use client";

import { useState, useTransition } from "react";
import {
  connectPracticeChannel,
  disconnectPracticeChannel,
  type ChannelConnectionRecord,
} from "@/server/actions/correspondence";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function ChannelConnectionsForm({
  connections,
}: {
  connections: ChannelConnectionRecord[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const whatsapp = connections.find((c) => c.channel === "whatsapp");
  const email = connections.find((c) => c.channel === "email");

  return (
    <div className="space-y-6">
      <FormErrorBanner error={error} />
      {ok && <p className="text-sm text-sea">{ok}</p>}

      <ChannelCard
        title="WhatsApp Business"
        description="Connect Meta WhatsApp Cloud API. Inbound messages are matched to clients by phone number and stored on their Communications tab. When a client replies with bank statements, status can auto-update to received."
        connected={whatsapp?.status === "connected"}
        displayName={whatsapp?.displayName}
        externalId={whatsapp?.externalAccountId}
        pending={pending}
        onConnect={(displayName, externalAccountId, apiToken) => {
          setError(null);
          setOk(null);
          start(async () => {
            try {
              await connectPracticeChannel({
                channel: "whatsapp",
                displayName,
                externalAccountId,
                apiToken,
              });
              setOk("WhatsApp connected. Point your Meta webhook to /api/webhooks/whatsapp.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Connect failed");
            }
          });
        }}
        onDisconnect={() => {
          start(async () => {
            await disconnectPracticeChannel("whatsapp");
            setOk("WhatsApp disconnected.");
          });
        }}
        fields={{
          displayNameLabel: "Display name",
          externalLabel: "WhatsApp phone number ID",
          tokenLabel: "Permanent access token (optional for now)",
        }}
      />

      <ChannelCard
        title="Practice email inbox"
        description="Connect the mailbox you use with clients. HydraTax will match inbound emails to clients by contact email address and file them under that company’s Communications."
        connected={email?.status === "connected"}
        displayName={email?.displayName}
        externalId={email?.externalAccountId}
        pending={pending}
        onConnect={(displayName, externalAccountId, apiToken) => {
          setError(null);
          setOk(null);
          start(async () => {
            try {
              await connectPracticeChannel({
                channel: "email",
                displayName,
                externalAccountId,
                apiToken,
              });
              setOk(
                "Email channel saved. Full Gmail/Outlook OAuth sync can use this connection; for now you can also forward or push via /api/webhooks/email.",
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Connect failed");
            }
          });
        }}
        onDisconnect={() => {
          start(async () => {
            await disconnectPracticeChannel("email");
            setOk("Email channel disconnected.");
          });
        }}
        fields={{
          displayNameLabel: "Mailbox label",
          externalLabel: "Email address to sync",
          tokenLabel: "API / app password (optional for now)",
        }}
      />
    </div>
  );
}

function ChannelCard({
  title,
  description,
  connected,
  displayName,
  externalId,
  pending,
  onConnect,
  onDisconnect,
  fields,
}: {
  title: string;
  description: string;
  connected: boolean;
  displayName?: string | null;
  externalId?: string | null;
  pending: boolean;
  onConnect: (
    displayName: string,
    externalAccountId: string,
    apiToken?: string,
  ) => void;
  onDisconnect: () => void;
  fields: {
    displayNameLabel: string;
    externalLabel: string;
    tokenLabel: string;
  };
}) {
  const [name, setName] = useState(displayName ?? "");
  const [ext, setExt] = useState(externalId ?? "");
  const [token, setToken] = useState("");

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="display text-2xl text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
            connected
              ? "border border-sea/30 bg-sea/10 text-sea"
              : "border border-line bg-sand text-ink-soft"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {connected ? (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-semibold">Name:</span> {displayName}
          </p>
          <p>
            <span className="font-semibold">Account:</span> {externalId}
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-2"
            disabled={pending}
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onConnect(name.trim(), ext.trim(), token.trim() || undefined);
          }}
        >
          <label className="block text-sm font-semibold">
            {fields.displayNameLabel}
            <input
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            {fields.externalLabel}
            <input
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              value={ext}
              onChange={(e) => setExt(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            {fields.tokenLabel}
            <input
              type="password"
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Connect"}
          </button>
        </form>
      )}
    </div>
  );
}
