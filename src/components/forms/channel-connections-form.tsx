"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectPracticeChannel,
  disconnectPracticeChannel,
  type ChannelConnectionRecord,
} from "@/server/actions/correspondence";
import type { MailboxOAuthProvider } from "@/lib/email/mailbox-oauth";

export function ChannelConnectionsForm({
  connections,
}: {
  connections: ChannelConnectionRecord[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const whatsapp = connections.find((c) => c.channel === "whatsapp");
  const gmail = connections.find(
    (c) => c.channel === "gmail" && c.status === "connected",
  );
  const outlook = connections.find(
    (c) => c.channel === "outlook" && c.status === "connected",
  );
  const connectedMailbox = gmail || outlook;

  function refreshQuietly() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-5">
        <div>
          <h2 className="display text-2xl text-ink">Outbound client email</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {connectedMailbox
              ? `Sending from ${
                  connectedMailbox.channel === "outlook"
                    ? "Microsoft 365"
                    : "Gmail"
                } · ${connectedMailbox.externalAccountId}`
              : "Sending with your practice name. Connect a mailbox to send as yourself."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!outlook ? (
            <MailboxConnectButton
              provider="gmail"
              label={gmail ? "Reconnect Gmail" : "Connect Gmail"}
              connected={Boolean(gmail)}
            />
          ) : null}
          {!gmail ? (
            <MailboxConnectButton
              provider="outlook"
              label={
                outlook
                  ? "Reconnect Microsoft 365"
                  : "Connect Microsoft 365"
              }
              connected={Boolean(outlook)}
            />
          ) : null}
          {gmail ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  try {
                    await disconnectPracticeChannel("gmail");
                    refreshQuietly();
                  } catch {
                    /* freeze */
                  }
                });
              }}
            >
              Disconnect
            </button>
          ) : null}
          {outlook ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  try {
                    await disconnectPracticeChannel("outlook");
                    refreshQuietly();
                  } catch {
                    /* freeze */
                  }
                });
              }}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>

      <ChannelCard
        title="WhatsApp Business"
        description={
          whatsapp?.status === "connected"
            ? "Connected"
            : "Optional — link WhatsApp for client chats."
        }
        connected={whatsapp?.status === "connected"}
        displayName={whatsapp?.displayName}
        externalId={whatsapp?.externalAccountId}
        pending={pending}
        onConnect={(displayName, externalAccountId, apiToken) => {
          start(async () => {
            try {
              await connectPracticeChannel({
                channel: "whatsapp",
                displayName,
                externalAccountId,
                apiToken,
              });
              refreshQuietly();
            } catch {
              /* freeze */
            }
          });
        }}
        onDisconnect={() => {
          start(async () => {
            try {
              await disconnectPracticeChannel("whatsapp");
              refreshQuietly();
            } catch {
              /* freeze */
            }
          });
        }}
        fields={{
          displayNameLabel: "Display name",
          externalLabel: "Phone number ID",
          tokenLabel: "Access token",
        }}
      />
    </div>
  );
}

function MailboxConnectButton({
  provider,
  label,
  connected,
}: {
  provider: MailboxOAuthProvider;
  label: string;
  connected: boolean;
}) {
  return (
    <a
      href={`/api/oauth/mailbox/${provider}/start`}
      className={connected ? "btn btn-secondary" : "btn btn-primary"}
    >
      {label}
    </a>
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
          <p className="mt-1 text-sm text-ink-soft">{description}</p>
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
